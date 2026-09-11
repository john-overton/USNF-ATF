import type { Platform } from '../platform/Platform';

export interface BakedTrack {
  name: string;
  wavSha256: string;
  bankSha256: string;
  bytes: number;
  durationSeconds: number;
  renderedSeconds: number;
  limitations: string[];
}
export type BakedTracks = Record<string, BakedTrack>;
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function parseBakedMusic(value: unknown): BakedTracks {
  const data = value as { version?: unknown; rendering?: unknown; tracks?: unknown } | null;
  if (
    data?.version !== 1 ||
    data.rendering !== 'fluidsynth-user-bank' ||
    !data.tracks ||
    typeof data.tracks !== 'object' ||
    Array.isArray(data.tracks)
  )
    throw new Error('Invalid baked music manifest');
  const entries = Object.entries(data.tracks);
  if (entries.length > 256) throw new Error('Baked music library too large');
  const result: BakedTracks = {};
  for (const [key, raw] of entries) {
    const t = raw as BakedTrack | null;
    if (
      !hash(key) ||
      !t ||
      !hash(t.wavSha256) ||
      !hash(t.bankSha256) ||
      typeof t.name !== 'string' ||
      !/^[A-Z0-9]{1,32}\.XMI$/.test(t.name) ||
      !Number.isInteger(t.bytes) ||
      t.bytes < 44 ||
      t.bytes > 54_000_000 ||
      !Number.isFinite(t.durationSeconds) ||
      t.durationSeconds < 0.1 ||
      t.durationSeconds > 600 ||
      !Number.isFinite(t.renderedSeconds) ||
      t.renderedSeconds < t.durationSeconds ||
      t.renderedSeconds > 610 ||
      !Array.isArray(t.limitations) ||
      t.limitations.length > 128 ||
      t.limitations.some((v) => typeof v !== 'string' || v.length > 300)
    )
      throw new Error('Invalid baked music track');
    result[key] = { ...t, limitations: [...t.limitations] };
  }
  return result;
}

/** Two decoded phrases maximum; one read/decode in flight. Never starts audio
 * from an async completion, so pause/reset/disposal cannot revive stale music. */
export class BakedMusic {
  private buffers = new Map<string, AudioBuffer>();
  private failed = new Set<string>();
  private pending = false;
  private disposed = false;
  error?: string;
  constructor(
    readonly tracks: BakedTracks,
    private readonly platform: Platform,
  ) {}
  available(key: string, duration: number): boolean {
    const track = this.tracks[key];
    return (
      !this.disposed &&
      !this.failed.has(key) &&
      !!track &&
      Math.abs(track.durationSeconds - duration) <= 0.01
    );
  }
  ready(key: string): boolean {
    return this.buffers.has(key);
  }
  get(context: AudioContext, key: string, duration: number): AudioBuffer | undefined {
    const track = this.tracks[key];
    if (!track || Math.abs(track.durationSeconds - duration) > 0.01 || this.disposed) return;
    const cached = this.buffers.get(key);
    if (cached) {
      this.buffers.delete(key);
      this.buffers.set(key, cached);
      return cached;
    }
    if (this.pending || this.failed.has(key)) return;
    this.pending = true;
    void this.load(context, key, track).finally(() => {
      this.pending = false;
    });
    return;
  }
  private async load(context: AudioContext, key: string, track: BakedTrack): Promise<void> {
    try {
      const bytes = await this.platform.fs.readBytes(
        'appData',
        `audio/music-baked/${track.wavSha256}.wav`,
      );
      if (bytes.length !== track.bytes) throw new Error('Baked WAV byte count mismatch');
      const data = new Uint8Array(bytes).buffer;
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (v) =>
        v.toString(16).padStart(2, '0'),
      ).join('');
      if (digest !== track.wavSha256) throw new Error('Baked WAV hash mismatch');
      if (this.disposed) return;
      const buffer = await context.decodeAudioData(data);
      if (buffer.numberOfChannels > 2 || Math.abs(buffer.duration - track.renderedSeconds) > 0.05)
        throw new Error('Baked WAV duration/channel mismatch');
      if (this.disposed) return;
      while (this.buffers.size >= 2) this.buffers.delete(this.buffers.keys().next().value!);
      this.buffers.set(key, buffer);
    } catch (error) {
      this.failed.add(key);
      this.error = `${track.name}: ${String(error)}; oscillator fallback`;
    }
  }
  dispose(): void {
    this.disposed = true;
    this.buffers.clear();
  }
}
