import type { TerrainChunk, TheaterManifest } from '../data';
import { LOD_METERS, type LodLevel } from './index';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected object');
  return value as Record<string, unknown>;
}
function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('Expected finite number');
  return value;
}
function positive(value: unknown): number {
  const n = finite(value);
  if (n <= 0) throw new Error('Expected positive number');
  return n;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096)
    throw new Error('Expected nonempty string');
  return value;
}
function array(value: unknown, max = 100_000): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('Invalid array size');
  return value as unknown[];
}
export function safeRelativePath(value: unknown): string {
  const p = string(value);
  if (
    !/^[a-zA-Z0-9_./-]+$/.test(p) ||
    p.startsWith('/') ||
    p.split('/').some((s) => !s || s === '.' || s === '..')
  )
    throw new Error('Unsafe relative terrain path');
  return p;
}
function level(value: unknown): LodLevel {
  const n = finite(value);
  if (!Number.isInteger(n) || n < 0 || n > 4) throw new Error('Invalid LOD');
  return n as LodLevel;
}
function coordinate(value: unknown): number {
  const n = finite(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid tile coordinate');
  return n;
}
export function parseManifest(text: string): TheaterManifest {
  if (text.length > 32 * 1024 * 1024) throw new Error('Manifest exceeds 32 MiB');
  const m = object(JSON.parse(text) as unknown);
  if (m.schemaVersion !== 1) throw new Error('Unsupported terrain schemaVersion');
  const p = object(m.projection),
    e = object(m.extents);
  const width = positive(e.width),
    height = positive(e.height);
  if (Math.max(width, height) > 20_000_000)
    throw new Error('Theater extents exceed supported flat grid');
  const lods = array(m.lods, 5).map(level);
  if (!lods.length || new Set(lods).size !== lods.length)
    throw new Error('Missing or duplicate LOD');
  const keys = new Set<string>(),
    paths = new Set<string>();
  const chunks = array(m.chunks).map((value): TerrainChunk => {
    const c = object(value),
      lod = level(c.lod),
      x = coordinate(c.x),
      y = coordinate(c.y);
    const path = safeRelativePath(c.path),
      spacing = positive(c.spacing);
    const originX = finite(c.originX),
      originZ = finite(c.originZ);
    const minElevation = finite(c.minElevation),
      maxElevation = finite(c.maxElevation);
    const offset = finite(c.offset),
      scale = positive(c.scale),
      byteLength = positive(c.byteLength);
    const sha256 = string(c.sha256),
      key = `${lod}/${x}/${y}`;
    if (!lods.includes(lod) || c.size !== 256 || spacing !== LOD_METERS[lod])
      throw new Error('Invalid chunk grid');
    if (
      originX !== x * 255 * spacing ||
      originZ !== y * 255 * spacing ||
      originX >= width ||
      originZ >= height
    )
      throw new Error('Chunk origin disagrees with grid/extents');
    if (
      minElevation > maxElevation ||
      minElevation < -12000 ||
      maxElevation > 12000 ||
      offset < -12000 ||
      offset > minElevation + scale ||
      offset + 65535 * scale < maxElevation - scale ||
      scale > 1
    )
      throw new Error('Invalid elevation bounds or quantization');
    if (!Number.isSafeInteger(byteLength) || byteLength > 262144 || !/^[0-9a-f]{64}$/.test(sha256))
      throw new Error('Invalid chunk byte length/hash');
    if (keys.has(key) || paths.has(path)) throw new Error('Duplicate chunk');
    keys.add(key);
    paths.add(path);
    return {
      lod,
      x,
      y,
      path,
      spacing,
      size: 256,
      originX,
      originZ,
      minElevation,
      maxElevation,
      offset,
      scale,
      byteLength,
      sha256,
    };
  });
  if (!chunks.length || lods.some((l) => !chunks.some((c) => c.lod === l)))
    throw new Error('LOD has no chunks');
  let waterPoints = 0;
  const ring = (value: unknown): readonly (readonly [number, number])[] => {
    const points = array(value, 100000).map((pair) => {
      const a = array(pair, 2);
      if (a.length !== 2) throw new Error('Water coordinate must be [x,z]');
      const x = finite(a[0]),
        z = finite(a[1]);
      if (x < 0 || z < 0 || x > width || z > height) throw new Error('Water outside theater');
      return [x, z] as const;
    });
    if (points.length < 3) throw new Error('Water polygon needs three points');
    waterPoints += points.length;
    if (waterPoints > 500000) throw new Error('Water exceeds vertex budget');
    return points;
  };
  const waterBodies = array(m.waterBodies, 50000).map((value) => {
    const w = object(value),
      polygon = ring(w.polygon);
    const holes = w.holes === undefined ? undefined : array(w.holes, 10000).map(ring);
    if (polygon.length + (holes?.reduce((sum, h) => sum + h.length, 0) ?? 0) > 100000)
      throw new Error('Water body exceeds vertex budget');
    return {
      id: string(w.id),
      elevation: finite(w.elevation),
      polygon,
      ...(holes ? { holes } : {}),
    };
  });
  return {
    schemaVersion: 1,
    id: string(m.id),
    name: string(m.name),
    projection: { crs: string(p.crs), originX: finite(p.originX), originY: finite(p.originY) },
    extents: { width, height },
    lods,
    chunks,
    waterBodies,
    source: string(m.source),
    attribution: array(m.attribution, 100).map(string),
  };
}
