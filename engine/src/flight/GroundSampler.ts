import type { TerrainChunk, TheaterManifest, WaterBody } from '../data';
import type { FsRoot, Platform } from '../platform/Platform';
import { WaterBodyIndex } from './WaterIndex';
import { ByteCache } from '../terrain/cache';
import { decodeChunk, sampleHeight } from '../terrain/chunk';

export interface ContactSurface {
  height: number;
  normal: { x: number; y: number; z: number };
  kind: 'land' | 'water';
}
export interface PracticeStrip {
  x: number;
  z: number;
  width: number;
  length: number;
  elevation: number;
}
export function inRing(
  ring: readonly (readonly [number, number])[],
  x: number,
  z: number,
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!,
      [xj, zj] = ring[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function containsWater(body: WaterBody, x: number, z: number): boolean {
  return inRing(body.polygon, x, z) && !body.holes?.some((hole) => inRing(hole, x, z));
}
export function onStrip(strip: PracticeStrip, x: number, z: number): boolean {
  return Math.abs(x - strip.x) <= strip.width / 2 && Math.abs(z - strip.z) <= strip.length / 2;
}

/** Contact data has its own bounded residency and never follows visual source LOD. */
export class GroundSampler {
  private readonly data = new ByteCache<Float32Array>(8 * 1024 * 1024);
  private readonly pending = new Map<string, Promise<void>>();
  private readonly index = new Map<string, TerrainChunk>();
  private readonly water = new Map<string, WaterBodyIndex[]>();
  private disposed = false;
  strip?: PracticeStrip;
  error = '';
  constructor(
    readonly manifest: TheaterManifest,
    private platform: Platform,
    private root: FsRoot,
    private folder: string,
  ) {
    for (const chunk of manifest.chunks)
      this.index.set(`${chunk.lod}/${chunk.x}/${chunk.y}`, chunk);
    for (const body of manifest.waterBodies) {
      const indexed = new WaterBodyIndex(body);
      const { minX, maxX, minZ, maxZ } = indexed.exterior;
      for (let x = Math.floor(minX / 16384); x <= Math.floor(maxX / 16384); x++)
        for (let z = Math.floor(minZ / 16384); z <= Math.floor(maxZ / 16384); z++) {
          const key = `${x}/${z}`,
            items = this.water.get(key) ?? [];
          items.push(indexed);
          this.water.set(key, items);
        }
    }
  }
  get bytes(): number {
    return this.data.bytes;
  }
  get loading(): number {
    return this.pending.size;
  }
  sourceAt(x: number, z: number): TerrainChunk | undefined {
    if (x < 0 || z < 0 || x > this.manifest.extents.width || z > this.manifest.extents.height)
      return;
    // Flight collision requires base100m or finer. Never fall back to 300m+ meshes.
    for (const [lod, spacing] of [
      [0, 30],
      [1, 100],
    ] as const) {
      const span = 255 * spacing;
      const chunk = this.index.get(
        `${lod}/${Math.floor(Math.min(x, this.manifest.extents.width - 0.001) / span)}/${Math.floor(Math.min(z, this.manifest.extents.height - 0.001) / span)}`,
      );
      if (chunk) return chunk;
    }
  }
  async ensure(x: number, z: number, reportError = true): Promise<void> {
    const chunk = this.sourceAt(x, z);
    if (!chunk)
      throw new Error('Flight requires complete 100m or finer ground coverage at this position');
    if (this.data.get(chunk.path)) return;
    let request = this.pending.get(chunk.path);
    if (!request) {
      request = this.platform.fs
        .readBytes(this.root, this.folder + chunk.path)
        .then((bytes) => decodeChunk(bytes, chunk))
        .then((samples) => {
          if (!this.disposed) this.data.put(chunk.path, samples, samples.byteLength);
        })
        .finally(() => {
          this.pending.delete(chunk.path);
        });
      this.pending.set(chunk.path, request);
    }
    try {
      await request;
    } catch (error) {
      if (reportError && !this.disposed) this.error = String(error);
      throw error;
    }
  }
  prefetch(x: number, z: number, vx: number, vz: number): void {
    for (const seconds of [0, 3, 6]) {
      const px = x + vx * seconds,
        pz = z + vz * seconds;
      for (const [dx, dz] of [
        [0, 0],
        [-200, 0],
        [200, 0],
        [0, -200],
        [0, 200],
      ]) {
        if (this.sourceAt(px + dx!, pz + dz!))
          void this.ensure(px + dx!, pz + dz!).catch(() => undefined);
      }
    }
  }
  sample(x: number, z: number): ContactSurface | undefined {
    const chunk = this.sourceAt(x, z);
    const samples = chunk && this.data.get(chunk.path);
    if (!chunk || !samples) return;
    const sx = (x - chunk.originX) / chunk.spacing,
      sz = (z - chunk.originZ) / chunk.spacing;
    const height = sampleHeight(samples, sx, sz);
    const dx =
      (sampleHeight(samples, sx + 1, sz) - sampleHeight(samples, sx - 1, sz)) / (2 * chunk.spacing);
    const dz =
      (sampleHeight(samples, sx, sz + 1) - sampleHeight(samples, sx, sz - 1)) / (2 * chunk.spacing);
    const n = Math.hypot(dx, 1, dz);
    if (this.strip && onStrip(this.strip, x, z))
      return { height: this.strip.elevation, normal: { x: 0, y: 1, z: 0 }, kind: 'land' };
    for (const body of this.water.get(`${Math.floor(x / 16384)}/${Math.floor(z / 16384)}`) ?? []) {
      if (body.contains(x, z))
        return {
          height: Math.max(height, body.body.elevation),
          normal: { x: 0, y: 1, z: 0 },
          kind: 'water',
        };
    }
    return { height, normal: { x: -dx / n, y: 1 / n, z: -dz / n }, kind: 'land' };
  }
  dispose(): void {
    this.disposed = true;
    this.data.clear();
  }
}
