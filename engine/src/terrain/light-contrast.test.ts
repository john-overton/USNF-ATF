import { expect, test } from 'bun:test';
import { ShaderLib } from 'three';
import { patchCloudShadow } from './cloud-shadow';
import {
  clampTerrainContrast,
  createContrastUniforms,
  parseContrastQuery,
  patchTerrainLightContrast,
  setTerrainContrast,
  terrainContrastFactors,
  TERRAIN_CONTRAST,
  TERRAIN_CONTRAST_RANGE,
} from './light-contrast';

/**
 * Minimal stand-in for the object three hands to `onBeforeCompile`. The real type
 * carries a hundred-odd compile parameters; the patches read three fields, so the cast
 * keeps the test to what is actually being exercised.
 */
type Shader = Parameters<typeof patchTerrainLightContrast>[0];
const patchable = () =>
  ({
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: ShaderLib.physical.vertexShader,
    fragmentShader: ShaderLib.physical.fragmentShader,
  }) as unknown as Shader;

test('the hook this patch relies on still exists in the three material it patches', () => {
  // A three upgrade that renamed the include would leave the patch silently replacing
  // nothing, and the setting would do exactly nothing with no error anywhere.
  const fragment = ShaderLib.physical.fragmentShader;
  expect(fragment).toContain('#include <aomap_fragment>');
  // It has to sit after the light loop and before the diffuse terms are summed.
  expect(fragment.indexOf('#include <lights_fragment_end>')).toBeLessThan(
    fragment.indexOf('#include <aomap_fragment>'),
  );
  expect(fragment.indexOf('#include <aomap_fragment>')).toBeLessThan(
    fragment.indexOf('vec3 totalDiffuse'),
  );
});

test('off is exactly the lighting that was there before', () => {
  const { direct, fill } = terrainContrastFactors(0);
  expect(direct).toBe(1);
  expect(fill).toBe(1);
});

test('the shipped value is the one dialled in against the renderer, and it is in range', () => {
  expect(TERRAIN_CONTRAST).toBe(0.8);
  expect(TERRAIN_CONTRAST).toBeGreaterThanOrEqual(TERRAIN_CONTRAST_RANGE.min);
  expect(TERRAIN_CONTRAST).toBeLessThanOrEqual(TERRAIN_CONTRAST_RANGE.max);
  // The fill has to stay well clear of zero at the shipped value, or shaded slopes
  // lose their ground colour instead of merely getting darker.
  expect(terrainContrastFactors(TERRAIN_CONTRAST).fill).toBeGreaterThan(0.5);
});

test('the boost is the extra separation between a lit face and a shaded one', () => {
  for (const boost of [0.1, 0.25, 0.5, 1]) {
    const { direct, fill } = terrainContrastFactors(boost);
    // A fully lit face gets direct + fill; a fully shaded one in the same air gets fill
    // alone. The difference between them is the direct term, and that is what the
    // number on the slider promises to raise.
    expect(direct - 1).toBeCloseTo(boost, 10);
    // The fill only ever comes down, never up, and never through zero.
    expect(fill).toBeLessThan(1);
    expect(fill).toBeGreaterThan(0);
    // An average fragment, with as much sun as fill, must not drift far either way.
    const before = 1 + 1;
    const after = direct + fill;
    expect(Math.abs(after - before) / before).toBeLessThan(boost * 0.3);
  }
});

test('the accepted range is clamped at both ends', () => {
  expect(clampTerrainContrast(-5)).toBe(TERRAIN_CONTRAST_RANGE.min);
  expect(clampTerrainContrast(99)).toBe(TERRAIN_CONTRAST_RANGE.max);
  expect(clampTerrainContrast(Number.NaN)).toBe(TERRAIN_CONTRAST);
  expect(clampTerrainContrast(0.35)).toBe(0.35);
});

test('all terrain materials share one uniform box, so the slider reaches every patch', () => {
  const first = createContrastUniforms();
  const second = createContrastUniforms();
  expect(first).not.toBe(second);
  expect(first.terrainLightContrast).toBe(second.terrainLightContrast);
  setTerrainContrast(0.4);
  expect(second.terrainLightContrast!.value).toBeCloseTo(1.4, 10);
  setTerrainContrast(TERRAIN_CONTRAST);
});

test('the patch scales the light after every light, including the cloud shadow', () => {
  const shader = patchable();
  patchCloudShadow(shader);
  patchTerrainLightContrast(shader);
  expect(Object.keys(shader.uniforms)).toContain('terrainLightContrast');
  const direct = shader.fragmentShader.indexOf('reflectedLight.directDiffuse *=');
  expect(direct).toBeGreaterThan(0);
  // The cloud shadow dims the direct term; this has to see the dimmed value, or a
  // cloud's shadow would be stretched along with the sunlight it is standing in for.
  expect(shader.fragmentShader.indexOf('float cloudLight = cloudShadow(')).toBeLessThan(direct);
  expect(direct).toBeLessThan(shader.fragmentShader.indexOf('#include <aomap_fragment>'));
});

test('the contrast query takes a fraction in range and rejects anything else', () => {
  expect(parseContrastQuery('')).toBeUndefined();
  expect(parseContrastQuery('?contrast=0.25')).toBe(0.25);
  expect(parseContrastQuery('?contrast=0')).toBe(0);
  expect(() => parseContrastQuery('?contrast=2')).toThrow(/expected 0 to 1/);
  expect(() => parseContrastQuery('?contrast=-0.1')).toThrow();
  expect(() => parseContrastQuery('?contrast=lots')).toThrow();
  expect(() => parseContrastQuery('?contrast=')).toThrow();
});
