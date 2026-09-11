/** Fixed-resolution weather DEMs, independent of camera-selected visual mesh LOD. */
import { DataTexture, LinearFilter, Vector2, Vector4 } from 'three';
import type { TerrainChunk, TheaterManifest } from '../data';
import { sampleHeight } from './chunk';
import { WaterBodyIndex } from '../flight/WaterIndex';

export interface WeatherHeightField {
  texture: DataTexture;
  /** World x/z at the first sample, world span between first and last samples. */
  bounds: Vector4;
  size: Vector2;
  min: number;
  max: number;
  bytes: number;
}
export type WeatherChunkReader = (chunk: TerrainChunk) => Promise<Float32Array>;

/** RG packs height, A marks known terrain. Linear sampling preserves the encoded height. */
export function heightField(
  values: Float32Array,
  width: number,
  height: number,
  bounds: Vector4,
): WeatherHeightField {
  let min = Infinity,
    max = -Infinity;
  for (const v of values)
    if (Number.isFinite(v)) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  // An empty map has no valid pixels. These encoding bounds never imply ground at zero.
  if (!Number.isFinite(min)) {
    min = 0;
    max = 0;
  }
  const span = max - min || 1;
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) continue;
    const n = Math.round(((values[i]! - min) / span) * 65535);
    pixels[i * 4] = n >> 8;
    pixels[i * 4 + 1] = n & 255;
    pixels[i * 4 + 3] = 255;
  }
  const texture = new DataTexture(pixels, width, height);
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return {
    texture,
    bounds,
    size: new Vector2(width, height),
    min,
    max,
    bytes: pixels.byteLength,
  };
}

/** Sample in world coordinates; invalid/outside terrain stays unknown, never ocean/zero. */
export function weatherHeightAt(
  field: WeatherHeightField,
  x: number,
  z: number,
): number | undefined {
  const u = (x - field.bounds.x) / field.bounds.z;
  const v = (z - field.bounds.y) / field.bounds.w;
  if (u < 0 || u > 1 || v < 0 || v > 1) return;
  const fx = u * (field.size.x - 1),
    fz = v * (field.size.y - 1);
  const ix = Math.min(field.size.x - 2, Math.floor(fx)),
    iz = Math.min(field.size.y - 2, Math.floor(fz));
  const tx = fx - ix,
    tz = fz - iz;
  const pixels = field.texture.image.data as Uint8Array;
  let encoded = 0;
  for (const [dx, dz, weight] of [
    [0, 0, (1 - tx) * (1 - tz)],
    [1, 0, tx * (1 - tz)],
    [0, 1, (1 - tx) * tz],
    [1, 1, tx * tz],
  ]) {
    if (weight! <= 0) continue;
    const i = ((iz + dz!) * field.size.x + ix + dx!) * 4;
    if (pixels[i + 3] !== 255) return;
    encoded += (pixels[i]! * 256 + pixels[i + 1]!) * weight!;
  }
  return field.min + (encoded / 65535) * (field.max - field.min);
}

/** Rasterize fixed source chunks into an atomic atlas; no streamed partially-zero uploads. */
export async function buildWeatherHeight(
  manifest: TheaterManifest,
  read: WeatherChunkReader,
  bounds: Vector4,
  spacing: number,
  lod: number,
  waterSurface = false,
): Promise<WeatherHeightField> {
  const width = Math.ceil(bounds.z / spacing) + 1,
    height = Math.ceil(bounds.w / spacing) + 1;
  const values = new Float32Array(width * height).fill(NaN);
  const dx = bounds.z / (width - 1),
    dz = bounds.w / (height - 1);
  const chunks = manifest.chunks.filter(
    (c) =>
      c.lod === lod &&
      c.originX <= bounds.x + bounds.z &&
      c.originX + 255 * c.spacing >= bounds.x &&
      c.originZ <= bounds.y + bounds.w &&
      c.originZ + 255 * c.spacing >= bounds.y,
  );
  // Four bounded readers, disjoint interiors; shared border samples agree by contract.
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, chunks.length) }, async () => {
      while (next < chunks.length) {
        const c = chunks[next++]!;
        const samples = await read(c);
        const x0 = Math.max(0, Math.ceil((Math.max(0, c.originX) - bounds.x) / dx));
        const z0 = Math.max(0, Math.ceil((Math.max(0, c.originZ) - bounds.y) / dz));
        const x1 = Math.min(
          width - 1,
          Math.floor(
            (Math.min(manifest.extents.width, c.originX + 255 * c.spacing) - bounds.x) / dx,
          ),
        );
        const z1 = Math.min(
          height - 1,
          Math.floor(
            (Math.min(manifest.extents.height, c.originZ + 255 * c.spacing) - bounds.y) / dz,
          ),
        );
        for (let z = z0; z <= z1; z++)
          for (let x = x0; x <= x1; x++) {
            values[z * width + x] = sampleHeight(
              samples,
              (bounds.x + x * dx - c.originX) / c.spacing,
              (bounds.y + z * dz - c.originZ) / c.spacing,
            );
          }
      }
    }),
  );
  if (waterSurface)
    for (const body of manifest.waterBodies) {
      const water = new WaterBodyIndex(body);
      const { minX, maxX, minZ, maxZ } = water.exterior;
      const x0 = Math.max(0, Math.ceil((minX - bounds.x) / dx)),
        x1 = Math.min(width - 1, Math.floor((maxX - bounds.x) / dx));
      const z0 = Math.max(0, Math.ceil((minZ - bounds.y) / dz)),
        z1 = Math.min(height - 1, Math.floor((maxZ - bounds.y) / dz));
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const i = z * width + x;
          if (Number.isFinite(values[i]) && water.contains(bounds.x + x * dx, bounds.y + z * dz))
            values[i] = Math.max(values[i]!, body.elevation);
        }
    }
  return heightField(values, width, height, bounds.clone());
}

