import { expect, test } from 'bun:test';
import type { TerrainChunk, TheaterManifest } from '../data';
import { waypointDestination } from './teleport';

const fine: TerrainChunk = {
  lod: 0,
  x: 0,
  y: 0,
  spacing: 30,
  size: 256,
  originX: 0,
  originZ: 0,
  minElevation: 0,
  maxElevation: 1600,
  offset: 0,
  scale: 1,
  path: 'fine.bin.gz',
  byteLength: 1,
  sha256: '0'.repeat(64),
};
const manifest: TheaterManifest = {
  schemaVersion: 1,
  id: 'test',
  name: 'test',
  source: 'synthetic',
  attribution: [],
  projection: { crs: 'local', originX: 0, originY: 0 },
  extents: { width: 76500, height: 76500 },
  lods: [0, 2],
  chunks: [{ ...fine, lod: 2, spacing: 300, maxElevation: 500, path: 'coarse.bin.gz' }, fine],
  waterBodies: [],
};
const point = { id: 2, x: 100, z: 100, elevationM: 50 };

test('teleport clears finest source terrain despite coarse map elevation and faces inward', () => {
  const destination = waypointDestination(manifest, point);
  expect(destination.position).toEqual({ x: 100, y: 2600, z: 100 });
  expect(destination.chunk).toBe(fine);
  expect(-Math.sin(destination.yaw)).toBeGreaterThan(0);
  expect(-Math.cos(destination.yaw)).toBeGreaterThan(0);
  const edge = waypointDestination(manifest, { ...point, x: 76500, z: 76500 });
  expect(edge.position.y).toBe(1500);
  expect(-Math.sin(edge.yaw)).toBeLessThan(0);
});

test('teleport rejects nonfinite, outside and uncovered destinations before moving', () => {
  for (const bad of [{ x: NaN }, { z: -1 }, { x: 76501 }, { elevationM: Infinity }, { id: 0 }])
    expect(() => waypointDestination(manifest, { ...point, ...bad })).toThrow();
  expect(() => waypointDestination({ ...manifest, chunks: [fine] }, { ...point, x: 8000 })).toThrow(
    'no terrain source coverage',
  );
});

test('teleport clears raised water while preserving dry islands', () => {
  const wet = {
    ...manifest,
    waterBodies: [
      {
        id: 'lake',
        elevation: 2000,
        polygon: [
          [0, 0],
          [1000, 0],
          [1000, 1000],
          [0, 1000],
        ] as const,
        holes: [
          [
            [200, 200],
            [800, 200],
            [800, 800],
            [200, 800],
          ],
        ] as const,
      },
    ],
  };
  expect(waypointDestination(wet, point).position.y).toBe(3000);
  expect(waypointDestination(wet, { ...point, x: 500, z: 500 }).position.y).toBe(2600);
});
