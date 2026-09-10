/** Native data supplies performance polygons, not the original force integrator.
 * This module fits an explicitly original parabolic polar to those boundaries. */
export interface EnvelopeProfile {
  envelopes: {
    g: number;
    points: { speedMps: number; altitudeM: number }[];
  }[];
}
export interface EnvelopeBounds {
  minSpeedMps: number;
  maxSpeedMps: number;
}
const G = 9.80665;

/** Horizontal intersection with a closed speed/altitude polygon. No extrapolation
 * outside its altitude coverage. Horizontal boundary edges include both ends. */
export function envelopeBounds(
  profile: EnvelopeProfile,
  g: number,
  altitudeM: number,
): EnvelopeBounds | undefined {
  if (!Number.isFinite(g) || !Number.isFinite(altitudeM))
    throw new Error('Envelope query must be finite');
  const points = profile.envelopes.find((e) => e.g === g)?.points;
  if (!points || points.length < 3) return undefined;
  const intersections: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!;
    if (![a.speedMps, a.altitudeM, b.speedMps, b.altitudeM].every(Number.isFinite))
      throw new Error('Envelope contains nonfinite coordinates');
    if (
      altitudeM < Math.min(a.altitudeM, b.altitudeM) ||
      altitudeM > Math.max(a.altitudeM, b.altitudeM)
    )
      continue;
    if (a.altitudeM === b.altitudeM) intersections.push(a.speedMps, b.speedMps);
    else
      intersections.push(
        a.speedMps +
          ((b.speedMps - a.speedMps) * (altitudeM - a.altitudeM)) / (b.altitudeM - a.altitudeM),
      );
  }
  if (!intersections.length) return undefined;
  const minSpeedMps = Math.min(...intersections),
    maxSpeedMps = Math.max(...intersections);
  if (minSpeedMps <= 0 || maxSpeedMps <= minSpeedMps) return undefined;
  return { minSpeedMps, maxSpeedMps };
}
export interface EnvelopePolar extends EnvelopeBounds {
  clMax: number;
  cd0: number;
  inducedDragK: number;
  referenceMassKg: number;
  /** Higher-G boundary assumed sustained by this fallback fit. Native callers
   * instead derive control G limits; see Docs/formats/native-performance.md. */
  fitG: number | null;
  fitWarnings: string[];
}

/** massKg is a FIXED calibration/reference mass (currently empty + full fuel).
 * Never pass instantaneous fuel/load mass here: doing so erases weight effects.
 * thrustAtSpeed supplies maximum AB thrust using the caller's documented lapse.
 * Density matches the current original sim atmosphere, not a decoded USNF law. */
export function fitEnvelopeAero(
  profile: EnvelopeProfile,
  input: {
    massKg: number;
    wingAreaM2: number;
    altitudeM: number;
    thrustAtSpeed: (speedMps: number) => number;
    /** Optional separately recovered native integer boundary query. */
    boundsAt?: (g: number, altitudeM: number) => EnvelopeBounds | undefined;
  },
): EnvelopePolar | undefined {
  const { massKg, wingAreaM2, altitudeM, thrustAtSpeed } = input;
  if (![massKg, wingAreaM2, altitudeM].every(Number.isFinite) || massKg <= 0 || wingAreaM2 <= 0)
    throw new Error('Envelope fit requires finite altitude and positive mass/wing area');
  const boundsAt =
    input.boundsAt ?? ((g: number, height: number) => envelopeBounds(profile, g, height));
  const bounds = boundsAt(1, altitudeM);
  if (!bounds) return undefined;
  const rho = 1.225 * Math.exp(-Math.max(0, altitudeM) / 8500);
  const qArea = (speed: number) => 0.5 * rho * speed ** 2 * wingAreaM2;
  const weight = massKg * G;
  const fitPoint = (speed: number, g: number) => {
    const thrust = thrustAtSpeed(speed);
    if (!Number.isFinite(thrust) || thrust <= 0)
      throw new Error('Envelope fit requires finite positive reference thrust');
    const q = qArea(speed);
    return { cl: (g * weight) / q, cd: thrust / q };
  };
  const level = fitPoint(bounds.maxSpeedMps, 1);
  const candidates = profile.envelopes.filter((e) => e.g > 1).sort((a, b) => b.g - a.g);
  let fitG: number | null = null;
  // Original fallback K; cap its contribution so CD0 remains positive and the
  // 1G upper boundary is still exactly balanced. Warn rather than silently claim
  // higher-G agreement when the available boundaries cannot fit one polar.
  let inducedDragK = Math.min(0.04, (0.5 * level.cd) / level.cl ** 2);
  let cd0 = level.cd - inducedDragK * level.cl ** 2;
  for (const candidate of candidates) {
    const range = boundsAt(candidate.g, altitudeM);
    if (!range) continue;
    const point = fitPoint(range.maxSpeedMps, candidate.g);
    const denominator = point.cl ** 2 - level.cl ** 2;
    if (Math.abs(denominator) < 1e-12) continue;
    const k = (point.cd - level.cd) / denominator;
    const base = level.cd - k * level.cl ** 2;
    if (!Number.isFinite(k) || !Number.isFinite(base) || k <= 0 || base <= 0) continue;
    inducedDragK = k;
    cd0 = base;
    fitG = candidate.g;
    break;
  }
  return {
    ...bounds,
    clMax: weight / qArea(bounds.minSpeedMps),
    cd0,
    inducedDragK,
    referenceMassKg: massKg,
    fitG,
    fitWarnings:
      fitG === null ? ['No compatible higher-G boundary; original induced-drag fallback'] : [],
  };
}
