import { describe, expect, test } from 'bun:test';

import {
  buildCloudVolume,
  buildCoverageTexture,
  sampleCoverage,
  type NoiseTexture2D,
} from './cloud-noise';

// Built once: these are the startup textures, and rebuilding per test would dominate the run.
const coverage = buildCoverageTexture({ seed: 1337 });
const volume = buildCloudVolume({ seed: 1337 });

function mean(data: Uint8Array): number {
  let sum = 0;
  for (const v of data) sum += v;
  return sum / data.length;
}
function fractionAbove(data: Uint8Array, threshold: number): number {
  let n = 0;
  for (const v of data) if (v / 255 > threshold) n++;
  return n / data.length;
}

describe('buildCoverageTexture', () => {
  test('is deterministic per seed and differs between seeds', () => {
    const same = buildCoverageTexture({ seed: 1337 });
    expect(same.size).toBe(512);
    expect(Buffer.from(same.data).equals(Buffer.from(coverage.data))).toBe(true);
    const other = buildCoverageTexture({ seed: 4242, size: 128 });
    const baseline = buildCoverageTexture({ seed: 1337, size: 128 });
    expect(Buffer.from(other.data).equals(Buffer.from(baseline.data))).toBe(false);
  });

  test('tiles seamlessly in x and y', () => {
    const { data, size } = coverage;
    // The invariant that matters for a repeated texture: the step across the seam is no
    // bigger than the steps inside the tile, so the wrap is invisible.
    let interior = 0;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size - 1; x++)
        interior = Math.max(interior, Math.abs(data[y * size + x]! - data[y * size + x + 1]!));
    let dx = 0,
      dy = 0;
    for (let i = 0; i < size; i++) {
      dx = Math.max(dx, Math.abs(data[i * size]! - data[i * size + size - 1]!));
      dy = Math.max(dy, Math.abs(data[i]! - data[(size - 1) * size + i]!));
    }
    expect(dx).toBeLessThanOrEqual(interior);
    expect(dy).toBeLessThanOrEqual(interior);
    expect(interior).toBeLessThan(40); // and the field itself is smooth, not white noise
  });

  test('histogram is spread, not clustered at the ends', () => {
    expect(mean(coverage.data)).toBeGreaterThan(110);
    expect(mean(coverage.data)).toBeLessThan(145);
    expect(fractionAbove(coverage.data, 0.9)).toBeGreaterThan(0.05);
    expect(fractionAbove(coverage.data, 0.1)).toBeGreaterThan(0.85);
  });

  test('thresholding at c covers roughly a fraction c of the sky', () => {
    for (const c of [0.25, 0.5, 0.75])
      expect(Math.abs(fractionAbove(coverage.data, 1 - c) - c)).toBeLessThan(0.02);
  });
});

describe('buildCloudVolume', () => {
  test('is deterministic per seed and differs between seeds', () => {
    const same = buildCloudVolume({ seed: 1337 });
    expect(same.size).toBe(64);
    expect(same.data.length).toBe(64 * 64 * 64);
    expect(Buffer.from(same.data).equals(Buffer.from(volume.data))).toBe(true);
    const other = buildCloudVolume({ seed: 99 });
    expect(Buffer.from(other.data).equals(Buffer.from(volume.data))).toBe(false);
  });

  test('tiles seamlessly on all three axes', () => {
    const { data, size } = volume;
    const at = (x: number, y: number, z: number): number => data[z * size * size + y * size + x]!;
    let interior = 0;
    for (let z = 0; z < size; z++)
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size - 1; x++)
          interior = Math.max(interior, Math.abs(at(x, y, z) - at(x + 1, y, z)));
    let dx = 0,
      dy = 0,
      dz = 0;
    for (let b = 0; b < size; b++)
      for (let a = 0; a < size; a++) {
        dx = Math.max(dx, Math.abs(at(0, a, b) - at(size - 1, a, b)));
        dy = Math.max(dy, Math.abs(at(a, 0, b) - at(a, size - 1, b)));
        dz = Math.max(dz, Math.abs(at(a, b, 0) - at(a, b, size - 1)));
      }
    // As for the coverage field: the seam step must not exceed the interior step.
    expect(dx).toBeLessThanOrEqual(interior);
    expect(dy).toBeLessThanOrEqual(interior);
    expect(dz).toBeLessThanOrEqual(interior);
  });

  test('histogram is spread with both tails populated', () => {
    expect(mean(volume.data)).toBeGreaterThan(110);
    expect(mean(volume.data)).toBeLessThan(145);
    expect(fractionAbove(volume.data, 0.9)).toBeGreaterThan(0.05);
    expect(fractionAbove(volume.data, 0.1)).toBeGreaterThan(0.85);
  });
});

