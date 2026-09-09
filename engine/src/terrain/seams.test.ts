import { expect, test } from 'bun:test';
import { BufferAttribute } from 'three';
import type { TerrainChunk } from '../data';
import { buildPatch } from './mesh';
import { patchMorph, selectPatches } from './lod';
import { TerrainSeams, type SeamPatch } from './seams';

const chunk: TerrainChunk = {
  lod: 0,
  x: 0,
  y: 0,
  path: '0.gz',
  originX: 0,
  originZ: 0,
  spacing: 30,
  size: 256,
  offset: 0,
  scale: 1,
  minElevation: -200,
  maxElevation: 200,
  byteLength: 1,
  sha256: 'a'.repeat(64),
};

test('same and mixed-depth edges follow one polyline through changing morphs', () => {
  const camera = { x: 1500, y: 350, z: 1000 };
  const samples = Float32Array.from(
    { length: 65536 },
    (_, i) => 100 * Math.sin((i % 256) / 7) * Math.cos(Math.floor(i / 256) / 11),
  );
  const patches: SeamPatch[] = selectPatches(chunk, camera).map((patch) => ({
    patch,
    chunk,
    geometry: buildPatch(chunk, samples, patch).geometry,
    morph: patchMorph(chunk, patch, camera),
  }));
  expect(new Set(patches.map((p) => p.patch.depth)).size).toBeGreaterThan(1);
  const seams = new TerrainSeams(patches);
  let comparisons = 0,
    mixed = 0;
  try {
    for (const fraction of [0, 0.3, 0.8, 1]) {
      for (const p of patches) p.morph = Math.min(1, fraction + patchMorph(chunk, p.patch, camera));
      seams.update();
      for (const a of patches)
        for (const b of patches) {
          if (a.patch.x + a.patch.span !== b.patch.x) continue;
          const lo = Math.max(a.patch.z, b.patch.z),
            hi = Math.min(a.patch.z + a.patch.span, b.patch.z + b.patch.span);
          if (lo >= hi) continue;
          const fine = a.patch.span <= b.patch.span ? a : b,
            coarse = fine === a ? b : a;
          const fineColumn = fine === a ? 16 : 0,
            coarseColumn = coarse === a ? 16 : 0;
          for (let j = 0; j <= 16; j++) {
            const z = fine.patch.z + (j * fine.patch.span) / 16;
            if (z < lo || z > hi) continue;
            const t = (z - coarse.patch.z) / (coarse.patch.span / 16),
              row = Math.min(15, Math.floor(t)),
              f = t - row;
            const h = coarse.geometry.getAttribute('seamHeight');
            const expected =
              h.getX(row * 17 + coarseColumn) * (1 - f) + h.getX((row + 1) * 17 + coarseColumn) * f;
            expect(
              Math.abs(
                fine.geometry.getAttribute('seamHeight').getX(j * 17 + fineColumn) - expected,
              ),
            ).toBeLessThan(0.00002);
            comparisons++;
            if (fine.patch.depth !== coarse.patch.depth) mixed++;
          }
        }
    }
    expect(comparisons).toBeGreaterThan(100);
    expect(mixed).toBeGreaterThan(100);
  } finally {
    for (const p of patches) p.geometry.dispose();
  }
});

test('adjacent source chunks share lighting, quantized heights and atlas UVs', () => {
  const other = { ...chunk, x: 1, originX: 7650, path: '1.gz' };
  const patches = [chunk, other].map((c): SeamPatch => {
    const samples = Float32Array.from(
      { length: 65536 },
      (_, i) => 0.1 * (c.x * 255 + (i % 256) - 255) ** 2 + c.x * 0.01,
    );
    const patch = { x: 0, z: 0, span: 7650, depth: 0, key: 'r' };
    return {
      chunk: c,
      patch,
      geometry: buildPatch(c, samples, patch, { width: 15300, height: 7650 }).geometry,
      morph: 0,
    };
  });
  new TerrainSeams(patches).update();
  const [a, b] = patches;
  for (let j = 0; j <= 16; j++) {
    for (const attribute of ['seamHeight', 'seamNormal', 'uv']) {
      const left = a!.geometry.getAttribute(attribute),
        right = b!.geometry.getAttribute(attribute);
      for (let axis = 0; axis < left.itemSize; axis++)
        expect(left.getComponent(j * 17 + 16, axis)).toBe(right.getComponent(j * 17, axis));
    }
  }
  for (const p of patches) p.geometry.dispose();
});

test('a neighbor subdivision eases shared-edge ownership instead of jumping', () => {
  const c = { ...chunk, originX: 10000 };
  const samples = Float32Array.from(
    { length: 65536 },
    (_, i) => 100 * Math.sin((i % 256) / 7) * Math.cos(Math.floor(i / 256) / 11),
  );
  const make = (x: number): SeamPatch[] => {
    const camera = { x, y: 200, z: 1000 };
    return selectPatches(c, camera).map((patch) => ({
      chunk: c,
      patch,
      geometry: buildPatch(c, samples, patch).geometry,
      morph: patchMorph(c, patch, camera),
    }));
  };
  const before = make(4645 - 0.000001),
    after = make(4645 + 0.000001);
  const old = new TerrainSeams(before);
  old.update();
  const next = new TerrainSeams(after, old);
  next.update(0);
  const height = (items: SeamPatch[]) =>
    items
      .find((p) => p.patch.key === 'r1')!
      .geometry.getAttribute('seamHeight')
      .getX(3 * 17);
  expect(height(after)).toBe(height(before));
  next.update(0.125);
  expect(Math.abs(height(after) - height(before))).toBeLessThan(2);
  next.update(0.125);
  expect(Math.abs(height(after) - height(before))).toBeGreaterThan(2);
  for (const p of [...before, ...after]) p.geometry.dispose();
});

test('settled unchanged boundaries do not recompute or upload, but morph changes resume updates', () => {
  const patch = { x: 0, z: 0, span: 7650, depth: 0, key: 'r' };
  const item: SeamPatch = {
    patch,
    chunk,
    geometry: buildPatch(chunk, new Float32Array(65536), patch).geometry,
    morph: 0,
  };
  const graph = new TerrainSeams([item]);
  expect(graph.update(0.25)).toBeGreaterThan(0);
  const height = item.geometry.getAttribute('seamHeight');
  if (!(height instanceof BufferAttribute)) throw new Error('Expected ordinary boundary buffer');
  const version = height.version;
  expect(graph.update(0.1)).toBe(0);
  expect(height.version).toBe(version);
  item.morph = 0.2;
  expect(graph.update(0.1)).toBeGreaterThan(0);
  expect(height.version).toBeGreaterThan(version);
  item.geometry.dispose();
});
