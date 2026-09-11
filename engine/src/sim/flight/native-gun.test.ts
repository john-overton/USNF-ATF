import { expect, test } from 'bun:test';
import { createGunState, stepGun, setGunMode, nativeLaunchSpeed } from './gun';
import { createFlightState } from './index';
import { syntheticNativeGun } from './gun-fixture';
const aircraft = () => createFlightState({ position: { x: 0, y: 5000, z: 0 }, airspeed: 250 });

test('native launch selects absolute speed; remake still inherits aircraft velocity', () => {
  const plane = aircraft();
  plane.velocity.x = 60;
  expect(nativeLaunchSpeed(syntheticNativeGun.native!, plane)).toBeCloseTo(914.4);
  const native = createGunState(syntheticNativeGun, 'retail');
  stepGun(native, syntheticNativeGun, plane, true, false, 1 / 120);
  expect(native.rounds[0]!.velocity.x).toBe(0);
  expect(native.rounds[0]!.velocity.z).toBeCloseTo(-(914.4 - (8 * 0.3048) / 120));
  const remake = createGunState(syntheticNativeGun);
  stepGun(remake, syntheticNativeGun, plane, true, false, 1 / 120);
  expect(remake.rounds[0]!.velocity.x).toBe(60);
  expect(remake.rounds[0]!.velocity.z).toBe(-1250);
});
test('representative projectiles debit ammo, obey safety, cadence and bounded lifetime', () => {
  const gun = createGunState(syntheticNativeGun, 'retail');
  for (let i = 0; i < 120; i++) stepGun(gun, syntheticNativeGun, aircraft(), true, false, 1 / 120);
  expect(gun.rounds.length).toBe(4);
  expect(gun.fired).toBe(8);
  expect(gun.remaining).toBe(93);
  expect(gun.rounds.every((r) => r.tracer)).toBe(true);
  for (let i = 0; i < 1200; i++) stepGun(gun, syntheticNativeGun, aircraft(), true, true, 1 / 120);
  expect(gun.rounds.length).toBe(0);
  expect(gun.fired).toBe(8);
  gun.remaining = 1;
  stepGun(gun, syntheticNativeGun, aircraft(), true, false, 1 / 120);
  expect(gun.remaining).toBe(0);
  expect(gun.fired).toBe(9);
});
test('native scalar deceleration is separate from capped vertical fall', () => {
  const gun = createGunState(syntheticNativeGun, 'retail');
  stepGun(gun, syntheticNativeGun, aircraft(), true, false, 1 / 120);
  for (let i = 1; i < 360; i++) stepGun(gun, syntheticNativeGun, aircraft(), false, false, 1 / 120);
  const round = gun.rounds[0]!;
  expect(round.nativeMotion!.speed).toBeCloseTo((3000 - 24) * 0.3048);
  expect(round.velocity.y).toBeCloseTo(-80 * 0.3048);
});
test('live mode switch clears projectiles without refilling ammo; old imports fall back safely', () => {
  const state = createGunState(syntheticNativeGun);
  stepGun(state, syntheticNativeGun, aircraft(), true, false, 1 / 120);
  const ammo = state.remaining;
  setGunMode(state, 'retail');
  expect(state.rounds).toEqual([]);
  expect(state.remaining).toBe(ammo);
  const { native: _native, ...legacy } = syntheticNativeGun;
  stepGun(state, legacy, aircraft(), true, false, 1 / 120);
  expect(state.rounds[0]!.nativeMotion).toBeUndefined();
  expect(state.remaining).toBe(ammo - 1);
});
