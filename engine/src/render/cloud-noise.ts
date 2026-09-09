/**
 * CPU-generated cloud noise for the ray-marched cumulus layer (Docs/environment-plan.md,
 * "Volumetric clouds"): a 512² tiling coverage field and a 64³ tiling Perlin-Worley
 * erosion volume. Kept free of Three.js and DOM so the sim side and `bun test` can use
 * the same code the renderer wraps in DataTexture/Data3DTexture.
 *
 * Build cost measured on this M3 in bun 1.4.2 (2026-09-09, box also running other work):
 * warm, median of five builds, coverage 512² ≈ 6 ms and volume 64³ ≈ 34 ms — ≈ 40 ms
 * combined. The very first build in a fresh process pays JIT warm-up: ≈ 38 ms + ≈ 130 ms,
 * ≈ 170 ms combined and noisy (150-200 ms across runs), which is why the generators are
 * written as whole-field passes with hoisted lattice tables rather than per-texel calls —
 * that alone took the volume from ~250 ms to ~34 ms. The test asserts only a 2 s bound so
 * a loaded machine cannot make it flake.
 */

export interface NoiseTexture2D {
  data: Uint8Array;
  size: number;
}
export interface NoiseTexture3D {
  data: Uint8Array;
  size: number;
}
export interface NoiseOptions {
  size?: number;
  seed?: number;
}

/**
 * xorshift-style integer hash: deterministic, seedable, and no Math.random anywhere.
 * Folded one coordinate at a time so the noise passes can hoist the z and y folds out of
 * the inner loop and mix only x per lattice corner.
 */
function mix(h: number, v: number): number {
  const m = Math.imul(h ^ (v + 0x9e3779b9), 0x85ebca6b);
  return m ^ (m >>> 13);
}
function hash(a: number, b: number, c: number, seed: number): number {
  return mix(mix(mix((seed | 0) ^ 0x27d4eb2f, c), b), a) >>> 0;
}
/** Unit float in [0,1) from a hash, used for lattice gradients and Worley feature points. */
function unit(h: number): number {
  return (h & 0xffffff) / 0x1000000;
}
/**
 * Fixed gradient tables. Deriving each lattice gradient from trigonometry cost more than
 * the rest of the generator put together, so hashes index these instead; the tables are
 * built from the same integer hash, so the output stays fully determined by the seed.
 */
