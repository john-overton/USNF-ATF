/**
 * Deterministic wind field. The flight model already subtracts this vector from
 * ground velocity, so `calm` must return exactly zero for byte-identical parity
 * with the preserved assisted model.
 */
import { directionFromHorizontal } from './solar';
import type { Vec3 } from '../flight';

export type WindPresetId = 'calm' | 'light' | 'gusty' | 'storm';
export interface WindPreset {
  id: WindPresetId;
  label: string;
  /** Ten-metre reference wind, m/s. */
  surfaceSpeed: number;
  /** Peak gust departure from the mean, m/s. */
  gustAmplitude: number;
}
export const WIND_PRESETS: Readonly<Record<WindPresetId, WindPreset>> = Object.freeze({
  calm: { id: 'calm', label: 'No wind', surfaceSpeed: 0, gustAmplitude: 0 },
  light: { id: 'light', label: 'Light wind', surfaceSpeed: 5, gustAmplitude: 0 },
  gusty: { id: 'gusty', label: 'Gusts', surfaceSpeed: 9, gustAmplitude: 4 },
  storm: { id: 'storm', label: 'Storm', surfaceSpeed: 18, gustAmplitude: 7 },
});
export const WIND_PRESET_IDS = Object.keys(WIND_PRESETS) as WindPresetId[];
export const isWindPresetId = (value: string): value is WindPresetId =>
  Object.hasOwn(WIND_PRESETS, value);

/** Reference height of the power-law profile and the top of the surface layer. */
const REFERENCE_HEIGHT = 10,
  GRADIENT_HEIGHT = 600,
  UPPER_HEIGHT = 3000;
/** Open-terrain Hellmann exponent; the upper wind is roughly twice the gradient wind. */
const SHEAR_EXPONENT = 0.143,
  UPPER_FACTOR = 2,
  /** Northern-hemisphere veer: wind backs at the surface, so aloft it turns clockwise. */
  VEER_DEGREES = 25;

export interface WindField {
  readonly preset: WindPreset;
  /** Compass bearing the wind blows *from*, degrees clockwise from north. */
  readonly directionDeg: number;
  readonly seed: number;
  /** Precomputed gust phases; deterministic given the seed. */
  readonly gusts: readonly {
    omega: number;
    kx: number;
    kz: number;
    phase: number;
    weight: number;
  }[];
}

/** Small xorshift so a seed reproduces a field exactly in headless runs. */
function random(seed: number): () => number {
  let s = (seed | 0) === 0 ? 0x9e3779b9 : seed | 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 0x1000000) / 0x1000000;
  };
}

export function createWindField(
  preset: WindPresetId,
  options: { directionDeg?: number; seed?: number } = {},
): WindField {
  const seed = options.seed ?? 1337;
  const next = random(seed);
  const gusts = Array.from({ length: 5 }, (_, i) => {
    // Slow, large eddies dominate; short waves are present but weak.
    const scale = 1 / (i + 1);
    return {
      omega: (0.08 + 0.5 * next()) * (i + 1),
      kx: ((next() - 0.5) * 2 * Math.PI) / (400 * (i + 1)),
      kz: ((next() - 0.5) * 2 * Math.PI) / (400 * (i + 1)),
      phase: next() * 2 * Math.PI,
      weight: scale,
    };
  });
  return {
    preset: WIND_PRESETS[preset],
    directionDeg: options.directionDeg ?? 250,
    seed,
    gusts,
  };
}

/** Mean wind speed and bearing at an altitude, before gusts. */
export function windProfile(
  field: WindField,
  altitudeM: number,
): { speed: number; bearingDeg: number } {
  const surface = field.preset.surfaceSpeed;
  if (surface === 0) return { speed: 0, bearingDeg: field.directionDeg };
  const y = Math.max(REFERENCE_HEIGHT, altitudeM);
  const gradient = surface * (GRADIENT_HEIGHT / REFERENCE_HEIGHT) ** SHEAR_EXPONENT;
  if (y <= GRADIENT_HEIGHT)
    return {
      speed: surface * (y / REFERENCE_HEIGHT) ** SHEAR_EXPONENT,
      bearingDeg: field.directionDeg,
    };
  const t = Math.min(1, (y - GRADIENT_HEIGHT) / (UPPER_HEIGHT - GRADIENT_HEIGHT));
  const blend = t * t * (3 - 2 * t);
  return {
    speed: gradient * (1 + (UPPER_FACTOR - 1) * blend),
    bearingDeg: field.directionDeg + VEER_DEGREES * blend,
  };
}

/**
 * World wind vector: the direction air is moving, which is opposite the bearing
 * the wind is named for. Gusts are a bounded sum of sines in time and position,
 * so repeated headless runs at the same clock produce the same field.
 */
export function windAt(field: WindField, position: Vec3, seconds: number): Vec3 {
  if (field.preset.surfaceSpeed === 0 && field.preset.gustAmplitude === 0)
    return { x: 0, y: 0, z: 0 };
  const { speed, bearingDeg } = windProfile(field, position.y);
  const toward = directionFromHorizontal(0, ((bearingDeg + 180) * Math.PI) / 180);
  const base = { x: toward.x * speed, y: 0, z: toward.z * speed };
  const amplitude = field.preset.gustAmplitude;
  if (amplitude === 0) return base;
  // Gusts weaken aloft with the same profile that thickens the mean wind.
  const surfaceFraction = Math.exp(-Math.max(0, position.y) / 1500);
  let total = 0,
    sx = 0,
    sz = 0,
    sy = 0;
  for (const g of field.gusts) {
    const argument = g.omega * seconds + g.kx * position.x + g.kz * position.z + g.phase;
    total += g.weight;
    sx += g.weight * Math.sin(argument);
    sz += g.weight * Math.sin(argument + 2.1);
    sy += g.weight * Math.sin(argument + 4.2);
  }
  const gain = (amplitude * surfaceFraction) / total;
  // Clamp the horizontal gust vector, not each axis, so the departure from the
  // mean can never exceed the preset amplitude on the diagonal.
  const peak = amplitude * surfaceFraction;
  const gx = sx * gain,
    gz = sz * gain;
  const limit = Math.min(1, peak / Math.max(1e-9, Math.hypot(gx, gz)));
  return {
    x: base.x + gx * limit,
    y: sy * gain * 0.4,
    z: base.z + gz * limit,
  };
}
