import { describe, expect, test } from 'bun:test';
import { Scene } from 'three';
import { initialCamera } from './camera';
import { waterBatches, nearbyWater, waterGeometry, WaterLayer, WATER_CACHE_BYTES } from './water';
import type { TerrainChunk, TheaterManifest, WaterBody } from '../data';
import { ByteCache } from './cache';
import { decodeChunk, sampleHeight } from './chunk';
import { floatingOrigin, selectPatches, selectSourceChunks } from './lod';
import { parseManifest, safeRelativePath } from './manifest';
import { buildPatch } from './mesh';

const chunk: TerrainChunk = {
  lod: 0,
  x: 0,
  y: 0,
  path: 'L0/0_0.u16.gz',
  originX: 0,
  originZ: 0,
  spacing: 30,
  size: 256,
  offset: 0,
  scale: 0.1,
  minElevation: 0,
  maxElevation: 100,
  byteLength: 200,
  sha256: 'a'.repeat(64),
};
const manifest: TheaterManifest = {
  schemaVersion: 1,
  id: 'test',
  name: 'Synthetic only',
  projection: { crs: '+proj=utm +zone=36', originX: 0, originY: 0 },
  extents: { width: 7650, height: 7650 },
  lods: [0],
  attribution: ['Original synthetic test fixture'],
  source: 'synthetic',
  chunks: [chunk],
  waterBodies: [],
};
async function compressed(raw: Uint8Array): Promise<{ bytes: Uint8Array; metadata: TerrainChunk }> {
  const bytes = Bun.gzipSync(new Uint8Array(raw));
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
  return { bytes, metadata: { ...chunk, byteLength: bytes.length, sha256: hash } };
}
async function rejects(promise: Promise<unknown>, message: string): Promise<void> {
  await promise.then(
    () => {
      throw new Error('Expected rejection');
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(message);
    },
  );
}
describe('terrain transport boundary', () => {
  test('accepts v1 and rejects unsupported schema and nonfinite elevation', () => {
    expect(parseManifest(JSON.stringify(manifest))).toEqual(manifest);
    expect(() => parseManifest(JSON.stringify({ ...manifest, schemaVersion: 2 }))).toThrow(
      'schemaVersion',
    );
    expect(() =>
      parseManifest(JSON.stringify({ ...manifest, chunks: [{ ...chunk, scale: null }] })),
    ).toThrow();
  });
  test('rejects traversal, duplicate grids and inconsistent origins', () => {
    for (const path of ['../x', '/tmp/x', 'a\\b', 'a//b', 'a/%2e%2e/b'])
      expect(() => safeRelativePath(path)).toThrow();
    expect(() => parseManifest(JSON.stringify({ ...manifest, chunks: [chunk, chunk] }))).toThrow(
      'Duplicate',
    );
    expect(() =>
      parseManifest(JSON.stringify({ ...manifest, chunks: [{ ...chunk, originX: 1 }] })),
    ).toThrow('origin');
  });
  test('validates little endian samples and quantized elevations', async () => {
    const raw = new Uint8Array(131072);
    raw[0] = 0xe8;
    raw[1] = 3;
    const { bytes, metadata } = await compressed(raw);
    const result = await decodeChunk(bytes, metadata);
    expect(result.length).toBe(65536);
    expect(result[0]).toBe(100);
    expect(result[1]).toBe(0);
  });
  test('rejects corrupt length/hash before decompression', async () => {
    const { bytes, metadata } = await compressed(new Uint8Array(131072));
    await rejects(decodeChunk(bytes.subarray(1), metadata), 'length');
    bytes[0] = 0;
    await rejects(decodeChunk(bytes, metadata), 'checksum');
  });
  test('caps gzip expansion and refuses short chunks', async () => {
    for (const size of [12, 131074]) {
      const { bytes, metadata } = await compressed(new Uint8Array(size));
      await rejects(decodeChunk(bytes, metadata), size === 12 ? 'Truncated' : 'budget');
    }
  });
  test('rejects sample outside declared elevation range', async () => {
    const raw = new Uint8Array(131072);
    raw[0] = 255;
    raw[1] = 255;
    const { bytes, metadata } = await compressed(raw);
    await rejects(decodeChunk(bytes, metadata), 'elevation bounds');
  });
});
describe('terrain mesh and selection', () => {
  test('bilinear source sampling preserves shared corner and plane', () => {
    const h = new Float32Array(65536);
    for (let z = 0; z < 256; z++) for (let x = 0; x < 256; x++) h[z * 256 + x] = x + 2 * z;
    expect(sampleHeight(h, 0.5, 0.5)).toBe(1.5);
    expect(sampleHeight(h, 255, 255)).toBe(765);
    const built = buildPatch(chunk, h, { x: 0, z: 0, span: 7650, depth: 1, key: 'r0' });
    const positions = built.geometry.getAttribute('position'),
      coarse = built.geometry.getAttribute('coarseHeight');
    for (let i = 0; i < 289; i++)
      expect(Math.abs(positions.getY(i) - coarse.getX(i))).toBeLessThan(0.001);
    const normals = built.geometry.getAttribute('normal');
    for (let i = 0; i < 289; i++) {
      expect(normals.getY(i)).toBeCloseTo(1 / Math.hypot(1 / 30, 1, 2 / 30), 5);
    }
    expect(positions.count).toBe(353); // 17x17 surface + 64 edge skirt vertices
    expect(built.geometry.index!.count).toBe(1920); // 512 surface + 128 skirt triangles
    built.geometry.dispose();
  });
  test('quadtree exactly covers a tile without overlapping leaf interiors', () => {
    const patches = selectPatches(chunk, { x: 3825, y: 200, z: 3825 });
    expect(patches.length).toBeGreaterThan(1);
    expect(patches.reduce((sum, p) => sum + p.span * p.span, 0)).toBe(7650 ** 2);
    for (let i = 0; i < patches.length; i++)
      for (let j = i + 1; j < patches.length; j++) {
        const a = patches[i]!,
          b = patches[j]!;
        expect(
          Math.max(a.x, b.x) >= Math.min(a.x + a.span, b.x + b.span) ||
            Math.max(a.z, b.z) >= Math.min(a.z + a.span, b.z + b.span),
        ).toBe(true);
      }
    expect(selectPatches(chunk, { x: 1e6, y: 1e6, z: 1e6 })).toHaveLength(1);
  });
  test('floating origin preserves global displacement at large and negative coordinates', () => {
    const a = { x: 8191.75, y: 50, z: -0.25 },
      b = { x: 8192.25, y: 50, z: 0.25 };
    const oa = floatingOrigin(a),
      ob = floatingOrigin(b);
    expect(oa).toEqual({ x: 0, z: -8192 });
    expect(ob).toEqual({ x: 8192, z: 0 });
    expect(b.x - ob.x - (a.x - oa.x) + (ob.x - oa.x)).toBe(0.5);
  });
  test('sparse detail cannot displace complete coarse coverage', () => {
    const sparse: TheaterManifest = {
      ...manifest,
      extents: { width: 51000, height: 51000 },
      lods: [0, 2],
      chunks: [chunk, { ...chunk, lod: 2, spacing: 300, path: 'coarse.gz' }],
    };
    const selected = selectSourceChunks(sparse, { x: 3825, y: 200, z: 3825 });
    expect(selected.lod).toBe(2);
    expect(selected.chunks).toHaveLength(1);
  });
  test('source selection handles cameras outside coverage with bounded nearest fallback', () => {
    expect(selectSourceChunks(manifest, { x: 1e7, y: 100, z: 1e7 }).chunks).toEqual([chunk]);
  });
});
test('byte cache LRU refresh, eviction, replacement and disposal stay within budget', () => {
  const disposed: string[] = [];
  const cache = new ByteCache<string>(8, (v) => disposed.push(v));
  cache.put('a', 'A', 4);
  cache.put('b', 'B', 4);
  expect(cache.get('a')).toBe('A');
  cache.put('c', 'C', 4);
  expect(disposed).toEqual(['B']);
  expect(cache.get('b')).toBeUndefined();
  expect(cache.bytes).toBe(8);
  cache.put('a', 'AA', 2);
  expect(cache.bytes).toBe(6);
  expect(disposed).toEqual(['B', 'A']);
  expect(() => cache.put('x', 'X', 9)).toThrow('capacity');
  cache.clear();
  expect(cache.bytes).toBe(0);
  expect(cache.size).toBe(0);
});