const GRADIENT_COUNT = 256;
const GRAD2 = new Float32Array(GRADIENT_COUNT * 2);
const GRAD3 = new Float32Array(GRADIENT_COUNT * 3);
for (let i = 0; i < GRADIENT_COUNT; i++) {
  const h = hash(i, 0, 0, 0x5f3759df);
  const theta = ((h & 0xffffff) / 0x1000000) * Math.PI * 2;
  GRAD2[i * 2] = Math.cos(theta);
  GRAD2[i * 2 + 1] = Math.sin(theta);
  const cosPhi = ((Math.imul(h, 0x2545f491) >>> 8) / 0x1000000) * 2 - 1;
  const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
  GRAD3[i * 3] = Math.cos(theta) * sinPhi;
  GRAD3[i * 3 + 1] = Math.sin(theta) * sinPhi;
  GRAD3[i * 3 + 2] = cosPhi;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
/** Positive modulo: lattice wrap is what makes every field tile. */
function wrap(i: number, n: number): number {
  return ((i % n) + n) % n;
}

/**
 * Per-axis lattice slots for one octave. The fields are separable, so wrapped indices and
 * fade weights are shared by every row and column instead of recomputed per texel.
 */
function latticeAxis(
  size: number,
  period: number,
): { lo: Int32Array; hi: Int32Array; frac: Float32Array; weight: Float32Array } {
  const lo = new Int32Array(size),
    hi = new Int32Array(size),
    frac = new Float32Array(size),
    weight = new Float32Array(size);
  const scale = period / size;
  for (let k = 0; k < size; k++) {
    const f = k * scale,
      c = Math.floor(f);
    lo[k] = wrap(c, period);
    hi[k] = wrap(c + 1, period);
    frac[k] = f - c;
    weight[k] = fade(f - c);
  }
  return { lo, hi, frac, weight };
}

/** Adds one tiling 2D gradient (Perlin) octave, roughly in [-1,1] before scaling. */
function addPerlinOctave2(
  out: Float32Array,
  size: number,
  period: number,
  seed: number,
  amplitude: number,
): void {
  const { lo, hi, frac, weight } = latticeAxis(size, period);
  const base = mix((seed | 0) ^ 0x27d4eb2f, 0);
  const dot = (h: number, dx: number, dy: number): number => {
    const g = (h & (GRADIENT_COUNT - 1)) * 2;
    return GRAD2[g]! * dx + GRAD2[g + 1]! * dy;
  };
  for (let y = 0; y < size; y++) {
    const yf = frac[y]!,
      v = weight[y]!;
    const h0 = mix(base, lo[y]!),
      h1 = mix(base, hi[y]!);
    for (let x = 0; x < size; x++) {
      const x0 = lo[x]!,
        x1 = hi[x]!,
        xf = frac[x]!,
        u = weight[x]!;
      const i = y * size + x;
      out[i] =
        out[i]! +
        amplitude *
          lerp(
            lerp(dot(mix(h0, x0), xf, yf), dot(mix(h0, x1), xf - 1, yf), u),
            lerp(dot(mix(h1, x0), xf, yf - 1), dot(mix(h1, x1), xf - 1, yf - 1), u),
            v,
          );
    }
  }
}

/**
 * Adds one tiling 3D gradient (Perlin) octave over the whole volume. Like the Worley pass,
 * this is written as a pass so the wrapped lattice indices and fade weights are computed
 * once per axis slot rather than once per voxel.
 */
function addPerlinOctave3(
  out: Float32Array,
  size: number,
  period: number,
  seed: number,
  amplitude: number,
): void {
  const { lo, hi, frac, weight } = latticeAxis(size, period);
  const base = (seed | 0) ^ 0x27d4eb2f;
  const dot = (h: number, dx: number, dy: number, dz: number): number => {
    const g = (h & (GRADIENT_COUNT - 1)) * 3;
    return GRAD3[g]! * dx + GRAD3[g + 1]! * dy + GRAD3[g + 2]! * dz;
  };
  for (let z = 0; z < size; z++) {
    const zf = frac[z]!,
      w = weight[z]!;
    const hz0 = mix(base, lo[z]!),
      hz1 = mix(base, hi[z]!);
    for (let y = 0; y < size; y++) {
      const yf = frac[y]!,
        v = weight[y]!;
      const y0 = lo[y]!,
        y1 = hi[y]!;
      const h00 = mix(hz0, y0),
        h10 = mix(hz0, y1),
        h01 = mix(hz1, y0),
        h11 = mix(hz1, y1);
      for (let x = 0; x < size; x++) {
        const x0 = lo[x]!,
          x1 = hi[x]!,
          xf = frac[x]!,
          u = weight[x]!;
        const value = lerp(
          lerp(
            lerp(dot(mix(h00, x0), xf, yf, zf), dot(mix(h00, x1), xf - 1, yf, zf), u),
            lerp(dot(mix(h10, x0), xf, yf - 1, zf), dot(mix(h10, x1), xf - 1, yf - 1, zf), u),
            v,
          ),
          lerp(
            lerp(dot(mix(h01, x0), xf, yf, zf - 1), dot(mix(h01, x1), xf - 1, yf, zf - 1), u),
            lerp(
              dot(mix(h11, x0), xf, yf - 1, zf - 1),
              dot(mix(h11, x1), xf - 1, yf - 1, zf - 1),
              u,
            ),
            v,
          ),
          w,
        );
        const i = z * size * size + y * size + x;
        out[i] = out[i]! + amplitude * value;
      }
    }
  }
}

/**
 * Feature points for tiling Worley noise: one jittered point per cell, precomputed so the
 * 27-neighbour search is array lookups rather than ~21 M hashes per volume.
 */
function worleyPoints(cells: number, seed: number): Float32Array {
  const points = new Float32Array(cells * cells * cells * 3);
  for (let z = 0; z < cells; z++)
    for (let y = 0; y < cells; y++)
      for (let x = 0; x < cells; x++) {
        const h = hash(x, y, z, seed);
        const i = (z * cells * cells + y * cells + x) * 3;
        points[i] = x + unit(h);
        points[i + 1] = y + unit(Math.imul(h ^ 0x68bc21eb, 0x2545f491) >>> 0);
        points[i + 2] = z + unit(Math.imul(h ^ 0x1b56c4e9, 0x27d4eb2f) >>> 0);
      }
  return points;
}

/**
 * Adds one inverted tiling Worley octave over the whole volume. Written as a pass rather
 * than a per-voxel call so the 27-cell neighbourhood is gathered once per cell instead of
 * once per voxel — that is the difference between a ~240 ms and a ~40 ms volume build.
 */
function addWorleyOctave(
  out: Float32Array,
  size: number,
  cells: number,
  points: Float32Array,
  amplitude: number,
): void {
  const nx = new Float32Array(27),
    ny = new Float32Array(27),
    nz = new Float32Array(27);
  const scale = cells / size;
  // Voxel range covered by cell c on one axis; iterating cell blocks keeps the gather out
  // of the voxel loop entirely.
  const begin = (c: number): number => Math.ceil((c * size) / cells);
  for (let cz = 0; cz < cells; cz++)
    for (let cy = 0; cy < cells; cy++)
      for (let cx = 0; cx < cells; cx++) {
        let k = 0;
        for (let dz = -1; dz <= 1; dz++)
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++, k++) {
              const wx = wrap(cx + dx, cells),
                wy = wrap(cy + dy, cells),
                wz = wrap(cz + dz, cells);
              const i = (wz * cells * cells + wy * cells + wx) * 3;
              // Shift the wrapped point back into this cell's unwrapped neighbourhood so
              // the field stays continuous across the tile seam.
              nx[k] = points[i]! + (cx + dx - wx);
              ny[k] = points[i + 1]! + (cy + dy - wy);
              nz[k] = points[i + 2]! + (cz + dz - wz);
            }
        for (let z = begin(cz); z < begin(cz + 1); z++) {
          const fz = z * scale;
          for (let y = begin(cy); y < begin(cy + 1); y++) {
            const fy = y * scale;
            for (let x = begin(cx); x < begin(cx + 1); x++) {
              const fx = x * scale;
              let best = Infinity;
              for (let n = 0; n < 27; n++) {
                const ax = nx[n]! - fx,
                  ay = ny[n]! - fy,
                  az = nz[n]! - fz;
                const d = ax * ax + ay * ay + az * az;
                if (d < best) best = d;
              }
              const o = z * size * size + y * size + x;
              out[o] = out[o]! + amplitude * (1 - Math.min(1, Math.sqrt(best)));
            }
          }
        }
      }
}

