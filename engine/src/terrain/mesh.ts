import { BufferGeometry, Float32BufferAttribute, DynamicDrawUsage } from 'three';
import type { TerrainChunk } from '../data';
import { sampleHeight } from './chunk';
import { PATCH_CELLS, type Patch } from './lod';

/** Interpolate on the parent's actual (possibly theater-clipped) triangle. */
function parentSample(
  sample: (x: number, z: number) => number,
  x: number,
  z: number,
  step: number,
  maxX: number,
  maxZ: number,
): number {
  const x0 = Math.floor(x / step) * step,
    z0 = Math.floor(z / step) * step;
  const x1 = Math.min(maxX, x0 + step),
    z1 = Math.min(maxZ, z0 + step);
  const fx = x1 > x0 ? (x - x0) / (x1 - x0) : 0;
  const fz = z1 > z0 ? (z - z0) / (z1 - z0) : 0;
  const a = sample(x0, z0),
    b = sample(x1, z0),
    c = sample(x0, z1),
    d = sample(x1, z1);
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
    uvs: number[] = [],
    indices: number[] = [];
  const step = patch.span / PATCH_CELLS;
  const maxX = Math.min(255, ((extents?.width ?? Infinity) - chunk.originX) / chunk.spacing);
  const maxZ = Math.min(255, ((extents?.height ?? Infinity) - chunk.originZ) / chunk.spacing);
  const coarseAt = (sample: (x: number, z: number) => number, x: number, z: number): number =>
    patch.depth === 0
      ? sample(x, z)
      : parentSample(sample, x, z, (2 * step) / chunk.spacing, maxX, maxZ);
  const vertex = (x: number, z: number, skirt = false): number => {
    x = Math.min(x, (extents?.width ?? Infinity) - chunk.originX);
    z = Math.min(z, (extents?.height ?? Infinity) - chunk.originZ);
    const sx = x / chunk.spacing,
      sz = z / chunk.spacing;
    const h = sampleHeight(samples, sx, sz),
      drop = skirt ? Math.max(100, chunk.maxElevation - chunk.minElevation + 10) : 0;
    const index = positions.length / 3;
    uvs.push(
      (chunk.originX + x) / (extents?.width ?? 255 * chunk.spacing),
      (chunk.originZ + z) / (extents?.height ?? 255 * chunk.spacing),
    );
    positions.push(x - patch.x, h - drop, z - patch.z);
    coarse.push(coarseAt((px, pz) => sampleHeight(samples, px, pz), sx, sz) - drop);
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
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('coarseHeight', new Float32BufferAttribute(coarse, 1));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  // Use the same source-gradient field for parent and child vertices. Interpolate
  // parent normals on the parent's actual triangle, not a different bilinear face.
  const normalAt = (x: number, z: number): number[] => {
    const x0 = Math.max(0, x - 1),
      x1 = Math.min(255, x + 1);
    const z0 = Math.max(0, z - 1),
      z1 = Math.min(255, z + 1);
    const dx =
      (sampleHeight(samples, x1, z) - sampleHeight(samples, x0, z)) / ((x1 - x0) * chunk.spacing);
    const dz =
      (sampleHeight(samples, x, z1) - sampleHeight(samples, x, z0)) / ((z1 - z0) * chunk.spacing);
    const length = Math.hypot(dx, 1, dz);
    return [-dx / length, 1 / length, -dz / length];
  };
  const normals: number[] = [],
    coarseNormals: number[] = [];
  for (let i = 0; i < positions.length / 3; i++) {
    const x = (patch.x + positions[i * 3]!) / chunk.spacing;
    const z = (patch.z + positions[i * 3 + 2]!) / chunk.spacing;
    const n = normalAt(x, z);
    normals.push(...n);
    for (let axis = 0; axis < 3; axis++)
      coarseNormals.push(coarseAt((px, pz) => normalAt(px, pz)[axis]!, x, z));
  }
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('coarseNormal', new Float32BufferAttribute(coarseNormals, 3));
  const coarseColors: number[] = [];
  for (let i = 0; i < coarse.length; i++) {
    const x = (patch.x + positions[i * 3]!) / chunk.spacing;
    const z = (patch.z + positions[i * 3 + 2]!) / chunk.spacing;
    const tint = coarseAt(
      (px, pz) => Math.max(0, Math.min(1, sampleHeight(samples, px, pz) / 2500)),
      x,
      z,
    );
    coarseColors.push(0.19 + tint * 0.34, 0.31 + tint * 0.27, 0.13 + tint * 0.4);
  }
  geometry.setAttribute('coarseColor', new Float32BufferAttribute(coarseColors, 3));
  const count = positions.length / 3;
  geometry.setAttribute(
    'seamHeight',
    new Float32BufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage),
  );
  geometry.setAttribute(
    'seamNormal',
    new Float32BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage),
  );
  geometry.setAttribute('seamWeight', new Float32BufferAttribute(new Float32Array(count), 1));
  geometry.computeBoundingSphere();
  const bytes =
    Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0) +
    (geometry.index?.array.byteLength ?? 0);
  return { geometry, bytes };
}