describe('sampleCoverage', () => {
  const worldScale = 20000;
  const texelCentre = (i: number): number => ((i + 0.5) / coverage.size) * worldScale;

  test('returns the stored texel at exact texel centres', () => {
    for (const [i, j] of [
      [0, 0],
      [3, 17],
      [511, 511],
      [255, 128],
    ] as [number, number][]) {
      const expected = coverage.data[j * coverage.size + i]! / 255;
      expect(sampleCoverage(coverage, texelCentre(i), texelCentre(j), worldScale)).toBeCloseTo(
        expected,
        6,
      );
    }
  });

  test('interpolates between neighbouring texels', () => {
    const a = coverage.data[0]! / 255;
    const b = coverage.data[1]! / 255;
    const midpoint = sampleCoverage(
      coverage,
      (texelCentre(0) + texelCentre(1)) / 2,
      texelCentre(0),
      worldScale,
    );
    expect(midpoint).toBeCloseTo((a + b) / 2, 6);
  });

  test('wraps for negative and large world coordinates', () => {
    const x = texelCentre(7),
      z = texelCentre(19);
    const base = sampleCoverage(coverage, x, z, worldScale);
    expect(sampleCoverage(coverage, x - worldScale * 3, z, worldScale)).toBeCloseTo(base, 6);
    expect(sampleCoverage(coverage, x, z + worldScale * 12, worldScale)).toBeCloseTo(base, 6);
    expect(sampleCoverage(coverage, x - worldScale, z - worldScale * 5, worldScale)).toBeCloseTo(
      base,
      6,
    );
  });

  test('agrees with a reference repeat-wrapped bilinear fetch', () => {
    const reference = (tex: NoiseTexture2D, u: number, v: number): number => {
      const n = tex.size;
      const fu = u * n - 0.5,
        fv = v * n - 0.5;
      const i0 = Math.floor(fu),
        j0 = Math.floor(fv);
      const tu = fu - i0,
        tv = fv - j0;
      const w = (i: number): number => ((i % n) + n) % n;
      const p = (i: number, j: number): number => tex.data[w(j) * n + w(i)]! / 255;
      return (
        p(i0, j0) * (1 - tu) * (1 - tv) +
        p(i0 + 1, j0) * tu * (1 - tv) +
        p(i0, j0 + 1) * (1 - tu) * tv +
        p(i0 + 1, j0 + 1) * tu * tv
      );
    };
    for (let k = 0; k < 50; k++) {
      const u = (k * 0.137) % 1;
      const v = ((k * 0.311) % 1) - 0.5;
      expect(sampleCoverage(coverage, u * worldScale, v * worldScale, worldScale)).toBeCloseTo(
        reference(coverage, u, v),
        6,
      );
    }
  });
});

// Measured on this M3 in bun 1.4.2: warm builds are ≈ 6 ms (coverage 512²) and ≈ 34 ms
// (volume 64³); a first build in a fresh process pays JIT warm-up and lands near 170 ms.
// The bound below is an order of magnitude above that so a loaded machine cannot flake it.
test('startup textures build well inside the frame budget', () => {
  const start = performance.now();
  buildCoverageTexture({ seed: 7 });
  buildCloudVolume({ seed: 7 });
  expect(performance.now() - start).toBeLessThan(2000);
});
