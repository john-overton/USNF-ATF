import {
  type BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  type Scene,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import type { WaterBody } from '../data';
import { waterGeometry, type WaterBatch } from './water-geometry';
import type { WaterGeometryBuilder } from './water-worker-client';
export { waterGeometry } from './water-geometry';
import { ByteCache } from './cache';
import type { WorldPosition } from './lod';

interface WaterResource {
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  x: number;
  z: number;
}
export const WATER_CACHE_BYTES = 32 * 1024 * 1024;
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
    // Position+normal cost 24 bytes per vertex. With H holes, triangulation
    // has at most N + 2H triangles; budget uint32 indices conservatively.
    const bytes =
      (body.polygon.length + (body.holes?.reduce((sum, h) => sum + h.length, 0) ?? 0)) * 36 +
      24 * (body.holes?.length ?? 0);
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
    if (selected.length >= 1024 || bytes + batch.bytes > WATER_CACHE_BYTES) continue;
    selected.push(batch);
    bytes += batch.bytes;
  }
  return { batches: selected, omitted: near.length - selected.length };
}
export class WaterLayer {
  private readonly cache: ByteCache<WaterResource>;
  private readonly batches: WaterBatch[];
  private visible = new Set<string>();
  private readonly building = new Set<string>();
  private disposed = false;
  private depthFrame = -1;
  private readonly depthUniforms = {
    waterCameraHeight: { value: 0 },
    waterViewUp: { value: new Vector3() },
    waterProjectionScale: { value: new Vector2() },
    waterViewport: { value: new Vector4() },
  };
  error = '';
  uploadedBytes = 0;
  omitted = 0;
  constructor(
    private readonly scene: Scene,
    bodies: readonly WaterBody[],
    private readonly builder?: WaterGeometryBuilder,
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
    this.visible = next;
    let built = 0;
    for (const batch of selection.batches) {
      if (this.cache.get(batch.id)) continue;
      if (this.building.has(batch.id) || built >= 4 || this.building.size >= 4) continue;
      built++;
      if (!this.builder) this.accept(batch, waterGeometry(batch));
      else {
        this.building.add(batch.id);
        void this.builder
          .build(batch)
          .then((geometry) => {
            if (this.disposed || !this.visible.has(batch.id)) geometry.dispose();
            else this.accept(batch, geometry);
          })
          .catch((error: unknown) => {
            if (!this.disposed && this.visible.has(batch.id)) this.error = String(error);
          })
          .finally(() => this.building.delete(batch.id));
      }
    }
  }
  private accept(batch: WaterBatch, geometry: BufferGeometry): void {
    const bytes =
      Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0) +
      (geometry.index?.array.byteLength ?? 0);
    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({ color: 0x285e82, roughness: 0.35, metalness: 0.25 }),
    );
    // Huge, slender sea triangles can lose depth precision in interpolation.
    // Reconstruct the horizontal plane's view depth from the pixel ray instead.
    mesh.onBeforeRender = (renderer, _scene, camera) => {
      if (this.depthFrame === renderer.info.render.frame) return;
      this.depthFrame = renderer.info.render.frame;
      const e = camera.matrixWorld.elements,
        p = camera.projectionMatrix.elements;
      this.depthUniforms.waterCameraHeight.value = e[13]!;
      this.depthUniforms.waterViewUp.value.set(e[1], e[5], e[9]);
      this.depthUniforms.waterProjectionScale.value.set(1 / p[0], 1 / p[5]);
      renderer.getCurrentViewport(this.depthUniforms.waterViewport.value);
    };
    mesh.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.depthUniforms);
      shader.vertexShader = 'varying float waterHeight;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nwaterHeight = (modelMatrix * vec4(position, 1.0)).y;',
      );
      shader.fragmentShader =
        `varying float waterHeight;
        uniform float waterCameraHeight;
        uniform vec3 waterViewUp;
        uniform vec2 waterProjectionScale;
        uniform vec4 waterViewport;
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <logdepthbuf_fragment>',
        `
        #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
          vec2 waterNdc = ((gl_FragCoord.xy - waterViewport.xy) / waterViewport.zw) * 2.0 - 1.0;
          vec3 waterRay = vec3(waterNdc * waterProjectionScale, -1.0);
          float waterViewDepth = (waterHeight - waterCameraHeight) / dot(waterViewUp, waterRay);
          gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z
            : clamp(log2(max(1.0, 1.0 + waterViewDepth)) * logDepthBufFC * 0.5 - 4.0 / 16777216.0, 0.0, 1.0);
        #endif
      `,
      );
    };
    mesh.material.customProgramCacheKey = () => 'water-analytic-plane-depth-v1';
    this.cache.put(batch.id, { mesh, x: batch.x, z: batch.z }, bytes);
    this.scene.add(mesh);
    this.uploadedBytes += bytes;
  }
  rebase(origin: { x: number; z: number }): void {
    for (const id of this.visible) {
      const r = this.cache.get(id);
      if (r) r.mesh.position.set(r.x - origin.x, 0, r.z - origin.z);
    }
  }
  dispose(): void {
    this.disposed = true;
    this.builder?.dispose();
    this.cache.clear();
  }
}
