import { expect, test } from 'bun:test';
import {
  colorNavigationMap,
  elevationColor,
  mapPixelWorld,
  navigationViewport,
  rasterizeWater,
  worldToMap,
} from './navigation-map';

const grid = { width: 10, height: 10, extents: { width: 1000, height: 1000 } };
test('north-up map coordinate round trips use pixel centres, independently of floating origin', () => {
  expect(worldToMap(grid, 0, 1000)).toEqual({ x: 0, y: 0 });
  expect(worldToMap(grid, 1000, 0)).toEqual({ x: 10, y: 10 });
  expect(mapPixelWorld(grid, 0, 0)).toEqual({ x: 50, z: 950 });
  const point = mapPixelWorld(grid, 3, 8);
  expect(worldToMap(grid, point.x, point.z).x).toBeCloseTo(3.5);
  expect(worldToMap(grid, point.x, point.z).y).toBeCloseTo(8.5);
});
test('water uses polygon union and leaves dry holes intact regardless of ground elevation', () => {
  const lake = {
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
        [200, 200],
        [800, 200],
        [800, 800],
        [200, 800],
      ],
    ] as const,
  };
  const mask = rasterizeWater(grid, [lake, { ...lake, id: 'overlapping' }]);
  expect(mask[0]).toBe(1);
  expect(mask[55]).toBe(0);
  const result = colorNavigationMap(grid, new Float32Array(100).fill(-10), mask, mask);
  expect([...result.rgba.slice(0, 3)]).toEqual([33, 86, 132]);
  expect([...result.rgba.slice(55 * 4, 55 * 4 + 3)]).toEqual([45, 115, 61]);
  expect(result.minLandElevation).toBe(-10);
});
test('regional land percentile excludes water and uncovered samples; flat ground stays green', () => {
  const heights = Float32Array.from({ length: 100 }, (_, i) => i);
  const water = new Uint8Array(100);
  water[99] = 1;
  heights[98] = NaN;
  const result = colorNavigationMap(grid, heights, water, water);
  expect(result.whiteElevation).toBe(92);
  expect(result.maxLandElevation).toBe(97);
  expect(result.waypoints.find((w) => w.id === 2)?.elevationM).toBe(97);
  expect([...result.rgba.slice(98 * 4, 98 * 4 + 3)]).toEqual([20, 26, 30]);
  expect(elevationColor(92, 0, 92)).toEqual([238, 238, 224]);
  expect(elevationColor(3, 3, 3)).toEqual([45, 115, 61]);
  expect(result.waypoints.some((w) => w.id === 1)).toBe(false);
});
test('zoom tracks the aircraft, clamps every edge, and preserves a meaningful NM distance scale', () => {
  const map = { width: 512, height: 256, extents: { width: 185200, height: 92600 } };
  const full = navigationViewport(map, { x: 0, z: 0 }, 1);
  expect(full).toMatchObject({
    x: 0,
    y: 0,
    width: 512,
    height: 256,
    scaleNm: 20,
    scalePercent: 20,
  });
  const centre = navigationViewport(map, { x: 92600, z: 46300 }, 4);
  expect(centre).toMatchObject({
    x: 192,
    y: 96,
    width: 128,
    height: 64,
    scaleNm: 5,
    scalePercent: 20,
  });
  expect(navigationViewport(map, { x: -100, z: 100000 }, 4)).toMatchObject({ x: 0, y: 0 });
  expect(navigationViewport(map, { x: 200000, z: -100 }, 4)).toMatchObject({ x: 384, y: 192 });
});

test('map loading validates bytes and cancellation stops further queued source reads', async () => {
  const { buildNavigationMap } = await import('./navigation-map');
  const { parseManifest } = await import('./manifest');
  const bytes = Bun.gzipSync(new Uint8Array(256 * 256 * 2));
  const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  const manifest = parseManifest(
    JSON.stringify({
      schemaVersion: 1,
      id: 'fixture',
      name: 'Synthetic',
      projection: { crs: 'synthetic', originX: 0, originY: 0 },
      extents: { width: 7650 * 3, height: 7650 },
      lods: [0],
      attribution: [],
      source: 'synthetic',
      waterBodies: [],
      chunks: [0, 1, 2].map((x) => ({
        lod: 0,
        x,
        y: 0,
        path: `${x}.gz`,
        spacing: 30,
        size: 256,
        originX: x * 7650,
        originZ: 0,
        offset: 0,
        scale: 0.1,
        minElevation: 0,
        maxElevation: 0,
        byteLength: bytes.length,
        sha256,
      })),
    }),
  );
  const failure = await buildNavigationMap(manifest, () =>
    Promise.resolve(new Uint8Array(bytes.length)),
  ).then(
    () => '',
    (error: unknown) => String(error),
  );
  expect(failure).toContain('checksum mismatch');
  const abort = new AbortController();
  let reads = 0;
  const cancelled = await buildNavigationMap(
    manifest,
    () => {
      reads++;
      abort.abort();
      return Promise.resolve(bytes);
    },
    abort.signal,
  ).then(
    () => false,
    () => true,
  );
  expect(cancelled).toBe(true);
  expect(reads).toBe(1);
  const result = await buildNavigationMap(manifest, () => Promise.resolve(bytes));
  expect(result.width).toBe(512);
  expect(result.height).toBe(171);
  expect(result.maxLandElevation).toBe(0);
});
