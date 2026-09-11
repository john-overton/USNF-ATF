import type { AircraftId } from './aircraft-catalog';
import { connectMixer } from './AudioMixer';
import { isEditingTarget, muteControl } from './mute';
import type { Platform } from '../platform/Platform';

type ClipRole = 'jet' | 'burner' | 'start' | 'stop';
export interface FlightClip {
  source: string;
  sha256: string;
  sampleRate: number;
  pcm: number[];
}
export type FlightSamples = Record<ClipRole, FlightClip>;
export type EnvironmentSamples = Record<'wind' | 'rolling', FlightClip>;
export function parseEnvironmentSamples(value: unknown): EnvironmentSamples {
  const data = value as {
    schemaVersion?: number;
    source?: string;
    clips?: Record<string, FlightClip[]>;
  };
  if (data?.schemaVersion !== 1 || data.source !== 'retail-pcm' || !data.clips)
    throw new Error('Invalid environment audio manifest');
  const result = {} as EnvironmentSamples;
  for (const role of ['wind', 'rolling'] as const) {
    const group = data.clips[role];
    if (!Array.isArray(group) || group.length !== 1) throw new Error('Invalid environment group');
    const clip = group[0] as FlightClip & { encoding?: string };
    if (
      !clip ||
      typeof clip.source !== 'string' ||
      clip.source.length > 80 ||
      !/^[a-f0-9]{64}$/.test(clip.sha256) ||
      clip.encoding !== 'unsigned8-mono' ||
      ![5512, 8010, 11025].includes(clip.sampleRate) ||
      !Array.isArray(clip.pcm) ||
      clip.pcm.length < 2 ||
      clip.pcm.length > 1000000 ||
      !clip.pcm.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    )
      throw new Error('Invalid environment PCM');
    result[role] = clip;
  }
  return result;
}
export function parseFlightSamples(value: unknown): FlightSamples {
  const data = value as { schemaVersion?: number; clips?: Record<string, unknown> };
  if (data?.schemaVersion !== 1 || !data.clips) throw new Error('Invalid flight audio manifest');
  const result = {} as FlightSamples;
  for (const role of ['jet', 'burner', 'start', 'stop'] as const) {
    const c = data.clips[role] as FlightClip & { encoding?: string };
    if (
      !c ||
      typeof c.source !== 'string' ||
      !/^[a-f0-9]{64}$/.test(c.sha256) ||
      c.encoding !== 'unsigned8-mono' ||
      ![5512, 8000, 8010, 11025].includes(c.sampleRate) ||
      !Array.isArray(c.pcm) ||
      c.pcm.length < 2 ||
      c.pcm.length > 1000000 ||
      !c.pcm.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    )
      throw new Error(`Invalid flight audio ${role}`);
    result[role] = c;
  }
  return result;
}
/** Remove DC and crossfade the tail into the head without a wrap discontinuity.
 * The returned loop starts after the crossfade head; one-shots keep their full duration. */
