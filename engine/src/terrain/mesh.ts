import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { TerrainChunk } from '../data';
import { sampleHeight } from './chunk';
import { PATCH_CELLS, type Patch } from './lod';

/** Same triangle diagonal as the mesh indices, so a fully morphed child follows its parent. */
function parentHeight(samples: Float32Array, x: number, z: number, step: number): number {
  const x0 = Math.floor(x / step) * step,
    z0 = Math.floor(z / step) * step;
  const fx = (x - x0) / step,
    fz = (z - z0) / step;
  const a = sampleHeight(samples, x0, z0),
    b = sampleHeight(samples, x0 + step, z0);
  const c = sampleHeight(samples, x0, z0 + step),
    d = sampleHeight(samples, x0 + step, z0 + step);
  return fx + fz <= 1
    ? a + (b - a) * fx + (c - a) * fz
    : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}
export function buildPatch(
  chunk: TerrainChunk,
  samples: Float32Array,
  patch: Patch,
  extents?: { width: number; height: number },
): { geometry: BufferGeometry; bytes: number } {
  const positions: number[] = [],
    coarse: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const step = patch.span / PATCH_CELLS;
  const vertex = (x: number, z: number, skirt = false): number => {
    x = Math.min(x, (extents?.width ?? Infinity) - chunk.originX);
    z = Math.min(z, (extents?.height ?? Infinity) - chunk.originZ);
    const sx = x / chunk.spacing,
      sz = z / chunk.spacing;
    const h = sampleHeight(samples, sx, sz),
      drop = skirt ? Math.max(100, chunk.maxElevation - chunk.minElevation + 10) : 0;
    const index = positions.length / 3;
    positions.push(x - patch.x, h - drop, z - patch.z);
    coarse.push(
      (patch.depth === 0 ? h : parentHeight(samples, sx, sz, (2 * step) / chunk.spacing)) - drop,
    );
    const tint = Math.max(0, Math.min(1, h / 2500));
    colors.push(0.19 + tint * 0.34, 0.31 + tint * 0.27, 0.13 + tint * 0.4);
    return index;
  };
  for (let j = 0; j <= PATCH_CELLS; j++)
    for (let i = 0; i <= PATCH_CELLS; i++) vertex(patch.x + i * step, patch.z + j * step);
  const row = PATCH_CELLS + 1;
  for (let j = 0; j < PATCH_CELLS; j++)
    for (let i = 0; i < PATCH_CELLS; i++) {
      const a = j * row + i,
        b = a + 1,
        c = a + row,
        d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  const edge: number[] = [];
  for (let i = 0; i < PATCH_CELLS; i++) edge.push(i);
  for (let j = 0; j < PATCH_CELLS; j++) edge.push(j * row + PATCH_CELLS);
  for (let i = PATCH_CELLS; i > 0; i--) edge.push(PATCH_CELLS * row + i);
  for (let j = PATCH_CELLS; j > 0; j--) edge.push(j * row);
  const bottoms = edge.map((index) =>
    vertex(patch.x + positions[index * 3]!, patch.z + positions[index * 3 + 2]!, true),
  );
  for (let i = 0; i < edge.length; i++) {
    const n = (i + 1) % edge.length;
    indices.push(edge[i]!, edge[n]!, bottoms[i]!, edge[n]!, bottoms[n]!, bottoms[i]!);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('coarseHeight', new Float32BufferAttribute(coarse, 1));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Skirt triangles must not pull surface edge normals sideways into visible bevels.
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < row * row; i++) {
    const x = (patch.x + positions[i * 3]!) / chunk.spacing;
    const z = (patch.z + positions[i * 3 + 2]!) / chunk.spacing;
    const x0 = Math.max(0, x - 1),
      x1 = Math.min(255, x + 1),
      z0 = Math.max(0, z - 1),
      z1 = Math.min(255, z + 1);
    const dx =
      (sampleHeight(samples, x1, z) - sampleHeight(samples, x0, z)) / ((x1 - x0) * chunk.spacing);
    const dz =
      (sampleHeight(samples, x, z1) - sampleHeight(samples, x, z0)) / ((z1 - z0) * chunk.spacing);
    const length = Math.hypot(dx, 1, dz);
    normals.setXYZ(i, -dx / length, 1 / length, -dz / length);
  }
  geometry.computeBoundingSphere();
  const bytes =
    Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0) +
    (geometry.index?.array.byteLength ?? 0);
  return { geometry, bytes };
}
