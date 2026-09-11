import { describe, expect, test } from 'bun:test';
import { createFlightState } from './index';
import { createGunState, stepGun } from './gun';
import type { RetailGun } from '../../data/retail-gun';
import { parseRetailGun } from '../../data/retail-gun';
import { syntheticNativeGun } from './gun-fixture';
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
describe('actual-round gun simulation', () => {
  test('native metadata and retail geometry validate bounds without changing legacy imports', () => {
    const manifest = {
      ...gun,
      native: syntheticNativeGun.native,
      clip: { ...gun.clip, encoding: 'unsigned8-mono' },
      bulletGeometry: {
        source: 'fixture.SH',
        sha256: 'a'.repeat(64),
        paletteSource: 'fixture.PAL',
        paletteSha256: 'b'.repeat(64),
        scaleNote: 'Synthetic triangle',
        vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        colors: [1, 1, 0, 1, 1, 0, 1, 1, 0],
        indices: [0, 1, 2],
      },
    };
    expect(parseRetailGun(manifest).native).toEqual(syntheticNativeGun.native);
    expect(() =>
      parseRetailGun({ ...manifest, native: { ...manifest.native, intervalSeconds: 0 } }),
    ).toThrow();
    expect(() =>
      parseRetailGun({ ...manifest, native: { ...manifest.native, gravityFps2: NaN } }),
    ).toThrow();
    expect(() =>
      parseRetailGun({
        ...manifest,
        bulletGeometry: { ...manifest.bulletGeometry, indices: [0, 1, 99] },
      }),
    ).toThrow();
    expect(() =>
      parseRetailGun({ ...manifest, bulletGeometry: { ...manifest.bulletGeometry, colors: [] } }),
    ).toThrow();
  });
  test('120 Hz cadence consumes actual rounds and every fifth is a tracer', () => {
    const state = createGunState(gun),
      aircraft = createFlightState({ position: { x: 0, y: 3000, z: 0 }, airspeed: 150 });
    for (let i = 0; i < 120; i++) stepGun(state, gun, aircraft, true, false, 1 / 120);
    expect(state.fired).toBe(100);
    expect(state.remaining).toBe(575);
    expect(state.rounds.filter((r) => r.tracer).length).toBe(20);
  });
  test('inherits all aircraft velocity components and gravity', () => {
    const state = createGunState(gun),
      aircraft = createFlightState({ position: { x: 0, y: 3000, z: 0 }, airspeed: 800 });
    aircraft.velocity.x = 120;
    aircraft.velocity.y = 20;
    stepGun(state, gun, aircraft, true, false, 1 / 120);
    expect(state.rounds[0]!.velocity.z).toBe(-1830);
    expect(state.rounds[0]!.velocity.x).toBe(120);
    expect(state.rounds[0]!.velocity.y).toBeCloseTo(20 - 9.80665 / 120);
  });
  test('substep emission origin follows a moving aircraft', () => {
    const state = createGunState(gun);
    const aircraft = createFlightState({ position: { x: 0, y: 3000, z: 0 }, airspeed: 800 });
    stepGun(state, gun, aircraft, true, false, 1 / 120);
    aircraft.position.z -= 800 / 120;
    stepGun(state, gun, aircraft, true, false, 1 / 120);
    const second = state.rounds[1]!;
    const birth = 0.01;
    const end = 2 / 120;
    expect(second.position.z).toBeCloseTo(-6 - 800 * end - 1030 * (end - birth), 8);
  });
  test('safety and crash block fire, reset restores ammunition', () => {
    const state = createGunState(gun),
      aircraft = createFlightState({ position: { x: 0, y: 3000, z: 0 }, airspeed: 150 });
    stepGun(state, gun, aircraft, true, true, 1 / 120);
    expect(state.fired).toBe(0);
    aircraft.status = 'crashed';
    stepGun(state, gun, aircraft, true, false, 1 / 120);
    expect(state.fired).toBe(0);
    aircraft.status = 'airborne';
    stepGun(state, gun, aircraft, true, false, 1 / 120);
    expect(state.fired).toBe(1);
    Object.assign(state, createGunState(gun));
    expect(state.remaining).toBe(675);
    expect(state.rounds).toHaveLength(0);
  });
  test('held trigger stops at empty and rounds expire', () => {
    const state = createGunState({ ...gun, capacity: 2 }),
      aircraft = createFlightState({ position: { x: 0, y: 3000, z: 0 }, airspeed: 150 });
    for (let i = 0; i < 800; i++) stepGun(state, gun, aircraft, true, false, 1 / 120);
    expect(state.fired).toBe(2);
    expect(state.remaining).toBe(0);
    expect(state.rounds).toHaveLength(0);
  });
  test('green custom belts validate; malformed rates and PCM rejected', () => {
    const value = {
      ...gun,
      tracerColor: 'green',
      clip: { ...gun.clip, encoding: 'unsigned8-mono' },
    };
    expect(parseRetailGun(value).tracerColor).toBe('green');
    expect(() => parseRetailGun({ ...value, roundsPerSecond: Infinity })).toThrow();
    expect(() => parseRetailGun({ ...value, clip: { ...value.clip, pcm: [-1, 128] } })).toThrow();
  });
});