export function flightPcm(
  clip: { sampleRate: number; pcm: number[] },
  loop: boolean,
): Float32Array {
  const pcm = Float32Array.from(clip.pcm, (x) => (x - 128) / 128);
  const mean = pcm.reduce((a, b) => a + b, 0) / pcm.length;
  for (let i = 0; i < pcm.length; i++) pcm[i] = pcm[i]! - mean;
  const fade = Math.min(
    Math.floor(clip.sampleRate * (loop ? 0.04 : 0.006)),
    Math.floor(pcm.length / 4),
  );
  if (loop && fade > 1) {
    for (let i = 0; i < fade; i++) {
      const mix = i / (fade - 1);
      pcm[pcm.length - fade + i] = pcm[pcm.length - fade + i]! * (1 - mix) + pcm[i]! * mix;
    }
    return pcm.slice(fade - 1);
  }
  for (let i = 0; i < fade; i++) {
    pcm[i] = pcm[i]! * (i / fade);
    pcm[pcm.length - 1 - i] = pcm[pcm.length - 1 - i]! * (i / fade);
  }
  pcm[0] = 0;
  pcm[pcm.length - 1] = 0;
  return pcm;
}
/** Web Audio rejects source rates below 8 kHz; resample the 5K clips explicitly. */
export function resampleFlightPcm(pcm: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return pcm;
  const out = new Float32Array(Math.max(2, Math.round((pcm.length * to) / from)));
  for (let i = 0; i < out.length; i++) {
    const at = (i * (pcm.length - 1)) / (out.length - 1);
    const lo = Math.floor(at);
    out[i] = pcm[lo]! + (pcm[Math.min(pcm.length - 1, lo + 1)]! - pcm[lo]!) * (at - lo);
  }
  return out;
}
export function engineAudioEvent(
  previous: FlightAudioState | undefined,
  state: FlightAudioState,
): 'start' | 'stop' | undefined {
  return previous && previous.engineRunning !== state.engineRunning
    ? state.engineRunning
      ? 'start'
      : 'stop'
    : undefined;
}
/** Local PT-selected retail samples when installed, filtered noise fallback otherwise. */
export interface FlightAudioState {
  engineRunning: boolean;
  spool: number;
  throttle: number;
  afterburner: boolean;
  airspeed: number;
  /** Normalized extension: zero retracted, one extended. */
  gear: number;
  hook: number;
  status: string;
  groundSpeed?: number;
  retailActuators?: boolean;
  retailTouchdown?: boolean;
}
const unit = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
export function flightAudioLevels(state: FlightAudioState): {
  jet: number;
  wind: number;
  burner: number;
  frequency: number;
} {
  const spool = unit(state.spool);
  const quiet = state.status === 'waiting-terrain' || state.status === 'crashed';
  return {
    // Residual spool remains audible during engine shutdown.
    jet: quiet ? 0 : spool * (0.035 + unit(state.throttle) * 0.04),
    wind: quiet ? 0 : unit(state.airspeed / 300) ** 2 * 0.075,
    burner: !quiet && state.engineRunning && state.afterburner ? spool ** 2 * 0.055 : 0,
    frequency: 65 + spool * 155,
  };
}

/** A scene owns one instance and disposes it together with its input adapter. */
export class FlightAudio {
  private disconnectMixer?: () => void;
  private context?: AudioContext;
  private master?: GainNode;
  private jet?: GainNode;
  private wind?: GainNode;
  private burner?: GainNode;
  private actuator?: GainNode;
  private impact?: GainNode;
  private rolling?: GainNode;
  private buffers: Partial<Record<ClipRole, AudioBuffer>> = {};
  private transition?: AudioBufferSourceNode;
  private transitionGain?: GainNode;
  private transitionEvents = { start: 0, stop: 0 };
  private lastTransition: 'start' | 'stop' | undefined;
  static async create(platform: Platform, id: AircraftId = 'f14'): Promise<FlightAudio> {
    let samples: FlightSamples | undefined;
    let error: string | undefined;
    let environment: EnvironmentSamples | undefined;
    try {
      if (await platform.fs.exists('appData', `audio/${id}.json`)) {
        const text = await platform.fs.readText('appData', `audio/${id}.json`);
        if (text.length > 16000000) throw new Error('Flight audio manifest too large');
        samples = parseFlightSamples(JSON.parse(text));
      }
    } catch (e) {
      error = String(e);
    }
    try {
      if (await platform.fs.exists('appData', 'audio/environment.json')) {
        const text = await platform.fs.readText('appData', 'audio/environment.json');
        if (text.length > 8000000) throw new Error('Environment audio manifest too large');
        environment = parseEnvironmentSamples(JSON.parse(text));
      }
    } catch (e) {
      error = String(e);
    }
    const audio = new FlightAudio(samples, environment);
    audio.error = error;
    return audio;
  }
  private sources: (AudioBufferSourceNode | OscillatorNode)[] = [];
  private previous?: FlightAudioState;
  private disposed = false;
  private paused = false;
  setPaused(value: boolean): void {
    this.paused = value;
    const context = this.context;
    if (!context || context.state === 'closed') return;
    void (value ? context.suspend() : context.resume()).catch((error: unknown) => {
      this.error = String(error);
    });
  }
  private unsubscribeMute?: () => void;
  private error: string | undefined;
  private levels = { jet: 0, wind: 0, burner: 0, frequency: 65 };

