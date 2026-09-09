import { DataTexture, RedFormat, UnsignedByteType, NearestFilter } from 'three';
import type { WaterBody } from '../data';
import { WaterRingIndex } from '../flight/WaterIndex';

/** Local visual coverage; never used for flight contact or water classification. */
export class ShoreWaterMask {
  private readonly bodies: {
    outer: WaterRingIndex;
    holes: WaterRingIndex[];
    rings: readonly WaterBody['polygon'][];
  }[];
  constructor(bodies: readonly WaterBody[]) {
    this.bodies = bodies
      .filter((b) => b.elevation === 0)
      .map((b) => ({
        rings: [b.polygon, ...(b.holes ?? [])],
        outer: new WaterRingIndex(b.polygon),
        holes: (b.holes ?? []).map((h) => new WaterRingIndex(h)),
      }));
  }
  bake(x: number, z: number, span: number): DataTexture {
    const size = 512,
      bytes = new Uint8Array(size * size);
    const bodies = this.bodies.filter(
      (b) =>
        b.outer.minX < x + span && b.outer.maxX > x && b.outer.minZ < z + span && b.outer.maxZ > z,
    );
    for (let row = 0; row < size; row++) {
      const north = z + ((row + 0.5) * span) / size;
      for (const body of bodies) {
        const crossings = body.outer.crossings(north);
        const holes = body.holes.flatMap((h) => {
          const xs = h.crossings(north);
          return Array.from(
            { length: Math.floor(xs.length / 2) },
            (_, i) => [xs[i * 2]!, xs[i * 2 + 1]!] as const,
          );
        });
        for (let k = 0; k + 1 < crossings.length; k += 2) {
          const lo = Math.max(0, Math.ceil(((crossings[k]! - x) * size) / span - 0.5));
          const hi = Math.min(size, Math.ceil(((crossings[k + 1]! - x) * size) / span - 0.5));
          for (let col = lo; col < hi; col++) {
            const east = x + ((col + 0.5) * span) / size;
            if (!holes.some((h) => east >= h[0] && east < h[1])) bytes[row * size + col] = 255;
          }
        }
      }
    }
    // Discard only wholly wet cells. Clear a conservative supercover of every
    // boundary, including sub-texel dry islands missed by center samples.
    const mark = (px: number, pz: number): void => {
      const ix = Math.floor(((px - x) * size) / span),
        iz = Math.floor(((pz - z) * size) / span);
      for (let j = Math.max(0, iz - 1); j <= Math.min(size - 1, iz + 1); j++)
        for (let i = Math.max(0, ix - 1); i <= Math.min(size - 1, ix + 1); i++)
          bytes[j * size + i] = 0;
    };
    for (const body of bodies)
      for (const ring of body.rings)
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]!,
            b = ring[(i + 1) % ring.length]!,
            dx = b[0] - a[0],
            dz = b[1] - a[1];
          let lo = 0,
            hi = 1;
          const margin = span / size;
          for (const [p, q] of [
            [-dx, a[0] - x + margin],
            [dx, x + span + margin - a[0]],
            [-dz, a[1] - z + margin],
            [dz, z + span + margin - a[1]],
          ]) {
            if (p === 0) {
              if (q! < 0) {
                hi = -1;
                break;
              }
            } else if (p! < 0) lo = Math.max(lo, q! / p!);
            else hi = Math.min(hi, q! / p!);
          }
          if (lo > hi) continue;
          const steps = Math.max(
            1,
            Math.ceil(((Math.max(Math.abs(dx), Math.abs(dz)) * (hi - lo) * size) / span) * 2),
          );
          for (let k = 0; k <= steps; k++) {
            const t = lo + ((hi - lo) * k) / steps;
            mark(a[0] + dx * t, a[1] + dz * t);
          }
        }
    const texture = new DataTexture(bytes, size, size, RedFormat, UnsignedByteType);
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }
}
