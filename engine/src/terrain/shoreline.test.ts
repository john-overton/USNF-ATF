import { ShoreWaterMask } from './shoreline-mask';
import { expect, test } from 'bun:test';
import { buildPatch } from './mesh';
import {
  ShoreIndex,
  buildShoreSurface,
  drapeShoreSurface,
  clipPolygon,
  seaward,
  SEA_RATIO,
  RIBBON_LIFT,
  RIBBON_WIDTH_SCALE,
} from './shoreline';
import { parseShorelines, type ShoreRing } from './shoreline-data';
import type { TerrainChunk } from '../data';
import { TerrainSeams, type SeamPatch } from './seams';

const chunk: TerrainChunk = {
  lod: 1,
  x: 0,
  y: 0,
  path: '0.gz',
  originX: 0,
  originZ: 0,
  spacing: 100,
  size: 256,
  offset: 0,
  scale: 1,
  minElevation: 0,
  maxElevation: 100,
  byteLength: 1,
  sha256: 'a'.repeat(64),
};
const ring: ShoreRing = {
  id: 'coast',
  points: [
    [100, 790, 100, 815, 0, 1, 0.4],
    [1500, 790, 1500, 815, 1400, 2, 0.4],
    [1500, 1200, 1475, 1200, 1810, 2, 0.4],
    [100, 790, 100, 815, 3300, 1, 0.4],
  ],
};
test('shoreline validation rejects unclosed rings, oversized bands and invalid classes', () => {
  const extents = { width: 25500, height: 25500 };
  const doc = { version: 1, kinds: ['unknown', 'beach', 'rock', 'cliff', 'marsh'], rings: [ring] };
  expect(parseShorelines(JSON.stringify(doc), extents)).toHaveLength(1);
  for (const [index, value] of [
    [2, 1000],
    [5, 5],
    [6, 2],
    [4, -1],
  ]) {
    const bad = structuredClone(doc) as unknown as { rings: { points: number[][] }[] };
    bad.rings[0]!.points[0]![index!] = value!;
    expect(() => parseShorelines(JSON.stringify(bad), extents)).toThrow();
  }
});
test('polygon clipping preserves continuous UV and interpolated material weights', () => {
  const p = clipPolygon(
    [
      [0, 0, 0],
      [10, 0, 10],
      [10, 10, 10],
      [0, 10, 0],
    ],
    [
      [5, -1],
      [5, 11],
      [11, 5],
    ],
  );
  expect(p.length).toBeGreaterThan(2);
  for (const v of p) {
    expect(v[0]).toBeGreaterThanOrEqual(5);
    expect(v[2]).toBeCloseTo(v[0]!, 8);
  }
});
test('ribbons follow the exact morphed triangles and shared tile boundary', () => {
  const samples = Float32Array.from(
    { length: 65536 },
    (_, i) => 20 + 10 * Math.sin(i % 256) + 5 * Math.cos(Math.floor(i / 256)),
  );
  const patches: SeamPatch[] = [0, 800].map((x) => {
    const patch = { x, z: 0, span: 800, depth: 1, key: String(x) };
    return { chunk, patch, morph: 0, geometry: buildPatch(chunk, samples, patch).geometry };
  });
  const graph = new TerrainSeams(patches),
    index = new ShoreIndex([ring]);
  const surfaces = patches.map((p) => buildShoreSurface(index, p)!);
  expect(surfaces.every(Boolean)).toBe(true);
  for (const morph of [0, 0.3, 1]) {
    patches.forEach((p) => (p.morph = morph));
    graph.update(1);
    surfaces.forEach((s, i) => drapeShoreSurface(s, patches[i]!));
    for (let j = 0; j < surfaces.length; j++) {
      const s = surfaces[j]!,
        p = patches[j]!,
        pos = s.geometry.getAttribute('position');
      for (let i = 0; i < s.bindings.length; i++) {
        const b = s.bindings[i]!;
        let expected = 0;
        for (let k = 0; k < 3; k++) {
          const id = b.ids[k]!,
            g = p.geometry,
            w = g.getAttribute('seamWeight').getX(id);
          expected +=
            b.weights[k]! *
            ((g.getAttribute('position').getY(id) * (1 - morph) +
              g.getAttribute('coarseHeight').getX(id) * morph) *
              (1 - w) +
              g.getAttribute('seamHeight').getX(id) * w);
        }
        expect(pos.getY(i)).toBeCloseTo(Math.max(expected, RIBBON_LIFT), 4);
      }
    }
    const edge = (i: number) => {
      const g = surfaces[i]!.geometry,
        p = g.getAttribute('position'),
        uv = g.getAttribute('shoreUv');
      return Array.from({ length: p.count }, (_, n) => ({
        x: p.getX(n) + patches[i]!.patch.x,
        z: p.getZ(n),
        y: p.getY(n),
        u: uv.getX(n),
      })).filter((v) => Math.abs(v.x - 800) < 1e-5);
    };
    const a = edge(0),
      b = edge(1);
    expect(a.length).toBeGreaterThan(0);
    for (const v of a) {
      const match = b.find((w) => Math.abs(w.z - v.z) < 1e-4 && Math.abs(w.y - v.y) < 1e-4);
      expect(match).toBeDefined();
      expect(match!.y).toBeCloseTo(v.y, 4);
      expect(match!.u).toBeCloseTo(v.u, 4);
    }
  }
  surfaces.forEach((s) => s.geometry.dispose());
  patches.forEach((p) => p.geometry.dispose());
});

