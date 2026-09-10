/**
 * Terrain shading contrast: widen the gap between the sunlit face of a slope and the
 * shaded one, so relief reads as relief instead of one flat wash that blends into the
 * next hill.
 *
 * It works on the light, not on the picture. The two diffuse terms reaching a fragment
 * are already separated by the time this runs: the direct term is the sun or the moon,
 * which is what varies from face to face, and the indirect term is the hemisphere fill,
 * which is close to constant across the whole scene and is therefore exactly the part
 * that flattens a hillside.
 *
 * So the direct term carries the setting: a fully lit face stands above a fully shaded
 * one by exactly the direct term, and scaling it by 1.8 makes that difference 80%
 * larger, which is what the number means. The fill then comes down by half as much
 * again, which restrains the overall brightening without cancelling it: where the sun
 * dominates the fill, the ground does end up brighter as well as better modelled. On
 * the Crimean ridge at 10:00 the shipped value measured a mean sRGB luminance of 74
 * against 47 with the effect off, and a standard deviation of 2.8 against 2.2
 * (2026-09-09, M3, 1280x768). Taking the fill down by the full amount instead pivots
 * the picture around the fragments where sun and fill happen to be equal, and in hazy
 * air most ground sits below that, so the ground went dark rather than gaining shape.
 *
 * The 0.8 was chosen by the user against the running renderer with a temporary slider,
 * not derived; the numbers above record what it does, not why it is right.
 *
 * Doing it here rather than as a contrast curve over the finished frame is what keeps it
 * honest: the sky, the sun disc, the clouds and the haze are not shaded surfaces and have
 * no business being stretched, and a curve over the final pixel would stretch the fog
 * along with the ground it is hiding.
 */
import type { MeshStandardMaterial } from 'three';

type Patchable = Parameters<NonNullable<MeshStandardMaterial['onBeforeCompile']>>[0];

/**
 * The extra separation between a lit face and a shaded one, as a fraction: 0 leaves the
 * lighting exactly as it was, 0.8 is what the theater ships with. The value was dialled
 * in against the real renderer on 2026-09-09 rather than derived — below about half the
 * relief is still washing out, and past one the fill is dark enough that shaded slopes
 * start losing their ground colour. The accepted range stops at a full doubling, which
 * is where the fill would reach zero.
 */
export const TERRAIN_CONTRAST_RANGE = Object.freeze({ min: 0, max: 1 });
export const TERRAIN_CONTRAST = 0.8;
export const clampTerrainContrast = (boost: number): number =>
  Number.isFinite(boost)
    ? Math.max(TERRAIN_CONTRAST_RANGE.min, Math.min(TERRAIN_CONTRAST_RANGE.max, boost))
    : TERRAIN_CONTRAST;

export const LIGHT_CONTRAST_CHUNK = /* glsl */ `
uniform float terrainLightContrast;
`;

/**
 * The two lines that do the work, injected where every light — including the cloud
 * shadow, which scales the direct term — has already been accumulated, and before the
 * diffuse terms are summed into the outgoing light.
 *
 * Off is exactly one on both terms, and the fill cannot go negative for any setting the
 * selector offers.
 */
export const TERRAIN_CONTRAST_FILL_SHARE = 0.5;
/**
 * What the two GLSL lines below do, in TypeScript, so the behaviour can be reasoned
 * about and tested without a GL context. `direct` is the factor on the sun or moon and
 * `fill` the factor on the hemisphere term.
 */
export function terrainContrastFactors(boost: number): { direct: number; fill: number } {
  const contrast = 1 + clampTerrainContrast(boost);
  return {
    direct: contrast,
    fill: Math.max(0, 1 - (contrast - 1) * TERRAIN_CONTRAST_FILL_SHARE),
  };
}
const APPLY = /* glsl */ `
reflectedLight.directDiffuse *= terrainLightContrast;
reflectedLight.indirectDiffuse *=
  max(0.0, 1.0 - (terrainLightContrast - 1.0) * ${TERRAIN_CONTRAST_FILL_SHARE.toFixed(2)});
`;

interface ContrastUniforms extends Record<string, { value: unknown }> {
  terrainLightContrast: { value: number };
}
let singleton: ContrastUniforms | undefined;
/**
 * One shared `{ value }` box, as with the cloud shadows: every terrain patch material
 * gets the same box, so `setTerrainContrast` reaches all of them at once and changing
 * the setting never recompiles a shader. The record itself is copied so one material
 * cannot add keys to its neighbours.
 */
export function createContrastUniforms(): Record<string, { value: unknown }> {
  singleton ??= { terrainLightContrast: { value: 1 + TERRAIN_CONTRAST } };
  return { ...singleton };
}
export function setTerrainContrast(boost: number): void {
  createContrastUniforms();
  singleton!.terrainLightContrast.value = 1 + clampTerrainContrast(boost);
}

/**
 * Call from inside the terrain material's own `onBeforeCompile`, after `patchCloudShadow`
 * so the cloud's own dimming of the direct term is already in, and bump the material's
 * `customProgramCacheKey`: the shader source has changed.
 */
export function patchTerrainLightContrast(shader: Patchable): void {
  Object.assign(shader.uniforms, createContrastUniforms());
  shader.fragmentShader = LIGHT_CONTRAST_CHUNK + shader.fragmentShader;
  // `aomap_fragment` is the first thing after the light loop and the cloud shadow that
  // follows it, and it still precedes the sum into `totalDiffuse`.
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <aomap_fragment>',
    `${APPLY}#include <aomap_fragment>`,
  );
}

/**
 * `?contrast=0.25`, the boost as a fraction, for comparing values against the running
 * renderer without a rebuild. There is no in-app control: the shipped value is
 * `TERRAIN_CONTRAST`. Anything outside the range is rejected rather than ignored.
 */
export function parseContrastQuery(search: string): number | undefined {
  const value = new URLSearchParams(search).get('contrast');
  if (value === null) return undefined;
  const boost = Number(value);
  if (
    !value.trim() ||
    !Number.isFinite(boost) ||
    boost < TERRAIN_CONTRAST_RANGE.min ||
    boost > TERRAIN_CONTRAST_RANGE.max
  )
    throw new Error(
      `Invalid contrast parameter “${value}”: expected ${TERRAIN_CONTRAST_RANGE.min} to ${TERRAIN_CONTRAST_RANGE.max}`,
    );
  return boost;
}
