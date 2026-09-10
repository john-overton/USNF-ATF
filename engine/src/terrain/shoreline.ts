import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  TextureLoader,
  SRGBColorSpace,
  DoubleSide,
  type Texture,
  type Scene,
} from 'three';
import { patchCloudShadow } from './cloud-shadow';
import type { WaterBody } from '../data';
import { ShoreWaterMask } from './shoreline-mask';
import type { ShorePoint, ShoreRing } from './shoreline-data';
import type { SeamPatch } from './seams';
import { PATCH_CELLS } from './lod';
import atlasUrl from './assets/shoreline.png';

// Clip in projected meters before converting to patch-local float32 coordinates.
// Interpolated ribbon UV/material weights survive every triangle/tile split.
type Vertex = number[]; // x,z,s,t, five material weights

/** Seaward extension as a fraction of the landward cross-section; the water line sits at t = SEA_RATIO / (1 + SEA_RATIO). */
export const SEA_RATIO = 0.7;
/** Along-coast metres per atlas repeat (384 px). */
export const COAST_REPEAT_METERS = 128;
/** Ribbon vertices float at least this high so the sea side sits on the water plane (+0.2). */
export const RIBBON_LIFT = 0.5;
/**
 * Visual widening of the pipeline cross-sections (nominal 10–25 m landward). The
 * pipeline's narrow-land safety was computed at 1x; widened ribbons may overlap
 * translucently on spits and around small islands. Test value, not accepted art.
 */
export const RIBBON_WIDTH_SCALE = 3;
/** Landward ribbon edge, scaled from the water-edge point. */
export function landward(p: ShorePoint): readonly [number, number] {
  return [p[0] + (p[2] - p[0]) * RIBBON_WIDTH_SCALE, p[1] + (p[3] - p[1]) * RIBBON_WIDTH_SCALE];
}
/** Water-edge point mirrored seaward by SEA_RATIO of the (scaled) landward offset. */
export function seaward(p: ShorePoint): readonly [number, number] {
  const k = RIBBON_WIDTH_SCALE * SEA_RATIO;
  return [p[0] - (p[2] - p[0]) * k, p[1] - (p[3] - p[1]) * k];
}
interface Segment {
  a: ShorePoint;
  b: ShorePoint;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}