test('local visual water mask preserves dry holes and unions overlapping water', () => {
  const outer = [
    [0, 0],
    [1000, 0],
    [1000, 1000],
    [0, 1000],
  ] as const;
  const hole = [
    [250, 250],
    [750, 250],
    [750, 750],
    [250, 750],
  ] as const;
  const mask = new ShoreWaterMask([
    { id: 'sea', elevation: 0, polygon: outer, holes: [hole] },
    {
      id: 'overlap',
      elevation: 0,
      polygon: [
        [450, 450],
        [550, 450],
        [550, 550],
        [450, 550],
      ],
    },
  ]);
  const texture = mask.bake(0, 0, 1000),
    bytes = texture.image.data!;
  const at = (x: number, z: number) =>
    bytes[Math.floor((z / 1000) * 512) * 512 + Math.floor((x / 1000) * 512)];
  expect(at(100, 100)).toBe(255);
  expect(at(300, 300)).toBe(0);
  expect(at(500, 500)).toBe(255);
  texture.dispose();
});

test('visual sea mask never erases a sub-texel dry island', () => {
  const mask = new ShoreWaterMask([
    {
      id: 'sea',
      elevation: 0,
      polygon: [
        [0, 0],
        [5120, 0],
        [5120, 5120],
        [0, 5120],
      ],
      holes: [
        [
          [2, 2],
          [4, 2],
          [4, 4],
          [2, 4],
        ],
      ],
    },
  ]);
  const texture = mask.bake(0, 0, 5120);
  expect(texture.image.data![0]).toBe(0);
  expect(texture.image.data![100 * 512 + 100]).toBe(255);
  texture.dispose();
});

test('ribbons extend seaward by SEA_RATIO and float above the water plane', () => {
  const patch = { x: 0, z: 0, span: 160, depth: 1, key: 'sea' };
  const p = {
    chunk,
    patch,
    morph: 0,
    geometry: buildPatch(chunk, new Float32Array(65536).fill(-3), patch).geometry,
  };
  const points = [
    [60, 20, 70, 20, 0, 1, 0],
    [60, 80, 70, 80, 60, 1, 0],
  ] as const;
  expect(seaward(points[0])[0]).toBeCloseTo(60 - 10 * SEA_RATIO * RIBBON_WIDTH_SCALE, 8);
  expect(seaward(points[0])[1]).toBeCloseTo(20, 8);
  const surface = buildShoreSurface(new ShoreIndex([{ id: 'segment', points }]), p)!;
  drapeShoreSurface(surface, p);
  const positions = surface.geometry.getAttribute('position'),
    uv = surface.geometry.getAttribute('shoreUv');
  let minX = Infinity,
    maxX = -Infinity,
    minT = Infinity,
    maxT = -Infinity;
  for (let i = 0; i < positions.count; i++) {
    expect(positions.getY(i)).toBeCloseTo(RIBBON_LIFT, 6);
    minX = Math.min(minX, positions.getX(i));
    maxX = Math.max(maxX, positions.getX(i));
    minT = Math.min(minT, uv.getY(i));
    maxT = Math.max(maxT, uv.getY(i));
  }
  expect(minX).toBeCloseTo(60 - 10 * SEA_RATIO * RIBBON_WIDTH_SCALE, 4);
  expect(maxX).toBeCloseTo(60 + 10 * RIBBON_WIDTH_SCALE, 4);
  expect(minT).toBeCloseTo(0, 6);
  expect(maxT).toBeCloseTo(1, 6);
  surface.geometry.dispose();
  p.geometry.dispose();
});