/**
 * Histogram equalisation to bytes. FBM output is near-Gaussian and would otherwise pile up
 * mid-range; equalising makes the stored value its own quantile, so "cloud where
 * sample/255 > 1 - c" covers a fraction ≈ c of the sky for any coverage parameter c, which
 * is exactly what the march wants from a coverage control.
 */
function equalise(values: Float32Array): Uint8Array {
  const bins = 4096;
  let min = Infinity,
    max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  const counts = new Float64Array(bins);
  const binOf = new Uint16Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const b = Math.min(bins - 1, Math.floor(((values[i]! - min) / span) * bins));
    binOf[i] = b;
    counts[b]! += 1;
  }
  // cdf[b] is the fraction of samples strictly below bin b; adding the within-bin share
  // keeps the mapping monotone and avoids banding at bin edges.
  const cdf = new Float64Array(bins + 1);
  for (let b = 0; b < bins; b++) cdf[b + 1] = cdf[b]! + counts[b]!;
  const total = values.length;
  const out = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const b = binOf[i]!;
    const lo = ((values[i]! - min) / span) * bins - b;
    const q = (cdf[b]! + counts[b]! * lo) / total;
    out[i] = Math.max(0, Math.min(255, Math.round(q * 255)));
  }
  return out;
}

/** Tiling 2D cloud coverage field, single channel, default 512x512. */
export function buildCoverageTexture(options?: NoiseOptions): NoiseTexture2D {
  const size = options?.size ?? 512;
  const seed = options?.seed ?? 1337;
  const raw = new Float32Array(size * size);
  // Five octaves from a period-4 base: the largest features are cloud-street sized and the
  // finest are still several texels wide, so the byte field stays smooth for the GPU fetch.
  let amplitude = 1,
    period = 4;
  for (let o = 0; o < 5; o++) {
    addPerlinOctave2(raw, size, period, seed + o * 7919, amplitude);
    amplitude *= 0.5;
    period *= 2;
  }
  return { data: equalise(raw), size };
}

