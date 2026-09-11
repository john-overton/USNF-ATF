import type { TerrainChunk, TheaterManifest } from '../data';
import { LOD_METERS, type LodLevel } from './index';
import { sourceX } from './world-orientation';

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}
export interface Patch {
  x: number;
  z: number;
  span: number;
  depth: number;
  key: string;
}
export const PATCH_CELLS = 16;
export const ORIGIN_GRID = 8192;
export function floatingOrigin(position: WorldPosition): { x: number; z: number } {
  return {
    x: Math.floor(position.x / ORIGIN_GRID) * ORIGIN_GRID,
    z: Math.floor(position.z / ORIGIN_GRID) * ORIGIN_GRID,
  };
}
export function distanceToSquare(
  x: number,
  z: number,
  span: number,
  camera: WorldPosition,
): number {
  return Math.hypot(
    Math.max(x - camera.x, 0, camera.x - x - span),
    Math.max(z - camera.z, 0, camera.z - z - span),
  );
}
/** The exact selection metric also drives morphs, including at far patch corners. */
export function patchDistance(
  chunk: TerrainChunk,
  patch: { x: number; z: number; span: number },
  camera: WorldPosition,
): number {
  return Math.hypot(
    distanceToSquare(chunk.originX + patch.x, chunk.originZ + patch.z, patch.span, camera),
    Math.max(0, camera.y - chunk.maxElevation),
  );
}
export function patchMorph(chunk: TerrainChunk, patch: Patch, camera: WorldPosition): number {
  const t = Math.max(
    0,
    Math.min(1, (patchDistance(chunk, patch, camera) / patch.span - 1.4) / 1.4),
  );
  return t * t * (3 - 2 * t);
}
/** Distance-driven dyadic mesh hierarchy within one independently sampled source tile. */
export function selectPatches(chunk: TerrainChunk, camera: WorldPosition, maxDepth = 4): Patch[] {
  const result: Patch[] = [];
  const visit = (x: number, z: number, span: number, depth: number, key: string): void => {
    const distance = patchDistance(chunk, { x, z, span }, camera);
    if (depth < maxDepth && distance < span * 1.4) {
      const half = span / 2;
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++)
          visit(x + i * half, z + j * half, half, depth + 1, `${key}${i + 2 * j}`);
    } else result.push({ x, z, span, depth, key });
  };
  visit(0, 0, 255 * chunk.spacing, 0, 'r');
  return result;
}
export function viewDistance(camera: WorldPosition): number {
  return Math.max(24000, Math.min(300000, camera.y * 16));
}
/** Source levels are not dyadic/nested. Switch the entire visible source set together. */
export function selectSourceChunks(
  manifest: TheaterManifest,
  camera: WorldPosition,
): { lod: LodLevel; chunks: TerrainChunk[] } {
  const levels = [...manifest.lods].sort((a, b) => a - b);
  const horizon = viewDistance(camera);
  let chosen: TerrainChunk[] = [],
    lod = levels[levels.length - 1]!;
  for (const level of levels) {
    const candidates = manifest.chunks.filter(
      (c) =>
        c.lod === level &&
        distanceToSquare(c.originX, c.originZ, 255 * c.spacing, camera) < horizon,
    );
    const span = 255 * LOD_METERS[level];
    // Sparse airbase LOD0 must never replace complete coarse theater coverage.
    let required = 0;
    const gridCamera = { ...camera, x: sourceX(manifest, camera.x) };
    const x0 = Math.max(0, Math.floor((gridCamera.x - horizon) / span));
    const z0 = Math.max(0, Math.floor((camera.z - horizon) / span));
    const x1 = Math.min(
      Math.ceil(manifest.extents.width / span) - 1,
      Math.floor((gridCamera.x + horizon) / span),
    );
    const z1 = Math.min(
      Math.ceil(manifest.extents.height / span) - 1,
      Math.floor((camera.z + horizon) / span),
    );
    for (let z = z0; z <= z1 && required <= 25; z++)
      for (let x = x0; x <= x1 && required <= 25; x++) {
        if (distanceToSquare(x * span, z * span, span, gridCamera) < horizon) required++;
      }
    if (
      required === candidates.length &&
      candidates.length > 0 &&
      candidates.length <= 25 &&
      (level === levels[levels.length - 1] || camera.y < candidates[0]!.spacing * 300)
    ) {
      chosen = candidates;
      lod = level;
      break;
    }
  }
  if (!chosen.length)
    chosen = manifest.chunks
      .filter((c) => c.lod === lod)
      .sort(
        (a, b) =>
          distanceToSquare(a.originX, a.originZ, 255 * a.spacing, camera) -
          distanceToSquare(b.originX, b.originZ, 255 * b.spacing, camera),
      )
      .slice(0, 25);
  return {
    lod,
    chunks: chosen
      .sort(
        (a, b) =>
          distanceToSquare(a.originX, a.originZ, 255 * a.spacing, camera) -
          distanceToSquare(b.originX, b.originZ, 255 * b.spacing, camera),
      )
      .slice(0, 25),
  };
}
