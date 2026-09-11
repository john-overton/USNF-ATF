/** Ground fog: dense through 200 ft AGL, smoothly clear by 600 ft. */
export const FOG_FULL_AGL_M = 200 * 0.3048;
export const FOG_TOP_AGL_M = 600 * 0.3048;
export const FOG_EXTINCTION = 0.0018;
export function groundFogDensity(aglM: number): number {
  if (!Number.isFinite(aglM) || aglM < 0 || aglM >= FOG_TOP_AGL_M) return 0;
  const t = Math.max(0, Math.min(1, (aglM - FOG_FULL_AGL_M) / (FOG_TOP_AGL_M - FOG_FULL_AGL_M)));
  return 1 - t * t * (3 - 2 * t);
}
