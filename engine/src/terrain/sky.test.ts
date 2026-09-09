import { expect, test } from 'bun:test';
import { buildSkyTable, sampleSky, skyElevationForRow } from '../render/sky-model';

/**
 * The sky shader looks the table up itself, so the uv math in sky.ts's FRAGMENT
 * is duplicated here and checked against `sampleSky`. A silent disagreement
 * would show as a sky that does not match the fog or the lights.
 */
function shaderLookup(
  table: ReturnType<typeof buildSkyTable>,
  direction: { x: number; y: number; z: number },
): [number, number, number] {
  const dir = (() => {
    const n = Math.hypot(direction.x, direction.y, direction.z);
    return { x: direction.x / n, y: direction.y / n, z: direction.z / n };
  })();
  const elevation = Math.asin(Math.max(-1, Math.min(1, dir.y)));
  const azimuth = Math.atan2(-dir.x, dir.z);
  const fract = (n: number) => n - Math.floor(n);
  const relative = fract((azimuth - table.sunAzimuthRad) / (2 * Math.PI));
  const u = (relative * table.width + 0.5) / table.width;
  const pivot = Math.floor((table.height - 1) * 0.5 + 0.5);
  // The shader clamps below-horizon views to the horizon row; see sky.ts.
  const warp = Math.sqrt(Math.min(1, Math.max(0, elevation) / (Math.PI / 2)));
  const rowIndex = pivot + warp * Math.max(1, table.height - 1 - pivot);
  const v = (rowIndex + 0.5) / table.height;
  // Nearest-texel fetch of the same texture the GPU samples with REPEAT/CLAMP.
  const col = Math.min(table.width - 1, Math.max(0, Math.round(u * table.width - 0.5)));
  const row = Math.min(table.height - 1, Math.max(0, Math.round(v * table.height - 0.5)));
  const base = (row * table.width + col) * 3;
  return [table.data[base]!, table.data[base + 1]!, table.data[base + 2]!];
}

test('the sky shader uv mapping lands on the exact table texel sampleSky uses', () => {
  const table = buildSkyTable((40 * Math.PI) / 180, Math.PI);
  // Replace the radiance with its own (row, column) so a lookup is checkable exactly.
  for (let row = 0; row < table.height; row++)
    for (let col = 0; col < table.width; col++) {
      const base = (row * table.width + col) * 3;
      table.data[base] = row;
      table.data[base + 1] = col;
      table.data[base + 2] = 0;
    }
  // Only the above-horizon rows: the shader never looks the ground rays up.
  const pivotRow = Math.floor((table.height - 1) * 0.5 + 0.5);
  for (let row = pivotRow; row < table.height; row++)
    for (const col of [0, 1, 17, table.width - 1]) {
      const elevation = skyElevationForRow(table.height, row);
      const azimuth = table.sunAzimuthRad + (col * 2 * Math.PI) / table.width;
      const c = Math.cos(elevation);
      const direction = {
        x: -c * Math.sin(azimuth),
        y: Math.sin(elevation),
        z: c * Math.cos(azimuth),
      };
      // At the poles the direction carries no azimuth, and the real table is
      // azimuth-independent there, so only the elevation row is meaningful.
      const pole = row === 0 || row === table.height - 1;
      const found = shaderLookup(table, direction);
      expect(found[0]).toBe(row);
      if (!pole) expect(found[1]).toBe(col);
      // Bilinear at a texel centre is that texel, so the CPU path must agree exactly.
      const cpu = sampleSky(table, elevation, azimuth - table.sunAzimuthRad);
      expect(cpu[0]).toBeCloseTo(row, 6);
      if (!pole) expect(cpu[1]).toBeCloseTo(col, 6);
    }
});

test('the shader azimuth convention puts north at +Z and east at -X', () => {
  // The sun is due south (azimuth 180) in this table, so the brightest horizon
  // direction must be -Z, matching the world axes the environment module uses.
  const table = buildSkyTable((15 * Math.PI) / 180, Math.PI);
  const south = shaderLookup(table, { x: 0, y: 0.02, z: -1 });
  const north = shaderLookup(table, { x: 0, y: 0.02, z: 1 });
  // A view below the horizon clamps to the horizon row rather than a ground ray.
  expect(shaderLookup(table, { x: 0, y: -0.05, z: -1 })).toEqual(
    shaderLookup(table, { x: 0, y: 0, z: -1 }),
  );
  const sum = (c: [number, number, number]) => c[0] + c[1] + c[2];
  expect(sum(south)).toBeGreaterThan(sum(north));
});
