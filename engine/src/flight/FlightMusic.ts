import type { Platform } from '../platform/Platform';
import { isEditingTarget, muteControl } from './mute';
import { NativeScore, parseScoreProgram, type ScoreProgram } from './NativeScore';

export const MUSIC_SITUATIONS = ['cruise', 'combat', 'danger', 'victory', 'defeat'] as const;
export type MusicSituation = (typeof MUSIC_SITUATIONS)[number];
export interface MusicNote {
  timeSeconds: number;
  durationSeconds: number;
  note: number;
  velocity: number;
  channel: number;
  program: number;
}
export interface MusicTrack {
  name: string;
  sourceSha256: string;
  durationSeconds: number;
  notes: MusicNote[];
  channelEvents?: MusicChannelEvent[];
}
export interface MusicChannelEvent {
  timeSeconds: number;
  channel: number;
  kind: 'controller' | 'pitch-bend';
  controller?: number;
  value: number;
}
/** GM defaults; bend sensitivity remains two semitones (RPN is not implemented). */
function musicChannelTimeline(events: readonly MusicChannelEvent[], channel: number) {
  let volume = 100 / 127,
    expression = 1,
    pan = 0,
    bend = 0;
  const timeline = [{ timeSeconds: 0, gain: volume, pan, bend }];
  for (const event of events) {
    if (event.channel !== channel) continue;
    if (event.kind === 'pitch-bend') bend = ((event.value - 8192) / 8192) * 2;
    else if (event.controller === 7) volume = event.value / 127;
    else if (event.controller === 11) expression = event.value / 127;
    else if (event.controller === 10) pan = (event.value - 64) / (event.value < 64 ? 64 : 63);
    else if (event.controller === 121) {
      expression = 1;
      bend = 0;
    } else continue;
    const state = { timeSeconds: event.timeSeconds, gain: volume * expression, pan, bend };
    if (timeline[timeline.length - 1]!.timeSeconds === event.timeSeconds)
      timeline[timeline.length - 1] = state;
    else timeline.push(state);
  }
  return timeline;
}
export function musicChannelState(
  events: readonly MusicChannelEvent[],
  channel: number,
  time: number,
) {
  const timeline = musicChannelTimeline(events, channel);
  let last = timeline[0]!;
  for (const state of timeline) {
    if (state.timeSeconds > time) break;
    last = state;
  }
  const { gain, pan, bend } = last;
  return { gain, pan, bend };
}
const automation = new WeakMap<MusicTrack, ReturnType<typeof musicChannelTimeline>[]>();
export interface FlightMusicManifest {
  version: 1;
  source: 'retail-xmi';
  tracks: Record<MusicSituation, MusicTrack>;
  scores?: Record<MusicSituation, ScoreProgram>;
  library?: Record<string, MusicTrack>;
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid music object');
  return value as Record<string, unknown>;
};
const number = (value: unknown, min: number, max: number, integer = false): number => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error('Invalid music number');
  return value;
};
export function parseFlightMusic(value: unknown): FlightMusicManifest {
  const data = object(value);
  if (data.version !== 1 || data.source !== 'retail-xmi')
    throw new Error('Invalid flight music manifest');
  const tracks = object(data.tracks);
  const result = {} as Record<MusicSituation, MusicTrack>;
  let total = 0;
  let totalEvents = 0;
  const parseTrack = (value: unknown): MusicTrack => {
    const track = object(value);
    if (
      typeof track.name !== 'string' ||
      track.name.length < 1 ||
      track.name.length > 200 ||
      typeof track.sourceSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(track.sourceSha256) ||
      !Array.isArray(track.notes) ||
      !track.notes.length ||
      track.notes.length > 20000 ||
      (total += track.notes.length) > 100000
    )
      throw new Error('Invalid flight music track');
    const duration = number(track.durationSeconds, 0.1, 600);
    const notes = track.notes
      .map((value: unknown): MusicNote => {
        const n = object(value);
        const timeSeconds = number(n.timeSeconds, 0, duration);
        const durationSeconds = number(n.durationSeconds, 0.001, duration);
        if (timeSeconds + durationSeconds > duration + 0.001)
          throw new Error('Music note exceeds track');
        return {
          timeSeconds,
          durationSeconds,
          note: number(n.note, 0, 127, true),
          velocity: number(n.velocity, 1, 127, true),
          channel: number(n.channel, 0, 15, true),
          program: number(n.program, 0, 127, true),
        };
      })
      .sort((a, b) => a.timeSeconds - b.timeSeconds);
    const parsed: MusicTrack = {
      name: track.name,
      sourceSha256: track.sourceSha256,
      durationSeconds: duration,
      notes,
    };
    if (track.channelEvents !== undefined) {
      if (
        !Array.isArray(track.channelEvents) ||
        (totalEvents += track.channelEvents.length) > 50000
      )
        throw new Error('Invalid music channel events');
      parsed.channelEvents = track.channelEvents
        .map((value: unknown): MusicChannelEvent => {
          const event = object(value);
          if (event.kind !== 'controller' && event.kind !== 'pitch-bend')
            throw new Error('Invalid MIDI event kind');
          const result: MusicChannelEvent = {
            timeSeconds: number(event.timeSeconds, 0, duration),
            channel: number(event.channel, 0, 15, true),
            kind: event.kind,
            value: number(event.value, 0, event.kind === 'controller' ? 127 : 16383, true),
          };
          if (event.kind === 'controller')
            result.controller = number(event.controller, 0, 127, true);
          return result;
        })
        .sort((a, b) => a.timeSeconds - b.timeSeconds);
    }
    return parsed;
  };
  for (const situation of MUSIC_SITUATIONS) result[situation] = parseTrack(tracks[situation]);
  const manifest: FlightMusicManifest = { version: 1, source: 'retail-xmi', tracks: result };
  if (data.scores !== undefined || data.library !== undefined) {
    const scores = object(data.scores),
      library = object(data.library);
    if (Object.keys(library).length > 128) throw new Error('Music library too large');
    manifest.library = {};
    for (const [name, track] of Object.entries(library)) {
      if (!/^[A-Z0-9]{1,32}\.XMI$/.test(name)) throw new Error('Invalid music library key');
      const parsed = parseTrack(track);
      if (parsed.name !== name) throw new Error('Music library name mismatch');
      manifest.library[name] = parsed;
    }
    manifest.scores = {} as Record<MusicSituation, ScoreProgram>;
    for (const situation of MUSIC_SITUATIONS)
      manifest.scores[situation] = parseScoreProgram(scores[situation]);
  }
  return manifest;
}

