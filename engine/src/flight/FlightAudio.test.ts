import { expect, test } from 'bun:test';
import {
  resampleFlightPcm,
  engineAudioEvent,
  flightPcm,
  parseFlightSamples,
  parseEnvironmentSamples,
  flightAudioLevels,
  type FlightAudioState,
} from './FlightAudio';

const flying: FlightAudioState = {
  engineRunning: true,
  spool: 1,
  throttle: 1,
  afterburner: true,
  airspeed: 150,
  gear: 0,
  hook: 0,
  status: 'airborne',
};

test('engine shutdown silences burner immediately, preserves wind and residual spool', () => {
  const running = flightAudioLevels(flying);
  const stopping = flightAudioLevels({ ...flying, engineRunning: false, spool: 0.5 });
  const stopped = flightAudioLevels({ ...flying, engineRunning: false, spool: 0 });
  expect(running.burner).toBeGreaterThan(0);
  expect(stopping.burner).toBe(0);
  expect(stopping.jet).toBeGreaterThan(0);
  expect(stopping.jet).toBeLessThan(running.jet);
  expect(stopped.jet).toBe(0);
  expect(stopped.wind).toBe(running.wind);
});

test('missing terrain and crash silence continuous flight sounds; bad inputs stay bounded', () => {
  for (const status of ['waiting-terrain', 'crashed']) {
    const levels = flightAudioLevels({ ...flying, status });
    expect([levels.jet, levels.wind, levels.burner]).toEqual([0, 0, 0]);
  }
  const levels = flightAudioLevels({ ...flying, spool: NaN, airspeed: Infinity, throttle: -5 });
  expect([levels.jet, levels.wind, levels.burner]).toEqual([0, 0, 0]);
  expect(levels.frequency).toBe(65);
});

test('actual engine toggles trigger exactly one transition and initial spawn stays quiet', () => {
  expect(engineAudioEvent(undefined, flying)).toBeUndefined();
  expect(engineAudioEvent(flying, { ...flying, engineRunning: false })).toBe('stop');
  expect(engineAudioEvent({ ...flying, engineRunning: false }, flying)).toBe('start');
  expect(engineAudioEvent(flying, { ...flying, throttle: 0 })).toBeUndefined();
});

test('retail loop removes DC and wraps without a discontinuity; one-shots fade endpoints', () => {
  const clip = {
    source: 'synthetic.11K',
    sha256: 'a'.repeat(64),
    sampleRate: 11025,
    pcm: Array.from({ length: 22050 }, (_, i) => Math.round(150 + 60 * Math.sin(i * 0.12))),
  };
  const loop = flightPcm(clip, true);
  expect(loop[0]).toBe(loop[loop.length - 1]);
  expect(Math.abs(loop.reduce((a, b) => a + b, 0) / loop.length)).toBeLessThan(0.002);
  const once = flightPcm(clip, false);
  expect(once.length).toBe(clip.pcm.length);
  expect(once[0]).toBe(0);
  expect(once[once.length - 1]).toBe(0);
  expect(Math.max(...once)).toBeLessThan(1);
});

test('audio manifest rejects invalid PCM/rates and accepts bounded unsigned samples', () => {
  const clip = {
    source: 'synthetic.5K',
    sha256: 'a'.repeat(64),
    sampleRate: 5512,
    encoding: 'unsigned8-mono',
    pcm: [0, 128, 255],
  };
  const manifest = {
    schemaVersion: 1,
    clips: { jet: clip, burner: clip, start: clip, stop: clip },
  };
  expect(parseFlightSamples(manifest).start.pcm).toEqual([0, 128, 255]);
  for (const patch of [
    { pcm: [256, 0] },
    { pcm: [NaN, 0] },
    { sampleRate: 0 },
    { encoding: 'signed16' },
  ]) {
    expect(() =>
      parseFlightSamples({
        ...manifest,
        clips: { ...manifest.clips, start: { ...clip, ...patch } },
      }),
    ).toThrow();
  }
});

test('5K PCM resampling preserves duration and exact fade/loop endpoints', () => {
  const pcm = Float32Array.from([0, 0.5, -0.5, 0]);
  const resampled = resampleFlightPcm(pcm, 5512, 48000);
  expect(resampled.length).toBe(Math.round((4 * 48000) / 5512));
  expect(resampled[0]).toBe(0);
  expect(resampled[resampled.length - 1]).toBe(0);
});

test('environment PCM requires both attributed bounded wind and tire loops', () => {
  const clip = {
    source: 'synthetic.5K',
    sha256: 'a'.repeat(64),
    sampleRate: 5512,
    encoding: 'unsigned8-mono',
    pcm: [128, 1, 255, 128],
  };
  const data = { schemaVersion: 1, source: 'retail-pcm', clips: { wind: [clip], rolling: [clip] } };
  expect(parseEnvironmentSamples(data).rolling.source).toBe(clip.source);
  expect(() => parseEnvironmentSamples({ ...data, clips: { wind: [clip] } })).toThrow();
  expect(() =>
    parseEnvironmentSamples({
      ...data,
      clips: { ...data.clips, wind: [{ ...clip, pcm: [128, -1] }] },
    }),
  ).toThrow();
});
