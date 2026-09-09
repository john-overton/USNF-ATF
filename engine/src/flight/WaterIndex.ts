import type { WaterBody } from '../data';

type Ring = WaterBody['polygon'];
/** Exact even/odd containment with bounded scanline buckets. No simplified collision coast. */
export class WaterRingIndex {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  private readonly bands: number[][];
  private readonly longEdges: number[] = [];
  private readonly step: number;
  constructor(private readonly ring: Ring) {
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const [x, z] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    this.minX = minX;
    this.maxX = maxX;
    this.minZ = minZ;
    this.maxZ = maxZ;
    const count = Math.max(1, Math.min(256, Math.ceil((maxZ - minZ) / 512)));
    this.step = Math.max(1, (maxZ - minZ) / count);
    this.bands = Array.from({ length: count }, () => []);
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]![1],
        b = ring[j]![1];
      if (a === b) continue; // Horizontal edges never cross the reference algorithm's ray.
      const first = this.band(Math.min(a, b)),
        last = this.band(Math.max(a, b));
      // At most eight index entries per edge, even for adversarial long segments.
      if (last - first >= 8) this.longEdges.push(i);
      else for (let band = first; band <= last; band++) this.bands[band]!.push(i);
    }
  }
  private band(z: number): number {
    return Math.max(0, Math.min(this.bands.length - 1, Math.floor((z - this.minZ) / this.step)));
  }
  candidateCount(z: number): number {
    return (this.bands[this.band(z)]?.length ?? 0) + this.longEdges.length;
  }
  crossings(z: number): number[] {
    if (z < this.minZ || z > this.maxZ) return [];
    const xs: number[] = [];
    for (const edges of [this.bands[this.band(z)]!, this.longEdges])
      for (const i of edges) {
        const [xi, zi] = this.ring[i]!,
          [xj, zj] = this.ring[(i + this.ring.length - 1) % this.ring.length]!;
        if (zi > z !== zj > z) xs.push(((xj - xi) * (z - zi)) / (zj - zi) + xi);
      }
    return xs.sort((a, b) => a - b);
  }
  contains(x: number, z: number): boolean {
    if (x < this.minX || x > this.maxX || z < this.minZ || z > this.maxZ) return false;
    let inside = false;
    for (const edges of [this.bands[this.band(z)]!, this.longEdges]) {
      for (const i of edges) {
        const [xi, zi] = this.ring[i]!,
          [xj, zj] = this.ring[(i + this.ring.length - 1) % this.ring.length]!;
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
    }
    return inside;
  }
}
export class WaterBodyIndex {
  readonly exterior: WaterRingIndex;
  private readonly holes: WaterRingIndex[];
  constructor(readonly body: WaterBody) {
    this.exterior = new WaterRingIndex(body.polygon);
    this.holes = (body.holes ?? []).map((ring) => new WaterRingIndex(ring));
  }
  contains(x: number, z: number): boolean {
    return this.exterior.contains(x, z) && !this.holes.some((hole) => hole.contains(x, z));
  }
}
