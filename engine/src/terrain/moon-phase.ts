/** Width across the disc, not a fraction of its radius. */
export const MOON_FEATHER = 0.02;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Projected spherical terminator: each horizontal slice has illuminated fraction phase. */
export function moonVisibility(x: number, y: number, phase: number, waxing: boolean): number {
  const disc = 1 - smooth(1 - MOON_FEATHER, 1 + MOON_FEATHER, Math.hypot(x, y));
  const curve = (1 - 2 * phase) * Math.sqrt(Math.max(0, 1 - y * y));
  const lit = smooth(-MOON_FEATHER, MOON_FEATHER, (waxing ? x : -x) - curve);
  return disc * lit * smooth(0, 0.005, phase);
}

export const MOON_PHASE_GLSL = /* glsl */ `
float moonVisibility(vec2 p) {
  float disc = 1.0 - smoothstep(0.98, 1.02, length(p));
  float curve = (1.0 - 2.0 * moonPhase) * sqrt(max(0.0, 1.0 - p.y * p.y));
  float lit = smoothstep(-0.02, 0.02, moonSide * p.x - curve);
  return disc * lit * smoothstep(0.0, 0.005, moonPhase);
}
`;