export interface FlightMusicInput {
  steps: number;
  outcome: string;
  damagePercent: number;
  contacts: number;
  underFire: boolean;
  grounded: boolean;
}
/** Original orchestration policy, not the executable's music trigger logic. */
export class MusicSituationState {
  situation: MusicSituation = 'cruise';
  private pending: MusicSituation | undefined;
  private pendingStep = 0;
  update(input: FlightMusicInput): MusicSituation {
    if (this.situation === 'victory' || this.situation === 'defeat') return this.situation;
    const desired: MusicSituation =
      input.outcome === 'defeat'
        ? 'defeat'
        : input.outcome === 'victory'
          ? 'victory'
          : input.underFire || input.damagePercent >= 60
            ? 'danger'
            : input.contacts > 0
              ? 'combat'
              : 'cruise';
    if (desired === this.situation) this.pending = undefined;
    else if (
      desired === 'victory' ||
      desired === 'defeat' ||
      desired === 'danger' ||
      (desired === 'combat' && this.situation === 'cruise')
    ) {
      this.situation = desired;
      this.pending = undefined;
    } else {
      if (this.pending !== desired) {
        this.pending = desired;
        this.pendingStep = input.steps;
      }
      if (input.steps - this.pendingStep >= 360) {
        this.situation = desired;
        this.pending = undefined;
      }
    }
    return this.situation;
  }
}

