/** Original synthesized sounds; no recorded or retail samples. */
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
  private context?: AudioContext;
  private master?: GainNode;
  private jet?: GainNode;
  private wind?: GainNode;
  private burner?: GainNode;
  private actuator?: GainNode;
  private impact?: GainNode;
  private tone?: OscillatorNode;
  private sources: (AudioBufferSourceNode | OscillatorNode)[] = [];
  private previous?: FlightAudioState;
  private disposed = false;
  private muted = false;
  private error: string | undefined;
  private levels = { jet: 0, wind: 0, burner: 0, frequency: 65 };

  private gesture = (event: Event): void => {
    if (!event.isTrusted || this.disposed) return;
    if (event.type === 'keydown') {
      const key = event as KeyboardEvent;
      if (key.repeat || this.editing(key.target)) return;
    }
    this.unlock();
  };
  private key = (event: KeyboardEvent): void => {
    if (
      event.code !== 'KeyM' ||
      event.repeat ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      this.editing(event.target)
    )
      return;
    event.preventDefault();
    this.muted = !this.muted;
    if (this.context && this.master)
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.45, this.context.currentTime, 0.04);
  };
  private editing(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        Boolean(target.closest('input,textarea,select,button,[contenteditable="true"]')))
    );
  }
  constructor() {
    // Creating the context only inside a real gesture avoids autoplay warnings.
    window.addEventListener('pointerdown', this.gesture);
    window.addEventListener('keydown', this.gesture);
    window.addEventListener('keydown', this.key);
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
    master.gain.value = this.muted ? 0 : 0.45;
    master.connect(context.destination);
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
    const tone = context.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = 65;
    const toneLevel = context.createGain();
    toneLevel.gain.value = 0.12;
    tone.connect(toneLevel).connect(this.jet);
    this.tone = tone;
    this.sources = [noise, tone];
    noise.start();
    tone.start();
    this.error = undefined;
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
    this.tone?.frequency.setTargetAtTime(this.levels.frequency, time, 0.12);
    const motion = previous
      ? (Math.abs(unit(state.gear) - unit(previous.gear)) +
          Math.abs(unit(state.hook) - unit(previous.hook))) /
        Math.max(0.001, Number.isFinite(dt) ? dt : 1 / 60)
      : 0;
    ramp(this.actuator, state.status === 'waiting-terrain' ? 0 : unit(motion * 2) * 0.035);
    // First ground spawn is quiet. Only an airborne-to-contact change gets a bump.
    if (
      previous?.status === 'airborne' &&
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
  } {
    return {
      muted: this.muted,
      contextState: this.context?.state ?? 'locked',
      error: this.error,
      levels: { ...this.levels },
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('pointerdown', this.gesture);
    window.removeEventListener('keydown', this.gesture);
    window.removeEventListener('keydown', this.key);
    this.master?.disconnect();
    for (const source of this.sources) {
      source.stop();
      source.disconnect();
    }
    this.sources = [];
    if (this.context && this.context.state !== 'closed')
      void this.context.close().catch(() => undefined);
  }
}
