import { expect, test } from 'bun:test';
import type { Platform } from '../platform/Platform';
import { BakedMusic, parseBakedMusic } from './BakedMusic';

const bytes = new Uint8Array([1, 2, 3]);
const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (v) =>
  v.toString(16).padStart(2, '0'),
).join('');
const entry = {
  name: 'AIR01.XMI',
  wavSha256: digest,
  bankSha256: 'b'.repeat(64),
  bytes: 44,
  durationSeconds: 1,
  renderedSeconds: 2,
  limitations: [],
};
const manifest = () => ({
  version: 1,
  rendering: 'fluidsynth-user-bank',
  tracks: { ['a'.repeat(64)]: { ...entry } },
});
const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

test('baked sidecar rejects unsafe identifiers, unbounded sizes and malformed durations', () => {
  expect(Object.keys(parseBakedMusic(manifest()))).toHaveLength(1);
  for (const patch of [
    { name: '../x.XMI' },
    { wavSha256: '../x' },
    { bankSha256: '' },
    { bytes: 54_000_001 },
    { bytes: 44.5 },
    { durationSeconds: NaN },
    { renderedSeconds: 0.5 },
    { limitations: [1] },
  ]) {
    const data = manifest();
    Object.assign(data.tracks['a'.repeat(64)]!, patch);
    expect(() => parseBakedMusic(data)).toThrow();
  }
  expect(() => parseBakedMusic({ ...manifest(), tracks: [] })).toThrow();
});

test('lazy baked cache verifies bytes/hash, bounds concurrent reads and caches two phrases', async () => {
  let reads = 0;
  const platform = {
    fs: {
      readBytes: () => {
        reads++;
        return Promise.resolve(bytes);
      },
    },
  } as unknown as Platform;
  const buffer = { duration: 2, numberOfChannels: 2 } as AudioBuffer;
  const context = { decodeAudioData: () => Promise.resolve(buffer) } as unknown as AudioContext;
  const tracks = Object.fromEntries(
    ['a', 'b', 'c'].map((k) => [k.repeat(64), { ...entry, bytes: 3 }]),
  );
  const cache = new BakedMusic(tracks, platform);
  const key = 'a'.repeat(64);
  expect(cache.get(context, key, 1)).toBeUndefined();
  cache.get(context, key, 1);
  cache.get(context, 'b'.repeat(64), 1);
  expect(reads).toBe(1);
  await settle();
  expect(cache.get(context, key, 1)).toBe(buffer);
  for (const k of ['b', 'c']) {
    cache.get(context, k.repeat(64), 1);
    await settle();
  }
  expect(reads).toBe(3);
  expect(cache.get(context, key, 1)).toBeUndefined();
  expect(reads).toBe(4);
  cache.dispose();
  await settle();
  expect(cache.get(context, key, 1)).toBeUndefined();
});

test('missing/corrupt baked audio fails once without starting playback or retry storms', async () => {
  for (const corrupt of [true, false]) {
    let reads = 0;
    const platform = {
      fs: {
        readBytes: () => {
          reads++;
          if (!corrupt) return Promise.reject(Error('missing'));
          return Promise.resolve(bytes);
        },
      },
    } as unknown as Platform;
    const cache = new BakedMusic(
      { ['a'.repeat(64)]: { ...entry, bytes: 3, wavSha256: 'c'.repeat(64) } },
      platform,
    );
    const context = {
      decodeAudioData: () => {
        throw Error('must not decode corrupt hash');
      },
    } as unknown as AudioContext;
    cache.get(context, 'a'.repeat(64), 1);
    await settle();
    cache.get(context, 'a'.repeat(64), 1);
    expect(reads).toBe(1);
    expect(cache.error).toContain('oscillator fallback');
  }
});
