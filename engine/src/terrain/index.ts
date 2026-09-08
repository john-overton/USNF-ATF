/**
 * Terrain streamer (phase 3). For now: the chunk addressing scheme from brief 5.3 so
 * the manifest schema in `../data` has something to point at.
 */

/** LOD 0 is the finest level (30 m detail); each level up is 3x coarser. */
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
