import { expect, test } from 'bun:test';
import {
  buildSkyTable,
  sampleSky,
  skyElevationForRow,
  skyHighlightRolloff,
  SKY_HIGHLIGHT_KNEE,
} from '../render/sky-model';
import {
  SKY_FRAGMENT,
  solarKeyIntensity,
  SKY_DISC_SCALE,
  SUN_DISC_RADIUS,
  MOON_DISC_RADIUS,
  MOON_HALO_WIDTH,
} from './sky';

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

test('the sky shader rolls highlights off instead of clipping them to flat white', () => {
  expect(SKY_FRAGMENT).toContain('vec3 skyRolloff(');
  expect(SKY_FRAGMENT).toContain('color = skyRolloff(color);');
  // One knee, interpolated into the shader from the model, so the dome, the fog colour
  // the terrain fades into, and the CPU helper cannot drift apart.
  expect(SKY_FRAGMENT).toContain(`const float SKY_KNEE = ${SKY_HIGHLIGHT_KNEE.toFixed(2)};`);
  // The discs are added after the transfer; rolled off they vanish into the aureole.
  expect(SKY_FRAGMENT.indexOf('color = skyRolloff(color);')).toBeLessThan(
    SKY_FRAGMENT.indexOf('color += sunDiscColor'),
  );
});

test('the highlight transfer is identity below the knee and compresses without clipping', () => {
  const low: [number, number, number] = [0.126, 0.22, 0.422];
  expect(skyHighlightRolloff(low)).toEqual(low);
  // The daytime aureole spans roughly 1.0 to 1.5; those must stay apart, not both be 1.
  const near = skyHighlightRolloff([1.5, 1.5, 1.5])[0];
  const out = skyHighlightRolloff([1.0, 1.0, 1.0])[0];
  expect(near).toBeLessThan(1);
  expect(near - out).toBeGreaterThan(0.05);
  // Ratios survive, so a few degrees off the sun the sky is blue again rather than white.
  const rolled = skyHighlightRolloff([0.994, 1.058, 1.238]);
  expect(rolled[2] - rolled[0]).toBeGreaterThan(0.05);
  expect(skyHighlightRolloff([40, 40, 40])[0]).toBeLessThanOrEqual(1);
});

test('a low sun remains a useful directional key so facing terrain catches sunrise light', () => {
  const low = solarKeyIntensity((2 * Math.PI) / 180);
  expect(low).toBeGreaterThan(1);
  expect(low).toBeLessThan(solarKeyIntensity((67 * Math.PI) / 180));
  expect(solarKeyIntensity(0)).toBe(0);
});

test('the moon uses the bundled texture, phase terminator and a restrained halo', () => {
  expect(SKY_FRAGMENT).toContain('uniform sampler2D moonTexture;');
  expect(SKY_FRAGMENT).toContain('texture2D(moonTexture, clamp(moonUv, 0.0, 1.0))');
  expect(SKY_FRAGMENT).toContain('float moonHalo');
  expect(SKY_FRAGMENT).toContain('moonSide * p.x - curve');
  expect(SKY_FRAGMENT).toContain('moonVisibility(p)');
  expect(SKY_FRAGMENT).toContain('moonVisibility(moonPlane)');
});

test('visual discs are 5x with independent sun feather and soft moon halo', () => {
  expect(SKY_DISC_SCALE).toBe(5);
  expect(SUN_DISC_RADIUS / 0.00465).toBeCloseTo(5);
  expect(MOON_DISC_RADIUS / 0.00452).toBeCloseTo(5);
  expect(SKY_FRAGMENT).toContain(`const float SUN_RADIUS = ${SUN_DISC_RADIUS.toFixed(8)};`);
  expect(SKY_FRAGMENT).toContain(`const float MOON_RADIUS = ${MOON_DISC_RADIUS.toFixed(8)};`);
  expect(SKY_FRAGMENT).toContain('SUN_RADIUS + 0.0016275');
  expect(SKY_FRAGMENT).toContain(
    `exp(-d2 / (${MOON_HALO_WIDTH.toFixed(5)} * ${MOON_HALO_WIDTH.toFixed(5)}))`,
  );
  expect(SKY_FRAGMENT).toContain('/ sin(MOON_RADIUS)');
  expect(SKY_FRAGMENT).not.toContain('MOON_RADIUS * 15.0');
});