test('camera query accepts reproducible poses, clamps extents and refuses invalid inputs', () => {
  const pose = initialCamera(manifest, '?x=-10&z=999999&y=1&yaw=3.14&pitch=-2');
  expect(pose).toEqual({ position: { x: 0, z: 7650, y: 25 }, yaw: 3.14, pitch: -1.5 });
  expect(initialCamera(manifest, '?x=123&z=456&y=789&yaw=0.4&pitch=-0.3').position).toEqual({
    x: 123,
    z: 456,
    y: 789,
  });
  for (const query of ['?x=NaN', '?y=Infinity', '?yaw=no', '?pitch='])
    expect(() => initialCamera(manifest, query)).toThrow('finite');
});
test('water holes preserve dry islands through validation and triangulation', () => {
  const body: WaterBody = {
    id: 'lake',
    elevation: 3,
    polygon: [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ],
    holes: [
      [
        [25, 25],
        [75, 25],
        [75, 75],
        [25, 75],
      ],
    ],
  };
  expect(
    parseManifest(JSON.stringify({ ...manifest, waterBodies: [body] })).waterBodies[0]!.holes,
  ).toEqual(body.holes);
  const geometry = waterGeometry(waterBatches([body])[0]!);
  const p = geometry.getAttribute('position'),
    indices = geometry.getIndex()!;
  let area = 0;
  for (let i = 0; i < indices.count; i += 3) {
    const a = indices.getX(i),
      b = indices.getX(i + 1),
      c = indices.getX(i + 2);
    area +=
      Math.abs(
        (p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) -
          (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a)),
      ) / 2;
  }
  expect(area).toBe(7500);
  geometry.dispose();
});
test('water batching culls remote geometry, builds lazily and disposes departed coverage', () => {
  const bodies: WaterBody[] = Array.from({ length: 400 }, (_, i) => ({
    id: String(i),
    elevation: 0,
    polygon: [
      [i * 1000, 0],
      [i * 1000 + 100, 0],
      [i * 1000 + 100, 100],
      [i * 1000, 100],
    ],
  }));
  const batches = waterBatches(bodies);
  expect(batches.length).toBeLessThan(bodies.length);
  const near = nearbyWater(batches, { x: 0, y: 100, z: 0 }, 12000);
  expect(near.batches.length).toBe(1);
  expect(near.omitted).toBe(0);
  const scene = new Scene(),
    layer = new WaterLayer(scene, bodies);
  layer.select({ x: 0, y: 100, z: 0 }, 12000);
  expect(layer.count).toBe(1);
  expect(layer.bytes).toBeGreaterThan(0);
  expect(layer.bytes).toBeLessThanOrEqual(WATER_CACHE_BYTES);
  layer.select({ x: 10000000, y: 100, z: 0 }, 12000);
  expect(layer.bytes).toBe(0);
  expect(scene.children).toHaveLength(0);
  layer.dispose();
});
