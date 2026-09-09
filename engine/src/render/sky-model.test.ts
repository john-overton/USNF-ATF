import { expect, test } from 'bun:test';
import {
  buildSkyTable,
  sampleSky,
  skyElevationForRow,
  skyFogColor,
  skyTableIsStale,
  type SkyTable,
} from './sky-model';

const rad = (degrees: number): number => (degrees * Math.PI) / 180;
const total = (data: Float32Array): number => data.reduce((sum, v) => sum + v, 0);
const luminance = (c: readonly [number, number, number]): number =>
  0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * Sky light falling on level ground: radiance weighted by the solid angle of each row and by
 * the cosine of incidence. A raw sum over the table is not a brightness measure now that rows
 * are warped toward the horizon, and the hemisphere-mean radiance genuinely peaks near a 30
 * degree sun as the horizon band brightens. This is the quantity the hemisphere light stands
 * for, and it is what has to fall as the sun sets.
 */
function skyIrradiance(table: SkyTable): number {
  const pivot = Math.round((table.height - 1) / 2);
  let sum = 0;
  for (let row = pivot; row < table.height; row++) {
    const elevation = skyElevationForRow(table.height, row);
    const lo = skyElevationForRow(table.height, Math.max(pivot, row - 1));
    const hi = skyElevationForRow(table.height, Math.min(table.height - 1, row + 1));
    const weight = (Math.cos(elevation) * Math.sin(elevation) * (hi - lo)) / 2;
    if (weight <= 0) continue;
    for (let col = 0; col < table.width; col++) {
      const base = (row * table.width + col) * 3;
      const rgb: [number, number, number] = [
        table.data[base] ?? 0,
        table.data[base + 1] ?? 0,
        table.data[base + 2] ?? 0,
      ];
      sum += (luminance(rgb) * weight) / table.width;
    }
  }
  return sum;
}

test('every sun elevation from night to high noon gives finite non-negative radiance', () => {
  for (let degrees = -30; degrees <= 85; degrees += 5) {
    const table = buildSkyTable(rad(degrees), rad(120));
    for (const value of table.data) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    for (const channel of [
      ...table.sunTransmittance,
      ...table.zenithColor,
      ...table.horizonColor,
    ]) {
      expect(Number.isFinite(channel)).toBe(true);
      expect(channel).toBeGreaterThanOrEqual(0);
    }
  }
});

test('below-horizon view directions stay finite and dark', () => {
  const table = buildSkyTable(rad(40), 0);
  for (const elevation of [-90, -60, -30, -5]) {
    const down = sampleSky(table, rad(elevation), rad(37));
    for (const channel of down) {
      expect(Number.isFinite(channel)).toBe(true);
      expect(channel).toBeGreaterThanOrEqual(0);
    }
    expect(luminance(down)).toBeLessThan(luminance(table.horizonColor));
  }
});

test('at low sun the zenith is much darker than the horizon', () => {
  const table = buildSkyTable(rad(8), 0);
  const zenith = luminance(table.zenithColor);
  expect(zenith).toBeGreaterThan(0);
  expect(zenith).toBeLessThan(luminance(table.horizonColor));
});

/**
 * Regression guard for the olive horizon. Away from the sun a daytime horizon is a pale
 * desaturated blue-white; single scattering on its own extinguishes blue over the long
 * grazing path and leaves a green-dominant residual, which is wrong at every sun angle.
 */
test('the anti-solar horizon is blue-white, not olive, at high and mid sun', () => {
  for (const degrees of [85, 67, 55, 45, 35, 25, 20]) {
    const table = buildSkyTable(rad(degrees), 0);
    for (const azimuth of [Math.PI / 2, (2 * Math.PI) / 3, Math.PI]) {
      const [r, g, b] = sampleSky(table, 0, azimuth);
      if (azimuth < Math.PI - 1e-9 && degrees < 35) continue; // Near a low sun, warm is correct.
      expect(b).toBeGreaterThanOrEqual(g);
      expect(g).toBeGreaterThanOrEqual(r);
    }
    // Desaturated: the extremes must stay within a modest ratio of each other.
    const [r, g, b] = sampleSky(table, 0, Math.PI);
    expect(b / Math.max(r, 1e-6)).toBeLessThan(2);
    expect(g).toBeGreaterThan(0.2);
  }
});

test('the zenith stays on the project calibrated clear-sky colour at summer noon', () => {
  const [r, g, b] = buildSkyTable(rad(67), 0).zenithColor;
  // Linear radiance for #8ca4c9, the shipped clear colour the whole palette is tuned against.
  expect(r).toBeCloseTo(0.265, 2);
  expect(g).toBeCloseTo(0.365, 2);
  expect(b).toBeCloseTo(0.591, 2);
});

test('sky light on the ground falls monotonically as the sun sets', () => {
  let previous = Infinity;
  for (const degrees of [85, 75, 67, 55, 45, 35, 25, 15, 8, 4, 1, 0, -2, -6, -12, -20, -30]) {
    const irradiance = skyIrradiance(buildSkyTable(rad(degrees), 0));
    expect(irradiance).toBeLessThanOrEqual(previous);
    previous = irradiance;
  }
});

