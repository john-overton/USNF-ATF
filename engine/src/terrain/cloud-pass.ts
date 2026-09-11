/**
 * Ray-marched cloud layer (Docs/environment-plan.md, "Volumetric clouds"): a march at a
 * selectable resolution into an RGBA8 target holding premultiplied colour and
 * transmittance, then a composite over the full-resolution scene.
 *
 * The coverage texture is a module singleton because the ground shadows sample exactly the
 * same field with the same offset and tiling; if the pass and the materials ever held
 * different textures or different uniform names the shadow would drift away from the cloud
 * that casts it. `SHADOW_CHUNK` is therefore included verbatim in the march shader too, so
 * one declaration serves both and a rename cannot desynchronise them.
 */
import {
  Color,
  Matrix4,
  Data3DTexture,
  DataTexture,
  LinearFilter,
  HalfFloatType,
  RedFormat,
  RepeatWrapping,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { SUNSHINE_GLSL, SUNSHINE_RECONSTRUCTION } from './sunshine-shader';
import { SUNSHINE_HISTORY } from './sunshine-history';
import { loadSunshineTextures, type SunshineTextures } from '../render/sunshine-textures';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { buildCloudShape, buildCloudVolume, buildCoverageTexture } from '../render/cloud-noise';
import { COVERAGE_TILE_METERS, type CloudLayer } from '../sim/environment/clouds';
import { WEATHER_HEIGHT_GLSL, type WeatherHeightField } from './weather-height';
import { FOG_FULL_AGL_M, FOG_TOP_AGL_M, FOG_EXTINCTION } from '../sim/environment/fog';
import type { CloudQuality } from '../sim/environment';

/** Metres of world spanned by one tile of the 64³ erosion volume. */
const DETAIL_TILE_METERS = 3000;
/** Light steps toward the sun per march sample; the plan's four-to-six band. */
const LIGHT_STEPS = 6;

export interface CloudUniformState {
  /** World-space offset of the coverage texture, metres; shared with cloud shadows. */
  offset: { x: number; z: number };
  /** Elapsed unpaused simulation seconds; independent of the solar clock. */
  evolutionSeconds: number;
  /** Independent high-altitude wind advection for the cirrus sheet. */
  cirrusOffset: { x: number; z: number };
  layer: CloudLayer | undefined;
  cirrus: CloudLayer | undefined;
  /** Unit, world space, pointing at the sun. */
  sunDirection: Vector3;
  sunColor: Color;
  /** Direct-light strength relative to the calibrated noon key. */
  sunIntensity: number;
  zenithColor: Color;
  groundColor: Color;
  /** Hemisphere-light strength relative to the calibrated noon fill. */
  ambientIntensity: number;
  /** Floating-origin offset: world = renderPosition + origin. */
  origin: { x: number; z: number };
  fogColor: Color;
  fogNear: number;
  fogFar: number;
  terrain?: WeatherHeightField | undefined;
  fogTerrain?: WeatherHeightField | undefined;
  groundFog?: boolean;
  wind?: { x: number; z: number };
  sunshine?: { coverage: number; density: number };
  appearance?: 'sunshine' | 'solid' | 'volume';
}

/** Authored linear-radiance weather adjustment, applied before distance haze. */
function cloudWeatherBrightness(type: CloudLayer['type'] | undefined): number {
  return type === 'stratus' ? 0.75 : 1;
}

export function cloudScaleFor(quality: CloudQuality): number {
  switch (quality) {
    case 'full':
      return 1;
    case 'half':
      return 0.5;
    case 'quarter':
      return 0.25;
    default:
      return 0;
  }
}

/** Keep the cloud pass in the same noon-relative exposure space as SkyLayer. */
export function cloudLightingFactors(
  sunIntensity: number,
  ambientIntensity: number,
): { direct: number; ambient: number } {
  return {
    direct: Math.max(0, Math.min(1, sunIntensity / 2.4)),
    ambient: Math.max(0, Math.min(1, ambientIntensity / 1.7)),
  };
}

let coverageSingleton: DataTexture | undefined;
let volumeSingleton: Data3DTexture | undefined;
let shapeSingleton: Data3DTexture | undefined;
/** Lazily built so `import`ing this module stays free for headless tests. */
function coverageTexture(): DataTexture {
  if (!coverageSingleton) {
    const noise = buildCoverageTexture();
    const texture = new DataTexture(
      noise.data,
      noise.size,
      noise.size,
      RedFormat,
      UnsignedByteType,
    );
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.minFilter = texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    coverageSingleton = texture;
  }
  return coverageSingleton;
}
function volumeTexture(shape = false): Data3DTexture {
  let texture = shape ? shapeSingleton : volumeSingleton;
  if (!texture) {
    const noise = shape ? buildCloudShape() : buildCloudVolume();
    texture = new Data3DTexture(noise.data, noise.size, noise.size, noise.size);
    texture.format = RedFormat;
    texture.type = UnsignedByteType;
    texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
    texture.minFilter = texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    if (shape) shapeSingleton = texture;
    else volumeSingleton = texture;
  }
  return texture;
}

/**
 * Declarations and the shadow lookup every lit material reuses. `worldPosition` is the
 * scene-space position; `cloudOrigin` adds the floating origin back before sampling.
 */
export const SHADOW_CHUNK = /* glsl */ `
${WEATHER_HEIGHT_GLSL}
uniform sampler2D cloudCoverage;
uniform vec2 cloudOffset;
uniform float cloudBaseM;
uniform float cloudCoverageAmount;
uniform vec3 cloudSunDirection;
uniform vec2 cloudOrigin;
uniform float cloudTileMeters;
uniform float cloudShadowEnabled;
uniform sampler2D cloudGroundShadow;
uniform vec4 cloudGroundShadowBounds;
uniform float cloudGroundShadowReady;
uniform float cloudGroundShadowStrength;

float cloudCoverageAt(vec2 worldXZ) {
  return texture2D(cloudCoverage, (worldXZ + cloudOffset) / cloudTileMeters).r;
}
// Coverage raises the noise floor: at 1 the whole layer is solid. Mirrors cloudDensityAt.
float cloudShaped(float noise, float amount) {
  return clamp((noise + amount - 1.0) / max(1e-3, amount), 0.0, 1.0);
}
float cloudShadow(vec3 worldPosition) {
  if (cloudGroundShadowReady > .5) {
    vec2 uv=(worldPosition.xz+cloudOrigin-cloudGroundShadowBounds.xy)/cloudGroundShadowBounds.zw;
    if(all(greaterThanEqual(uv,vec2(0.))) && all(lessThanEqual(uv,vec2(1.)))) {
      vec2 ground=cloudGroundAt(worldPosition.xz+cloudOrigin);
      if(ground.y>.5 && worldPosition.y<ground.x+cloudBaseM) {
        float edge=min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y));
        return mix(1.,texture2D(cloudGroundShadow,uv).r,smoothstep(0.,.05,edge));
      }
    }
    return 1.;
  }
  if (cloudShadowEnabled < 0.5 || cloudCoverageAmount <= 0.0) return 1.0;
  // A sun on the horizon casts shadows that stretch to infinity; the light is already
  // near zero there, so stop rather than sampling a wildly extrapolated point.
  if (cloudSunDirection.y <= 0.05) return 1.0;
  vec3 p = vec3(worldPosition.x + cloudOrigin.x, worldPosition.y, worldPosition.z + cloudOrigin.y);
  vec2 ground = cloudGroundAt(p.xz);
  if (ground.y < 0.5) return 1.0;
  float t = (ground.x + cloudBaseM - p.y) / cloudSunDirection.y;
  // Two refinements follow the regional terrain-relative base along the light ray.
  for (int i = 0; i < 2; i++) {
    ground = cloudGroundAt(p.xz + cloudSunDirection.xz * max(0.0, t));
    if (ground.y < 0.5) return 1.0;
    t = (ground.x + cloudBaseM - p.y) / cloudSunDirection.y;
  }
  if (t <= 0.0) return 1.0;
  vec2 hit = p.xz + cloudSunDirection.xz * t;
  float shaped = cloudShaped(cloudCoverageAt(hit), cloudCoverageAmount);
  return 1.0 - 0.75 * smoothstep(0.0, 0.6, shaped);
}
`;

interface CloudShadowUniforms extends Record<string, { value: unknown }> {
  weatherHeight: { value: Texture | null };
  weatherBounds: { value: Vector4 };
  weatherSize: { value: Vector2 };
  weatherRange: { value: Vector2 };
  weatherReady: { value: number };
  cloudCoverage: { value: Texture };
  cloudOffset: { value: Vector2 };
  cloudBaseM: { value: number };
  cloudCoverageAmount: { value: number };
  cloudSunDirection: { value: Vector3 };
  cloudOrigin: { value: Vector2 };
  cloudTileMeters: { value: number };
  cloudShadowEnabled: { value: number };
  cloudGroundShadow: { value: Texture | null };
  cloudGroundShadowBounds: { value: Vector4 };
  cloudGroundShadowReady: { value: number };
  cloudGroundShadowStrength: { value: number };
}

let shadowSingleton: CloudShadowUniforms | undefined;
/**
 * The uniform objects are one shared set: every material that includes `SHADOW_CHUNK` gets
 * the same `{ value }` boxes, so a single `updateCloudShadowUniforms` per frame updates all
 * of them. The record itself is copied so a material cannot add keys to its neighbours.
 */
export function createCloudShadowUniforms(): Record<string, { value: unknown }> {
  shadowSingleton ??= {
    weatherHeight: { value: null },
    weatherBounds: { value: new Vector4(0, 0, 1, 1) },
    weatherSize: { value: new Vector2(2, 2) },
    weatherRange: { value: new Vector2(0, 1) },
    weatherReady: { value: 0 },
    cloudCoverage: { value: coverageTexture() },
    cloudOffset: { value: new Vector2() },
    cloudBaseM: { value: 1500 },
    cloudCoverageAmount: { value: 0 },
    cloudSunDirection: { value: new Vector3(0, 1, 0) },
    cloudOrigin: { value: new Vector2() },
    cloudTileMeters: { value: COVERAGE_TILE_METERS },
    cloudShadowEnabled: { value: 1 },
    cloudGroundShadow: { value: null },
    cloudGroundShadowBounds: { value: new Vector4(0, 0, 1, 1) },
    cloudGroundShadowReady: { value: 0 },
    cloudGroundShadowStrength: { value: 0.5 },
  };
  return { ...shadowSingleton };
}

export function updateCloudShadowUniforms(
  uniforms: Record<string, { value: unknown }>,
  state: CloudUniformState,
): void {
  const u = uniforms as CloudShadowUniforms;
  u.cloudOffset.value.set(state.offset.x, state.offset.z);
  u.cloudOrigin.value.set(state.origin.x, state.origin.z);
  u.cloudSunDirection.value.copy(state.sunDirection);
  u.cloudBaseM.value = state.layer?.baseM ?? 0;
  u.cloudCoverageAmount.value = state.layer?.coverage ?? 0;
  u.cloudTileMeters.value = COVERAGE_TILE_METERS;
  if (state.appearance !== 'sunshine' || !state.layer) u.cloudGroundShadowReady.value = 0;
  u.cloudGroundShadowStrength.value = state.layer?.type === 'stratus' ? 0.25 : 0.5;
  // Sunshine uses its own density atlas, never the unrelated legacy noise.
  u.cloudShadowEnabled.value = state.appearance === 'sunshine' ? 0 : 1;
  u.weatherHeight.value = state.terrain?.texture ?? null;
  u.weatherReady.value = state.terrain ? 1 : 0;
  if (state.terrain) {
    u.weatherBounds.value.copy(state.terrain.bounds);
    u.weatherSize.value.copy(state.terrain.size);
    u.weatherRange.value.set(state.terrain.min, state.terrain.max);
  }
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * ShaderMaterial sources are compiled as `#version 300 es` by three on WebGL2 (it defines
 * `varying` and `gl_FragColor` for us), so a uniform loop bound and `sampler3D` are legal
 * here even though the source reads like GLSL 1.
 */
export const MARCH_FRAGMENT = /* glsl */ `
precision highp float;
precision highp sampler3D;

varying vec2 vUv;

uniform sampler2D tDepth;
uniform sampler3D cloudVolume;
uniform sampler3D cloudShape;
uniform float cloudEvolution;
uniform float cloudHasDepth;
uniform float cameraFar;
uniform mat4 inverseProjection;
uniform mat4 cameraWorld;
uniform vec3 rayOrigin;
uniform int cloudSteps;
uniform float cloudJitter;
layout(location = 1) out vec4 weatherRayData;
uniform float cloudTopM;
uniform float cloudDensity;
uniform float cloudStratus;
uniform float cloudTower;
uniform float cloudWeatherBrightness;
uniform vec2 cirrusOffset;
uniform float cloudMarch;
uniform float groundFog;
uniform float cloudSolid;
uniform sampler2D fogHeight;
uniform vec4 fogBounds;
uniform vec2 fogSize;
uniform vec2 fogRange;
uniform float cloudDetailMeters;
uniform float cirrusBaseM;
uniform float cirrusCoverage;
uniform float cirrusDensity;
uniform vec3 cloudSunColor;
uniform vec3 cloudZenithColor;
uniform vec3 cloudGroundColor;
uniform float cloudSunStrength;
uniform float cloudAmbientStrength;
uniform vec3 cloudFogColor;
uniform float cloudFogNear;
uniform float cloudFogFar;

${SHADOW_CHUNK}

const float EXTINCTION = 0.0025;
const float PI = 3.141592653589793;
/** Past this the steps are too long to resolve anything; the fog has swallowed it anyway. */
const float MAX_MARCH_M = 60000.0;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float henyeyGreenstein(float cosTheta, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(max(1e-3, 1.0 + g2 - 2.0 * g * cosTheta), 1.5));
}
/** Mirrors layerHeightGradient: cumulus round off at both ends, stratus fill the slab. */
float heightGradient(float altitude) {
  float h = (altitude - cloudBaseM) / max(1.0, cloudTopM - cloudBaseM);
  if (h <= 0.0 || h >= 1.0) return 0.0;
  if (cloudStratus > 0.5) return min(1.0, min(h, 1.0 - h) / 0.15);
  return min(1.0, h / 0.2) * min(1.0, (1.0 - h) / 0.35);
}
// Broad shape is shared by the camera and light rays. Fine erosion does not
// punch tiny shadow cavities into the body. All coordinates remain world anchored.
vec3 cloudCoordinates(vec3 p) {
  vec3 uvw = (p + vec3(cloudOffset.x, 0.0, cloudOffset.y)) / cloudDetailMeters;
  // Smooth, bounded domain deformation; no texture regeneration or frame clock.
  vec3 wave = sin(uvw.yzx * 6.2831853 + vec3(0.0, 2.1, 4.2) + cloudEvolution);
  return uvw + wave * mix(0.055, 0.015, cloudStratus);
}
float bodyDensity(vec3 p, vec3 uvw) {
  vec2 ground = cloudGroundAt(p.xz);
  if (ground.y < 0.5) return 0.0;
  float agl = p.y - ground.x;
  float h = (agl - cloudBaseM) / max(1.0, cloudTopM - cloudBaseM);
  if (h <= 0.0 || h >= 1.0) return 0.0;
  float shaped = cloudShaped(cloudCoverageAt(p.xz), cloudCoverageAmount);
  if (shaped <= 0.0) return 0.0;
  vec3 shapeUVW = uvw;
  // Tall storms must not repeat the same noise slice every 3 km of altitude.
  shapeUVW += cloudTower * vec3(uvw.y * 0.13, -uvw.y * 0.6, -uvw.y * 0.17);
  float billow = texture(cloudShape, shapeUVW).r;
  // Rounded variable tops over a flatter condensation base. Stratus retains its
  // filled slab instead of inheriting the cumulus towers.
  float cap = mix(0.62, 1.0, smoothstep(0.12, 0.72, billow));
  float cumulus = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(cap - 0.24, cap, h));
  if (cloudTower > 0.5) {
    // Wide columns set coherent tower heights, independent of the small 3D lobes.
    vec2 columnXZ = (p.xz + cloudOffset) / cloudDetailMeters * 0.45;
    float column = texture(cloudShape, vec3(columnXZ.x, 0.37, columnXZ.y)).r;
    float towerCap = mix(0.48, 1.0, smoothstep(0.12, 0.65, column));
    towerCap = mix(towerCap, max(towerCap, 0.91), smoothstep(0.18, 0.55, column));
    float crown = 1.0 - smoothstep(towerCap - 0.16, towerCap, h);
    float tower = smoothstep(0.0, 0.025, h) * crown;
    // The upper outflow spreads within the weather envelope, with a flat cap.
    float anvil = smoothstep(0.66, 0.81, h) * (1.0 - smoothstep(0.9, 1.0, h));
    cumulus = max(tower, anvil * smoothstep(0.18, 0.55, column));
    shaped = mix(shaped, sqrt(shaped), anvil * 0.65);
  }
  float profile = mix(cumulus, heightGradient(agl), cloudStratus);
  return shaped * profile * mix(0.75 + billow * 0.85, 0.92 + billow * 0.16, cloudStratus);
}
float coarseDensity(vec3 p) {
  if (p.y <= weatherRange.x + cloudBaseM || p.y >= weatherRange.y + cloudTopM) return 0.0;
  return bodyDensity(p, cloudCoordinates(p)) * cloudDensity;
}
float densityAt(vec3 p, float footprint) {
  if (p.y <= weatherRange.x + cloudBaseM || p.y >= weatherRange.y + cloudTopM) return 0.0;
  vec3 uvw = cloudCoordinates(p);
  float body = bodyDensity(p, uvw);
  if (body <= 0.0) return 0.0;
  // Dense cores stay intact. Fade unresolved erosion instead of aliasing it into
  // dimples on long horizon rays. Broad shape is still sampled by both marches.
  float edge = 1.0 - smoothstep(0.12, 0.45, body);
  float resolved = 1.0 - smoothstep(100.0, 450.0, footprint);
  float detail = texture(cloudVolume, uvw * 1.7 + vec3(0.0, sin(cloudEvolution) * 0.025, 0.0)).r;
  float erosion = (1.0 - detail) * 0.07 * edge * resolved;
  return max(0.0, body - erosion) * cloudDensity;
}
float lightOpticalDepth(vec3 p) {
  // Follow the actual light-facing slab exit, with a bounded grazing-ray range.
  float dy = cloudSunDirection.y;
  float exitDistance = dy >= 0.0 ? weatherRange.y + cloudTopM - p.y : p.y - weatherRange.x - cloudBaseM;
  float span = min(20000.0, max(0.0, exitDistance) / max(0.001, abs(dy)));
  float tau = 0.0;
  float previous = 0.0;
  int count = cloudTower > 0.5 ? 12 : LIGHT_STEPS;
  for (int i = 0; i < 12; i++) {
    if (i >= count) break;
    float f = float(i + 1) / float(count);
    float end = span * f * f;
    float width = end - previous;
    tau += coarseDensity(p + cloudSunDirection * (previous + width * 0.5)) * width;
    previous = end;
  }
  return tau * EXTINCTION;
}
float skyOpticalDepth(vec3 p) {
  vec2 ground = cloudGroundAt(p.xz);
  float span = max(0.0, ground.x + cloudTopM - p.y);
  float tau = 0.0;
  for (int i = 0; i < 4; i++)
    tau += coarseDensity(p + vec3(0.0, span * (float(i) + 0.5) / 4.0, 0.0));
  return tau * span * 0.25 * EXTINCTION;
}
float fogAmount(float distanceM) {
  return clamp((distanceM - cloudFogNear) / max(1.0, cloudFogFar - cloudFogNear), 0.0, 1.0);
}

${SUNSHINE_GLSL}

float fogSigma(vec3 p) {
  if (groundFog < 0.5) return 0.0;
  vec2 ground = sampleWeatherHeight(fogHeight, fogBounds, fogSize, fogRange, p.xz);
  if (ground.y < 0.5) return 0.0;
  float agl = p.y - ground.x;
  if (agl < 0.0 || agl >= ${FOG_TOP_AGL_M}) return 0.0;
  return (1.0 - smoothstep(${FOG_FULL_AGL_M}, ${FOG_TOP_AGL_M}, agl)) * ${FOG_EXTINCTION};
}
vec2 slabInterval(vec3 ro, vec3 dir, float base, float top, float range) {
  if (abs(dir.y) < 1e-5) return ro.y >= base && ro.y <= top ? vec2(0.0, range) : vec2(range, range);
  float a = (base - ro.y) / dir.y;
  float b = (top - ro.y) / dir.y;
  return vec2(clamp(min(a,b), 0.0, range), clamp(max(a,b), 0.0, range));
}

void integrateMedium(vec3 ro, vec3 dir, float start, float end, float jitter,
                     vec2 cloudSpan, vec2 fogSpan, float phase,
                     inout vec3 scatter, inout float transmittance) {
    float stepM = end - start;
    float t = start + stepM * jitter;
    vec3 p = ro + dir * t;
    float d = t >= cloudSpan.x && t < cloudSpan.y ? densityAt(p, stepM) : 0.0;
    float fog = t >= fogSpan.x && t < fogSpan.y ? fogSigma(p) * (1.0 - smoothstep(6000.0, 8000.0, t)) : 0.0;
    float sigma = d * EXTINCTION + fog;
    if (sigma > 0.0 && stepM > 0.0) {
      vec3 lum = vec3(0.0);
      if (d > 0.0) {
        float sunTau = lightOpticalDepth(p);
        float skyTau = skyOpticalDepth(p);
        float direct = exp(-sunTau);
        float multiple = 0.12 * exp(-sunTau * 0.25);
        float skyVisibility = exp(-skyTau * 0.65);
        vec3 ambient = (cloudZenithColor * (0.12 + 0.38 * skyVisibility) +
                        cloudGroundColor * 0.1) * cloudAmbientStrength;
        lum = cloudSunColor * cloudSunStrength *
              (direct * (0.24 + phase * 0.7) + multiple) + ambient;
        lum *= cloudWeatherBrightness;
        lum = mix(lum, cloudFogColor, fogAmount(t));
      }
      lum = (lum * d * EXTINCTION + cloudFogColor * fog) / sigma;
      float sampleT = exp(-sigma * stepM);
      scatter += transmittance * (1.0 - sampleT) * lum;
      transmittance *= sampleT;

    }
}

void main() {
  weatherRayData = vec4(0.0);
  vec4 clip = vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec4 view = inverseProjection * clip;
  vec3 viewDir = normalize(view.xyz / view.w);
  vec3 dir = normalize((cameraWorld * vec4(viewDir, 0.0)).xyz);
  // Stored log depth is along the view axis, not along the ray.
  float forward = max(1e-4, -viewDir.z);

  float sceneDistance = sunshineMode > 0.5 ? 180000.0 : MAX_MARCH_M;
  if (cloudHasDepth > 0.5) {
    float d = texture2D(tDepth, vUv).x;
    // A cleared depth of 1 is sky; anything else is w = (far + 1)^d - 1.
    if (d < 1.0) sceneDistance = (pow(cameraFar + 1.0, d) - 1.0) / forward;
  }

  vec3 ro = vec3(rayOrigin.x + cloudOrigin.x, rayOrigin.y, rayOrigin.z + cloudOrigin.y);
  float cosSun = dot(dir, cloudSunDirection);
  // Dual lobe: a forward lobe for the silver lining, a weak back lobe for the rest.
  float phase = mix(henyeyGreenstein(cosSun, 0.7), henyeyGreenstein(cosSun, -0.2), 0.4) * 4.0;

  vec3 scatter = vec3(0.0);
  float transmittance = 1.0;

  // Cirrus: an analytic sheet sampled once, on a stretched tile so it does not repeat the
  // cumulus pattern. Composited in ray order relative to the marched slab.
  float cirrusT = -1.0;
  vec4 cirrus = vec4(0.0);
  if (cirrusCoverage > 0.0 && abs(dir.y) > 1e-3) {
    float t = (cirrusBaseM - ro.y) / dir.y;
    if (t > 0.0 && t < sceneDistance) {
      // High ice-cloud filaments: long along the wind-independent authored axis,
      // narrow across it, gently curled by a broad coverage field. No cumulus lobes.
      vec2 ice = (ro.xz + dir.xz * t + cirrusOffset) / cloudTileMeters;
      float bend = texture2D(cloudCoverage, ice * 0.7).r - 0.5;
      vec2 streakUV = vec2(ice.x * 0.22, ice.y * 2.2 + ice.x * 0.35 + bend * 0.14);
      float strands = texture2D(cloudCoverage, streakUV).r;
      float wisps = texture2D(cloudCoverage, streakUV * vec2(0.7, 2.3)).r;
      float iceEnvelope = smoothstep(0.25, 0.65, texture2D(cloudCoverage, ice * 0.55).r);
      float shaped = cloudShaped(strands, cirrusCoverage) * smoothstep(0.12, 0.8, wisps) * iceEnvelope;
      // Grazing rays cross more of the sheet, so it thickens toward the horizon.
      float slant = 1.0 / max(0.2, abs(dir.y));
      float alpha = 1.0 - exp(-shaped * cirrusDensity * 4.0 * slant);
      vec3 lit =
        mix(cloudZenithColor * cloudAmbientStrength, cloudSunColor * cloudSunStrength, 0.65) *
        (0.7 + 0.3 * min(phase, 2.0));
      cirrus = vec4(mix(lit, cloudFogColor, fogAmount(t)), alpha);
      cirrusT = t;
    }
  }

  if (sunshineMode > 0.5 && cloudMarch > 0.5) {
    vec4 cloudData;
    vec4 cloud = sunshineMarch(ro, dir, sceneDistance, cloudData);
    float cloudT = cloudData.b;
    if (cloud.a < 0.001 && cirrusT >= 0.0 && cirrus.a > 0.001) cloudData.rgb = vec3(cirrusT);
    weatherRayData = vec4(cloudData.rgb / 1000.0, cloudHasDepth > 0.5 ? texture2D(tDepth,vUv).r : 1.0);
    // A single history depth cannot correctly reproject two translucent layers.
    // Keep analytic cirrus fresh wherever it materially overlaps the cloud.
    if (cirrusT >= 0.0 && cloud.a > 0.001 &&
        cirrus.a * (cirrusT < cloudT ? 1.0 : 1.0-cloud.a) > 0.001) weatherRayData.a = -1.0;
    // Cloud reconstruction has a representative depth, as in Sunshine's post
    // pass. Retained cirrus and terrain fog are composed around that depth.
    float limit = sceneDistance;
    vec2 fogSpan = groundFog > 0.5 ?
      slabInterval(ro,dir,fogRange.x,fogRange.y+${FOG_TOP_AGL_M},min(limit,8000.0)) : vec2(0.0);
    bool cloudDone = false;
    bool cirrusDone = cirrusT < 0.0;
    float cursor = 0.0;
    for (int j=0;j<67;j++) {
      float nextFog = j < 64 ? mix(fogSpan.x,fogSpan.y,float(j+1)/64.0) : limit;
      // Process both layer events in order before the next fog boundary.
      for (int event=0;event<2;event++) {
        float nextCloud = cloudDone ? limit+1.0 : cloudT;
        float nextCirrus = cirrusDone ? limit+1.0 : cirrusT;
        float layerT = min(nextCloud,nextCirrus);
        if (layerT > nextFog) break;
        integrateMedium(ro,dir,max(cursor,fogSpan.x),min(layerT,fogSpan.y),0.5,
          vec2(0.0),fogSpan,phase,scatter,transmittance);
        cursor = max(cursor,layerT);
        if (nextCloud <= nextCirrus) {
          scatter += transmittance * cloud.rgb * cloud.a;
          transmittance *= 1.0-cloud.a;
          cloudDone = true;
        } else {
          scatter += transmittance * cirrus.rgb * cirrus.a;
          transmittance *= 1.0-cirrus.a;
          cirrusDone = true;
        }
      }
      integrateMedium(ro,dir,max(cursor,fogSpan.x),min(nextFog,fogSpan.y),0.5,
        vec2(0.0),fogSpan,phase,scatter,transmittance);
      cursor = max(cursor,nextFog);
      if (cloudDone && cirrusDone && cursor >= fogSpan.y) break;
    }
    gl_FragColor = vec4(scatter,transmittance);
    return;
  }

  float limit = min(sceneDistance, MAX_MARCH_M);
  vec2 cloudSpan = vec2(limit);
  if (cloudMarch > 0.5)
    cloudSpan = slabInterval(ro, dir, weatherRange.x + cloudBaseM, weatherRange.y + cloudTopM, limit);
  vec2 fogSpan = vec2(limit);
  if (groundFog > 0.5)
    fogSpan = slabInterval(ro, dir, fogRange.x, fogRange.y + ${FOG_TOP_AGL_M}, min(limit, 8000.0));
  float enter = min(cloudSpan.x, fogSpan.x);
  bool cirrusFirst = cirrusT >= 0.0 && cirrusT <= enter;
  if (cirrusFirst) {
    scatter += transmittance * cirrus.a * cirrus.rgb;
    transmittance *= 1.0 - cirrus.a;
  }

  // Merge the cloud and thin-fog sample intervals in ray order. Fog behind a
  // nearby cloud must never be painted on top; thin fog gets its own 64 segments.
  int count = cloudTower > 0.5 ? max(cloudSteps, 80) : cloudSteps;
  int ci = 0;
  int fi = 0;
  float start = enter;
  // A density isosurface supplies the exterior, using the same world field as
  // the interior. Fade it out near entry and whenever the camera is immersed.
  float exterior = cloudSolid * (1.0 - smoothstep(0.015, 0.10, coarseDensity(ro)));
  bool surfaceSeen = false;

  for (int i = 0; i < count + 68; i++) {
    float cloudEnd = limit;
    float fogEnd = limit;
    if (cloudSpan.y > cloudSpan.x && ci < count) {
      float f = float(ci + 1) / float(count);
      cloudEnd = start < cloudSpan.x ? cloudSpan.x : mix(cloudSpan.x, cloudSpan.y, f * f);
    }
    if (fogSpan.y > fogSpan.x && fi < 64) {
      float f = float(fi + 1) / 64.0;
      fogEnd = start < fogSpan.x ? fogSpan.x : mix(fogSpan.x, fogSpan.y, f * f);
    }
    float end = min(cloudEnd, fogEnd);
    float jitter = mix(0.5, hash12(gl_FragCoord.xy + float(i) * vec2(17.0, 31.0)), cloudJitter * 0.65);
    float hitT = end;
    float surfaceAlpha = 0.0;
    if (!surfaceSeen && exterior > 0.0 && end > cloudSpan.x && start < cloudSpan.y) {
      // Bracket within the unintegrated cell, never in a cell already composited.
      float lo = max(start, cloudSpan.x);
      float hi = min(end, cloudSpan.y);
      float mid = (lo + hi) * 0.5;
      bool atStart = coarseDensity(ro + dir * lo) >= 0.10;
      bool atMid = coarseDensity(ro + dir * mid) >= 0.10;
      bool atEnd = coarseDensity(ro + dir * hi) >= 0.10;
      if (atStart || atMid || atEnd) {
        surfaceSeen = true;
        if (atStart) hi = lo;
        else {
          if (atMid) hi = mid;
          else lo = mid;
          for (int refine = 0; refine < 7; refine++) {
            float probe = (lo + hi) * 0.5;
            if (coarseDensity(ro + dir * probe) >= 0.10) hi = probe;
            else lo = probe;
          }
        }
        hitT = hi;
        surfaceAlpha = exterior * smoothstep(80.0, 350.0, hitT);
      }
    }
    vec3 surfacePoint = ro + dir * hitT;
    integrateMedium(ro, dir, start, hitT, jitter, cloudSpan, fogSpan, phase, scatter, transmittance);
    if (surfaceAlpha > 0.0) {
      const float e = 60.0;
      vec3 gradient = vec3(
        coarseDensity(surfacePoint + vec3(e,0,0)) - coarseDensity(surfacePoint - vec3(e,0,0)),
        coarseDensity(surfacePoint + vec3(0,e,0)) - coarseDensity(surfacePoint - vec3(0,e,0)),
        coarseDensity(surfacePoint + vec3(0,0,e)) - coarseDensity(surfacePoint - vec3(0,0,e)));
      vec3 normal = length(gradient) > 0.00001 ? -normalize(gradient) : -dir;
      float sun = max(0.0, dot(normal, cloudSunDirection));
      float sky = smoothstep(-0.6, 0.8, normal.y);
      vec3 face = cloudSunColor * cloudSunStrength *
        (0.15 + 0.85 * sun) * exp(-lightOpticalDepth(surfacePoint) * 0.35)
        + (cloudZenithColor * mix(0.12, 0.5, sky) + cloudGroundColor * 0.1) * cloudAmbientStrength;
      face *= cloudWeatherBrightness;
      face = mix(face, cloudFogColor, fogAmount(length(surfacePoint - ro)));
      scatter += transmittance * surfaceAlpha * face;
      transmittance *= 1.0 - surfaceAlpha;
      if (transmittance < 0.01) break;
    }
    if (hitT < end)
      integrateMedium(ro, dir, hitT, end, jitter, cloudSpan, fogSpan, phase, scatter, transmittance);
    if (transmittance < 0.01) break;
    if (end > cloudSpan.x && end == cloudEnd) ci++;
    if (end > fogSpan.x && end == fogEnd) fi++;
    start = end;
    if (start >= max(cloudSpan.y, fogSpan.y)) break;
  }

  if (cirrusT >= 0.0 && !cirrusFirst) {
    scatter += transmittance * cirrus.a * cirrus.rgb;
    transmittance *= 1.0 - cirrus.a;
  }

  gl_FragColor = vec4(scatter, transmittance);
}
`;

/**
 * Depth-aware upsample. The march runs at a fraction of the screen, and each of its
 * texels stopped at whatever the scene depth was under its own centre. A plain bilinear
 * read blends across that: on the pixels covering the aircraft, where the march was
 * stopped at the canopy and contributed nothing, it mixes in neighbouring texels that
 * marched right past the aircraft into the cloud deck behind it. That is the bright
 * fringe that makes the aircraft look fuzzy whenever cloud renders behind it.
 *
 * So where the four surrounding low-resolution texels disagree about depth -- a
 * silhouette -- take the one whose depth matches this pixel instead of the blend. Away
 * from silhouettes every tap agrees and the smoother bilinear result is kept, so this
 * costs nothing in the interior and does not sharpen the clouds themselves. Cloud in
 * front of the aircraft is unaffected: there the march never reached the aircraft
 * depth, every tap agrees, and the aircraft is correctly obscured.
 */
const COMPOSITE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tClouds;
uniform sampler2D tDepth;
uniform vec2 cloudTexel;
uniform vec2 fullTexel;
uniform float sunshineMode;
${SUNSHINE_RECONSTRUCTION}
uniform float cloudHasDepth;

/**
 * Logarithmic depth, so this is a ratio of view distances rather than metres: 0.02 of
 * the [0,1] range is about a 9% step at any distance. Small enough to catch an aircraft
 * against a cloud deck, large enough that a lit terrain slope does not trip it.
 */
const float DEPTH_EDGE = 0.02;

void main() {
  vec3 scene = texture2D(tDiffuse, vUv).rgb;
  vec4 cloud = texture2D(tClouds, vUv);
  if (sunshineMode > 0.5) {
    vec2 res = 1.0 / cloudTexel;
    cloud = texture2D_bicubic(tClouds,vUv,res);
    cloud += texture2D_bicubic(tClouds,vUv+vec2(2.0*fullTexel.x,0),res);
    cloud += texture2D_bicubic(tClouds,vUv-vec2(2.0*fullTexel.x,0),res);
    cloud += texture2D_bicubic(tClouds,vUv+vec2(0,2.0*fullTexel.y),res);
    cloud += texture2D_bicubic(tClouds,vUv-vec2(0,2.0*fullTexel.y),res);
    cloud *= 0.2;
  }
  if (cloudHasDepth > 0.5) {
    float here = texture2D(tDepth, vUv).x;
    vec2 base = floor(vUv / cloudTexel - 0.5) + 0.5;
    float nearest = 1e20;
    float furthest = 0.0;
    vec4 matched = cloud;
    for (int i = 0; i < 4; i++) {
      vec2 tap = (base + vec2(float(i - 2 * (i / 2)), float(i / 2))) * cloudTexel;
      float delta = abs(texture2D(tDepth, tap).x - here);
      furthest = max(furthest, delta);
      if (delta < nearest) {
        nearest = delta;
        matched = texture2D(tClouds, tap);
      }
    }
    if (sunshineMode > 0.5)
      for (int y=-2;y<=2;y++) for (int x=-2;x<=2;x++)
        furthest = max(furthest, abs(texture2D(tDepth,vUv+vec2(float(x),float(y))*cloudTexel).r-here));
    if (furthest > DEPTH_EDGE) cloud = matched;
  }
  gl_FragColor = vec4(scene * cloud.a + cloud.rgb, 1.0);
}
`;

export class CloudPass extends Pass {
  static readonly SHADOW_CHUNK = SHADOW_CHUNK;
  private readonly camera: PerspectiveCamera;
  private readonly shadowUniforms = createCloudShadowUniforms();
  private readonly marchMaterial: ShaderMaterial;
  private readonly compositeMaterial: ShaderMaterial;
  private readonly quad = new FullScreenQuad();
  private readonly target: WebGLRenderTarget;
  private width = 1;
  private height = 1;
  private lowWidth = 1;
  private lowHeight = 1;
  private byteEstimate = 0;
  private currentQuality: CloudQuality = 'half';
  private currentSteps = 40;
  private sunshineTextures: SunshineTextures | undefined;
  private sunshineLoad: Promise<void> | undefined;
  private disposed = false;
  private readonly historyTargets: WebGLRenderTarget[];
  private readonly historyMaterial: ShaderMaterial;
  private historyIndex = 0;
  private historyValid = false;
  private historyKey = '';
  private readonly previousPosition = new Vector3();
  private readonly previousProjection = new Matrix4();

  private groundShadowTarget: WebGLRenderTarget | undefined;
  private groundShadowMaterial: ShaderMaterial | undefined;
  private lastGroundShadow = -Infinity;
  private secondaryViews = new Map<PerspectiveCamera, CloudPass>();

  /** A separate camera/history/depth pass, sharing only immutable noise textures. */
  renderSecondary(
    renderer: WebGLRenderer,
    camera: PerspectiveCamera,
    output: WebGLRenderTarget,
    input: WebGLRenderTarget,
  ): void {
    let view = this.secondaryViews.get(camera);
    if (!view) {
      view = new CloudPass(camera, this.highPrecision);
      this.secondaryViews.set(camera, view);
    }
    if (view.quality !== this.currentQuality) view.quality = this.currentQuality;
    view.steps = this.currentSteps;
    for (const [name, uniform] of Object.entries(this.marchMaterial.uniforms)) {
      const value: unknown = uniform.value;
      view.marchMaterial.uniforms[name]!.value =
        value instanceof Vector2 ||
        value instanceof Vector3 ||
        value instanceof Vector4 ||
        value instanceof Matrix4 ||
        value instanceof Color
          ? value.clone()
          : value;
    }
    if (
      view.width !== input.width ||
      view.height !== input.height ||
      view.lowWidth !== Math.max(1, Math.ceil(input.width * view.scale)) ||
      view.lowHeight !== Math.max(1, Math.ceil(input.height * view.scale))
    )
      view.setSize(input.width, input.height);
    if (view.historyKey !== this.historyKey) view.historyValid = false;
    view.historyKey = this.historyKey;
    view.render(renderer, output, input, 0, false);
  }

  /** Sample the actual Sunshine density along sunlight before rendering the scene. */
  renderGroundShadows(renderer: WebGLRenderer): void {
    const u = this.marchMaterial.uniforms;
    const shadow = this.shadowUniforms;
    if (u.sunshineMode!.value !== 1 || !this.enabled || u.cloudCoverageAmount!.value <= 0) {
      shadow.cloudGroundShadowReady!.value = 0;
      return;
    }
    if (performance.now() - this.lastGroundShadow < 250) return;
    this.groundShadowTarget ??= new WebGLRenderTarget(256, 256, { depthBuffer: false });
    this.groundShadowMaterial ??= new ShaderMaterial({
      uniforms: u,
      defines: { LIGHT_STEPS },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:
        MARCH_FRAGMENT.slice(0, MARCH_FRAGMENT.indexOf('void main()')) +
        `
      void main() {
        vec2 xz = cloudGroundShadowBounds.xy + vUv * cloudGroundShadowBounds.zw;
        vec2 ground = cloudGroundAt(xz);
        if (ground.y < .5 || cloudSunDirection.y < .05) { gl_FragColor=vec4(1.); return; }
        vec3 ro=vec3(xz.x,ground.x,xz.y);
        float begin=max(0.,(weatherRange.x+cloudBaseM-ro.y)/cloudSunDirection.y);
        float end=max(begin,(weatherRange.y+cloudTopM-ro.y)/cloudSunDirection.y);
        float stepLength=(end-begin)/32.;
        vec3 extra=vec3(sunshineOffset.x,0.,sunshineOffset.y);
        vec3 small=extra*(12./140.);
        small.y=sunshineTime/15.111*.25*sunshineScale;
        float optical=0.;
        for(int i=0;i<32;i++) {
          vec3 p=ro+cloudSunDirection*(begin+(float(i)+.5)*stepLength);
          float mask=texture(extra_large_noise,(p.xz-extra.xz)/(320000.*sunshineScale)).a;
          float d=sampleScene(extra*(100./140.),extra*(40./140.),small,p,cloudTopM,cloudBaseM,
            mask,120000.*sunshineScale,20000.*sunshineScale,8500.*sunshineScale,
            sunshineCoverage*1.01,1.075,4500.*sunshineScale,1.,false);
          optical+=pow(d*sunshineDensity,.508)*stepLength/(500.*sunshineScale);
        }
        float light=1.-cloudGroundShadowStrength*(1.-exp(-optical));
        gl_FragColor=vec4(vec3(light),1.);
      }`,
      depthTest: false,
      depthWrite: false,
    });
    const origin = shadow.cloudOrigin!.value as Vector2;
    // Snap the atlas to its texels so camera movement does not make shadows swim.
    (shadow.cloudGroundShadowBounds!.value as Vector4).set(
      Math.floor((this.camera.position.x + origin.x) / 250) * 250 - 32000,
      Math.floor((this.camera.position.z + origin.y) / 250) * 250 - 32000,
      64000,
      64000,
    );
    const previous = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(this.groundShadowTarget);
      this.quad.material = this.groundShadowMaterial;
      this.quad.render(renderer);
    } finally {
      renderer.setRenderTarget(previous);
    }
    shadow.cloudGroundShadow!.value = this.groundShadowTarget.texture;
    shadow.cloudGroundShadowReady!.value = 1;
    this.lastGroundShadow = performance.now();
  }

  loadSunshine(read: Parameters<typeof loadSunshineTextures>[0]): Promise<void> {
    this.sunshineLoad ??= loadSunshineTextures(read).then((textures) => {
      if (this.disposed) {
        Object.values(textures).forEach((texture) => texture.dispose());
        return;
      }
      this.sunshineTextures = textures;
      const mapping = {
        coverage: 'extra_large_noise',
        large: 'large_noise',
        medium: 'noise_medium',
        small: 'noise_small',
        curl: 'curl_noise',
        height: 'heightmask',
        dither: 'dither_small',
      } as const;
      for (const name of Object.keys(mapping) as (keyof typeof mapping)[])
        this.marchMaterial.uniforms[mapping[name]]!.value = textures[name];
      this.historyValid = false;
    });
    return this.sunshineLoad;
  }

  constructor(
    camera: PerspectiveCamera,
    private readonly highPrecision = true,
  ) {
    super();
    this.camera = camera;
    this.marchMaterial = new ShaderMaterial({
      defines: { LIGHT_STEPS: LIGHT_STEPS },
      uniforms: {
        ...this.shadowUniforms,
        extra_large_noise: { value: null },
        large_noise: { value: null },
        noise_medium: { value: null },
        noise_small: { value: null },
        curl_noise: { value: null },
        dither_small: { value: null },
        heightmask: { value: null },
        sunshineMode: { value: 0 },
        sunshineTime: { value: 0 },
        sunshineScale: { value: 1 },
        sunshineCoverage: { value: 0.874 },
        sunshineDensity: { value: 0.14 },
        sunshineWind: { value: new Vector2(1, 1).normalize() },
        sunshineSteps: { value: 300 },
        sunshineLightSteps: { value: 32 },
        sunshineOffset: { value: new Vector2() },
        tDepth: { value: null },
        cloudVolume: { value: null },
        cloudShape: { value: null },
        cloudEvolution: { value: 0 },
        cloudHasDepth: { value: 0 },
        cameraFar: { value: camera.far },
        inverseProjection: { value: camera.projectionMatrixInverse.clone() },
        cameraWorld: { value: camera.matrixWorld.clone() },
        rayOrigin: { value: new Vector3() },
        cloudSteps: { value: this.currentSteps },
        cloudJitter: { value: 1 },
        cloudTopM: { value: 2600 },
        cloudDensity: { value: 0 },
        cloudStratus: { value: 0 },
        cloudTower: { value: 0 },
        cloudWeatherBrightness: { value: 1 },
        cirrusOffset: { value: new Vector2() },
        cloudMarch: { value: 0 },
        groundFog: { value: 0 },
        cloudSolid: { value: 0 },
        fogHeight: { value: null },
        fogBounds: { value: new Vector4(0, 0, 1, 1) },
        fogSize: { value: new Vector2(2, 2) },
        fogRange: { value: new Vector2(0, 1) },
        cloudDetailMeters: { value: DETAIL_TILE_METERS },
        cirrusBaseM: { value: 9000 },
        cirrusCoverage: { value: 0 },
        cirrusDensity: { value: 0 },
        cloudSunColor: { value: new Color(1, 1, 1) },
        cloudZenithColor: { value: new Color(0.3, 0.45, 0.7) },
        cloudGroundColor: { value: new Color(0.25, 0.25, 0.24) },
        cloudSunStrength: { value: 1 },
        cloudAmbientStrength: { value: 1 },
        cloudFogColor: { value: new Color(0x91b1c8) },
        cloudFogNear: { value: 80000 },
        cloudFogFar: { value: 180000 },
      },
      vertexShader: VERTEX,
      fragmentShader: MARCH_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.compositeMaterial = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tClouds: { value: null },
        tDepth: { value: null },
        cloudTexel: { value: new Vector2(1, 1) },
        fullTexel: { value: new Vector2(1, 1) },
        sunshineMode: { value: 0 },
        cloudHasDepth: { value: 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.target = new WebGLRenderTarget(1, 1, {
      count: 2,
      type: highPrecision ? HalfFloatType : UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
    });
    this.historyTargets = [this.target.clone(), this.target.clone()];
    this.historyMaterial = new ShaderMaterial({
      uniforms: {
        currentColor: { value: null },
        currentData: { value: null },
        previousColor: { value: null },
        previousData: { value: null },
        inverseProjection: { value: new Matrix4() },
        cameraWorld: { value: new Matrix4() },
        previousViewProjection: { value: new Matrix4() },
        worldCamera: { value: new Vector3() },
        previousOrigin: { value: new Vector2() },
        texel: { value: new Vector2() },
        validHistory: { value: 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: SUNSHINE_HISTORY,
      depthTest: false,
      depthWrite: false,
    });
    this.quality = 'half';
  }

  get quality(): CloudQuality {
    return this.currentQuality;
  }
  set quality(value: CloudQuality) {
    this.currentQuality = value;
    this.enabled = value !== 'off' || this.marchMaterial.uniforms.groundFog!.value === 1;
    this.resizeTarget();
  }
  get steps(): number {
    return this.currentSteps;
  }
  set steps(value: number) {
    this.currentSteps = value;
    this.marchMaterial.uniforms.cloudSteps!.value = value;
  }
  /** Jitter amplitude in steps; reducible if the low-resolution march looks noisy. */
  get jitter(): number {
    return this.marchMaterial.uniforms.cloudJitter!.value as number;
  }
  set jitter(value: number) {
    this.marchMaterial.uniforms.cloudJitter!.value = value;
  }
  get bytes(): number {
    return (
      this.byteEstimate +
      (this.groundShadowTarget ? 256 * 256 * 4 : 0) +
      [...this.secondaryViews.values()].reduce((sum, view) => sum + view.bytes, 0) +
      (this.sunshineTextures
        ? Object.values(this.sunshineTextures).reduce(
            (sum, texture) => sum + (texture.image.data?.byteLength ?? 0),
            0,
          )
        : 0)
    );
  }
  get scale(): number {
    return (
      cloudScaleFor(this.currentQuality) ||
      (this.marchMaterial.uniforms.groundFog!.value === 1 ? 0.5 : 0)
    );
  }
  /** Marched resolution, for the diagnostics panel. */
  get resolution(): { width: number; height: number } {
    return { width: this.lowWidth, height: this.lowHeight };
  }

  override setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.resizeTarget();
  }

  private resizeTarget(): void {
    const scale = this.scale;
    this.lowWidth = Math.max(1, Math.ceil(this.width * scale));
    this.lowHeight = Math.max(1, Math.ceil(this.height * scale));
    this.target.setSize(this.lowWidth, this.lowHeight);
    for (const target of this.historyTargets) target.setSize(this.lowWidth, this.lowHeight);
    this.historyValid = false;
    // Half-float accumulation avoids quantized bands in smooth storm/fog gradients.
    this.byteEstimate =
      scale > 0 ? this.lowWidth * this.lowHeight * (this.highPrecision ? 8 : 4) * 6 : 0;
  }

  update(state: CloudUniformState): void {
    updateCloudShadowUniforms(this.shadowUniforms, state);
    const u = this.marchMaterial.uniforms;
    const layer = state.layer;
    const sunshine = state.appearance === 'sunshine' && Boolean(this.sunshineTextures);
    u.sunshineMode!.value = Number(sunshine);
    u.sunshineTime!.value = state.evolutionSeconds * 15.111;
    u.sunshineCoverage!.value = state.sunshine?.coverage ?? 0.874;
    u.sunshineDensity!.value = state.sunshine?.density ?? 0.14;
    u.sunshineScale!.value = Math.max(
      0.05,
      ((layer?.topM ?? 25000) - (layer?.baseM ?? 1500)) / 23500,
    );
    (u.sunshineOffset!.value as Vector2).set(state.offset.x, state.offset.z);
    (u.sunshineWind!.value as Vector2).set(state.wind?.x ?? 0, state.wind?.z ?? 0).normalize();
    // Sunshine needs its own sample budget; retain 40 as the legacy default,
    // scaling explicit user overrides relative to Sunshine's 300/32 defaults.
    u.sunshineSteps!.value = Math.min(720, Math.round(this.currentSteps * 7.5));
    u.sunshineLightSteps!.value = Math.min(32, Math.max(8, this.currentSteps));
    const key = [
      state.appearance,
      state.sunshine?.coverage,
      state.sunshine?.density,
      layer?.type,
      layer?.baseM,
      layer?.topM,
      layer?.coverage,
      layer?.density,
      state.terrain?.texture.uuid,
      state.fogTerrain?.texture.uuid,
      state.groundFog,
      this.currentQuality,
      this.currentSteps,
      state.sunDirection.x.toFixed(3),
      state.sunDirection.y.toFixed(3),
    ].join('|');
    if (key !== this.historyKey) {
      this.lastGroundShadow = -Infinity;
      this.historyValid = false;
      this.historyKey = key;
    }
    // A full rolling cycle takes about ten minutes; wrapping avoids float drift.
    u.cloudEvolution!.value = (state.evolutionSeconds * 0.01) % (Math.PI * 2);
    u.cloudSolid!.value = Number(state.appearance === 'solid');
    const fogActive = Boolean(state.groundFog && state.fogTerrain);
    if (u.groundFog!.value !== Number(fogActive)) {
      u.groundFog!.value = Number(fogActive);
      this.enabled = this.currentQuality !== 'off' || fogActive;
      this.resizeTarget();
    }
    u.fogHeight!.value = state.fogTerrain?.texture ?? null;
    if (state.fogTerrain) {
      (u.fogBounds!.value as Vector4).copy(state.fogTerrain.bounds);
      (u.fogSize!.value as Vector2).copy(state.fogTerrain.size);
      (u.fogRange!.value as Vector2).set(state.fogTerrain.min, state.fogTerrain.max);
    }
    u.cloudMarch!.value = layer && state.terrain && this.currentQuality !== 'off' ? 1 : 0;
    u.cloudTopM!.value = layer ? layer.topM : 0;
    u.cloudDensity!.value = layer ? layer.density : 0;
    u.cloudStratus!.value = layer?.type === 'stratus' ? 1 : 0;
    u.cloudTower!.value = layer?.type === 'cumulonimbus' ? 1 : 0;
    u.cloudWeatherBrightness!.value = cloudWeatherBrightness(layer?.type);
    (u.cirrusOffset!.value as Vector2).set(state.cirrusOffset.x, state.cirrusOffset.z);
    u.cirrusBaseM!.value = Math.max(
      state.cirrus?.baseM ?? 0,
      layer && state.terrain ? state.terrain.max + layer.topM + 500 : 0,
    );
    u.cirrusCoverage!.value = this.currentQuality === 'off' ? 0 : (state.cirrus?.coverage ?? 0);
    u.cirrusDensity!.value = state.cirrus?.density ?? 0;
    (u.cloudSunColor!.value as Color).copy(state.sunColor);
    (u.cloudZenithColor!.value as Color).copy(state.zenithColor);
    (u.cloudGroundColor!.value as Color).copy(state.groundColor);
    const lighting = cloudLightingFactors(state.sunIntensity, state.ambientIntensity);
    u.cloudSunStrength!.value = lighting.direct;
    u.cloudAmbientStrength!.value = lighting.ambient;
    (u.cloudFogColor!.value as Color).copy(state.fogColor);
    u.cloudFogNear!.value = state.fogNear;
    u.cloudFogFar!.value = state.fogFar;
  }

  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    _deltaTime: number,
    _maskActive: boolean,
  ): void {
    const u = this.marchMaterial.uniforms;
    // The viewer retunes camera.far every 200 ms, so read the camera each frame.
    u.cameraFar!.value = this.camera.far;
    u.inverseProjection!.value = this.camera.projectionMatrixInverse;
    u.cameraWorld!.value = this.camera.matrixWorld;
    (u.rayOrigin!.value as Vector3).setFromMatrixPosition(this.camera.matrixWorld);
    u.cloudVolume!.value = volumeTexture();
    u.cloudShape!.value = volumeTexture(true);
    const depth = readBuffer.depthTexture;
    u.tDepth!.value = depth ?? null;
    // Without a depth attachment the march cannot clip to the terrain, so it would paint
    // cloud over the ground; fall back to sky-only rather than to a wrong picture.
    u.cloudHasDepth!.value = depth ? 1 : 0;

    this.quad.material = this.marchMaterial;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    this.quad.render(renderer);

    let cloudTexture = this.target.texture;
    if (u.sunshineMode!.value === 1 && this.highPrecision) {
      const h = this.historyMaterial.uniforms;
      const position = new Vector3().setFromMatrixPosition(this.camera.matrixWorld);
      const origin = this.shadowUniforms.cloudOrigin!.value as Vector2;
      position.x += origin.x;
      position.z += origin.y;
      const movedTooFar = position.distanceTo(this.previousPosition) > 2000;
      // Clip-plane retuning changes depth encoding, not the viewing rays.
      // Reprojection already uses the previous frame's complete matrix; retain
      // history across those updates, but still reset for FOV/aspect/lens changes.
      const projectionChanged = this.previousProjection.elements.some(
        (value, index) =>
          index !== 10 && index !== 14 && value !== this.camera.projectionMatrix.elements[index],
      );
      h.currentColor!.value = this.target.textures[0];
      h.currentData!.value = this.target.textures[1];
      const previous = this.historyTargets[1 - this.historyIndex]!;
      const output = this.historyTargets[this.historyIndex]!;
      h.previousColor!.value = previous.textures[0];
      h.previousData!.value = previous.textures[1];
      h.inverseProjection!.value = this.camera.projectionMatrixInverse;
      h.cameraWorld!.value = this.camera.matrixWorld;
      (h.worldCamera!.value as Vector3).copy(position);
      (h.texel!.value as Vector2).set(1 / this.lowWidth, 1 / this.lowHeight);
      h.validHistory!.value = Number(this.historyValid && !movedTooFar && !projectionChanged);
      this.quad.material = this.historyMaterial;
      renderer.setRenderTarget(output);
      this.quad.render(renderer);
      cloudTexture = output.texture;
      (h.previousViewProjection!.value as Matrix4).multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      );
      (h.previousOrigin!.value as Vector2).copy(origin);
      this.previousPosition.copy(position);
      this.previousProjection.copy(this.camera.projectionMatrix);
      this.historyValid = true;
      this.historyIndex = 1 - this.historyIndex;
    } else this.historyValid = false;

    const c = this.compositeMaterial.uniforms;
    c.tDiffuse!.value = readBuffer.texture;
    c.tClouds!.value = cloudTexture;
    c.sunshineMode!.value = u.sunshineMode!.value as number;
    (c.fullTexel!.value as Vector2).set(1 / this.width, 1 / this.height);
    // The same depth the march clipped against, so the taps compare like with like.
    c.tDepth!.value = depth ?? null;
    c.cloudHasDepth!.value = depth ? 1 : 0;
    (c.cloudTexel!.value as Vector2).set(1 / this.lowWidth, 1 / this.lowHeight);
    this.quad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.disposed = true;
    for (const view of this.secondaryViews.values()) view.dispose();
    this.secondaryViews.clear();
    if (
      this.groundShadowTarget &&
      this.shadowUniforms.cloudGroundShadow!.value === this.groundShadowTarget.texture
    ) {
      this.shadowUniforms.cloudGroundShadowReady!.value = 0;
      this.shadowUniforms.cloudGroundShadow!.value = null;
    }
    this.groundShadowTarget?.dispose();
    this.groundShadowMaterial?.dispose();
    if (this.sunshineTextures)
      Object.values(this.sunshineTextures).forEach((texture) => texture.dispose());
    for (const target of this.historyTargets) target.dispose();
    this.historyMaterial.dispose();
    this.marchMaterial.dispose();
    this.compositeMaterial.dispose();
    this.target.dispose();
    this.quad.dispose();
  }
}
