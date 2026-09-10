import type { Platform } from '../platform/Platform';
import { expect, test } from 'bun:test';
import { parseRetailAircraft } from './RetailAircraft';
import type { DataTexture, Mesh, MeshStandardMaterial } from 'three';

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

test('texture cutouts retain alpha testing and opaque depth writes', async () => {
  const { RetailAircraft } = await import('./RetailAircraft');
  const data = {
    ...triangle,
    uvs: [0, 0, 1, 0, 0, 1],
    texture: { width: 2, height: 1, rgba: [255, 255, 255, 0, 255, 255, 255, 255] },
  };
  const platform = {
    fs: {
      exists: () => Promise.resolve(true),
      readText: () => Promise.resolve(JSON.stringify(data)),
    },
  } as unknown as Platform;
  const model = await RetailAircraft.load(platform);
  const mesh = model!.parts.get(triangle.name)!.children[0] as Mesh;
  const material = mesh.material as MeshStandardMaterial;
  expect(material.alphaTest).toBe(0.5);
  expect(material.transparent).toBe(false);
  expect(material.depthWrite).toBe(true);
  expect((material.map as DataTexture).image.data![3]).toBe(0);
  expect((material.map as DataTexture).image.data![7]).toBe(255);
  model!.dispose();
});