export class WeatherTerrain {
  clouds?: WeatherHeightField;
  fog?: WeatherHeightField;
  error = '';
  private disposed = false;
  private loading = false;
  private requested = '';
  private loaded = '';
  private position = { x: 0, z: 0 };
  constructor(
    private manifest: TheaterManifest,
    private read: WeatherChunkReader,
  ) {}
  async initialize(maxSize: number): Promise<void> {
    const { width, height } = this.manifest.extents;
    const lod = this.manifest.lods.includes(2) ? 2 : Math.min(...this.manifest.lods);
    const spacing = Math.max(300, width / (maxSize - 1), height / (maxSize - 1));
    const map = await buildWeatherHeight(
      this.manifest,
      this.read,
      new Vector4(0, 0, width, height),
      spacing,
      lod,
      true,
    );
    if (this.disposed) map.texture.dispose();
    else this.clouds = map;
  }
  /** 25.6 km square at 100 m: fixed across visual LOD, shifted in 6.4 km increments. */
  update(x: number, z: number): void {
    if (this.disposed) return;
    const cx = Math.round(x / 6400) * 6400,
      cz = Math.round(z / 6400) * 6400;
    this.position = { x: cx, z: cz };
    this.requested = `${cx}/${cz}`;
    if (this.loaded === this.requested || this.loading) return;
    this.loading = true;
    const key = this.requested;
    const lod = this.manifest.lods.includes(1) ? 1 : Math.min(...this.manifest.lods);
    void buildWeatherHeight(
      this.manifest,
      this.read,
      new Vector4(cx - 12800, cz - 12800, 25600, 25600),
      100,
      lod,
      true,
    )
      .then((map) => {
        if (this.disposed || key !== this.requested) {
          map.texture.dispose();
          return;
        }
        this.fog?.texture.dispose();
        this.fog = map;
        this.loaded = key;
        this.error = '';
      })
      .catch((error: unknown) => {
        if (!this.disposed) {
          this.error = String(error);
          this.loaded = key;
        }
      })
      .finally(() => {
        this.loading = false;
        if (!this.disposed && this.requested !== key) this.update(this.position.x, this.position.z);
      });
  }
  dispose(): void {
    this.disposed = true;
    this.clouds?.texture.dispose();
    this.fog?.texture.dispose();
  }
}

/** Shared by shadows and the atmospheric march. Atlas A is a validity mask. */
export const WEATHER_HEIGHT_GLSL = /* glsl */ `
uniform sampler2D weatherHeight;
uniform vec4 weatherBounds;
uniform vec2 weatherSize;
uniform vec2 weatherRange;
uniform float weatherReady;
vec2 sampleWeatherHeight(sampler2D map, vec4 bounds, vec2 size, vec2 range, vec2 p) {
  vec2 uv = (p - bounds.xy) / bounds.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec2(0.0);
  vec4 sampleValue = texture2D(map, (uv * (size - 1.0) + 0.5) / size);
  if (sampleValue.a < 0.999999) return vec2(0.0);
  float h = (sampleValue.r * 65280.0 + sampleValue.g * 255.0) / 65535.0;
  return vec2(mix(range.x, range.y, h), 1.0);
}
vec2 cloudGroundAt(vec2 p) {
  if (weatherReady < 0.5) return vec2(0.0);
  return sampleWeatherHeight(weatherHeight, weatherBounds, weatherSize, weatherRange, p);
}
`;
