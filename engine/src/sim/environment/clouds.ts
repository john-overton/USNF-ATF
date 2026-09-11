/**
 * Authored cloud layers per weather preset. The renderer marches the same
 * coverage field these presets describe. `cloudDensityAt` evaluates only its
 * coarse envelope; render-only morphology is not an AI/radar visibility model.
 */
import type { Vec3 } from '../flight';

export type WeatherId = 'clear' | 'scattered' | 'broken' | 'overcast' | 'storm';
export type CloudType = 'cumulus' | 'cumulonimbus' | 'stratus' | 'cirrus';
export interface CloudLayer {
  type: CloudType;
  /** AGL for marched layers; MSL for the high cirrus sheet. */
  baseM: number;
  topM: number;
  /** Fraction of sky the layer covers, 0-1. */
  coverage: number;
  /** Extinction scale inside the layer; cirrus is thin by construction. */
  density: number;
}
export interface WeatherPreset {
  id: WeatherId;
  label: string;
  layers: readonly CloudLayer[];
}
/** Authored in Docs/environment-plan.md; a cirrus sheet is present in every preset. */
export const WEATHER_PRESETS: Readonly<Record<WeatherId, WeatherPreset>> = Object.freeze({
  clear: {
    id: 'clear',
    label: 'Clear',
    layers: [{ type: 'cirrus', baseM: 9000, topM: 9200, coverage: 0.15, density: 0.1 }],
  },
  scattered: {
    id: 'scattered',
    label: 'Scattered cumulus',
    layers: [
      { type: 'cumulus', baseM: 1500, topM: 2600, coverage: 0.35, density: 0.55 },
      { type: 'cirrus', baseM: 9000, topM: 9200, coverage: 0.25, density: 0.1 },
    ],
  },
  broken: {
    id: 'broken',
    label: 'Broken cumulus',
    layers: [
      { type: 'cumulus', baseM: 1200, topM: 2800, coverage: 0.6, density: 0.7 },
      { type: 'cirrus', baseM: 9000, topM: 9200, coverage: 0.35, density: 0.12 },
    ],
  },
  overcast: {
    id: 'overcast',
    label: 'Overcast',
    layers: [
      { type: 'stratus', baseM: 800, topM: 1400, coverage: 0.97, density: 0.85 },
      { type: 'cirrus', baseM: 9000, topM: 9200, coverage: 0.5, density: 0.15 },
    ],
  },
  storm: {
    id: 'storm',
    label: 'Thunderstorm towers',
    layers: [
      { type: 'cumulonimbus', baseM: 700, topM: 10500, coverage: 0.85, density: 1.4 },
      { type: 'cirrus', baseM: 11500, topM: 11700, coverage: 0.6, density: 0.12 },
    ],
  },
});
export const WEATHER_IDS = Object.keys(WEATHER_PRESETS) as WeatherId[];
export const isWeatherId = (value: string): value is WeatherId =>
  Object.hasOwn(WEATHER_PRESETS, value);

/** Metres of world covered by one tile of the coverage texture. */
export const COVERAGE_TILE_METERS = 24000;
/** A coverage field sampled in world metres, returning 0-1. */
export type CoverageSampler = (x: number, z: number) => number;

/** The marched layer, or undefined for a preset that has only the cirrus sheet. */
export function marchedLayer(preset: WeatherPreset): CloudLayer | undefined {
  return preset.layers.find((layer) => layer.type !== 'cirrus');
}

/**
 * Coarse envelope for CPU queries; the shader reuses the stratus profile but
 * shapes cumulus/tower tops separately. Returns 0 outside the layer.
 */
export function layerHeightGradient(layer: CloudLayer, altitudeM: number): number {
  const h = (altitudeM - layer.baseM) / Math.max(1, layer.topM - layer.baseM);
  if (h <= 0 || h >= 1) return 0;
  if (layer.type === 'stratus') return Math.min(1, Math.min(h, 1 - h) / 0.15);
  return Math.min(1, h / 0.2) * Math.min(1, (1 - h) / 0.35);
}

/**
 * Cloud extinction at a world position, matching the large-scale coverage envelope before
 * renderer-only billows, towers, anvils and erosion. This is an approximation,
 * not density parity with the final rendered volume. `sample` is the same tiling coverage field the GPU samples.
 */
export function cloudDensityAt(
  preset: WeatherPreset,
  position: Vec3,
  sample: CoverageSampler,
  offset: { x: number; z: number } = { x: 0, z: 0 },
  groundAt?: (x: number, z: number) => number | undefined,
): number {
  let total = 0;
  for (const layer of preset.layers) {
    const ground = layer.type === 'cirrus' ? 0 : groundAt?.(position.x, position.z);
    if (ground === undefined || !Number.isFinite(ground)) continue;
    const gradient = layerHeightGradient(layer, position.y - ground);
    if (gradient === 0) continue;
    const noise = sample(position.x + offset.x, position.z + offset.z);
    // Coverage raises the noise floor: at 1 the whole layer is solid.
    const shaped = Math.max(0, noise + layer.coverage - 1) / Math.max(1e-3, layer.coverage);
    total += shaped * gradient * layer.density;
  }
  return total;
}

/** True when the camera is inside enough cloud to warrant fly-through whiteout. */
export function inCloud(
  preset: WeatherPreset,
  position: Vec3,
  sample: CoverageSampler,
  offset?: { x: number; z: number },
  groundAt?: (x: number, z: number) => number | undefined,
): boolean {
  return cloudDensityAt(preset, position, sample, offset, groundAt) > 0.35;
}
