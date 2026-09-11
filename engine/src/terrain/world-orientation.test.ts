import { expect, test } from 'bun:test';
import type { TerrainChunk, TheaterManifest } from '../data';
import type { Platform } from '../platform/Platform';
import { GroundSampler } from '../flight/GroundSampler';
import { bearingDegrees } from '../sim/flight';
import { orientManifest, reflectPixels, runtimeTheater, sourceX } from './world-orientation';
import { decodeChunk } from './chunk';
import { buildNavigationMap, worldToMap } from './navigation-map';
import { buildPatch } from './mesh';
import { selectSourceChunks } from './lod';

function fixture() {
  const files = new Map<string, Uint8Array>();
  const chunks: TerrainChunk[] = [0, 1].map((x) => {
    const raw = new Uint8Array(256 * 256 * 2),
      view = new DataView(raw.buffer);
    for (let z = 0; z < 256; z++)
      for (let col = 0; col < 256; col++)
        view.setUint16((z * 256 + col) * 2, x * 255 + col + 2 * z, true);
    const bytes = Bun.gzipSync(raw),
      path = `${x}.gz`;
    files.set(path, bytes);
    return {
      lod: 1,
      x,
      y: 0,
      path,
      originX: x * 25500,
      originZ: 0,
      spacing: 100,
      size: 256,
      offset: 0,
      scale: 1,
      minElevation: 0,
      maxElevation: 1020,
      byteLength: bytes.length,
      sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),
    };
  });
  const manifest: TheaterManifest = {
    schemaVersion: 1,
    id: 'salt-lake',
    name: 'Synthetic',
    projection: { crs: 'local', originX: 0, originY: 0 },
    extents: { width: 40000, height: 25500 },
    lods: [1],
    attribution: [],
    source: 'synthetic',
    chunks,
    waterBodies: [
      {
        id: 'lake',
        elevation: 0,
        polygon: [
          [1000, 1000],
          [2000, 1000],
          [2000, 2000],
          [1000, 2000],
        ],
        holes: [
          [
            [1200, 1200],
            [1800, 1200],
            [1800, 1800],
            [1200, 1800],
          ],
        ],
      },
    ],
  };
  const read = (path: string) => Promise.resolve(files.get(path)!);
  const platform = {
    fs: { readBytes: async (_root: string, path: string) => read(path) },
  } as unknown as Platform;
  return { manifest, read, platform };
}

test('reflection is runtime-only, idempotent and leaves Ukraine untouched', () => {
  const { manifest } = fixture(),
    before = JSON.stringify(manifest);
  const world = orientManifest(manifest);
  expect(orientManifest(world)).toBe(world);
  expect(JSON.stringify(manifest)).toBe(before);
  expect(world.chunks[1]!.originX).toBe(-11000);
  const ukraine = { ...manifest, id: 'ukraine' };
  expect(orientManifest(ukraine)).toBe(ukraine);
  const pixels = new Uint8Array([1, 2, 3, 4, 5, 6]);
  reflectPixels(pixels, 3, 2, 1);
  expect([...pixels]).toEqual([3, 2, 1, 6, 5, 4]);
});

test('DEM, contact normals, lake islands and clipped mesh agree after reflection', async () => {
  const { manifest, read, platform } = fixture(),
    world = orientManifest(manifest);
  const old = new GroundSampler(manifest, platform, 'appData', ''),
    next = new GroundSampler(world, platform, 'appData', '');
  for (const [x, z] of [
    [1100, 1100],
    [1500, 1500],
    [8000, 5000],
    [25500, 7000],
    [39999, 8000],
  ]) {
    await old.ensure(x!, z!);
    await next.ensure(sourceX(world, x!), z!);
    const a = old.sample(x!, z!)!,
      b = next.sample(sourceX(world, x!), z!)!;
    expect(b.height).toBeCloseTo(a.height, 5);
    expect(b.kind).toBe(a.kind);
    if (x !== 25500) expect(b.normal.x).toBeCloseTo(-a.normal.x, 5);
  }
  for (const c of world.chunks) {
    const samples = await decodeChunk(await read(c.path), c);
    const { geometry } = buildPatch(
      c,
      samples,
      { x: 0, z: 0, span: 25500, depth: 0, key: 'r' },
      world.extents,
    );
    const p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      expect(p.getX(i) + c.originX).toBeGreaterThanOrEqual(0);
      expect(p.getX(i) + c.originX).toBeLessThanOrEqual(world.extents.width);
    }
    geometry.dispose();
  }
  const camera = { x: 32000, y: 1000, z: 12000 };
  expect(
    selectSourceChunks(world, { ...camera, x: sourceX(world, camera.x) })
      .chunks.map((c) => c.path)
      .sort(),
  ).toEqual(
    selectSourceChunks(manifest, camera)
      .chunks.map((c) => c.path)
      .sort(),
  );
  old.dispose();
  next.dispose();
});

test('nav raster reverses source geography and Denver is east of SLC on compass and map', async () => {
  const { manifest, read } = fixture();
  const a = await buildNavigationMap(manifest, read),
    b = await buildNavigationMap(orientManifest(manifest), read);
  for (const x of [0, 100, 300, 511])
    expect([...b.rgba.slice(x * 4, x * 4 + 4)]).toEqual([
      ...a.rgba.slice((511 - x) * 4, (512 - x) * 4),
    ]);
  const real = orientManifest({
    ...manifest,
    extents: { width: 863257.4857287335, height: 344929.0782296875 },
  });
  const points = runtimeTheater(real)!.waypoints!,
    slc = points[0]!,
    flats = points[1]!,
    denver = points[2]!;
  const grid = { width: 512, height: 205, extents: real.extents };
  expect(worldToMap(grid, denver.x, denver.z).x).toBeGreaterThan(worldToMap(grid, slc.x, slc.z).x);
  expect(worldToMap(grid, flats.x, flats.z).x).toBeLessThan(worldToMap(grid, slc.x, slc.z).x);
  expect(bearingDegrees(denver.x - slc.x, denver.z - slc.z)).toBeGreaterThan(90);
  expect(bearingDegrees(denver.x - slc.x, denver.z - slc.z)).toBeLessThan(110);
});
