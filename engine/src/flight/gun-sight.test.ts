import { expect, test } from 'bun:test';
import { Quaternion, Vector3 } from 'three';
import { createFlightState } from '../sim/flight';
import { createGunState, stepGun } from '../sim/flight/gun';
import type { RetailGun } from '../data/retail-gun';
import { gunSight } from './gun-sight';
const gun: RetailGun = {
  schemaVersion: 1,
  aircraftSource: 'F14.PT',
  aircraftSha256: 'a'.repeat(64),
  name: 'Synthetic M61',
  type: 'm61',
  capacity: 675,
  muzzleSpeedMps: 1030,
  roundsPerSecond: 100,
  tracerEvery: 5,
  tracerColor: 'red',
  mounts: [[0, 0, -6]],
  clip: { source: 'synthetic.11k', sha256: 'b'.repeat(64), sampleRate: 11025, pcm: [128, 127] },
};

test('surface range follows the forward ray and cue agrees with emitted rounds', () => {
  const aircraft = createFlightState({ position: { x: 0, y: 150, z: 0 }, airspeed: 150 });
  const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.3);
  aircraft.attitude = { x: q.x, y: q.y, z: q.z, w: q.w };
  const result = gunSight(aircraft, gun, () => ({ height: 0 }));
  expect(result.status).toBe('solution');
  expect(result.rangeM!).toBeCloseTo(150 / Math.sin(0.3) - 6, 1);
  const rounds = createGunState(gun);
  const dt = result.timeSeconds! / 200;
  for (let i = 0; i < 200; i++) stepGun(rounds, gun, aircraft, i === 0, false, dt);
  const round = rounds.rounds[0]!;
  expect(
    new Vector3(round.position.x, round.position.y, round.position.z).distanceTo(
      new Vector3(result.point!.x, result.point!.y, result.point!.z),
    ),
  ).toBeLessThan(1e-8);
});
test('sky and missing data use labelled base range; unavailable gun has no solution', () => {
  const aircraft = createFlightState({ position: { x: 0, y: 300, z: 0 }, airspeed: 150 });
  expect(gunSight(aircraft, gun, () => ({ height: 0 })).rangeM).toBe(1000);
  expect(gunSight(aircraft, gun, () => ({ height: 0 })).rangeSource).toBe('base');
  expect(gunSight(aircraft, gun, () => undefined).rangeM).toBe(1000);
  expect(gunSight(aircraft, undefined, () => ({ height: 0 })).status).toBe('unavailable');
});
test('target plumbing solves moving intercept including inherited speed and gravity', () => {
  const aircraft = createFlightState({ position: { x: 0, y: 300, z: 0 }, airspeed: 150 });
  const target = { position: { x: 0, y: 300, z: -1000 }, velocity: { x: 100, y: 0, z: 0 } };
  const result = gunSight(
    aircraft,
    gun,
    () => {
      throw new Error('target must not sample terrain');
    },
    target,
  );
  expect(result.mode).toBe('target');
  expect(result.status).toBe('solution');
  expect(result.point!.x).toBeGreaterThan(0);
  expect(result.point!.y).toBeGreaterThan(aircraft.position.y);
  const t = result.timeSeconds!;
  const muzzle = new Vector3(result.point!.x, result.point!.y - 300, result.point!.z + 6)
    .normalize()
    .multiplyScalar(gun.muzzleSpeedMps);
  const impact = muzzle
    .add(new Vector3(0, 0, -150))
    .multiplyScalar(t)
    .add(new Vector3(0, 300 - 0.5 * 9.80665 * t * t, -6));
  expect(impact.distanceTo(new Vector3(100 * t, 300, -1000))).toBeLessThan(0.001);
  expect(
    gunSight(aircraft, gun, () => undefined, { ...target, velocity: { x: 0, y: 0, z: -5000 } })
      .status,
  ).toBe('no-range');
  expect(
    gunSight(aircraft, gun, () => undefined, { ...target, position: { x: 0, y: 300, z: 1000 } })
      .status,
  ).toBe('no-range');
  expect(gunSight(aircraft, gun, () => undefined).mode).toBe('terrain');
});

test('far terrain is capped and base pipper includes aircraft lateral inertia', () => {
  const aircraft = createFlightState({ position: { x: 0, y: 300, z: 0 }, airspeed: 150 });
  const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.1);
  aircraft.attitude = { x: q.x, y: q.y, z: q.z, w: q.w };
  const far = gunSight(aircraft, gun, () => ({ height: 0 }));
  expect(far.rangeM).toBe(1000);
  expect(far.rangeSource).toBe('base');
  aircraft.velocity.x = 100;
  const drift = gunSight(aircraft, gun, () => undefined);
  expect(drift.rangeM).toBe(1000);
  expect(drift.point!.x).toBeGreaterThan(far.point!.x);
  aircraft.velocity.z = -500;
  expect(gunSight(aircraft, gun, () => undefined).timeSeconds!).toBeLessThan(drift.timeSeconds!);
});