/** Tiling 64^3 Perlin-Worley erosion volume, single channel (R8). */
export function buildCloudVolume(options?: NoiseOptions): NoiseTexture3D {
  const size = options?.size ?? 64;
  const seed = options?.seed ?? 1337;
  // Inverted Worley FBM: billowy blobs at the low frequency, wispy detail above.
  const frequencies = [4, 8, 16];
  const worley = new Float32Array(size * size * size);
  let wAmp = 1,
    wNorm = 0;
  for (let f = 0; f < frequencies.length; f++) {
    const cells = frequencies[f]!;
    addWorleyOctave(worley, size, cells, worleyPoints(cells, seed + 104729 + f * 6151), wAmp);
    wNorm += wAmp;
    wAmp *= 0.5;
  }
  const raw = new Float32Array(size * size * size);
  let amplitude = 1,
    norm = 0,
    period = 4;
  for (let o = 0; o < 3; o++) {
    addPerlinOctave3(raw, size, period, seed + o * 7919, amplitude);
    norm += amplitude;
    amplitude *= 0.5;
    period *= 2;
  }
  for (let i = 0; i < raw.length; i++) {
    const perlin = raw[i]! / norm / 2 + 0.5;
    // Nubis remap: the Worley FBM sets the low end the Perlin range is stretched from,
    // which carves the billow shapes out of an otherwise featureless FBM.
    const lo = 1 - worley[i]! / wNorm;
    raw[i] = (perlin - lo) / Math.max(1e-4, 1 - lo);
  }
  return { data: equalise(raw), size };
}

/**
 * CPU evaluation of the same coverage field the GPU will sample, so sim-side queries
 * (fly-through fog, later AI/radar rules) agree with the picture. x/z are world metres;
 * worldScale is the metres-per-tile of the coverage texture. Bilinear with repeat wrap and
 * half-texel centres, matching GL `texture2D` on the same data. Returns [0,1].
 */
export function sampleCoverage(
  coverage: NoiseTexture2D,
  x: number,
  z: number,
  worldScale: number,
): number {
  const { data, size } = coverage;
  const fu = (x / worldScale) * size - 0.5;
  const fv = (z / worldScale) * size - 0.5;
  const iu = Math.floor(fu),
    iv = Math.floor(fv);
  const tu = fu - iu,
    tv = fv - iv;
  const u0 = wrap(iu, size),
    u1 = wrap(iu + 1, size);
  const v0 = wrap(iv, size) * size,
    v1 = wrap(iv + 1, size) * size;
  return (
    lerp(lerp(data[v0 + u0]!, data[v0 + u1]!, tu), lerp(data[v1 + u0]!, data[v1 + u1]!, tu), tv) /
    255
  );
}
