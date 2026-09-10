import type { CombatEvent } from '../sim/combat/world';
import type { Vec3 } from '../sim/flight';
import { isEditingTarget, muteControl } from './mute';
import type { Platform } from '../platform/Platform';
import { flightPcm, resampleFlightPcm, type FlightClip } from './FlightAudio';
import {
  GAMEPLAY_CUES,
  GameplayCueState,
  type GameplayCue,
  type GameplayCueInput,
} from './gameplay-cues';

export type CombatSound = 'impact' | 'explosion' | 'ground' | 'water';
const DURATIONS: Record<CombatSound, number> = {
  impact: 0.2,
  explosion: 1.6,
  ground: 2.1,
  water: 1.8,
};
export const MAX_COMBAT_VOICES = 8;
export type CombatSamples = Record<CombatSound, FlightClip[]> &
  Partial<Record<GameplayCue, FlightClip[]>>;
export function parseCombatSamples(value: unknown): CombatSamples {
  const data = value as { schemaVersion?: number; source?: string; clips?: CombatSamples };
  if (data?.schemaVersion !== 1 || data.source !== 'retail-pcm' || !data.clips)
    throw new Error('Invalid combat audio manifest');
  const result = {} as CombatSamples;
  let total = 0;
  for (const kind of ['impact', 'explosion', 'ground', 'water', ...GAMEPLAY_CUES] as const) {
    const group = data.clips[kind];
    if (group === undefined && (GAMEPLAY_CUES as readonly string[]).includes(kind)) continue;
    if (!Array.isArray(group) || group.length < 1 || group.length > 8)
      throw new Error(`Invalid combat sample group: ${kind}`);
    for (const clip of group) {
      if (
        !clip ||
        typeof clip.source !== 'string' ||
        clip.source.length > 80 ||
        !/^[a-f0-9]{64}$/.test(clip.sha256) ||
        (clip as FlightClip & { encoding?: string }).encoding !== 'unsigned8-mono' ||
        ![5510, 5512, 8000, 8010, 11025].includes(clip.sampleRate) ||
        !Array.isArray(clip.pcm) ||
        clip.pcm.length < 2 ||
        clip.pcm.length > 1000000 ||
        !clip.pcm.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
      )
        throw new Error(`Invalid combat sample: ${kind}`);
      total += clip.pcm.length;
      if (total > 2000000) throw new Error('Combat PCM exceeds sample budget');
    }
    result[kind] = group;
  }
  return result;
}

/** Original, deterministic sound design; no retail samples or simulation RNG. */
export function combatSoundPcm(kind: CombatSound, sampleRate: number): Float32Array {
  const rate = Math.max(8000, Math.min(96000, Math.round(sampleRate) || 48000));
  const duration = DURATIONS[kind];
  const pcm = new Float32Array(Math.ceil(duration * rate));
  let seed = 0x51e7;
  let low = 0;
  for (let i = 0; i < pcm.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed / 0x100000000) * 2 - 1;
    const t = i / rate;
    low += (noise - low) * (1 - Math.exp((-2 * Math.PI * 300) / rate));
    const envelope = Math.min(1, t / 0.003) * Math.exp((-5 * t) / duration);
    const tail = Math.min(1, (duration - t) / 0.02);
    const rumble = Math.sin(2 * Math.PI * (65 * t - 12 * t * t));
    const signal =
      kind === 'impact'
        ? noise * 0.55 + Math.sin(2 * Math.PI * 930 * t) * 0.2
        : kind === 'water'
          ? noise * 0.35 + low * 0.65
          : low * 0.6 + rumble * 0.3 + noise * (kind === 'ground' ? 0.28 : 0.16);
    pcm[i] = Math.max(-1, Math.min(1, signal * envelope * tail));
  }
  pcm[0] = 0;
  pcm[pcm.length - 1] = 0;
  return pcm;
}

