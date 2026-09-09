import type { TheaterManifest, WaterBody } from '../data';
import { UKRAINE_PRACTICE } from '../flight/practice';
import type { FsRoot, Platform } from '../platform/Platform';
import { decodeChunk, sampleHeight } from './chunk';
import { parseManifest, safeRelativePath } from './manifest';

export interface MapWaypoint {
  id: 1 | 2 | 3;
  name: string;
  x: number;
  z: number;
  elevationM: number;
}
export interface MapGrid {
  width: number;
  height: number;
  extents: { width: number; height: number };
}
export interface NavigationMapData extends MapGrid {
  rgba: Uint8ClampedArray;
  waypoints: MapWaypoint[];
  minLandElevation: number;
  whiteElevation: number;
  maxLandElevation: number;
  sourceLod: number;
  name: string;
}

/** Pixel centres, north up; coordinates remain theater metres, never floating-origin local. */
export function mapPixelWorld(grid: MapGrid, x: number, y: number) {
  return {
    x: ((x + 0.5) / grid.width) * grid.extents.width,
    z: (1 - (y + 0.5) / grid.height) * grid.extents.height,
  };
}
export function worldToMap(grid: MapGrid, x: number, z: number) {
  return {
    x: (x / grid.extents.width) * grid.width,
    y: (1 - z / grid.extents.height) * grid.height,
  };
}

/** Even-odd scan conversion includes dry holes. Each body is unioned, not XORed with others. */
export function rasterizeWater(grid: MapGrid, bodies: readonly WaterBody[]): Uint8Array {
  const mask = new Uint8Array(grid.width * grid.height);
  for (const body of bodies) {
    const rows = new Map<number, number[]>();
    for (const ring of [body.polygon, ...(body.holes ?? [])]) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = worldToMap(grid, ...ring[i]!);
        const b = worldToMap(grid, ...ring[j]!);
        const first = Math.max(0, Math.ceil(Math.min(a.y, b.y) - 0.5));
        const end = Math.min(grid.height, Math.ceil(Math.max(a.y, b.y) - 0.5));
        for (let y = first; y < end; y++) {
          const row = rows.get(y) ?? [];
          row.push(a.x + ((y + 0.5 - a.y) * (b.x - a.x)) / (b.y - a.y));
          rows.set(y, row);
        }
      }
    }
    for (const [y, row] of rows) {
      const xs = row.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const start = Math.max(0, Math.ceil(xs[i]! - 0.5));
        const end = Math.min(grid.width, Math.ceil(xs[i + 1]! - 0.5));
        mask.fill(1, y * grid.width + start, y * grid.width + end);
      }
    }
  }
  return mask;
}

const LAND_COLORS = [
  [45, 115, 61],
  [202, 185, 67],
  [185, 70, 47],
  [102, 69, 46],
] as const;
export function elevationColor(height: number, minimum: number, white: number): readonly number[] {
  if (height >= white && white > minimum) return [238, 238, 224];
  const t = white > minimum ? Math.max(0, Math.min(1, (height - minimum) / (white - minimum))) : 0;
  const scaled = t * (LAND_COLORS.length - 1);
  const index = Math.min(LAND_COLORS.length - 2, Math.floor(scaled));
  const a = LAND_COLORS[index]!;
  const b = LAND_COLORS[index + 1]!;
  return a.map((v, channel) => Math.round(v + (b[channel]! - v) * (scaled - index)));
}

function polygonArea(body: WaterBody): number {
  const area = (ring: WaterBody['polygon']) => {
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      sum += ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1];
    }
    return Math.abs(sum / 2);
  };
  return area(body.polygon) - (body.holes?.reduce((sum, ring) => sum + area(ring), 0) ?? 0);
}

/** Missing source coverage stays transparent/dark and is excluded from statistics and routes. */
export function colorNavigationMap(
  grid: MapGrid,
  heights: Float32Array,
  water: Uint8Array,
  coastWater: Uint8Array,
): Pick<
  NavigationMapData,
  'rgba' | 'waypoints' | 'minLandElevation' | 'whiteElevation' | 'maxLandElevation'
> {
  const land: number[] = [];
  let peak = -1;
  for (let i = 0; i < heights.length; i++) {
    if (!water[i] && Number.isFinite(heights[i])) {
      land.push(heights[i]!);
      if (peak < 0 || heights[i]! > heights[peak]!) peak = i;
    }
  }
  land.sort((a, b) => a - b);
  const minLandElevation = land[0] ?? 0;
  const maxLandElevation = land[land.length - 1] ?? 0;
  const whiteElevation = land[Math.floor((land.length - 1) * 0.95)] ?? 0;
  const rgba = new Uint8ClampedArray(grid.width * grid.height * 4);
  for (let i = 0; i < heights.length; i++) {
    const rgb = !Number.isFinite(heights[i])
      ? [20, 26, 30]
      : water[i]
        ? [33, 86, 132]
        : elevationColor(heights[i]!, minLandElevation, whiteElevation);
    rgba.set([...rgb, 255], i * 4);
  }
  const waypoint = (id: MapWaypoint['id'], name: string, index: number): MapWaypoint => ({
    id,
    name,
    ...mapPixelWorld(grid, index % grid.width, Math.floor(index / grid.width)),
    elevationM: heights[index]!,
  });
  const waypoints: MapWaypoint[] = [];
  const strip = { x: UKRAINE_PRACTICE.x, z: UKRAINE_PRACTICE.z };
  const stripPixel = worldToMap(grid, strip.x, strip.z);
  const stripIndex = Math.floor(stripPixel.y) * grid.width + Math.floor(stripPixel.x);
  if (
    stripPixel.x >= 0 &&
    stripPixel.x < grid.width &&
    stripPixel.y >= 0 &&
    stripPixel.y < grid.height &&
    Number.isFinite(heights[stripIndex])
  ) {
    waypoints.push({
      id: 1,
      name: 'Practice strip',
      ...strip,
      elevationM: UKRAINE_PRACTICE.elevation,
    });
  }
  if (peak >= 0) waypoints.push(waypoint(2, 'Mountains', peak));
  let nearest = Infinity;
  let coast = -1;
  for (let y = 1; y < grid.height - 1; y++) {
    for (let x = 1; x < grid.width - 1; x++) {
      const i = y * grid.width + x;
      if (water[i] || !Number.isFinite(heights[i])) continue;
      if (![i - 1, i + 1, i - grid.width, i + grid.width].some((j) => coastWater[j])) continue;
      const position = mapPixelWorld(grid, x, y);
      const distance = Math.hypot(position.x - strip.x, position.z - strip.z);
      if (distance < nearest) {
        nearest = distance;
        coast = i;
      }
    }
  }
  if (coast >= 0) waypoints.push(waypoint(3, 'Coastline', coast));
  return { rgba, waypoints, minLandElevation, whiteElevation, maxLandElevation };
}