/** Small original motifs for installs without locally imported XMI note events. */
function originalTracks(): Record<MusicSituation, MusicTrack> {
  const motifs: Record<MusicSituation, number[]> = {
    cruise: [48, 55, 60, 64, 62, 55, 60, 55],
    combat: [48, 48, 55, 58, 48, 55, 60, 58],
    danger: [45, 46, 52, 45, 46, 52, 48, 46],
    victory: [48, 52, 55, 60, 64, 60, 55, 60],
    defeat: [48, 43, 46, 41, 44, 39, 43, 36],
  };
  return Object.fromEntries(
    MUSIC_SITUATIONS.map((situation) => [
      situation,
      {
        name: `Original ${situation}`,
        sourceSha256: '',
        durationSeconds: 8,
        notes: motifs[situation].flatMap((note, i) => [
          { timeSeconds: i, durationSeconds: 0.85, note, velocity: 65, channel: 0, program: 48 },
          {
            timeSeconds: i,
            durationSeconds: 0.9,
            note: note - 12,
            velocity: 40,
            channel: 1,
            program: 32,
          },
        ]),
      },
    ]),
  ) as Record<MusicSituation, MusicTrack>;
}
interface Voice {
  source: OscillatorNode;
  gain: GainNode;
  expression?: GainNode;
  pan?: StereoPannerNode;
}
export const MAX_MUSIC_VOICES = 32;

/** Frame-driven scheduler, with a 120ms look-ahead and no background timers.
 * Note data can be retail; oscillators/envelopes are authored GM approximations. */