export function combatSoundGain(kind: CombatSound, point: Vec3, listener: Vec3): number {
  const distance = Math.hypot(point.x - listener.x, point.y - listener.y, point.z - listener.z);
  if (!Number.isFinite(distance)) return 0;
  const reach = kind === 'impact' ? 2500 : 12000;
  if (distance >= reach) return 0;
  return (kind === 'impact' ? 0.24 : 0.65) * (1 - distance / reach) ** 2;
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  speech: boolean;
}

/** Frame adapter: ids are consumed even while muted, locked or paused, never queued.
 * Pause discards one-shots rather than resuming stale explosions. Call reset when
 * replacing the CombatWorld (which restarts its event-id sequence). */
export class CombatAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private voices: Voice[] = [];
  private watermark = -1;
  private paused = false;
  private disposed = false;
  private played = 0;
  private lastPlayed: CombatSound | GameplayCue | undefined;
  private cues = new GameplayCueState();
  private cueCounts: Partial<Record<GameplayCue, number>> = {};
  private lastTerrainStep = -Infinity;
  private playerDestroyed = false;
  private error?: string;
  private unsubscribeMute: () => void;
  private gesture = (event: Event): void => {
    if (!event.isTrusted || this.disposed || this.paused) return;
    if (event.type === 'keydown') {
      const key = event as KeyboardEvent;
      if (key.repeat || isEditingTarget(key.target)) return;
    }
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = muteControl.muted ? 0 : 0.45;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended')
        void this.context.resume().catch((error: unknown) => {
          this.error = String(error);
        });
    } catch (error) {
      this.error = String(error);
    }
  };

  static async load(platform: Platform): Promise<CombatAudio> {
    let samples: CombatSamples | undefined;
    let error: string | undefined;
    try {
      if (await platform.fs.exists('appData', 'audio/combat.json')) {
        const text = await platform.fs.readText('appData', 'audio/combat.json');
        if (text.length > 10000000) throw new Error('Combat audio exceeds 10 MB');
        samples = parseCombatSamples(JSON.parse(text));
      }
    } catch (cause) {
      error = String(cause);
    }
    const audio = new CombatAudio(samples);
    if (error !== undefined) audio.error = error;
    return audio;
  }

  constructor(private readonly samples?: CombatSamples) {
    window.addEventListener('pointerdown', this.gesture);
    window.addEventListener('keydown', this.gesture);
    this.unsubscribeMute = muteControl.subscribe((muted) => {
      if (muted) this.stopVoices();
      if (this.context && this.master)
        this.master.gain.setValueAtTime(muted || this.paused ? 0 : 0.45, this.context.currentTime);
    });
  }

  update(events: readonly CombatEvent[], listenerPosition: Vec3): void {
    if (this.disposed) return;
    for (const event of events) {
      if (event.id <= this.watermark) continue;
      this.watermark = event.id;
      if (this.paused || muteControl.muted || this.context?.state !== 'running') continue;
      if (event.type === 'terrain') {
        // Gun bursts may create hundreds of impacts; bound the audible aggregate.
        if (event.step - this.lastTerrainStep < 12) continue;
        const cue = event.cause === 'water' ? 'terrainWater' : 'terrainGround';
        const gain = combatSoundGain('impact', event.point, listenerPosition);
        if (gain > 0.001 && this.samples?.[cue]) {
          this.lastTerrainStep = event.step;
          this.play(cue, gain, event.id);
        }
        continue;
      }
      const kind: CombatSound | undefined =
        event.type === 'hit'
          ? 'impact'
          : event.type === 'destroyed'
            ? event.cause === 'ground'
              ? 'ground'
              : event.cause === 'water'
                ? 'water'
                : 'explosion'
            : undefined;
      if (!kind) continue;
      const gain = combatSoundGain(kind, event.point, listenerPosition);
      if (gain > 0.001) this.play(kind, gain, event.id);
      if (
        event.type === 'destroyed' &&
        event.cause === 'gun' &&
        event.shooterId === 0 &&
        event.targetId > 0 &&
        !this.playerDestroyed &&
        this.samples?.playerKill
      )
        this.play('playerKill', 0.5, event.id);
    }
  }

  updateGameplay(input: GameplayCueInput): void {
    if (this.disposed || this.paused) return;
    this.playerDestroyed = input.destroyed;
    const cues = this.cues.update(input);
    if (muteControl.muted || this.context?.state !== 'running') return;
    for (const cue of cues) {
      if (this.samples?.[cue]) this.play(cue, cue === 'stall' ? 0.22 : 0.5, input.step);
    }
  }
  hasCue(cue: GameplayCue): boolean {
    return !!this.samples?.[cue];
  }

  private play(kind: CombatSound | GameplayCue, volume: number, eventId: number): void {
    const context = this.context;
    if (!context || !this.master) return;
    try {
      const speech = kind === 'outOfFuel' || kind === 'playerHit' || kind === 'playerKill';
      // No stale radio queue and no overlapping speech recordings.
      if (speech && this.voices.some((voice) => voice.speech)) return;
      while (this.voices.length >= MAX_COMBAT_VOICES) this.stopVoice(this.voices[0]!);
      const group = this.samples?.[kind];
      const clip = group?.[eventId % group.length];
      const key = clip ? `${kind}:${clip.sha256}` : kind;
      let buffer = this.buffers.get(key);
      if (!buffer) {
        const pcm = clip
          ? resampleFlightPcm(flightPcm(clip, false), clip.sampleRate, context.sampleRate)
          : combatSoundPcm(kind as CombatSound, context.sampleRate);
        buffer = context.createBuffer(1, pcm.length, context.sampleRate);
        buffer.getChannelData(0).set(pcm);
        this.buffers.set(key, buffer);
      }
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = volume;
      source.connect(gain).connect(this.master);
      const voice = { source, gain, speech };
      source.onended = () => this.releaseVoice(voice);
      this.voices.push(voice);
      source.start();
      this.played++;
      this.lastPlayed = kind;
      if ((GAMEPLAY_CUES as readonly string[]).includes(kind)) {
        const cue = kind as GameplayCue;
        this.cueCounts[cue] = (this.cueCounts[cue] ?? 0) + 1;
      }
    } catch (error) {
      this.error = String(error);
    }
  }

  private releaseVoice(voice: Voice): void {
    voice.source.onended = null;
    voice.source.disconnect();
    voice.gain.disconnect();
    const index = this.voices.indexOf(voice);
    if (index !== -1) this.voices.splice(index, 1);
  }
  private stopVoice(voice: Voice): void {
    voice.source.onended = null;
    try {
      voice.source.stop();
    } catch {
      /* Already ended. */
    }
    this.releaseVoice(voice);
  }
  private stopVoices(): void {
    for (const voice of [...this.voices]) this.stopVoice(voice);
  }

  setPaused(value: boolean): void {
    this.paused = value;
    if (value) this.stopVoices();
    if (this.context && this.master)
      this.master.gain.setValueAtTime(
        value || muteControl.muted ? 0 : 0.45,
        this.context.currentTime,
      );
  }
  reset(): void {
    this.stopVoices();
    this.watermark = -1;
    this.played = 0;
    this.lastPlayed = undefined;
    this.cues.reset();
    this.cueCounts = {};
    this.lastTerrainStep = -Infinity;
    this.playerDestroyed = false;
  }
  diagnostics() {
    return {
      contextState: this.context?.state ?? 'locked',
      muted: muteControl.muted,
      paused: this.paused,
      voices: this.voices.length,
      played: this.played,
      lastPlayed: this.lastPlayed,
      cueCounts: { ...this.cueCounts },
      watermark: this.watermark,
      source: this.samples ? 'retail-pcm' : 'original-synthesized',
      samples: this.samples
        ? Object.fromEntries(
            Object.entries(this.samples).map(([kind, clips]) => [
              kind,
              clips.map((clip) => clip.source),
            ]),
          )
        : undefined,
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
    this.buffers.clear();
    if (this.context && this.context.state !== 'closed')
      void this.context.close().catch((error: unknown) => {
        this.error = String(error);
      });
  }
}
