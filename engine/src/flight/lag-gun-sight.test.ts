import { expect, test } from 'bun:test';
import { createFlightState, attitudeFromEuler } from '../sim/flight';
import { LagGunSight } from './lag-gun-sight';
import { syntheticNativeGun } from '../sim/flight/gun-fixture';

test('both modes trail aircraft aiming history; target velocity does not draw a lead cue', () => {
  const history = new LagGunSight();
  let state = createFlightState({ position: { x: 0, y: 1000, z: 0 }, airspeed: 200 });
  for (let i = 0; i <= 240; i++) {
    state = { ...state, timeSeconds: i / 120, attitude: attitudeFromEuler(0, (i / 120) * 0.1, 0) };
    history.record(state);
  }
  const target = { position: { x: 0, y: 1000, z: -800 }, velocity: { x: 0, y: 0, z: 0 } };
  for (const mode of ['remake', 'retail'] as const) {
    const solution = history.solution(state, syntheticNativeGun, mode, target);
    const fastTarget = history.solution(state, syntheticNativeGun, mode, {
      ...target,
      velocity: { x: 900, y: 0, z: 0 },
    });
    expect(solution.status).toBe('solution');
    expect(solution.point).toEqual(fastTarget.point);
    expect(solution.point!.x).toBeLessThan(0);
    expect(Math.abs(solution.point!.x)).toBeLessThan(Math.sin(0.2) * 800);
  }
  const retail = history.solution(state, syntheticNativeGun, 'retail', target);
  const remake = history.solution(state, syntheticNativeGun, 'remake', target);
  expect(retail.timeSeconds!).toBeGreaterThan(remake.timeSeconds!);
});
test('unranged pipper uses quarter-second history and never calls target interception', () => {
  const history = new LagGunSight();
  const state = createFlightState({ position: { x: 0, y: 1000, z: 0 }, airspeed: 200 });
  history.record(state);
  for (const mode of ['remake', 'retail'] as const) {
    const solution = history.solution(state, syntheticNativeGun, mode);
    expect(solution.timeSeconds).toBe(0.25);
    expect(solution.rangeSource).toBe('base');
    expect(solution.point!.x).toBe(0);
  }
  history.reset();
  expect(history.solution(state, syntheticNativeGun, 'retail').point).toBeNull();
});

test('both modes correct downward drop without predicting the target position', () => {
  const history = new LagGunSight();
  const state = createFlightState({ position: { x: 0, y: 1000, z: 0 }, airspeed: 0 });
  history.record(state);
  const target = { position: { x: 0, y: 1000, z: -900 }, velocity: { x: 50, y: 20, z: 0 } };
  for (const mode of ['retail', 'remake'] as const) {
    const solution = history.solution(state, syntheticNativeGun, mode, target);
    const gravity = mode === 'retail' ? 32 * 0.3048 : 9.80665;
    expect(solution.point!.x).toBe(0);
    expect(solution.point!.y).toBeCloseTo(1000 - 0.5 * gravity * solution.timeSeconds! ** 2);
  }
});
