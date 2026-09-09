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
  Data3DTexture,
  DataTexture,
  LinearFilter,
  RedFormat,
  RepeatWrapping,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { buildCloudVolume, buildCoverageTexture } from '../render/cloud-noise';
import { COVERAGE_TILE_METERS, type CloudLayer } from '../sim/environment/clouds';
import type { CloudQuality } from '../sim/environment';

/** Metres of world spanned by one tile of the 64³ erosion volume. */
const DETAIL_TILE_METERS = 3000;
/** Light steps toward the sun per march sample; the plan's four-to-six band. */
const LIGHT_STEPS = 5;

export interface CloudUniformState {
  /** World-space offset of the coverage texture, metres; shared with cloud shadows. */
  offset: { x: number; z: number };
  layer: CloudLayer | undefined;
  cirrus: CloudLayer | undefined;
  /** Unit, world space, pointing at the sun. */
  sunDirection: Vector3;
  sunColor: Color;
  zenithColor: Color;
  groundColor: Color;
  /** Floating-origin offset: world = renderPosition + origin. */
  origin: { x: number; z: number };
  fogColor: Color;
  fogNear: number;
  fogFar: number;
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

let coverageSingleton: DataTexture | undefined;
let volumeSingleton: Data3DTexture | undefined;
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
function volumeTexture(): Data3DTexture {
  if (!volumeSingleton) {
    const noise = buildCloudVolume();
    const texture = new Data3DTexture(noise.data, noise.size, noise.size, noise.size);
    texture.format = RedFormat;
    texture.type = UnsignedByteType;
    texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
    texture.minFilter = texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    volumeSingleton = texture;
  }
  return volumeSingleton;
}

/**
 * Declarations and the shadow lookup every lit material reuses. `worldPosition` is the
 * scene-space position; `cloudOrigin` adds the floating origin back before sampling.
 */
export const SHADOW_CHUNK = /* glsl */ `
uniform sampler2D cloudCoverage;
uniform vec2 cloudOffset;
uniform float cloudBaseM;
uniform float cloudCoverageAmount;
uniform vec3 cloudSunDirection;
uniform vec2 cloudOrigin;
uniform float cloudTileMeters;

float cloudCoverageAt(vec2 worldXZ) {
  return texture2D(cloudCoverage, (worldXZ + cloudOffset) / cloudTileMeters).r;
}
// Coverage raises the noise floor: at 1 the whole layer is solid. Mirrors cloudDensityAt.
float cloudShaped(float noise, float amount) {
  return clamp((noise + amount - 1.0) / max(1e-3, amount), 0.0, 1.0);
}
float cloudShadow(vec3 worldPosition) {
  if (cloudCoverageAmount <= 0.0) return 1.0;
  // A sun on the horizon casts shadows that stretch to infinity; the light is already
  // near zero there, so stop rather than sampling a wildly extrapolated point.
  if (cloudSunDirection.y <= 0.05) return 1.0;
  vec3 p = vec3(worldPosition.x + cloudOrigin.x, worldPosition.y, worldPosition.z + cloudOrigin.y);
  float t = (cloudBaseM - p.y) / cloudSunDirection.y;
  if (t <= 0.0) return 1.0;
  vec2 hit = p.xz + cloudSunDirection.xz * t;
  float shaped = cloudShaped(cloudCoverageAt(hit), cloudCoverageAmount);
  return 1.0 - 0.75 * smoothstep(0.0, 0.6, shaped);
}
`;

interface CloudShadowUniforms extends Record<string, { value: unknown }> {
  cloudCoverage: { value: Texture };
  cloudOffset: { value: Vector2 };
  cloudBaseM: { value: number };
  cloudCoverageAmount: { value: number };
  cloudSunDirection: { value: Vector3 };
  cloudOrigin: { value: Vector2 };
  cloudTileMeters: { value: number };
}

let shadowSingleton: CloudShadowUniforms | undefined;
/**
 * The uniform objects are one shared set: every material that includes `SHADOW_CHUNK` gets
 * the same `{ value }` boxes, so a single `updateCloudShadowUniforms` per frame updates all
 * of them. The record itself is copied so a material cannot add keys to its neighbours.
 */
export function createCloudShadowUniforms(): Record<string, { value: unknown }> {
  shadowSingleton ??= {
    cloudCoverage: { value: coverageTexture() },
    cloudOffset: { value: new Vector2() },
    cloudBaseM: { value: 1500 },
    cloudCoverageAmount: { value: 0 },
    cloudSunDirection: { value: new Vector3(0, 1, 0) },
    cloudOrigin: { value: new Vector2() },
    cloudTileMeters: { value: COVERAGE_TILE_METERS },
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
uniform float cloudHasDepth;
uniform float cameraFar;
uniform mat4 inverseProjection;
uniform mat4 cameraWorld;
uniform vec3 rayOrigin;
uniform int cloudSteps;
uniform float cloudJitter;
uniform float cloudTopM;
uniform float cloudDensity;
uniform float cloudStratus;
uniform float cloudMarch;
uniform float cloudDetailMeters;
uniform float cirrusBaseM;
uniform float cirrusCoverage;
uniform float cirrusDensity;
uniform vec3 cloudSunColor;
uniform vec3 cloudZenithColor;
uniform vec3 cloudGroundColor;
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
float densityAt(vec3 p) {
  float gradient = heightGradient(p.y);
  if (gradient <= 0.0) return 0.0;
  float shaped = cloudShaped(cloudCoverageAt(p.xz), cloudCoverageAmount);
  if (shaped <= 0.0) return 0.0;
  vec3 uvw = (p + vec3(cloudOffset.x, 0.0, cloudOffset.y)) / cloudDetailMeters;
  float detail = texture(cloudVolume, uvw).r;
  // Erosion carves the wispy edges away and leaves the core solid.
  float d = clamp((shaped * gradient - (1.0 - detail) * 0.4) / 0.6, 0.0, 1.0);
  return d * cloudDensity;
}
float lightTransmittance(vec3 p) {
  float stepM = max(60.0, (cloudTopM - cloudBaseM) * 0.6 / float(LIGHT_STEPS));
  float tau = 0.0;
  vec3 q = p;
  for (int i = 0; i < LIGHT_STEPS; i++) {
    q += cloudSunDirection * stepM;
    tau += densityAt(q) * stepM;
  }
  return exp(-tau * EXTINCTION);
}
float fogAmount(float distanceM) {
  return clamp((distanceM - cloudFogNear) / max(1.0, cloudFogFar - cloudFogNear), 0.0, 1.0);
}

void main() {
  vec4 clip = vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec4 view = inverseProjection * clip;
  vec3 viewDir = normalize(view.xyz / view.w);
  vec3 dir = normalize((cameraWorld * vec4(viewDir, 0.0)).xyz);
  // Stored log depth is along the view axis, not along the ray.
  float forward = max(1e-4, -viewDir.z);

  float sceneDistance = MAX_MARCH_M;
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
      float shaped = cloudShaped(cloudCoverageAt((ro.xz + dir.xz * t) * 0.25), cirrusCoverage);
      // Grazing rays cross more of the sheet, so it thickens toward the horizon.
      float slant = 1.0 / max(0.08, abs(dir.y));
      float alpha = 1.0 - exp(-shaped * cirrusDensity * 6.0 * slant);
      vec3 lit = mix(cloudZenithColor, cloudSunColor, 0.5) * (0.7 + 0.3 * min(phase, 2.0));
      cirrus = vec4(mix(lit, cloudFogColor, fogAmount(t)), alpha);
      cirrusT = t;
    }
  }

  float enter = 0.0;
  float exitM = -1.0;
  if (cloudMarch > 0.5) {
    if (abs(dir.y) < 1e-4) {
      // Level flight inside the slab: march ahead until the depth or the range stops us.
      if (ro.y > cloudBaseM && ro.y < cloudTopM) exitM = min(sceneDistance, MAX_MARCH_M);
    } else {
      float t0 = (cloudBaseM - ro.y) / dir.y;
      float t1 = (cloudTopM - ro.y) / dir.y;
      enter = max(0.0, min(t0, t1));
      exitM = min(min(max(t0, t1), sceneDistance), MAX_MARCH_M);
    }
  }

  bool cirrusFirst = cirrusT >= 0.0 && (exitM <= enter || cirrusT <= enter);
  if (cirrusFirst) {
    scatter += transmittance * cirrus.a * cirrus.rgb;
    transmittance *= 1.0 - cirrus.a;
  }

  if (exitM > enter) {
    float span = exitM - enter;
    float stepM = span / float(cloudSteps);
    float jitter = hash12(gl_FragCoord.xy) * cloudJitter;
    float t = enter + stepM * jitter;
    for (int i = 0; i < cloudSteps; i++) {
      vec3 p = ro + dir * t;
      float d = densityAt(p);
      if (d > 0.0) {
        float sigma = d * EXTINCTION;
        float sampleT = exp(-sigma * stepM);
        // Powder: multiple scattering darkens the lit side of a dense edge.
        float powder = 1.0 - exp(-sigma * stepM * 2.0);
        float hFrac = clamp((p.y - cloudBaseM) / max(1.0, cloudTopM - cloudBaseM), 0.0, 1.0);
        vec3 ambient = mix(cloudGroundColor, cloudZenithColor, hFrac);
        vec3 lum = cloudSunColor * lightTransmittance(p) * phase * powder + ambient;
        // Distant clouds sit in the same haze as the terrain behind them.
        lum = mix(lum, cloudFogColor, fogAmount(t));
        scatter += transmittance * (1.0 - sampleT) * lum;
        transmittance *= sampleT;
        if (transmittance < 0.01) break;
      }
      t += stepM;
      if (t > exitM) break;
    }
  }

  if (cirrusT >= 0.0 && !cirrusFirst) {
    scatter += transmittance * cirrus.a * cirrus.rgb;
    transmittance *= 1.0 - cirrus.a;
  }

  gl_FragColor = vec4(scatter, transmittance);
}
`;

/** Bilinear upsample for now; depth-aware upsampling is the follow-up if edges smear. */
const COMPOSITE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tClouds;
void main() {
  vec4 cloud = texture2D(tClouds, vUv);
  vec3 scene = texture2D(tDiffuse, vUv).rgb;
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

  constructor(camera: PerspectiveCamera) {
    super();
    this.camera = camera;
    this.marchMaterial = new ShaderMaterial({
      defines: { LIGHT_STEPS: LIGHT_STEPS },
      uniforms: {
        ...this.shadowUniforms,
        tDepth: { value: null },
        cloudVolume: { value: null },
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
        cloudMarch: { value: 0 },
        cloudDetailMeters: { value: DETAIL_TILE_METERS },
        cirrusBaseM: { value: 9000 },
        cirrusCoverage: { value: 0 },
        cirrusDensity: { value: 0 },
        cloudSunColor: { value: new Color(1, 1, 1) },
        cloudZenithColor: { value: new Color(0.3, 0.45, 0.7) },
        cloudGroundColor: { value: new Color(0.25, 0.25, 0.24) },
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
      uniforms: { tDiffuse: { value: null }, tClouds: { value: null } },
      vertexShader: VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.target = new WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
    });
    this.quality = 'half';
  }

  get quality(): CloudQuality {
    return this.currentQuality;
  }
  set quality(value: CloudQuality) {
    this.currentQuality = value;
    this.enabled = value !== 'off';
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
    return this.byteEstimate;
  }
  get scale(): number {
    return cloudScaleFor(this.currentQuality);
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
    const scale = cloudScaleFor(this.currentQuality);
    this.lowWidth = Math.max(1, Math.ceil(this.width * scale));
    this.lowHeight = Math.max(1, Math.ceil(this.height * scale));
    this.target.setSize(this.lowWidth, this.lowHeight);
    // One RGBA8 colour attachment; the pass adds no depth buffer of its own.
    this.byteEstimate = scale > 0 ? this.lowWidth * this.lowHeight * 4 : 0;
  }

  update(state: CloudUniformState): void {
    updateCloudShadowUniforms(this.shadowUniforms, state);
    const u = this.marchMaterial.uniforms;
    const layer = state.layer;
    u.cloudMarch!.value = layer ? 1 : 0;
    u.cloudTopM!.value = layer ? layer.topM : 0;
    u.cloudDensity!.value = layer ? layer.density : 0;
    u.cloudStratus!.value = layer?.type === 'stratus' ? 1 : 0;
    u.cirrusBaseM!.value = state.cirrus?.baseM ?? 0;
    u.cirrusCoverage!.value = state.cirrus?.coverage ?? 0;
    u.cirrusDensity!.value = state.cirrus?.density ?? 0;
    (u.cloudSunColor!.value as Color).copy(state.sunColor);
    (u.cloudZenithColor!.value as Color).copy(state.zenithColor);
    (u.cloudGroundColor!.value as Color).copy(state.groundColor);
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
    const depth = readBuffer.depthTexture;
    u.tDepth!.value = depth ?? null;
    // Without a depth attachment the march cannot clip to the terrain, so it would paint
    // cloud over the ground; fall back to sky-only rather than to a wrong picture.
    u.cloudHasDepth!.value = depth ? 1 : 0;

    this.quad.material = this.marchMaterial;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    this.quad.render(renderer);

    this.compositeMaterial.uniforms.tDiffuse!.value = readBuffer.texture;
    this.compositeMaterial.uniforms.tClouds!.value = this.target.texture;
    this.quad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.marchMaterial.dispose();
    this.compositeMaterial.dispose();
    this.target.dispose();
    this.quad.dispose();
  }
}
