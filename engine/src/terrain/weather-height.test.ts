import { expect, test } from 'bun:test';
import { Vector4 } from 'three';
import type { TerrainChunk, TheaterManifest } from '../data';
import { buildWeatherHeight, heightField, weatherHeightAt } from './weather-height';
import { orientManifest, chunkNeedsReflection } from './world-orientation';

const chunk: TerrainChunk = {
  lod: 1,
  x: 0,
  y: 0,
  path: 'test',
  originX: 0,
  originZ: 0,
  spacing: 100,
  size: 256,
  offset: 0,
  scale: 1,
  minElevation: -10,
  maxElevation: 6000,
  byteLength: 0,
  sha256: '',
};
const manifest: TheaterManifest = {
  schemaVersion: 1,
  id: 'test',
  name: 'test',
  source: 'synthetic',
  attribution: [],
  projection: { crs: 'test', originX: 0, originY: 0 },
  extents: { width: 25500, height: 25500 },
  lods: [1],
  chunks: [chunk],
  waterBodies: [],
};

test('weather height preserves slopes, submeter relief and explicit unknowns', () => {
  for (const [lo, hi] of [
    [-10, 4000],
    [100, 100.5],
    [1300, 1300],
  ]) {
    const f = heightField(
      new Float32Array([lo!, hi!, lo!, hi!]),
      2,
      2,
      new Vector4(100, 200, 1000, 1000),
    );
    expect(weatherHeightAt(f, 100, 200)).toBeCloseTo(lo!, 3);
    expect(weatherHeightAt(f, 1100, 1200)).toBeCloseTo(hi!, 3);
    expect(weatherHeightAt(f, 600, 700)).toBeCloseTo((lo! + hi!) / 2, 3);
    expect(weatherHeightAt(f, 99, 200)).toBeUndefined();
    f.texture.dispose();
  }
  const missing = heightField(
    new Float32Array([10, NaN, 10, NaN]),
    2,
    2,
    new Vector4(0, 0, 100, 100),
  );
  expect(weatherHeightAt(missing, 0, 0)).toBe(10);
  expect(weatherHeightAt(missing, 50, 50)).toBeUndefined();
  missing.texture.dispose();
});

test('fixed source raster follows oriented elevation independently of other visual LODs', async () => {
  const m = orientManifest({
    ...manifest,
    id: 'salt-lake',
    extents: { width: 12000, height: 10000 },
  });
  const field = await buildWeatherHeight(
    m,
    (c) => {
      const values = new Float32Array(256 ** 2);
      for (let z = 0; z < 256; z++)
        for (let x = 0; x < 256; x++)
          values[z * 256 + x] = (chunkNeedsReflection(c) ? 255 - x : x) * 100 * 0.1;
      return Promise.resolve(values);
    },
    new Vector4(0, 0, 12000, 10000),
    100,
    1,
  );
  expect(weatherHeightAt(field, 0, 5000)).toBeCloseTo(1200, 1);
  expect(weatherHeightAt(field, 12000, 5000)).toBeCloseTo(0, 1);
  expect(weatherHeightAt(field, 6000, 5000)).toBeCloseTo(600, 1);
  field.texture.dispose();
});

test('water elevations require polygons and preserve dry holes and missing DEM', async () => {
  const m = {
    ...manifest,
    waterBodies: [
      {
        id: 'lake',
        elevation: 20,
        polygon: [
          [0, 0],
          [1000, 0],
          [1000, 1000],
          [0, 1000],
        ] as const,
        holes: [
          [
            [300, 300],
            [700, 300],
            [700, 700],
            [300, 700],
          ] as const,
        ],
      },
    ],
  };
  const field = await buildWeatherHeight(
    m,
    () => Promise.resolve(new Float32Array(256 ** 2).fill(10)),
    new Vector4(0, 0, 2000, 2000),
    100,
    1,
    true,
  );
  expect(weatherHeightAt(field, 100, 100)).toBe(20);
  expect(weatherHeightAt(field, 500, 500)).toBe(10);
  expect(weatherHeightAt(field, 1500, 1500)).toBe(10);
  const unknown = await buildWeatherHeight(
    { ...m, chunks: [] },
    () => {
      throw new Error('not read');
    },
    new Vector4(0, 0, 2000, 2000),
    100,
    1,
    true,
  );
  expect(weatherHeightAt(unknown, 100, 100)).toBeUndefined();
  field.texture.dispose();
  unknown.texture.dispose();
});

test('corrupt weather source rejects without publishing a zero-filled map', async () => {
  await buildWeatherHeight(
    manifest,
    () => Promise.reject(new Error('bad checksum')),
    new Vector4(0, 0, 1000, 1000),
    100,
    1,
  ).then(
    () => {
      throw new Error('Expected corrupt source to reject');
    },
    (error: unknown) => {
      expect(String(error)).toContain('bad checksum');
    },
  );
});
