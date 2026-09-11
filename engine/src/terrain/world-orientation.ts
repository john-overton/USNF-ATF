import type { TerrainChunk, TheaterManifest } from '../data';
import type { ShoreRing } from './shoreline-data';
import { theaterForManifest } from './theaters';

// Runtime-only identity tags. Serialized v1 data and transport hashes stay untouched.
const reflected = new WeakSet<TheaterManifest>();
const reversedChunks = new WeakSet<TerrainChunk>();
export const chunkNeedsReflection = (chunk: TerrainChunk) => reversedChunks.has(chunk);
export const reflectedWidth = (manifest: TheaterManifest): number | undefined =>
  reflected.has(manifest) ? manifest.extents.width : undefined;
export const sourceX = (manifest: TheaterManifest, x: number): number =>
  reflected.has(manifest) ? manifest.extents.width - x : x;

/** Utah source +X east → right-handed flight +X west, about the theater's width. */
export function orientManifest(source: TheaterManifest): TheaterManifest {
  if (source.id !== 'salt-lake' || reflected.has(source)) return source;
  const width = source.extents.width;
  const ring = (points: readonly (readonly [number, number])[]) =>
    points.map(([x, z]) => [width - x, z] as const).reverse();
  const manifest: TheaterManifest = {
    ...source,
    chunks: source.chunks.map((chunk) => {
      const next = { ...chunk, originX: width - chunk.originX - 255 * chunk.spacing };
      reversedChunks.add(next);
      return next;
    }),
    waterBodies: source.waterBodies.map((body) => ({
      ...body,
      polygon: ring(body.polygon),
      ...(body.holes ? { holes: body.holes.map(ring) } : {}),
    })),
  };
  reflected.add(manifest);
  return manifest;
}

export function reflectPixels(pixels: Uint8Array, width: number, height: number, channels: number) {
  for (let y = 0; y < height; y++)
    for (let x = 0; x < Math.floor(width / 2); x++) {
      for (let c = 0; c < channels; c++) {
        const a = (y * width + x) * channels + c,
          b = (y * width + width - 1 - x) * channels + c;
        const value = pixels[a]!;
        pixels[a] = pixels[b]!;
        pixels[b] = value;
      }
    }
}

export function runtimeTheater(manifest: TheaterManifest) {
  const theater = theaterForManifest(manifest.id);
  if (!theater || !reflected.has(manifest)) return theater;
  return {
    ...theater,
    strip: { ...theater.strip, x: sourceX(manifest, theater.strip.x) },
    ...(theater.waypoints
      ? { waypoints: theater.waypoints.map((p) => ({ ...p, x: sourceX(manifest, p.x) })) }
      : {}),
  };
}

export function orientShorelines(manifest: TheaterManifest, rings: ShoreRing[]): ShoreRing[] {
  if (!reflected.has(manifest)) return rings;
  return rings.map((r) => ({
    ...r,
    points: r.points.map(
      (p) =>
        [sourceX(manifest, p[0]), p[1], sourceX(manifest, p[2]), p[3], p[4], p[5], p[6]] as const,
    ),
  }));
}
