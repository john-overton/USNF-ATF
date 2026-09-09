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
