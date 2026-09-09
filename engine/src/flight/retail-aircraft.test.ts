import type { Platform } from '../platform/Platform';
import { expect, test } from 'bun:test';
import { parseRetailAircraft } from './RetailAircraft';

const triangle = {
  version: 1,
  name: 'Synthetic aircraft',
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  colors: [1, 1, 1, 1, 1, 1, 1, 1, 1],
  limitations: [],
};
test('aircraft import rejects malformed triangles, nonfinite geometry and mismatched textures', () => {
  expect(parseRetailAircraft(triangle).name).toBe('Synthetic aircraft');
  expect(() => parseRetailAircraft({ ...triangle, positions: [0, 0, 0] })).toThrow();
  expect(() =>
    parseRetailAircraft({ ...triangle, positions: [NaN, ...triangle.positions.slice(1)] }),
  ).toThrow();
  expect(() => parseRetailAircraft({ ...triangle, uvs: [0, 0] })).toThrow();
  expect(() =>
    parseRetailAircraft({ ...triangle, texture: { width: 2, height: 2, rgba: [255] } }),
  ).toThrow();
  expect(() =>
    parseRetailAircraft({ ...triangle, parts: [{ ...triangle, pivot: [0, Infinity, 0] }] }),
  ).toThrow();
});

test('selected aircraft reads its own model and missing imports remain explicit', async () => {
  const { RetailAircraft } = await import('./RetailAircraft');
  const { aircraftId } = await import('./aircraft-catalog');
  const reads: string[] = [];
  const platform = {
    fs: {
      exists: (_root: string, path: string) => Promise.resolve(path === 'aircraft/x31.json'),
      readText: (_root: string, path: string) => {
        reads.push(path);
        return Promise.resolve(JSON.stringify(triangle));
      },
    },
  } as unknown as Platform;
  expect(await RetailAircraft.load(platform, 'a4e')).toBeUndefined();
  const model = await RetailAircraft.load(platform, 'x31');
  expect(model?.triangles).toBe(1);
  expect(reads).toEqual(['aircraft/x31.json']);
  model?.dispose();
  expect(aircraftId(null)).toBe('f14');
  for (const value of ['../f14', 'constructor', 'unknown', ''])
    expect(() => aircraftId(value)).toThrow('Unknown aircraft');
});