export function clipPolygon(
  input: Vertex[],
  triangle: readonly (readonly [number, number])[],
): Vertex[] {
  let polygon = input;
  const area = (a: readonly number[], b: readonly number[], c: readonly number[]): number =>
    (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
  const sign = Math.sign(area(triangle[0]!, triangle[1]!, triangle[2]!));
  if (!sign) return [];
  for (let edge = 0; edge < 3; edge++) {
    const a = triangle[edge]!,
      b = triangle[(edge + 1) % 3]!,
      next: Vertex[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]!,
        q = polygon[(i + 1) % polygon.length]!;
      const dp = sign * area(a, b, p),
        dq = sign * area(a, b, q);
      if (dp >= 0) next.push(p);
      if (dp >= 0 !== dq >= 0) {
        const t = dp / (dp - dq);
        next.push(p.map((v, j) => v + (q[j]! - v) * t));
      }
    }
    polygon = next;
  }
  return polygon;
}
export class ShoreIndex {
  bytes = 0;
  private readonly cells = new Map<string, Segment[]>();
  constructor(rings: readonly ShoreRing[]) {
    this.bytes = rings.reduce((sum, ring) => sum + ring.points.length * 240, 0);
    for (const ring of rings)
      for (let i = 1; i < ring.points.length; i++) {
        const a = ring.points[i - 1]!,
          b = ring.points[i]!;
        if (Math.hypot(a[2] - a[0], a[3] - a[1]) + Math.hypot(b[2] - b[0], b[3] - b[1]) < 0.1)
          continue;
        const sa = seaward(a),
          sb = seaward(b),
          la = landward(a),
          lb = landward(b);
        const s = {
          a,
          b,
          minX: Math.min(la[0], lb[0], sa[0], sb[0]),
          minZ: Math.min(la[1], lb[1], sa[1], sb[1]),
          maxX: Math.max(la[0], lb[0], sa[0], sb[0]),
          maxZ: Math.max(la[1], lb[1], sa[1], sb[1]),
        };
        for (let x = Math.floor(s.minX / 4096); x <= Math.floor(s.maxX / 4096); x++)
          for (let z = Math.floor(s.minZ / 4096); z <= Math.floor(s.maxZ / 4096); z++) {
            const key = `${x}/${z}`,
              list = this.cells.get(key) ?? [];
            list.push(s);
            this.cells.set(key, list);
          }
      }
  }
  query(x: number, z: number, span: number): Segment[] {
    const found = new Set<Segment>();
    for (let i = Math.floor(x / 4096); i <= Math.floor((x + span) / 4096); i++)
      for (let j = Math.floor(z / 4096); j <= Math.floor((z + span) / 4096); j++)
        for (const s of this.cells.get(`${i}/${j}`) ?? [])
          if (s.minX < x + span && s.maxX > x && s.minZ < z + span && s.maxZ > z) found.add(s);
    return [...found];
  }
}
interface Binding {
  ids: number[];
  weights: number[];
}
export interface ShoreSurface {
  evaluated: Float64Array;
  geometry: BufferGeometry;
  bindings: Binding[];
  bytes: number;
}
export function buildShoreSurface(index: ShoreIndex, patch: SeamPatch): ShoreSurface | undefined {
  const x = patch.chunk.originX + patch.patch.x,
    z = patch.chunk.originZ + patch.patch.z;
  const step = patch.patch.span / PATCH_CELLS,
    row = PATCH_CELLS + 1,
    source = patch.geometry.getAttribute('position');
  const positions: number[] = [],
    uv: number[] = [],
    weights: number[] = [],
    extra: number[] = [],
    bindings: Binding[] = [];
  // The quad runs from the seaward edge (t = 0) across the water line to the
  // landward edge (t = 1); the atlas rows are painted with the same layout.
  const corner = (p: ShorePoint, inside: boolean): Vertex => [
    ...(inside ? landward(p) : seaward(p)),
    p[4] / COAST_REPEAT_METERS,
    inside ? 1 : 0,
    ...Array.from({ length: 5 }, (_, k) => (k === p[5] ? 1 : 0)),
  ];
  for (const s of index.query(x, z, patch.patch.span)) {
    const quad = [corner(s.a, false), corner(s.b, false), corner(s.b, true), corner(s.a, true)];
    const i0 = Math.max(0, Math.floor((s.minX - x) / step)),
      i1 = Math.min(PATCH_CELLS - 1, Math.floor((s.maxX - x) / step));
    const j0 = Math.max(0, Math.floor((s.minZ - z) / step)),
      j1 = Math.min(PATCH_CELLS - 1, Math.floor((s.maxZ - z) / step));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++)
        for (const ids of [
          [j * row + i, j * row + i + row, j * row + i + 1],
          [j * row + i + 1, j * row + i + row, j * row + i + row + 1],
        ]) {
          const tri = ids.map((id) => [x + source.getX(id), z + source.getZ(id)] as const);
          const polygon = clipPolygon(quad, tri);
          const area = polygon.reduce((sum, p, i) => {
            const q = polygon[(i + 1) % polygon.length]!;
            return sum + (p[0]! - x) * (q[1]! - z) - (p[1]! - z) * (q[0]! - x);
          }, 0);
          if (Math.abs(area) < 1e-5) continue;
          const a = tri[0]!,
            b = tri[1]!,
            c = tri[2]!;
          const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
          if (Math.abs(den) < 1e-8) continue;
          const append = (v: Vertex): void => {
            const wa = ((b[1] - c[1]) * (v[0]! - c[0]) + (c[0] - b[0]) * (v[1]! - c[1])) / den;
            const wb = ((c[1] - a[1]) * (v[0]! - c[0]) + (a[0] - c[0]) * (v[1]! - c[1])) / den;
            positions.push(v[0]! - x, 0, v[1]! - z);
            uv.push(v[2]!, v[3]!);
            weights.push(...v.slice(4, 8));
            extra.push(v[8]!);
            bindings.push({ ids, weights: [wa, wb, 1 - wa - wb] });
          };
          for (let k = 1; k + 1 < polygon.length; k++) {
            const p = polygon[0]!,
              q = polygon[k]!,
              r = polygon[k + 1]!;
            if (
              Math.abs((q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!)) < 1e-5
            )
              continue;
            for (const v of [p, q, r]) append(v);
          }
          if (bindings.length > 16000) return undefined;
        }
  }
  if (!bindings.length) return undefined;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'normal',
    new Float32BufferAttribute(new Float32Array(positions.length), 3),
  );
  geometry.setAttribute('shoreUv', new Float32BufferAttribute(uv, 2));
  geometry.setAttribute('shoreWeights', new Float32BufferAttribute(weights, 4));
  geometry.setAttribute('shoreMarsh', new Float32BufferAttribute(extra, 1));
  // Include retained JS bindings conservatively in the resource budget.
  return {
    geometry,
    bindings,
    evaluated: new Float64Array(source.count * 4),
    bytes: bindings.length * 160 + source.count * 32,
  };
}
export function drapeShoreSurface(surface: ShoreSurface, patch: SeamPatch): void {
  const src = patch.geometry,
    pos = src.getAttribute('position'),
    coarse = src.getAttribute('coarseHeight'),
    seam = src.getAttribute('seamHeight'),
    weight = src.getAttribute('seamWeight');
  const normal = src.getAttribute('normal'),
    cn = src.getAttribute('coarseNormal'),
    sn = src.getAttribute('seamNormal');
  const out = surface.geometry.getAttribute('position'),
    n = surface.geometry.getAttribute('normal');
  // Many clipped ribbon vertices share the same 17x17 ground vertices.
  // Evaluate each source vertex once, then only interpolate its cached result.
  const evaluated = surface.evaluated,
    m = patch.morph;
  for (let id = 0; id < pos.count; id++) {
    const sw = weight.getX(id),
      at = id * 4;
    evaluated[at] = (pos.getY(id) * (1 - m) + coarse.getX(id) * m) * (1 - sw) + seam.getX(id) * sw;
    const ax = normal.getX(id) * (1 - m) + cn.getX(id) * m,
      ay = normal.getY(id) * (1 - m) + cn.getY(id) * m,
      az = normal.getZ(id) * (1 - m) + cn.getZ(id) * m;
    const len = Math.hypot(ax, ay, az) || 1;
    evaluated[at + 1] = (ax / len) * (1 - sw) + sn.getX(id) * sw;
    evaluated[at + 2] = (ay / len) * (1 - sw) + sn.getY(id) * sw;
    evaluated[at + 3] = (az / len) * (1 - sw) + sn.getZ(id) * sw;
  }
  for (let i = 0; i < surface.bindings.length; i++) {
    const binding = surface.bindings[i]!;
    let y = 0,
      nx = 0,
      ny = 0,
      nz = 0;
    for (let k = 0; k < 3; k++) {
      const at = binding.ids[k]! * 4,
        w = binding.weights[k]!;
      y += w * evaluated[at]!;
      nx += w * evaluated[at + 1]!;
      ny += w * evaluated[at + 2]!;
      nz += w * evaluated[at + 3]!;
    }
    // The seaward half and any shore ground below sea level float just above
    // the water plane; the ribbon is the visible coast where the DEM dips.
    out.setY(i, Math.max(y, RIBBON_LIFT));
    n.setXYZ(i, nx, ny, nz);
  }
  out.needsUpdate = true;
  n.needsUpdate = true;
  surface.geometry.computeBoundingSphere();
}
export interface ShoreVisible {
  seam: SeamPatch;
  shoreMaskUniform: { value: Texture | null };
  mesh: Mesh;
  fadeUniform: { value: number };
  outgoingUniform: { value: boolean };
}
interface Resource {
  mask: Texture;
  owner: ShoreVisible;
  surface: ShoreSurface;
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  morph: number;
  version: number;
}
export class ShoreLayer {
  private readonly resources = new Map<BufferGeometry, Resource>();
  private readonly blocked = new WeakMap<BufferGeometry, number>();
  private readonly empty = new WeakSet<BufferGeometry>();
  private readonly index: ShoreIndex;
  private readonly waterMask: ShoreWaterMask;
  readonly atlas: Texture;
  private resourceBytes = 0;
  get bytes(): number {
    return this.resourceBytes + this.index.bytes + (384 * 640 * 4 * 7) / 3;
  }
  triangles = 0;
  pending = 0;
  omitted = 0;
  constructor(
    private readonly scene: Scene,
    rings: readonly ShoreRing[],
    bodies: readonly WaterBody[],
    onError: (error: unknown) => void,
  ) {
    this.index = new ShoreIndex(rings);
    this.waterMask = new ShoreWaterMask(bodies);
    this.atlas = new TextureLoader().load(atlasUrl, undefined, undefined, onError);
    this.atlas.colorSpace = SRGBColorSpace;
    this.atlas.flipY = false;
  }
  update(patches: readonly ShoreVisible[], camera: { x: number; y: number; z: number }): void {
    const eligible = patches.filter(
      (p) =>
        Math.hypot(
          Math.max(
            p.seam.chunk.originX + p.seam.patch.x - camera.x,
            0,
            camera.x - p.seam.chunk.originX - p.seam.patch.x - p.seam.patch.span,
          ),
          Math.max(
            p.seam.chunk.originZ + p.seam.patch.z - camera.z,
            0,
            camera.z - p.seam.chunk.originZ - p.seam.patch.z - p.seam.patch.span,
          ),
          camera.y,
        ) < 18000,
    );
    const active = new Set(eligible.map((p) => p.seam.geometry));
    for (const [key, r] of this.resources)
      if (!active.has(key)) {
        this.scene.remove(r.mesh);
        r.owner.shoreMaskUniform.value = null;
        r.mask.dispose();
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.resourceBytes -= r.surface.bytes;
        this.resources.delete(key);
      }
    let built = 0;
    this.triangles = 0;
    this.pending = 0;
    this.omitted = 0;
    for (const p of eligible) {
      const key = p.seam.geometry;
      let r = this.resources.get(key);
      if (
        !r &&
        !this.empty.has(key) &&
        this.resourceBytes < (this.blocked.get(key) ?? Infinity) &&
        built < 1 &&
        this.resourceBytes < 32 * 1024 * 1024
      ) {
        built++;
        const surface = buildShoreSurface(this.index, p.seam);
        if (!surface) {
          this.empty.add(key);
          continue;
        }
        if (this.resourceBytes + surface.bytes + 512 * 512 * 2 > 32 * 1024 * 1024) {
          surface.geometry.dispose();
          this.blocked.set(key, this.resourceBytes);
          continue;
        }
        const material = new MeshStandardMaterial({
          roughness: 1,
          side: DoubleSide,
          transparent: true,
          depthWrite: false,
        });
        material.onBeforeCompile = (shader) => {
          shader.uniforms.shoreAtlas = { value: this.atlas };
          shader.uniforms.sourceFade = p.fadeUniform;
          shader.uniforms.sourceOutgoing = p.outgoingUniform;
          shader.vertexShader =
            'attribute vec2 shoreUv; attribute vec4 shoreWeights; attribute float shoreMarsh; varying vec2 vShoreUv; varying vec4 vShoreWeights; varying float vShoreMarsh; varying float vShoreDistance;\n' +
            shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvShoreUv=shoreUv;vShoreWeights=shoreWeights;vShoreMarsh=shoreMarsh;',
          );
          shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            '#include <project_vertex>\nvShoreDistance=length(mvPosition.xyz);',
          );
          shader.fragmentShader =
            'uniform sampler2D shoreAtlas; uniform float sourceFade; uniform bool sourceOutgoing; varying vec2 vShoreUv; varying vec4 vShoreWeights; varying float vShoreMarsh; varying float vShoreDistance;\n' +
            shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `vec4 shore=vec4(0.0);
            for(int i=0;i<5;i++) {
              float w=i==4?vShoreMarsh:vShoreWeights[i];
              shore+=texture2D(shoreAtlas,vec2(fract(vShoreUv.x),(float(i)*128.0+2.0+clamp(vShoreUv.y,0.0,1.0)*124.0)/640.0))*w;
            }
            diffuseColor.rgb*=shore.rgb;
            diffuseColor.a*=shore.a*(1.0-smoothstep(12000.0,18000.0,vShoreDistance));
            float noise=fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(0.06711056,0.00583715))));
            if(sourceOutgoing ? noise<sourceFade : noise>=sourceFade) discard;`,
          );
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <logdepthbuf_fragment>',
            '#include <logdepthbuf_fragment>\n#ifdef USE_LOGARITHMIC_DEPTH_BUFFER\ngl_FragDepth=max(0.0,gl_FragDepth-2.0/16777216.0);\n#endif',
          );
          patchCloudShadow(shader);
        };
        material.customProgramCacheKey = () => 'terrain-shore-ribbon-v3-seaward-alpha';
        const mesh = new Mesh(surface.geometry, material);
        mesh.receiveShadow = true;
        mesh.renderOrder = 1;
        this.scene.add(mesh);
        const mask = this.waterMask.bake(
          p.seam.chunk.originX + p.seam.patch.x,
          p.seam.chunk.originZ + p.seam.patch.z,
          p.seam.patch.span,
        );
        p.shoreMaskUniform.value = mask;
        surface.bytes += 512 * 512 * 2;
        r = { surface, mesh, mask, owner: p, morph: NaN, version: -1 };
        this.resources.set(key, r);
        this.resourceBytes += surface.bytes;
      }
      if (!r && !this.empty.has(key)) {
        if (this.blocked.has(key) || this.resourceBytes >= 32 * 1024 * 1024) this.omitted++;
        else this.pending++;
      }
      if (r) {
        r.mesh.position.copy(p.mesh.position);
        const version = (key.getAttribute('seamHeight') as Float32BufferAttribute).version;
        if (r.morph !== p.seam.morph || r.version !== version) {
          drapeShoreSurface(r.surface, p.seam);
          r.morph = p.seam.morph;
          r.version = version;
        }
        this.triangles += r.surface.bindings.length / 3;
      }
    }
  }
  dispose(): void {
    for (const r of this.resources.values()) {
      this.scene.remove(r.mesh);
      r.owner.shoreMaskUniform.value = null;
      r.mask.dispose();
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
    }
    this.resources.clear();
    this.atlas.dispose();
    this.resourceBytes = 0;
  }
}
