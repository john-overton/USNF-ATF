import { BufferAttribute, DynamicDrawUsage, type BufferGeometry } from 'three';
import type { TerrainChunk } from '../data';
import { PATCH_CELLS, type Patch } from './lod';

export interface SeamPatch {
  geometry: BufferGeometry;
  chunk: TerrainChunk;
  patch: Patch;
  morph: number;
}
interface Reference {
  patch: SeamPatch;
  index: number;
  step: number;
}
interface Node {
  x: number;
  z: number;
  refs: Reference[];
  parents?: [Node, Node, number];
  value: number[];
  frame: number;
  initial?: number[];
}
interface Edge {
  start: number;
  end: number;
  step: number;
  nodes: Node[];
}
const row = PATCH_CELLS + 1;
const key = (x: number, z: number): string => `${x.toFixed(6)},${z.toFixed(6)}`;
const axisKey = (n: number): string => n.toFixed(6);

/** Shared boundary graph, rebuilt only when the selected hierarchy changes.
 * Fine edges follow the actual coarse polyline, including its corrected corners.
 * Equal-resolution edges average height AND lighting from their source chunks.
 */
export class TerrainSeams {
  private nodes = new Map<string, Node>();
  private vertical = new Map<string, Edge[]>();
  private horizontal = new Map<string, Edge[]>();
  private frame = 0;
  private age = 0;
  private lastMorphs: number[] = [];
  readonly uploadBytes: number;
  private writes: { patch: SeamPatch; index: number; node: Node }[] = [];
  private copies: { patch: SeamPatch; top: number; bottom: number; drop: number }[] = [];
  constructor(
    readonly patches: SeamPatch[],
    previous?: TerrainSeams,
  ) {
    this.uploadBytes = patches.reduce(
      (sum, p) => sum + p.geometry.getAttribute('position').count * 16,
      0,
    );
    const vertical = this.vertical,
      horizontal = this.horizontal;
    for (const p of patches) {
      const position = p.geometry.getAttribute('position');
      const count = position.count;
      if (!p.geometry.hasAttribute('seamHeight')) {
        p.geometry.setAttribute(
          'seamHeight',
          new BufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage),
        );
        p.geometry.setAttribute(
          'seamNormal',
          new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage),
        );
        p.geometry.setAttribute('seamWeight', new BufferAttribute(new Float32Array(count), 1));
      }
      const weight = p.geometry.getAttribute('seamWeight');
      const step = p.patch.span / PATCH_CELLS;
      const nodeAt = (index: number): Node => {
        const x = p.chunk.originX + p.patch.x + position.getX(index);
        const z = p.chunk.originZ + p.patch.z + position.getZ(index);
        const id = key(x, z);
        let node = this.nodes.get(id);
        if (!node) {
          node = { x, z, refs: [], value: [0, 0, 0, 0], frame: -1 };
          const old = previous?.boundaryValue(x, z);
          if (old) node.initial = old;
          this.nodes.set(id, node);
        }
        if (!node.refs.some((r) => r.patch === p && r.index === index))
          node.refs.push({ patch: p, index, step });
        this.writes.push({ patch: p, index, node });
        weight.setX(index, 1);
        return node;
      };
      for (let side = 0; side < 4; side++) {
        const isVertical = side < 2;
        const indices = Array.from({ length: row }, (_, i) =>
          isVertical ? i * row + side * PATCH_CELLS : (side - 2) * PATCH_CELLS * row + i,
        );
        const nodes = indices.map(nodeAt);
        const coordinate = isVertical ? nodes[0]!.x : nodes[0]!.z;
        const start = isVertical ? nodes[0]!.z : nodes[0]!.x;
        const end = isVertical ? nodes[PATCH_CELLS]!.z : nodes[PATCH_CELLS]!.x;
        if (end <= start) continue;
        const map = isVertical ? vertical : horizontal;
        const id = axisKey(coordinate),
          list = map.get(id) ?? [];
        list.push({ start, end, step, nodes });
        map.set(id, list);
      }
      const tops: number[] = [];
      for (let i = 0; i < PATCH_CELLS; i++) tops.push(i);
      for (let j = 0; j < PATCH_CELLS; j++) tops.push(j * row + PATCH_CELLS);
      for (let i = PATCH_CELLS; i > 0; i--) tops.push(PATCH_CELLS * row + i);
      for (let j = PATCH_CELLS; j > 0; j--) tops.push(j * row);
      tops.forEach((top, i) => {
        const bottom = row * row + i;
        weight.setX(bottom, 1);
        this.copies.push({
          patch: p,
          top,
          bottom,
          drop: position.getY(top) - position.getY(bottom),
        });
      });
      weight.needsUpdate = true;
    }
    for (const node of this.nodes.values()) {
      let best: Edge | undefined,
        along = 0;
      for (const [edges, coordinate] of [
        [vertical.get(axisKey(node.x)), node.z],
        [horizontal.get(axisKey(node.z)), node.x],
      ] as const) {
        for (const edge of edges ?? []) {
          if (
            coordinate >= edge.start - 1e-6 &&
            coordinate <= edge.end + 1e-6 &&
            (!best || edge.step > best.step)
          ) {
            best = edge;
            along = coordinate;
          }
        }
      }
      if (!best) continue;
      // A genuine coarse vertex owns its value; all touching finer vertices use it.
      const refs = node.refs.filter((r) => Math.abs(r.step - best.step) < 1e-6);
      if (refs.length) {
        node.refs = refs;
        continue;
      }
      const i = Math.min(
        PATCH_CELLS - 1,
        Math.max(0, Math.floor((along - best.start) / best.step)),
      );
      const a = best.nodes[i]!,
        b = best.nodes[i + 1]!;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length > 0 && a !== node && b !== node)
        node.parents = [a, b, Math.hypot(node.x - a.x, node.z - a.z) / length];
    }
  }
  private boundaryValue(x: number, z: number): number[] | undefined {
    const existing = this.nodes.get(key(x, z));
    if (existing) return [...existing.value];
    for (const [edges, coordinate] of [
      [this.vertical.get(axisKey(x)), z],
      [this.horizontal.get(axisKey(z)), x],
    ] as const)
      for (const edge of edges ?? []) {
        if (coordinate < edge.start || coordinate > edge.end) continue;
        const i = Math.min(PATCH_CELLS - 1, Math.floor((coordinate - edge.start) / edge.step));
        const a = edge.nodes[i]!,
          b = edge.nodes[i + 1]!;
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (!length) continue;
        const t = Math.hypot(x - a.x, z - a.z) / length;
        return a.value.map((v, axis) => v * (1 - t) + b.value[axis]! * t);
      }
    return undefined;
  }
  update(seconds = 1): number {
    const settled = this.age >= 0.25;
    this.age = Math.min(0.25, this.age + seconds);
    if (settled && this.patches.every((p, i) => p.morph === this.lastMorphs[i])) return 0;
    this.lastMorphs = this.patches.map((p) => p.morph);
    this.frame++;
    const t = Math.min(1, this.age / 0.25),
      blend = t * t * (3 - 2 * t);
    const value = (node: Node): number[] => {
      if (node.frame === this.frame) return node.value;
      node.frame = this.frame;
      const out = node.value;
      if (node.parents) {
        const [a, b, t] = node.parents,
          av = value(a),
          bv = value(b);
        for (let axis = 0; axis < 4; axis++) out[axis] = av[axis]! * (1 - t) + bv[axis]! * t;
      } else {
        out.fill(0);
        for (const r of node.refs) {
          const g = r.patch.geometry,
            t = r.patch.morph;
          out[0]! +=
            g.getAttribute('position').getY(r.index) * (1 - t) +
            g.getAttribute('coarseHeight').getX(r.index) * t;
          for (let axis = 0; axis < 3; axis++)
            out[axis + 1]! +=
              g.getAttribute('normal').getComponent(r.index, axis) * (1 - t) +
              g.getAttribute('coarseNormal').getComponent(r.index, axis) * t;
        }
        for (let axis = 0; axis < 4; axis++) out[axis]! /= node.refs.length;
        const length = Math.hypot(out[1]!, out[2]!, out[3]!);
        for (let axis = 1; axis < 4; axis++) out[axis]! /= length;
      }
      if (!node.parents && node.initial && blend < 1)
        for (let axis = 0; axis < 4; axis++)
          out[axis] = node.initial[axis]! * (1 - blend) + out[axis]! * blend;
      return out;
    };
    for (const { patch, index, node } of this.writes) {
      const v = value(node);
      patch.geometry.getAttribute('seamHeight').setX(index, v[0]!);
      patch.geometry.getAttribute('seamNormal').setXYZ(index, v[1]!, v[2]!, v[3]!);
    }
    for (const p of this.patches) {
      p.geometry.getAttribute('seamHeight').needsUpdate = true;
      p.geometry.getAttribute('seamNormal').needsUpdate = true;
    }
    for (const { patch, top, bottom, drop } of this.copies) {
      const h = patch.geometry.getAttribute('seamHeight'),
        n = patch.geometry.getAttribute('seamNormal');
      h.setX(bottom, h.getX(top) - drop);
      n.setXYZ(bottom, n.getX(top), n.getY(top), n.getZ(top));
    }
    return this.uploadBytes;
  }
}
