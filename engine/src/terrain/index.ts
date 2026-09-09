/**
 * Terrain source chunk addressing. Runtime validation, decoding and rendering live
 * in sibling modules; these constants are shared with the offline pipeline.
 */

/** LOD 0 is the finest level (30 m detail); 30 → 100 is not a factor of three. */
export type LodLevel = 0 | 1 | 2 | 3 | 4;

export const LOD_METERS: Readonly<Record<LodLevel, number>> = {
  0: 30,
  1: 100,
  2: 300,
  3: 900,
  4: 2700,
};

/** Every chunk is CHUNK_SIZE x CHUNK_SIZE samples regardless of LOD. */
export const CHUNK_SIZE = 256;

export interface ChunkKey {
  readonly lod: LodLevel;
  readonly x: number;
  readonly y: number;
}

export function chunkId(key: ChunkKey): string {
  return `L${key.lod}/${key.x}_${key.y}`;
}