export class FlightMusic {
  private context?: AudioContext;
  private master?: GainNode;
  private voices: Voice[] = [];
  private state = new MusicSituationState();
  private playhead = 0;
  private scheduledUntil = 0;
  private previousStep: number | undefined;
  private paused = false;
  private enabled = true;
  private volume = 0.35;
  private disposed = false;
  private played = 0;
  private error: string | undefined;
  private unsubscribeMute: () => void;
  private readonly tracks: Record<MusicSituation, MusicTrack>;
  private readonly source: 'retail-xmi' | 'original-composition';
  private score: NativeScore | undefined;
  private selectedTrack: MusicTrack | undefined;
  private scoreFinished = false;
  static async load(platform: Platform): Promise<FlightMusic> {
    let manifest: FlightMusicManifest | undefined;
    let error: string | undefined;
    try {
      if (await platform.fs.exists('appData', 'audio/flight-music.json')) {
        const text = await platform.fs.readText('appData', 'audio/flight-music.json');
        if (text.length > 20000000) throw new Error('Music manifest too large');
        manifest = parseFlightMusic(JSON.parse(text));
      }
    } catch (e) {
      error = String(e);
    }
    const music = new FlightMusic(manifest);
    if (error !== undefined) music.error = error;
    return music;
  }
  constructor(private readonly manifest?: FlightMusicManifest) {
    this.tracks = manifest?.tracks ?? originalTracks();
    this.source = manifest?.source ?? 'original-composition';
    this.startScore();
    window.addEventListener('pointerdown', this.gesture);
    window.addEventListener('keydown', this.gesture);
    this.unsubscribeMute = muteControl.subscribe(() => this.syncVolume());
  }
  private gesture = (event: Event): void => {
    if (!event.isTrusted || this.disposed) return;
    if (event.type === 'keydown') {
      const key = event as KeyboardEvent;
      if (key.repeat || isEditingTarget(key.target)) return;
      if (key.code === 'KeyN' && !key.ctrlKey && !key.metaKey && !key.altKey && !key.shiftKey) {
        key.preventDefault();
        this.setEnabled(!this.enabled);
      }
    }
    if (this.paused || !this.enabled) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
        this.syncVolume();
      }
      if (this.context.state === 'suspended')
        void this.context.resume().catch((e: unknown) => {
          this.error = String(e);
        });
    } catch (e) {
      this.error = String(e);
    }
  };
  private syncVolume(): void {
    if (!this.enabled || muteControl.muted) {
      this.stopVoices();
      this.scheduledUntil = this.playhead;
    }
    if (this.context && this.master)
      this.master.gain.setTargetAtTime(
        this.enabled && !muteControl.muted ? (0.065 * this.volume) / 0.35 : 0,
        this.context.currentTime,
        0.025,
      );
  }
  update(input: FlightMusicInput): void {
    if (this.disposed || this.paused) return;
    const previous = this.state.situation;
    this.state.update(input);
    const delta =
      this.previousStep === undefined ? 0 : Math.max(0, input.steps - this.previousStep) / 120;
    this.previousStep = input.steps;
    this.playhead += delta;
    if (previous !== this.state.situation) {
      this.stopVoices(0.08);
      this.playhead = 0;
      this.scheduledUntil = 0;
      this.startScore();
    }
    if (
      this.score &&
      !this.scoreFinished &&
      this.selectedTrack &&
      this.playhead >= this.selectedTrack.durationSeconds
    ) {
      // Native starts the next sequence on its next service tick. Retaining frame
      // overshoot here would skip its opening chord at time zero.
      this.playhead = 0;
      this.scheduledUntil = 0;
      this.advanceScore();
    }
    if (!this.enabled || muteControl.muted || this.context?.state !== 'running') {
      this.scheduledUntil = this.playhead;
      return;
    }
    this.schedule();
  }
  private schedule(): void {
    if (this.scoreFinished) return;
    const context = this.context!;
    const track = this.selectedTrack ?? this.tracks[this.state.situation];
    const start = Math.max(this.playhead, this.scheduledUntil);
    const end = this.score
      ? Math.min(track.durationSeconds, this.playhead + 0.12)
      : this.playhead + 0.12;
    let scheduled = 0;
    for (
      let cycle = Math.floor(start / track.durationSeconds);
      cycle <= Math.floor(end / track.durationSeconds);
      cycle++
    ) {
      const offset = cycle * track.durationSeconds;
      // Binary search avoids scanning thousands of imported notes every frame.
      let lo = 0;
      let hi = track.notes.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (track.notes[mid]!.timeSeconds < start - offset) lo = mid + 1;
        else hi = mid;
      }
      for (let i = lo; i < track.notes.length; i++) {
        const note = track.notes[i]!;
        const when = note.timeSeconds + offset;
        if (when >= end || scheduled >= MAX_MUSIC_VOICES || this.voices.length >= MAX_MUSIC_VOICES)
          break;
        if (this.voices.length < MAX_MUSIC_VOICES) {
          this.play(note, context.currentTime + Math.max(0, when - this.playhead));
          scheduled++;
        }
      }
    }
    this.scheduledUntil = end;
  }
  private startScore(): void {
    const program = this.manifest?.scores?.[this.state.situation];
    this.score = program ? new NativeScore(program) : undefined;
    this.selectedTrack = undefined;
    this.scoreFinished = false;
    if (this.score) this.advanceScore();
  }
  private advanceScore(): void {
    try {
      const name = this.score!.next();
      if (name === undefined) {
        this.scoreFinished = true;
        return;
      }
      const track = this.manifest?.library?.[name];
      if (!track) throw new Error(`Score references missing track ${name}`);
      this.selectedTrack = track;
    } catch (error) {
      this.error = String(error);
      this.scoreFinished = true;
    }
  }
  private play(note: MusicNote, when: number): void {
    const context = this.context!;
    try {
      const source = context.createOscillator();
      const gain = context.createGain();
      const percussion = note.channel === 9;
      source.type = percussion
        ? 'triangle'
        : note.program >= 32 && note.program < 40
          ? 'sine'
          : 'triangle';
      source.frequency.setValueAtTime(
        percussion ? 100 + note.note * 3 : 440 * 2 ** ((note.note - 69) / 12),
        when,
      );
      const duration = percussion
        ? Math.min(0.18, note.durationSeconds)
        : Math.min(12, note.durationSeconds);
      if (percussion) source.frequency.exponentialRampToValueAtTime(40, when + duration);
      const amplitude = (note.velocity / 127) * 0.22;
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(amplitude, when + Math.min(0.015, duration / 4));
      gain.gain.linearRampToValueAtTime(amplitude * 0.65, when + duration * 0.7);
      gain.gain.linearRampToValueAtTime(0, when + duration);
      const voice: Voice = { source, gain };
      const track = this.selectedTrack ?? this.tracks[this.state.situation];
      if (track.channelEvents?.length) {
        const expression = context.createGain(),
          pan = context.createStereoPanner();
        voice.expression = expression;
        voice.pan = pan;
        source.connect(gain).connect(expression).connect(pan).connect(this.master!);
        let channels = automation.get(track);
        if (!channels) {
          channels = Array.from({ length: 16 }, (_, channel) =>
            musicChannelTimeline(track.channelEvents!, channel),
          );
          automation.set(track, channels);
        }
        const timeline = channels[note.channel]!;
        let lo = 0,
          hi = timeline.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (timeline[mid]!.timeSeconds <= note.timeSeconds) lo = mid + 1;
          else hi = mid;
        }
        for (let index = Math.max(0, lo - 1); index < timeline.length; index++) {
          const state = timeline[index]!;
          if (state.timeSeconds >= note.timeSeconds + duration) break;
          const at = when + Math.max(0, state.timeSeconds - note.timeSeconds);
          expression.gain.setValueAtTime(state.gain, at);
          pan.pan.setValueAtTime(state.pan, at);
          if (!percussion)
            source.frequency.setValueAtTime(440 * 2 ** ((note.note + state.bend - 69) / 12), at);
        }
      } else source.connect(gain).connect(this.master!);
      source.onended = () => this.release(voice);
      this.voices.push(voice);
      source.start(when);
      source.stop(when + duration + 0.005);
      this.played++;
    } catch (e) {
      this.error = String(e);
    }
  }
  private release(voice: Voice): void {
    voice.source.onended = null;
    voice.source.disconnect();
    voice.gain.disconnect();
    voice.expression?.disconnect();
    voice.pan?.disconnect();
    const i = this.voices.indexOf(voice);
    if (i !== -1) this.voices.splice(i, 1);
  }
  private stopVoices(fade = 0): void {
    for (const voice of [...this.voices]) {
      const now = this.context?.currentTime ?? 0;
      voice.gain.gain.cancelScheduledValues(now);
      if (fade) {
        voice.gain.gain.setTargetAtTime(0, now, fade / 4);
      }
      try {
        voice.source.stop(now + fade);
      } catch {
        /* Already ended. */
      }
      if (!fade) this.release(voice);
    }
  }
  setEnabled(value: boolean): void {
    this.enabled = value;
    this.syncVolume();
    if (this.context && this.context.state !== 'closed')
      void (value && !this.paused ? this.context.resume() : this.context.suspend()).catch(
        (e: unknown) => {
          this.error = String(e);
        },
      );
  }
  setVolume(value: number): void {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : this.volume;
    this.syncVolume();
  }
  setPaused(value: boolean): void {
    if (this.disposed || this.paused === value) return;
    this.paused = value;
    if (this.context && this.context.state !== 'closed' && (value || this.enabled))
      void (value ? this.context.suspend() : this.context.resume()).catch((e: unknown) => {
        this.error = String(e);
      });
  }
  reset(): void {
    this.stopVoices();
    this.state = new MusicSituationState();
    this.playhead = 0;
    this.scheduledUntil = 0;
    this.previousStep = undefined;
    this.played = 0;
    this.startScore();
  }
  diagnostics() {
    return {
      enabled: this.enabled,
      volume: this.volume,
      muted: muteControl.muted,
      paused: this.paused,
      situation: this.state.situation,
      track: (this.selectedTrack ?? this.tracks[this.state.situation]).name,
      selection: this.score
        ? 'recovered MUS VM; authored situation adapter/RNG'
        : 'fixed representative',
      scoreFinished: this.scoreFinished,
      scoreHostFlag: this.score?.hostFlag ?? false,
      playheadSeconds: this.playhead,
      voices: this.voices.length,
      played: this.played,
      contextState: this.context?.state ?? 'locked',
      source: this.source,
      rendering: 'authored GM-style oscillator approximation',
      midiControls: 'CC7 volume, CC10 pan, CC11 expression, CC121 reset; pitch bend ±2 semitones',
      error: this.error,
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('pointerdown', this.gesture);
    window.removeEventListener('keydown', this.gesture);
    this.unsubscribeMute();
    this.stopVoices();
    this.master?.disconnect();
    if (this.context && this.context.state !== 'closed')
      void this.context.close().catch((e: unknown) => {
        this.error = String(e);
      });
  }
}
