import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { parseRetailGun } from '../data/retail-gun';
import { createFlightState, attitudeFromEuler } from '../sim/flight';
import { createGunState, stepGun } from '../sim/flight/gun';
import { flightCamera } from './FlightCamera';
import { gunSight } from './gun-sight';
import { gunRangeArc, gunReticleEnabled, projectGunSight } from './GunSightOverlay';
import type { FlightDiagnostics } from './FlightLayer';

test('range bar is hidden until inside 1000 m and fills left to right as range closes', () => {
  for (const range of [1000, 2000, NaN, -1]) expect(gunRangeArc(range)).toBe('');
  for (const [range, x, y] of [
    [250, Math.SQRT1_2 * 22, Math.SQRT1_2 * 22],
    [500, 0, 22],
    [0, 22, 0],
    [750, -Math.SQRT1_2 * 22, Math.SQRT1_2 * 22],
  ]) {
    const path = gunRangeArc(range!);
    const end = path.split(' ').slice(-2).map(Number);
    expect(end[0]!).toBeCloseTo(x!, 8);
    expect(end[1]!).toBeCloseTo(y!, 8);
    expect(path).toStartWith('M-22 0 A22 22 0 0 0');
  }
  expect(gunRangeArc(2000)).toBe(gunRangeArc(1000));
});
test('reticle requires cockpit, installed armed gun and ammunition', () => {
  const flight = {
    cameraMode: 'cockpit',
    status: 'airborne',
    gun: { available: true, safe: false, remaining: 1 },
  } as FlightDiagnostics;
  expect(gunReticleEnabled(flight)).toBe(true);
  for (const cameraMode of ['attitude', 'world-up'])
    expect(gunReticleEnabled({ ...flight, cameraMode })).toBe(false);
  for (const change of [{ safe: true }, { available: false }, { remaining: 0 }])
    expect(gunReticleEnabled({ ...flight, gun: { ...flight.gun, ...change } })).toBe(false);
});

for (const id of ['f14', 'a4e', 'x31']) {
  const file = `extracted/flight/${id}-gun.json`;
  (existsSync(file) ? test : test.skip)(
    `${id}: imported mounts align stepped rounds through camera, aspect, look and rebasing`,
    () => {
      const gun = parseRetailGun(JSON.parse(readFileSync(file, 'utf8')));
      for (const [width, height] of [
        [2560, 1440],
        [1024, 768],
        [3440, 1440],
      ]) {
        for (const look of [
          { yaw: 0, pitch: 0 },
          { yaw: 0.12, pitch: -0.05 },
        ]) {
          const aircraft = createFlightState({
            position: { x: 200001, y: 3000, z: 299999 },
            airspeed: 180,
          });
          aircraft.attitude = attitudeFromEuler(0.2, 0.7, 0.4);
          aircraft.velocity = { x: 25, y: -10, z: -180 };
          const sight = gunSight(aircraft, gun, () => undefined);
          const average = new Vector3();
          // Independently integrate one actual round from each installed barrel.
          for (const mount of gun.mounts) {
            const single = { ...gun, mounts: [mount] };
            const rounds = createGunState(single);
            const dt = sight.timeSeconds! / 200;
            for (let i = 0; i < 200; i++) stepGun(rounds, single, aircraft, i === 0, false, dt);
            const p = rounds.rounds[0]!.position;
            average.add(new Vector3(p.x, p.y, p.z));
          }
          average.divideScalar(gun.mounts.length);
          expect(
            average.distanceTo(new Vector3(sight.point!.x, sight.point!.y, sight.point!.z)),
          ).toBeLessThan(1e-7);
          const q = aircraft.attitude;
          const pose = flightCamera(
            new Vector3(200001, 3000, 299999),
            new Quaternion(q.x, q.y, q.z, q.w),
            'cockpit',
            look,
          );
          const expected = new PerspectiveCamera(60, width! / height!, 5, 400000);
          expected.position.copy(pose.camera);
          expected.up.copy(pose.up);
          expected.lookAt(pose.look);
          expected.updateMatrixWorld(true);
          const projected = average.clone().project(expected);
          for (const origin of [
            { x: 0, z: 0 },
            { x: 196608, z: 294912 },
            { x: 204800, z: 303104 },
          ]) {
            const camera = expected.clone();
            camera.position.x -= origin.x;
            camera.position.z -= origin.z;
            camera.updateMatrixWorld(true);
            const actual = projectGunSight(sight, camera, origin, width!, height!)!;
            expect(actual.x).toBeCloseTo(((projected.x + 1) * width!) / 2, 5);
            expect(actual.y).toBeCloseTo(((1 - projected.y) * height!) / 2, 5);
          }
        }
      }
    },
  );
}
test('projection includes eye-to-muzzle parallax and rejects points behind the eye', () => {
  const camera = new PerspectiveCamera(60, 16 / 9, 5, 400000);
  camera.position.set(0, 2, 0);
  camera.updateMatrixWorld(true);
  const base = {
    mode: 'terrain',
    rangeSource: 'base',
    status: 'solution',
    rangeM: 1000,
    timeSeconds: 1,
    point: { x: -1, y: 0, z: -1000 },
  } as const;
  const point = projectGunSight(base, camera, { x: 0, z: 0 }, 1920, 1080)!;
  expect(point.x).toBeLessThan(960);
  expect(point.y).toBeGreaterThan(540);
  expect(point.visible).toBe(true);
  expect(
    projectGunSight(
      { ...base, point: { x: 0, y: 0, z: 1000 } },
      camera,
      { x: 0, z: 0 },
      1920,
      1080,
    )!.visible,
  ).toBe(false);
});
