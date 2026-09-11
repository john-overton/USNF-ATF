import { expect, test } from 'bun:test';
import { groundFogDensity, FOG_FULL_AGL_M, FOG_TOP_AGL_M } from './fog';
import { cloudDensityAt, WEATHER_PRESETS } from './clouds';
import { parseMissionQuery, missionQuery } from '../mission/params';

test('ground fog is dense below 200 feet and smoothly clears by 600 feet AGL', () => {
  expect(FOG_FULL_AGL_M).toBeCloseTo(60.96);
  expect(FOG_TOP_AGL_M).toBeCloseTo(182.88);
  expect(groundFogDensity(0)).toBe(1);
  expect(groundFogDensity(60.96)).toBe(1);
  expect(groundFogDensity(121.92)).toBeCloseTo(0.5);
  expect(groundFogDensity(182.88)).toBe(0);
  expect(groundFogDensity(-1)).toBe(0);
  expect(groundFogDensity(NaN)).toBe(0);
});

test('low cloud envelope shifts with terrain, unknown elevation is not sea level', () => {
  const preset = WEATHER_PRESETS.broken;
  const sample = () => 1;
  const flat = cloudDensityAt(preset, { x: 0, y: 1900, z: 0 }, sample, undefined, () => 0);
  const hill = cloudDensityAt(preset, { x: 0, y: 3900, z: 0 }, sample, undefined, () => 2000);
  expect(flat).toBeGreaterThan(0);
  expect(hill).toBe(flat);
  expect(cloudDensityAt(preset, { x: 0, y: 1900, z: 0 }, sample, undefined, () => 2000)).toBe(0);
  expect(cloudDensityAt(preset, { x: 0, y: 1900, z: 0 }, sample)).toBe(0);
});

test('fog URL selection survives session serialization and rejects typos', () => {
  for (const fog of ['off', 'ground'] as const) {
    const mission = parseMissionQuery(`?fog=${fog}&clouds=off`);
    expect(parseMissionQuery(`?${missionQuery(mission)}`).environment.fog).toBe(fog);
  }
  expect(() => parseMissionQuery('?fog=mistyped')).toThrow('Invalid fog');
});

test('cloud appearance URL selection round-trips and rejects typos', () => {
  for (const appearance of ['sunshine', 'solid', 'volume'] as const) {
    const mission = parseMissionQuery(`?cloudAppearance=${appearance}`);
    expect(parseMissionQuery(`?${missionQuery(mission)}`).environment.cloudAppearance).toBe(
      appearance,
    );
  }
  expect(() => parseMissionQuery('?cloudAppearance=mistyped')).toThrow('Invalid cloudAppearance');
});

test('fog is a distinct weather preset without cloud layers', () => {
  const mission = parseMissionQuery('?weather=fog');
  expect(parseMissionQuery('?' + missionQuery(mission).toString()).environment.weather).toBe('fog');
  expect(WEATHER_PRESETS.fog.layers).toEqual([]);
});
