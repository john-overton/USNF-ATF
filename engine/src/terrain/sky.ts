/**
 * Sky dome, sun/moon lights and dynamic fog, all driven by one scattering table
 * so the shader, the fog colour and the lights cannot disagree. Today's noon look
 * is the calibration reference: `NOON_*` below reproduce the previous fixed
 * DirectionalLight(0xfff0d0, 2.4) and AmbientLight(0xffffff, 1.7) at a summer
 * local noon, and everything else is a departure from that anchor.
 */
import {
  BackSide,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DirectionalLight,
  Fog,
  HalfFloatType,
  HemisphereLight,
  LinearFilter,
  Mesh,
  RGBAFormat,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
  Vector3,
  DataUtils,
  PCFSoftShadowMap,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import {
  buildSkyTable,
  skyFogColor,
  skyHighlightRolloff,
  skyTableIsStale,
  SKY_HIGHLIGHT_KNEE,
  type SkyTable,
} from '../render/sky-model';
import type { Environment } from '../sim/environment';
import moonTextureUrl from './assets/moon-nasa-galileo.png';
import { MOON_PHASE_GLSL } from './moon-phase';

/** Summer local noon at the theater latitude, the look everything is calibrated to. */
const NOON_ELEVATION_RAD = (67 * Math.PI) / 180;
const NOON_SUN_INTENSITY = 2.4;
const NOON_SUN_COLOR = new Color(0xfff0d0);
const NOON_AMBIENT_INTENSITY = 1.7;
/** Keeps terrain silhouettes readable under a moonless sky. */
const NIGHT_AMBIENT = 0.04;
const MOON_INTENSITY = 0.11;
const MOON_COLOR = new Color(0x9fb4d8);
/** Authored visual size only; astronomical positions, lighting and sun haze stay unchanged. */
export const SKY_DISC_SCALE = 5;
export const SUN_DISC_RADIUS = 0.00465 * SKY_DISC_SCALE;
export const MOON_DISC_RADIUS = 0.00452 * SKY_DISC_SCALE;
export const MOON_HALO_WIDTH = 0.035;
/** NASA Galileo full-moon photograph, public domain; source and hash in ATTRIBUTIONS.md. */
let loadedMoonTexture: Texture | undefined;
/** Delayed because sky-model unit tests deliberately run without a DOM. */
function moonTexture(): Texture {
  loadedMoonTexture ??= new TextureLoader().load(moonTextureUrl);
  loadedMoonTexture.colorSpace = SRGBColorSpace;
  return loadedMoonTexture;
}
/** How far the hemisphere light is tinted toward the table; a full tint shifts ground colours. */
const AMBIENT_TINT = 0.25;
const AMBIENT_GROUND = new Color(0xc8a878);
/** Fog follows the sky over about a third of a second, so dawn does not strobe. */
const FOG_SMOOTHING = 6;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Do not scale a directional light by the sun's height: Lambert shading already does
 * that for level ground. Keeping a warm, attenuated key near the horizon lets ridges,
 * tree lines and other faces aimed at sunrise/sunset actually catch the light.
 */
export function solarKeyIntensity(elevationRad: number): number {
  if (elevationRad <= 0) return 0;
  const noonFraction = clamp01(Math.sin(elevationRad) / Math.sin(NOON_ELEVATION_RAD));
  return NOON_SUN_INTENSITY * (0.45 + 0.55 * noonFraction);
}

export class SkyLayer {
  readonly sun = new DirectionalLight(NOON_SUN_COLOR.clone(), NOON_SUN_INTENSITY);
  readonly ambient = new HemisphereLight(0xffffff, 0xffffff, NOON_AMBIENT_INTENSITY);
  private table: SkyTable;
  private texture: DataTexture;
  private readonly mesh: Mesh;
  private readonly uniforms;
  private readonly reference: readonly [number, number, number];
  private readonly fogColor = new Color(0x91b1c8);
  private shadowTarget: Vector3 | undefined;
  private shadowDistance = 0;
  private readonly scratch = new Color();
  bytes = 0;
  constructor(private readonly scene: Scene) {
    this.table = buildSkyTable(NOON_ELEVATION_RAD, Math.PI);
    this.reference = this.table.sunTransmittance;
    this.texture = this.createTexture(this.table);
    this.uniforms = {
      skyTable: { value: this.texture },
      tableSize: { value: [this.table.width, this.table.height] as [number, number] },
      sunDirection: { value: new Vector3(0, 1, 0) },
      sunAzimuth: { value: Math.PI },
      sunElevation: { value: NOON_ELEVATION_RAD },
      sunDiscColor: { value: new Color(1, 1, 1) },
      moonDirection: { value: new Vector3(0, -1, 0) },
      moonPhase: { value: 0.5 },
      moonSide: { value: 1 },
      moonTexture: { value: moonTexture() },
    };
    const material = new ShaderMaterial({
      uniforms: this.uniforms,
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      vertexShader: VERTEX,
      fragmentShader: SKY_FRAGMENT,
    });
    this.mesh = new Mesh(new SphereGeometry(1, 32, 16), material);
    // Drawn first, unculled and untranslated by the floating origin: only the
    // view direction matters, and the camera sits at its centre.
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.matrixAutoUpdate = false;
    // The light's target must be in the graph for the shadow camera to aim.
    scene.add(this.mesh, this.sun, this.sun.target, this.ambient);
    scene.fog = new Fog(this.fogColor, 80000, 180000);
    scene.background = this.fogColor;
  }
  private createTexture(table: SkyTable): DataTexture {
    // Half float: filterable in core WebGL2, and 8 bits per channel bands a
    // gradient this smooth. RGBA because RGB half-float textures are not filterable.
    const pixels = new Uint16Array(table.width * table.height * 4);
    for (let i = 0; i < table.width * table.height; i++) {
      for (let c = 0; c < 3; c++)
        pixels[i * 4 + c] = DataUtils.toHalfFloat(table.data[i * 3 + c] ?? 0);
      pixels[i * 4 + 3] = DataUtils.toHalfFloat(1);
    }
    const texture = new DataTexture(pixels, table.width, table.height, RGBAFormat, HalfFloatType);
    // Azimuth wraps, elevation does not.
    texture.wrapS = RepeatWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    this.bytes = pixels.byteLength;
    return texture;
  }
  /**
   * Only the aircraft casts, so the depth pass is a few hundred triangles and a
   * tight box around it keeps the texels small. The explorer never calls this.
   */
  enableShadows(renderer: WebGLRenderer): void {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -SHADOW_HALF_EXTENT;
    this.sun.shadow.camera.right = SHADOW_HALF_EXTENT;
    this.sun.shadow.camera.top = SHADOW_HALF_EXTENT;
    this.sun.shadow.camera.bottom = -SHADOW_HALF_EXTENT;
    this.sun.shadow.bias = -0.0004;
  }
  /**
   * `groundDistance` is how far the aircraft is above the terrain along the sun
   * direction. Beyond the cap a shadow would be a single texel of noise, so the
   * far plane simply stops and very high altitude casts nothing.
   */
  setShadowTarget(target: Vector3 | undefined, groundDistance: number, normalBias: number): void {
    this.shadowTarget = target;
    this.shadowDistance = Math.min(SHADOW_MAX_DISTANCE, Math.max(50, groundDistance));
    this.sun.shadow.normalBias = normalBias;
  }
  /** Rebuild only when the sun has moved enough to matter; see `skyTableIsStale`. */
  private refreshTable(elevationRad: number, azimuthRad: number): void {
    if (!skyTableIsStale(this.table, elevationRad, azimuthRad)) return;
    this.table = buildSkyTable(elevationRad, azimuthRad);
    const next = this.createTexture(this.table);
    this.texture.dispose();
    this.texture = next;
    this.uniforms.skyTable.value = next;
  }
  /**
   * `forwardAzimuthRad` is the camera's compass bearing: Three's `Fog` carries a
   * single colour per frame, so it takes the horizon colour the pilot is looking at.
   */
  update(environment: Environment, camera: PerspectiveCamera, dt: number): void {
    const sun = environment.sun,
      moon = environment.moon;
    this.refreshTable(sun.elevationRad, sun.azimuthRad);
    this.mesh.position.copy(camera.position);
    this.mesh.updateMatrix();
    this.uniforms.sunDirection.value.set(sun.direction.x, sun.direction.y, sun.direction.z);
    this.uniforms.sunAzimuth.value = sun.azimuthRad;
    this.uniforms.sunElevation.value = sun.elevationRad;
    this.uniforms.moonDirection.value.set(moon.direction.x, moon.direction.y, moon.direction.z);
    this.uniforms.moonPhase.value = moon.phase;
    this.uniforms.moonSide.value = moon.waxing ? 1 : -1;
    const t = this.table.sunTransmittance;
    // Reddening comes from the model's own transmittance ratio, then the peak is
    // renormalised so elevation alone controls how bright the key light is.
    const ratio = [0, 1, 2].map((c) => (this.reference[c]! > 0 ? t[c]! / this.reference[c]! : 0));
    const noon = [NOON_SUN_COLOR.r, NOON_SUN_COLOR.g, NOON_SUN_COLOR.b];
    const scaled = [0, 1, 2].map((c) => noon[c]! * ratio[c]!);
    const peak = Math.max(scaled[0]!, scaled[1]!, scaled[2]!);
    // The disc is rolled off with the rest of the sky, so this only has to be bright
    // enough to saturate inside its own radius; 12 also bloomed the shoulder flat.
    this.uniforms.sunDiscColor.value.setRGB(t[0], t[1], t[2]).multiplyScalar(6);
    const key = sun.elevationRad > 0 && peak > 1e-4 ? sun.direction : moon.direction;
    if (sun.elevationRad > 0 && peak > 1e-4) {
      this.sun.color.setRGB(scaled[0]! / peak, scaled[1]! / peak, scaled[2]! / peak);
      this.sun.intensity = solarKeyIntensity(sun.elevationRad);
    } else {
      // Below the horizon the key light follows the moon: cool, dim, phase-scaled.
      this.sun.color.copy(MOON_COLOR);
      this.sun.intensity = MOON_INTENSITY * moon.phase * clamp01(Math.sin(moon.elevationRad) * 3);
    }
    KEY.set(key.x, key.y, key.z);
    if (this.shadowTarget) {
      this.sun.target.position.copy(this.shadowTarget);
      this.sun.position.copy(this.shadowTarget).addScaledVector(KEY, this.shadowDistance);
      // The camera sits one shadowDistance up-sun of the aircraft and the ground
      // is the same distance again down-sun, so the far plane needs both.
      this.sun.shadow.camera.far = 2 * this.shadowDistance + 2 * SHADOW_HALF_EXTENT;
      this.sun.shadow.camera.updateProjectionMatrix();
      this.sun.target.updateMatrixWorld();
    } else {
      this.sun.target.position.set(0, 0, 0);
      this.sun.position.copy(KEY).multiplyScalar(1000);
    }
    // Twilight keeps a little ambient after the sun sets rather than cutting to black.
    const ambientDay = clamp01(
      (Math.sin(sun.elevationRad) + 0.12) / (Math.sin(NOON_ELEVATION_RAD) + 0.12),
    );
    this.ambient.intensity = Math.max(NIGHT_AMBIENT, NOON_AMBIENT_INTENSITY * ambientDay);
    const zenith = this.table.zenithColor;
    const peakZenith = Math.max(zenith[0], zenith[1], zenith[2], 1e-4);
    this.ambient.color
      .setRGB(1, 1, 1)
      .lerp(
        this.scratch.setRGB(zenith[0] / peakZenith, zenith[1] / peakZenith, zenith[2] / peakZenith),
        AMBIENT_TINT,
      );
    this.ambient.groundColor.setRGB(1, 1, 1).lerp(AMBIENT_GROUND, AMBIENT_TINT);
    const forward = camera.getWorldDirection(FORWARD);
    const azimuth = Math.atan2(-forward.x, forward.z);
    // The same transfer the dome applies, so the horizon and the haze do not part company.
    const fog = skyHighlightRolloff(skyFogColor(this.table, azimuth));
    const blend = clamp01(dt * FOG_SMOOTHING);
    this.fogColor.lerp(this.scratch.setRGB(fog[0], fog[1], fog[2]), blend);
    if (this.scene.fog instanceof Fog) this.scene.fog.color.copy(this.fogColor);
  }
  /** Shadow state for the diagnostics panel and the packaged acceptance reports. */
  shadowDiagnostics(): {
    enabled: boolean;
    mapSize: number;
    distanceM: number;
    cameraFarM: number;
    lightY: number;
    targetY: number;
  } {
    return {
      enabled: this.sun.castShadow,
      mapSize: this.sun.shadow.mapSize.x,
      distanceM: this.shadowDistance,
      cameraFarM: this.sun.shadow.camera.far,
      lightY: this.sun.position.y,
      targetY: this.sun.target.position.y,
    };
  }
  dispose(): void {
    this.scene.remove(this.mesh, this.sun, this.sun.target, this.ambient);
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
    this.texture.dispose();
    this.sun.dispose();
    this.ambient.dispose();
  }
}
const FORWARD = new Vector3();
const KEY = new Vector3();
/** Half-width of the aircraft shadow box, metres. */
const SHADOW_HALF_EXTENT = 120;
/** Past this the shadow is sub-texel; the far plane stops and nothing is cast. */
const SHADOW_MAX_DISTANCE = 20000;

const VERTEX = `
varying vec3 vDirection;
void main() {
  vDirection = position;
  gl_Position = (projectionMatrix * modelViewMatrix * vec4(position, 1.0)).xyww;
}`;

/** Exported so the highlight rolloff can be asserted without a GL context. */
export const SKY_FRAGMENT = `
precision highp float;
uniform sampler2D skyTable;
uniform vec2 tableSize;
uniform vec3 sunDirection;
uniform vec3 moonDirection;
uniform vec3 sunDiscColor;
uniform float sunAzimuth;
uniform float sunElevation;
uniform float moonPhase;
uniform float moonSide;
uniform sampler2D moonTexture;
varying vec3 vDirection;
const float PI = 3.141592653589793;
// Exaggerated apparent discs, independent of the atmosphere's physical sun radius.
const float SUN_RADIUS = ${SUN_DISC_RADIUS.toFixed(8)};
const float MOON_RADIUS = ${MOON_DISC_RADIUS.toFixed(8)};
${MOON_PHASE_GLSL}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

/** GPU copy of skyHighlightRolloff; see its comment in sky-model.ts for why. The knee
 * is interpolated from that module so the two cannot drift apart. */
const float SKY_KNEE = ${SKY_HIGHLIGHT_KNEE.toFixed(2)};
vec3 skyRolloff(vec3 c) {
  vec3 over = max(c - SKY_KNEE, 0.0) / (1.0 - SKY_KNEE);
  return min(c, SKY_KNEE + (1.0 - SKY_KNEE) * (1.0 - exp(-over)));
}

void main() {
  vec3 dir = normalize(vDirection);
  float elevation = asin(clamp(dir.y, -1.0, 1.0));
  // World +Z is north and +X is west, so the compass bearing is atan(-x, z).
  float azimuth = atan(-dir.x, dir.z);
  float relative = fract((azimuth - sunAzimuth) / (2.0 * PI));
  // Rows are quadratically warped around a row pinned exactly to the horizon;
  // this must stay identical to skyElevationForRow in sky-model.ts.
  float pivot = floor((tableSize.y - 1.0) * 0.5 + 0.5);
  // The table integrates below-horizon rays from a 2 m eye, so they are ground,
  // not sky. At altitude the true horizon is below level -- 1.4 degrees at
  // 1800 m -- and that band is still sky, so it takes the horizon colour, which
  // is also what the scene fog fades distant terrain to.
  float warp = sqrt(clamp(max(elevation, 0.0) / (PI * 0.5), 0.0, 1.0));
  float row = pivot + warp * max(1.0, tableSize.y - 1.0 - pivot);
  vec2 uv = vec2((relative * tableSize.x + 0.5) / tableSize.x, (row + 0.5) / tableSize.y);
  vec3 color = texture2D(skyTable, uv).rgb;

  // Stars fade out as soon as the sun approaches the horizon. Cells on a shell
  // of radius 320 are about 0.003 rad across, so a 0.3 unit disc is a couple of
  // pixels at 1440p: round points, not the cell-sized squares a flat hash gives.
  float night = smoothstep(0.03, -0.12, sunElevation);
  if (night > 0.0) {
    vec3 scaled = dir * 320.0;
    vec3 cell = floor(scaled);
    float h = hash13(cell);
    if (h > 0.997) {
      vec3 jitter = vec3(hash13(cell + 1.7), hash13(cell + 3.3), hash13(cell + 5.9)) - 0.5;
      float d = length(fract(scaled) - 0.5 - jitter * 0.7);
      float star = smoothstep(0.33, 0.02, d) * (0.35 + 0.65 * hash13(cell + 7.0));
      color += vec3(star * 1.5 * night) * smoothstep(-0.02, 0.06, dir.y);
    }
  }

  // The discs go on after the transfer, not through it: rolled off with the aureole they
  // would land within a hundredth of the sky right beside them and disappear.
  color = skyRolloff(color);
  float cosSun = dot(dir, sunDirection);
  // Retain the original limb feather; enlarge the disc, not its glow shoulder.
  color += sunDiscColor * smoothstep(cos(SUN_RADIUS + 0.0016275), cos(SUN_RADIUS), cosSun);
  float cosMoon = dot(dir, moonDirection);
  // View-right and view-up basis: waxing illuminates the right, waning the left.
  vec3 moonEast = cross(moonDirection, vec3(0.0, 1.0, 0.0));
  if (dot(moonEast, moonEast) < 0.001) moonEast = cross(moonDirection, vec3(1.0, 0.0, 0.0));
  moonEast = normalize(moonEast);
  vec3 moonNorth = normalize(cross(moonEast, moonDirection));
  vec2 moonUv = vec2(dot(dir, moonEast), dot(dir, moonNorth)) / sin(MOON_RADIUS) * 0.5 + 0.5;
  // Work only near the visible moon, never on the opposite hemisphere. The glow
  // convolves the SAME phase-masked photograph as the disc, not a circular halo.
  if (night > 0.0 && cosMoon > cos(0.12) && moonPhase > 0.0) {
    vec2 moonPlane = moonUv * 2.0 - 1.0;
    float moonHalo = 0.0;
    for (int sy = 0; sy < 12; sy++) {
      for (int sx = 0; sx < 12; sx++) {
        vec2 sampleUv = (vec2(float(sx), float(sy)) + 0.5) / 12.0;
        vec2 p = sampleUv * 2.0 - 1.0;
        vec3 photo = texture2D(moonTexture, sampleUv).rgb;
        float emission = dot(photo, vec3(0.2126, 0.7152, 0.0722)) * moonVisibility(p);
        vec2 delta = (moonPlane - p) * MOON_RADIUS;
        float d2 = dot(delta, delta);
        float blur = 0.65 * exp(-d2 / (0.012 * 0.012)) + 0.35 * exp(-d2 / (${MOON_HALO_WIDTH.toFixed(5)} * ${MOON_HALO_WIDTH.toFixed(5)}));
        moonHalo += emission * blur * (2.0 / 144.0);
      }
    }
    float moonAngle = acos(clamp(cosMoon, -1.0, 1.0));
    float haloWeight = moonHalo * night * (1.0 - smoothstep(0.07, 0.12, moonAngle));
    float haloDither = (hash13(vec3(gl_FragCoord.xy, 17.0)) - 0.5) / 255.0;
    color += max(vec3(0.0), vec3(0.12, 0.16, 0.28) * haloWeight + vec3(haloDither) * min(1.0, haloWeight * 255.0));
    vec3 moonPhoto = texture2D(moonTexture, clamp(moonUv, 0.0, 1.0)).rgb;
    color += moonPhoto * moonVisibility(moonPlane) * night * 1.35;
  }

  gl_FragColor = vec4(color, 1.0);
}`;