/** Reads at most two source chunks concurrently and retains only the bounded output grid. */
export async function loadNavigationMap(
  platform: Platform,
  root: FsRoot,
  path: string,
  signal?: AbortSignal,
): Promise<NavigationMapData> {
  safeRelativePath(path);
  const manifest = parseManifest(await platform.fs.readText(root, path));
  signal?.throwIfAborted();
  return buildNavigationMap(
    manifest,
    async (relative) =>
      platform.fs.readBytes(root, path.slice(0, path.lastIndexOf('/') + 1) + relative),
    signal,
  );
}

export async function buildNavigationMap(
  manifest: TheaterManifest,
  read: (path: string) => Promise<Uint8Array>,
  signal?: AbortSignal,
): Promise<NavigationMapData> {
  const sourceLod = Math.max(...manifest.lods);
  const chunks = manifest.chunks.filter((chunk) => chunk.lod === sourceLod);
  const longest = Math.max(manifest.extents.width, manifest.extents.height);
  const grid: MapGrid = {
    extents: manifest.extents,
    width: Math.max(1, Math.round((512 * manifest.extents.width) / longest)),
    height: Math.max(1, Math.round((512 * manifest.extents.height) / longest)),
  };
  const heights = new Float32Array(grid.width * grid.height).fill(NaN);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < chunks.length) {
      signal?.throwIfAborted();
      const chunk = chunks[next++]!;
      const samples = await decodeChunk(await read(chunk.path), chunk);
      signal?.throwIfAborted();
      const sw = worldToMap(grid, chunk.originX, chunk.originZ);
      const ne = worldToMap(
        grid,
        chunk.originX + 255 * chunk.spacing,
        chunk.originZ + 255 * chunk.spacing,
      );
      for (
        let y = Math.max(0, Math.ceil(ne.y - 0.5));
        y < Math.min(grid.height, Math.ceil(sw.y - 0.5));
        y++
      ) {
        for (
          let x = Math.max(0, Math.ceil(sw.x - 0.5));
          x < Math.min(grid.width, Math.ceil(ne.x - 0.5));
          x++
        ) {
          const position = mapPixelWorld(grid, x, y);
          heights[y * grid.width + x] = sampleHeight(
            samples,
            (position.x - chunk.originX) / chunk.spacing,
            (position.z - chunk.originZ) / chunk.spacing,
          );
        }
      }
      // Yield between chunks so a theater change can cancel queued map work.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  };
  await Promise.all(
    [worker(), worker()].map((work) =>
      work.catch((error: unknown) => {
        failed = true;
        throw error;
      }),
    ),
  );
  signal?.throwIfAborted();
  const water = rasterizeWater(grid, manifest.waterBodies);
  let largest: WaterBody | undefined;
  let largestArea = 0;
  for (const body of manifest.waterBodies) {
    const area = polygonArea(body);
    if (area > largestArea) {
      largest = body;
      largestArea = area;
    }
  }
  const coastWater = rasterizeWater(grid, largest ? [largest] : []);
  const colored = colorNavigationMap(grid, heights, water, coastWater);
  if (manifest.id !== 'ukraine')
    colored.waypoints = colored.waypoints.filter((point) => point.id !== 1);
  return {
    ...grid,
    ...colored,
    sourceLod,
    name: manifest.name,
  };
}

/** North-up viewport follows aircraft at zoom > 1 and clamps at the theater edges. */
export function navigationViewport(
  grid: MapGrid,
  aircraft: { x: number; z: number },
  zoom: number,
) {
  const factor = Math.max(1, Math.min(16, Number.isFinite(zoom) ? zoom : 1));
  const width = grid.width / factor;
  const height = grid.height / factor;
  const centre = worldToMap(grid, aircraft.x, aircraft.z);
  const x = Math.max(0, Math.min(grid.width - width, centre.x - width / 2));
  const y = Math.max(0, Math.min(grid.height - height, centre.y - height / 2));
  const worldWidth = grid.extents.width / factor;
  const targetNm = worldWidth / 1852 / 3;
  const power = 10 ** Math.floor(Math.log10(targetNm));
  const scaleNm = (targetNm / power >= 5 ? 5 : targetNm / power >= 2 ? 2 : 1) * power;
  return {
    x,
    y,
    width,
    height,
    zoom: factor,
    scaleNm,
    scalePercent: ((scaleNm * 1852) / worldWidth) * 100,
  };
}
