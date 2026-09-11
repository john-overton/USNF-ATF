import { expect, test, afterEach } from 'bun:test';
import { audioMixer, connectMixer, DEFAULT_MIXER, parseMixer, type MixerBus } from './AudioMixer';
import type { Platform } from '../platform/Platform';

afterEach(() => {
  for (const bus of Object.keys(DEFAULT_MIXER) as MixerBus[]) audioMixer.set(bus, 1);
});
test('mixer validates persistence and clamps controls without amplifying above unity', () => {
  expect(parseMixer({ version: 1, levels: DEFAULT_MIXER })).toEqual(DEFAULT_MIXER);
  for (const n of [-1, NaN, Infinity, 2, '1'])
    expect(() => parseMixer({ version: 1, levels: { ...DEFAULT_MIXER, music: n } })).toThrow();
  audioMixer.set('master', 0.5);
  audioMixer.set('music', 0.4);
  expect(audioMixer.gain('music')).toBeCloseTo(0.2);
  expect(audioMixer.gain('weapons')).toBe(0.5);
  audioMixer.set('music', NaN);
  expect(audioMixer.gain('music')).toBeCloseTo(0.2);
  audioMixer.set('music', 5);
  expect(audioMixer.gain('music')).toBe(0.5);
});
test('mixer gain node applies live levels and unsubscribes on disposal', () => {
  const values: number[] = [];
  let disconnected = false;
  const gain = {
    gain: { value: 1, setTargetAtTime: (v: number) => values.push(v) },
    connect: () => undefined,
    disconnect: () => {
      disconnected = true;
    },
  };
  const context = {
    createGain: () => gain,
    currentTime: 0,
    destination: {},
  } as unknown as AudioContext;
  const source = { connect: () => gain } as unknown as AudioNode;
  const close = connectMixer(context, source, 'weapons');
  audioMixer.set('weapons', 0);
  expect(values.at(-1)).toBe(0);
  close();
  const count = values.length;
  audioMixer.set('weapons', 1);
  expect(values).toHaveLength(count);
  expect(disconnected).toBe(true);
});
test('late settings load cannot overwrite a user change', async () => {
  let finish!: (text: string) => void;
  const platform = {
    fs: {
      exists: () => Promise.resolve(true),
      readText: () =>
        new Promise<string>((r) => {
          finish = r;
        }),
    },
  } as unknown as Platform;
  const load = audioMixer.load(platform);
  await Promise.resolve();
  audioMixer.set('master', 0.25);
  finish(JSON.stringify({ version: 1, levels: DEFAULT_MIXER }));
  await load;
  expect(audioMixer.snapshot().master).toBe(0.25);
});