  private gesture = (event: Event): void => {
    if (!event.isTrusted || this.disposed || this.paused) return;
    if (event.type === 'keydown') {
      const key = event as KeyboardEvent;
      if (key.repeat || isEditingTarget(key.target)) return;
    }
    this.unlock();
  };
  constructor(
    private readonly samples?: FlightSamples,
    private readonly environment?: EnvironmentSamples,
  ) {
    // Creating the context only inside a real gesture avoids autoplay warnings.
    window.addEventListener('pointerdown', this.gesture);
    window.addEventListener('keydown', this.gesture);
    this.unsubscribeMute = muteControl.subscribe((muted) => {
      if (this.context && this.master)
        this.master.gain.setTargetAtTime(muted ? 0 : 0.45, this.context.currentTime, 0.04);
    });
  }
  private unlock(): void {
    try {
      if (!this.context) this.create();
      if (this.context?.state === 'suspended') {
        void this.context.resume().catch((error: unknown) => {
          this.error = String(error);
        });
      }
    } catch (error) {
      this.error = String(error);
    }
  }
  private create(): void {
    const context = new AudioContext();
    this.context = context;
    const master = context.createGain();
    master.gain.value = muteControl.muted ? 0 : 0.45;
    this.disconnectMixer = connectMixer(context, master, 'aircraft');
    this.master = master;
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const voice = (type: BiquadFilterType, frequency: number, q = 0.7): GainNode => {
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      const gain = context.createGain();
      gain.gain.value = 0;
      noise.connect(filter).connect(gain).connect(master);
      return gain;
    };
    this.jet = voice('bandpass', 650);
    this.wind = voice('lowpass', 1200);
    this.burner = voice('lowpass', 240);
    this.actuator = voice('bandpass', 1100, 2);
    this.impact = voice('lowpass', 180);
    // No tonal oscillator: the former low sine added an artificial buzz.
    this.sources = [noise];
    noise.start();
    if (this.environment) {
      this.wind.disconnect();
      for (const role of ['wind', 'rolling'] as const) {
        const clip = this.environment[role];
        const pcm = resampleFlightPcm(flightPcm(clip, true), clip.sampleRate, context.sampleRate);
        const source = context.createBufferSource();
        source.buffer = context.createBuffer(1, pcm.length, context.sampleRate);
        source.buffer.getChannelData(0).set(pcm);
        source.loop = true;
        const gain = context.createGain();
        gain.gain.value = 0;
        source.connect(gain).connect(master);
        this[role] = gain;
        this.sources.push(source);
        source.start();
      }
    }
    if (this.samples) {
      for (const role of ['jet', 'burner', 'start', 'stop'] as const) {
        const clip = this.samples[role];
        const pcm = resampleFlightPcm(
          flightPcm(clip, role === 'jet' || role === 'burner'),
          clip.sampleRate,
          context.sampleRate,
        );
        const buffer = context.createBuffer(1, pcm.length, context.sampleRate);
        buffer.getChannelData(0).set(pcm);
        this.buffers[role] = buffer;
      }
      // Replace synthetic engine voices; wind/contact/actuators remain original.
      this.jet.disconnect();
      this.burner.disconnect();
      for (const role of ['jet', 'burner'] as const) {
        const source = context.createBufferSource();
        source.buffer = this.buffers[role]!;
        source.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 4000;
        filter.Q.value = 0.5;
        const gain = context.createGain();
        gain.gain.value = 0;
        source.connect(filter).connect(gain).connect(master);
        this[role] = gain;
        this.sources.push(source);
        source.start();
      }
    }
  }
  private playTransition(role: 'start' | 'stop'): void {
    const context = this.context;
    if (!context || !this.master) return;
    const time = context.currentTime;
    // A repeated toggle fades its predecessor rather than stacking motors/clicks.
    if (this.transition && this.transitionGain) {
      this.transitionGain.gain.cancelScheduledValues(time);
      this.transitionGain.gain.setTargetAtTime(0, time, 0.02);
      this.transition.stop(time + 0.15);
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    let buffer = this.buffers[role];
    if (!buffer) {
      buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const pcm = buffer.getChannelData(0);
      let smooth = 0;
      for (let i = 0; i < pcm.length; i++) {
        smooth = smooth * 0.94 + (Math.random() * 2 - 1) * 0.06;
        const t = i / pcm.length;
        pcm[i] = smooth * Math.sin(Math.PI * t) * (role === 'start' ? t : 1 - t);
      }
    }
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2600;
    source.connect(filter).connect(gain).connect(this.master);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.5, time + 0.015);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    this.transition = source;
    this.transitionGain = gain;
    this.transitionEvents[role]++;
    this.lastTransition = role;
    source.start();
  }

