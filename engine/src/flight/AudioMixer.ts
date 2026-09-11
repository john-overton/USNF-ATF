import type { Platform } from '../platform/Platform';

export const MIXER_LABELS = {
  master: 'Master volume',
  music: 'In-flight music',
  aircraft: 'Engines & environment',
  weapons: 'Guns',
  effects: 'Explosions, radio & warnings',
  menu: 'Menu sounds & title music',
} as const;
export type MixerBus = keyof typeof MIXER_LABELS;
export type MixerLevels = Record<MixerBus, number>;
export const DEFAULT_MIXER: MixerLevels = {
  master: 1,
  music: 1,
  aircraft: 1,
  weapons: 1,
  effects: 1,
  menu: 1,
};
export function parseMixer(value: unknown): MixerLevels {
  if (!value || typeof value !== 'object') throw Error('Invalid mixer settings');
  const data = value as { version?: unknown; levels?: Partial<MixerLevels> };
  if (data.version !== 1 || !data.levels) throw Error('Invalid mixer version');
  const result = { ...DEFAULT_MIXER };
  for (const key of Object.keys(result) as MixerBus[]) {
    const n = data.levels[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1)
      throw Error('Invalid mixer level');
    result[key] = n;
  }
  return result;
}
class AudioMixer {
  private levels = { ...DEFAULT_MIXER };
  private listeners = new Set<() => void>();
  private revision = 0;
  snapshot = (): MixerLevels => this.levels;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  set(bus: MixerBus, value: number): void {
    if (!Number.isFinite(value)) return;
    this.levels = { ...this.levels, [bus]: Math.max(0, Math.min(1, value)) };
    this.revision++;
    this.listeners.forEach((fn) => fn());
  }
  gain(bus: Exclude<MixerBus, 'master'>): number {
    return this.levels.master * this.levels[bus];
  }
  async load(platform: Platform): Promise<void> {
    const revision = this.revision;
    if (!(await platform.fs.exists('appData', 'settings/audio-mixer.json'))) return;
    const text = await platform.fs.readText('appData', 'settings/audio-mixer.json');
    if (text.length > 4096) throw Error('Mixer settings too large');
    const levels = parseMixer(JSON.parse(text));
    if (this.revision === revision) {
      this.levels = levels;
      this.listeners.forEach((fn) => fn());
    }
  }
}
export const audioMixer = new AudioMixer();
/** Post-mix gain preserves existing envelopes, mute and pause behavior. */
export function connectMixer(
  context: AudioContext,
  source: AudioNode,
  bus: Exclude<MixerBus, 'master'>,
): () => void {
  const gain = context.createGain();
  gain.gain.value = audioMixer.gain(bus);
  source.connect(gain).connect(context.destination);
  const unsubscribe = audioMixer.subscribe(() =>
    gain.gain.setTargetAtTime(audioMixer.gain(bus), context.currentTime, 0.025),
  );
  return () => {
    unsubscribe();
    gain.disconnect();
  };
}
