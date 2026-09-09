import { expect, test } from 'bun:test';
import { flightAudioLevels, type FlightAudioState } from './FlightAudio';

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