  update(state: FlightAudioState, dt = 1 / 60): void {
    if (this.disposed) return;
    this.levels = flightAudioLevels(state);
    const previous = this.previous;
    this.previous = { ...state };
    const context = this.context;
    if (!context || context.state === 'closed') return;
    const time = context.currentTime;
    const ramp = (node: GainNode | undefined, value: number): void => {
      node?.gain.setTargetAtTime(value, time, 0.08);
    };
    ramp(this.jet, this.levels.jet);
    ramp(this.wind, this.levels.wind);
    ramp(this.burner, this.levels.burner);
    ramp(
      this.rolling,
      state.status === 'grounded' && state.gear >= 0.99
        ? unit((state.groundSpeed ?? 0) / 50) * 0.09
        : 0,
    );
    const event = engineAudioEvent(previous, state);
    if (event && state.status !== 'waiting-terrain' && state.status !== 'crashed')
      this.playTransition(event);
    const motion = previous
      ? (Math.abs(unit(state.gear) - unit(previous.gear)) +
          Math.abs(unit(state.hook) - unit(previous.hook))) /
        Math.max(0.001, Number.isFinite(dt) ? dt : 1 / 60)
      : 0;
    ramp(
      this.actuator,
      state.status === 'waiting-terrain' || state.retailActuators ? 0 : unit(motion * 2) * 0.035,
    );
    // First ground spawn is quiet. Only an airborne-to-contact change gets a bump.
    if (
      previous?.status === 'airborne' &&
      !state.retailTouchdown &&
      (state.status === 'grounded' || state.status === 'crashed') &&
      this.impact
    ) {
      const gain = this.impact.gain;
      gain.cancelScheduledValues(time);
      gain.setValueAtTime(state.status === 'crashed' ? 0.2 : 0.09, time);
      gain.exponentialRampToValueAtTime(0.0001, time + 0.35);
      gain.setValueAtTime(0, time + 0.36);
    }
  }
  diagnostics(): {
    muted: boolean;
    contextState: AudioContextState | 'locked';
    error: string | undefined;
    levels: ReturnType<typeof flightAudioLevels>;
    source: 'retail-pt-samples' | 'original-filtered-noise';
    clips: Partial<Record<ClipRole, { source: string; sha256: string }>>;
    transitionEvents: { start: number; stop: number };
    lastTransition: 'start' | 'stop' | undefined;
    environmentSource: 'retail-pcm' | 'original-filtered-noise';
    environmentClips: string[];
  } {
    return {
      muted: muteControl.muted,
      contextState: this.context?.state ?? 'locked',
      error: this.error,
      levels: { ...this.levels },
      source: this.samples ? 'retail-pt-samples' : 'original-filtered-noise',
      clips: this.samples
        ? Object.fromEntries(
            Object.entries(this.samples).map(([k, c]) => [
              k,
              { source: c.source, sha256: c.sha256 },
            ]),
          )
        : {},
      transitionEvents: { ...this.transitionEvents },
      lastTransition: this.lastTransition,
      environmentSource: this.environment ? 'retail-pcm' : 'original-filtered-noise',
      environmentClips: this.environment
        ? Object.values(this.environment).map((clip) => clip.source)
        : [],
    };
  }
  dispose(): void {
    this.disconnectMixer?.();
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('pointerdown', this.gesture);
    window.removeEventListener('keydown', this.gesture);
    this.unsubscribeMute?.();
    this.master?.disconnect();
    this.transition?.stop();
    for (const source of this.sources) {
      source.stop();
      source.disconnect();
    }
    this.sources = [];
    if (this.context && this.context.state !== 'closed')
      void this.context.close().catch(() => undefined);
  }
}