/**
 * The sun's local zenith angle at a sample far down a view ray depends on the ray's azimuth.
 * Collapsing that put the whole twilight sky in the planet's shadow at the horizon and left
 * the zenith as the brightest part of the sky, which is backwards.
 */
test('twilight is brightest at the horizon toward the sun and fades smoothly', () => {
  let previous = Infinity;
  for (const degrees of [0, -1, -2, -3, -4, -6]) {
    const table = buildSkyTable(rad(degrees), 0);
    const towardSun = luminance(sampleSky(table, 0, 0));
    expect(towardSun).toBeGreaterThan(luminance(table.zenithColor));
    expect(towardSun).toBeGreaterThan(luminance(sampleSky(table, 0, Math.PI)));
    expect(towardSun).toBeGreaterThan(0);
    expect(towardSun).toBeLessThan(previous);
    previous = towardSun;
  }
});

test('sun transmittance reddens as the sun drops toward the horizon', () => {
  let previousRatio = 0;
  for (const degrees of [80, 60, 40, 20, 10, 5, 2]) {
    const { sunTransmittance } = buildSkyTable(rad(degrees), 0);
    const ratio = sunTransmittance[0] / sunTransmittance[2];
    expect(ratio).toBeGreaterThan(previousRatio);
    previousRatio = ratio;
  }
  // Blue must actually be extinguished by then, not merely relatively weaker.
  expect(buildSkyTable(rad(2), 0).sunTransmittance[2]).toBeLessThan(0.05);
});

test('night is far darker than noon and never negative', () => {
  const noon = total(buildSkyTable(rad(67), 0).data);
  const night = total(buildSkyTable(rad(-18), 0).data);
  expect(night).toBeGreaterThanOrEqual(0);
  expect(night).toBeLessThan(noon / 1000);
});

test('bilinear sampling reproduces the stored value at exact grid points', () => {
  const table = buildSkyTable(rad(35), 0);
  const { width, height, data } = table;
  for (const row of [0, 7, height >> 1, height - 2, height - 1]) {
    for (const col of [0, 1, width >> 2, width - 1]) {
      const elevation = skyElevationForRow(height, row);
      const azimuth = (col * 2 * Math.PI) / width;
      const sampled = sampleSky(table, elevation, azimuth);
      for (let c = 0; c < 3; c++) {
        expect(sampled[c]).toBeCloseTo(data[(row * width + col) * 3 + c] ?? NaN, 5);
      }
    }
  }
});

test('a row is pinned exactly to the horizon', () => {
  for (const height of [8, 32, 48, 49]) {
    const pivot = Math.round((height - 1) / 2);
    expect(Math.abs(skyElevationForRow(height, pivot))).toBe(0);
    expect(skyElevationForRow(height, 0)).toBeCloseTo(-Math.PI / 2, 12);
    expect(skyElevationForRow(height, height - 1)).toBeCloseTo(Math.PI / 2, 12);
    for (let row = 1; row < height; row++) {
      expect(skyElevationForRow(height, row)).toBeGreaterThan(skyElevationForRow(height, row - 1));
    }
  }
});

test('azimuth wraps continuously and is periodic', () => {
  const table = buildSkyTable(rad(6), 0);
  const before = sampleSky(table, rad(3), 2 * Math.PI - 1e-5);
  const after = sampleSky(table, rad(3), 1e-5);
  for (let c = 0; c < 3; c++) expect(before[c]).toBeCloseTo(after[c] ?? NaN, 4);

  const azimuth = rad(211);
  const once = sampleSky(table, rad(12), azimuth);
  for (const turns of [-2, -1, 1, 3]) {
    const again = sampleSky(table, rad(12), azimuth + turns * 2 * Math.PI);
    for (let c = 0; c < 3; c++) expect(again[c]).toBeCloseTo(once[c] ?? NaN, 5);
  }
});

test('fog colour follows world azimuth relative to the sun', () => {
  const sunAzimuth = rad(250);
  const table = buildSkyTable(rad(5), sunAzimuth);
  const toward = skyFogColor(table, sunAzimuth);
  const away = skyFogColor(table, sunAzimuth + Math.PI);
  expect(luminance(toward)).toBeGreaterThan(luminance(away));
  expect(luminance(away)).toBeGreaterThan(0);
});

test('staleness triggers only past the quarter-degree tolerance', () => {
  const table = buildSkyTable(rad(30), rad(100));
  expect(skyTableIsStale(table, rad(30), rad(100))).toBe(false);
  expect(skyTableIsStale(table, rad(30.1), rad(100))).toBe(false);
  expect(skyTableIsStale(table, rad(30.5), rad(100))).toBe(true);
  expect(skyTableIsStale(table, rad(30), rad(101))).toBe(true);
});
