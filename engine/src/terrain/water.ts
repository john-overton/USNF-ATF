import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Path,
  Shape,
  ShapeGeometry,
  type Scene,
} from 'three';
import type { WaterBody } from '../data';
import { ByteCache } from './cache';
import type { WorldPosition } from './lod';

interface WaterBatch {
  id: string;
  bodies: WaterBody[];
  x: number;
  z: number;
  maxX: number;
  maxZ: number;
  bytes: number;
}
interface WaterResource {
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  x: number;
  z: number;
}
export const WATER_CACHE_BYTES = 16 * 1024 * 1024;
/** Cluster nearby small polygons into draw batches, bounding each batch's triangulation work. */
export function waterBatches(bodies: readonly WaterBody[]): WaterBatch[] {
  const groups = new Map<string, WaterBatch[]>();
  for (const body of bodies) {
    let x = Infinity,
      z = Infinity,
      maxX = -Infinity,
      maxZ = -Infinity;
    for (const [px, pz] of body.polygon) {
      x = Math.min(x, px);
      z = Math.min(z, pz);
      maxX = Math.max(maxX, px);
      maxZ = Math.max(maxZ, pz);
    }
    const cell = `${Math.floor(x / 32768)}/${Math.floor(z / 32768)}`;
    const group = groups.get(cell) ?? [];
    let batch = group[group.length - 1];
    // A vertex needs position+normal and at most three uint32 triangle indices.
    const bytes =
      (body.polygon.length + (body.holes?.reduce((sum, h) => sum + h.length, 0) ?? 0)) * 36;
    if (!batch || batch.bodies.length >= 64 || batch.bytes + bytes > 1024 * 1024) {
      batch = { id: `${cell}/${group.length}`, bodies: [], x, z, maxX, maxZ, bytes: 0 };
      group.push(batch);
      groups.set(cell, group);
    }
    batch.bodies.push(body);
    batch.x = Math.min(batch.x, x);
    batch.z = Math.min(batch.z, z);
    batch.maxX = Math.max(batch.maxX, maxX);
    batch.maxZ = Math.max(batch.maxZ, maxZ);
    batch.bytes += bytes;
  }
  return [...groups.values()].flat();
}
export function nearbyWater(
  batches: readonly WaterBatch[],
  camera: WorldPosition,
  horizon: number,
): { batches: WaterBatch[]; omitted: number } {
  const distance = (b: WaterBatch): number =>
    Math.hypot(
      Math.max(b.x - camera.x, 0, camera.x - b.maxX),
      Math.max(b.z - camera.z, 0, camera.z - b.maxZ),
    );
  const near = batches
    .filter((b) => distance(b) < horizon)
    .sort((a, b) => distance(a) - distance(b));
  let bytes = 0;
  const selected: WaterBatch[] = [];
  for (const batch of near) {
    if (selected.length >= 128 || bytes + batch.bytes > WATER_CACHE_BYTES) continue;
    selected.push(batch);
    bytes += batch.bytes;
  }
  return { batches: selected, omitted: near.length - selected.length };
}
export function waterGeometry(batch: WaterBatch): BufferGeometry {
  const positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [];
  for (const body of batch.bodies) {
    const shape = new Shape();
    body.polygon.forEach(([x, z], i) => {
      if (i === 0) shape.moveTo(x - batch.x, batch.z - z);
      else shape.lineTo(x - batch.x, batch.z - z);
    });
    shape.closePath();
    for (const ring of body.holes ?? []) {
      const hole = new Path();
      ring.forEach(([x, z], i) => {
        if (i === 0) hole.moveTo(x - batch.x, batch.z - z);
        else hole.lineTo(x - batch.x, batch.z - z);
      });
      hole.closePath();
      shape.holes.push(hole);
    }
    const part = new ShapeGeometry(shape);
    const p = part.getAttribute('position'),
      base = positions.length / 3;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), body.elevation + 0.2, -p.getY(i));
      normals.push(0, 1, 0);
    }
    const index = part.getIndex();
    if (index) for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i));
    part.dispose();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
export class WaterLayer {
  private readonly cache: ByteCache<WaterResource>;
  private readonly batches: WaterBatch[];
  private visible = new Set<string>();
  uploadedBytes = 0;
  omitted = 0;
  constructor(
    private readonly scene: Scene,
    bodies: readonly WaterBody[],
  ) {
    this.batches = waterBatches(bodies);
    this.cache = new ByteCache(WATER_CACHE_BYTES, (r) => {
      scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
    });
  }
  get bytes(): number {
    return this.cache.bytes;
  }
  get count(): number {
    return this.cache.size;
  }
  get pending(): number {
    return this.visible.size - this.cache.size;
  }
  select(camera: WorldPosition, horizon: number): void {
    const selection = nearbyWater(this.batches, camera, horizon);
    this.omitted = selection.omitted;
    const next = new Set(selection.batches.map((b) => b.id));
    // Dispose departed coverage before filling the next working set: no pinned eviction cycle.
    for (const id of this.visible) if (!next.has(id)) this.cache.remove(id);
    let built = 0;
    for (const batch of selection.batches) {
      if (this.cache.get(batch.id)) continue;
      if (built >= 4) continue;
      built++;
      const geometry = waterGeometry(batch),
        bytes =
          Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0) +
          (geometry.index?.array.byteLength ?? 0);
      const mesh = new Mesh(
        geometry,
        new MeshStandardMaterial({ color: 0x285e82, roughness: 0.35, metalness: 0.25 }),
      );
      this.cache.put(batch.id, { mesh, x: batch.x, z: batch.z }, bytes);
      this.scene.add(mesh);
      this.uploadedBytes += bytes;
    }
    this.visible = next;
  }
  rebase(origin: { x: number; z: number }): void {
    for (const id of this.visible) {
      const r = this.cache.get(id);
      if (r) r.mesh.position.set(r.x - origin.x, 0, r.z - origin.z);
    }
  }
  dispose(): void {
    this.cache.clear();
  }
}
