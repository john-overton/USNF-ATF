/**
 * Rayleigh + Mie + ozone sky over a spherical atmosphere, single scattering plus an
 * approximate multiple-scattering term, baked into a small table. Pure TypeScript on purpose: the same numbers drive the sky shader, the fog colour
 * and the scene lights, so CPU and GPU can never disagree, and the model stays testable
 * headless. Rebuilt only when the sun moves (see `skyTableIsStale`), so a straight
 * numerical integration is cheaper than the error of a closed-form fit.
 *
 * Single scattering alone is not enough: it gets the zenith right and the horizon badly
 * wrong, because a horizon ray extinguishes blue completely and single scattering has no
 * mechanism to put it back. See MULTI_SCATTER_FRACTION and warpedStepEnd.
 *
 * A 96x48 build measures 6-25 ms on the first call and 2-6 ms warm under bun 1.4.2 on an M3
 * (2026-09-09). It runs only when the sun has moved a quarter degree, so roughly once a
 * minute of wall clock at ordinary sun rates.
 */

export interface SkyTable {
  /** RGB radiance, length width*height*3, row-major: row = elevation index, column = azimuth index. */
  readonly data: Float32Array;
  /** Azimuth samples relative to the sun, spanning a full turn so column 0 wraps onto column width. */
  readonly width: number;
  /** View elevation samples, spanning -90..+90 degrees; see `skyElevationForRow` for the warp. */
  readonly height: number;
  /** Sun elevation/azimuth radians this table was built for. */
  readonly sunElevationRad: number;
  readonly sunAzimuthRad: number;
  /** Transmittance toward the sun from the ground: use for directional light colour. */
  readonly sunTransmittance: readonly [number, number, number];
  /**
   * Radiance straight up, not the hemisphere average the brief sketched: the hemisphere
   * light only takes a tint from it, and a name that lies about which direction it came
   * from would make the "zenith darker than the horizon at low sun" behaviour untestable.
   */
  readonly zenithColor: readonly [number, number, number];
  /** Radiance at the horizon averaged over azimuth: the fallback single fog colour. */
  readonly horizonColor: readonly [number, number, number];
}

const EARTH_RADIUS_M = 6371000;
const ATMOSPHERE_THICKNESS_M = 60000;
const ATMOSPHERE_RADIUS_M = EARTH_RADIUS_M + ATMOSPHERE_THICKNESS_M;
/** Eye height. Exactly on the sphere makes the horizon ray tangent and the first step degenerate. */
const CAMERA_ALTITUDE_M = 2;

const RAYLEIGH_SCALE_HEIGHT_M = 8000;
const MIE_SCALE_HEIGHT_M = 1200;
const BETA_RAYLEIGH: readonly [number, number, number] = [5.802e-6, 13.558e-6, 33.1e-6];
const BETA_MIE = 21e-6;
/** Mie extinction runs above its scattering; the ~1.11 ratio is the usual absorbing-aerosol fudge. */
const BETA_MIE_EXTINCTION = BETA_MIE * 1.11;
const MIE_G = 0.76;

/**
 * Ozone: absorption only, no scattering, on Bruneton's tent profile peaking at 25 km and
 * vanishing at 10 and 40 km. It is nearly free at the zenith (vertical optical depth about
 * 0.03 in green) but a horizon ray crosses the layer at a grazing angle and picks up 20-30
 * times that, and the Chappuis band absorbs green and red while leaving blue alone. Without
 * it a horizon ray's residual is green-dominant no matter how much multiple scattering is
 * added, because the surviving spectrum is simply whatever Rayleigh scattered out last.
 */
const BETA_OZONE: readonly [number, number, number] = [0.65e-6, 1.881e-6, 0.085e-6];
const OZONE_CENTRE_M = 25000;
const OZONE_HALF_WIDTH_M = 15000;

const VIEW_STEPS = 16;
const LIGHT_STEPS = 8;
/** Below-horizon rays end at the ground within a few km and are nearly black; don't pay full price. */
const GROUND_VIEW_STEPS = 6;

/**
 * Step boundaries sit at `span * u^2` for uniform u, not evenly. A horizon ray is 880 km long
 * but its entire blue contribution comes from the first few tens of km — past that blue is
 * extinguished — so evenly spaced samples put the first sample 27 km out and simply miss it.
 * That was the largest single cause of the olive horizon: red and green were integrated
 * adequately along the long tail of the ray and blue was not integrated at all.
 */
function warpedStepEnd(span: number, steps: number, i: number): number {
  const u = i / steps;
  return span * u * u;
}

/**
 * Columns between every `AZIMUTH_STRIDE`-th one interpolate the scattering integrals rather
 * than re-marching. Only the sun's local zenith angle varies with azimuth along the ray, and
 * it does so smoothly; the phase functions, which do not, are still evaluated per column.
 */
const AZIMUTH_STRIDE = 4;

function ozoneDensity(h: number): number {
  return Math.max(0, 1 - Math.abs(h - OZONE_CENTRE_M) / OZONE_HALF_WIDTH_M);
}

/**
 * Multiple scattering, as Hillaire's geometric series with a mean-field source.
 *
 * Rayleigh scattering conserves photons: blue removed from the beam is not destroyed, it is
 * handed to the next scattering event. Single scattering models only the removal, so along a
 * horizon ray blue was extinguished with nothing to put it back and the residual was whatever
 * survived the long path — red and green. That is the olive horizon, and no phase-function or
 * colour tweak fixes it, because the missing radiance genuinely is not in a single-scattering
 * integral.
 *
 * The closure: in an optically thick conservative medium, radiance tends to the mean radiance
 * of the field. So orders two and up are approximated as the sky's own hemisphere-average
 * radiance, faded in by how opaque the view ray is, `1 - transmittance`. It is chromatic in
 * the right direction for free (the mean field is blue), it vanishes on thin rays like the
 * zenith and saturates on thick ones like the horizon, and it is zero at night because the
 * mean field is zero. `f` is the fraction re-scattered rather than escaping to space or the
 * ground; the geometric series sums to f/(1-f).
 */
const MULTI_SCATTER_FRACTION = 0.4;
const MULTI_SCATTER_GAIN = MULTI_SCATTER_FRACTION / (1 - MULTI_SCATTER_FRACTION);

interface RayIntegral {
  /** Rayleigh and Mie in-scattering along the ray, per channel, before the phase functions. */
  rayleigh: [number, number, number];
  mie: [number, number, number];
  /** Transmittance of the whole view ray, for the multiple-scattering fade. */
  transmittance: [number, number, number];
}

/**
 * Sun irradiance in the arbitrary units the table is expressed in, and the only place the
 * absolute scale is set — the renderer has no tone mapping. 17.35 is calibrated against the
 * project's existing clear-sky colour: a summer-noon sun (67 degrees) puts the zenith at
 * (0.265, 0.365, 0.591), which is #8da3ca in sRGB against the shipped 0x91b1c8 reference.
 * The anti-solar horizon lands at (0.44, 0.59, 0.73), a pale blue-white. Everything outside
 * the sun's own forward-scatter lobe stays inside 0..1.5; the caller rescales from here to
 * today's DirectionalLight 2.4 / 0xfff0d0 noon look.
 */
const SUN_IRRADIANCE = 17.35;

function raySphereExit(radius: number, altitude: number, cosZenith: number): number {
  // Positive root of |p + t*d|^2 = radius^2 with |p| = altitude and p.d = altitude*cosZenith.
  const b = altitude * cosZenith;
  const c = altitude * altitude - radius * radius;
  const disc = b * b - c;
  return disc <= 0 ? 0 : -b + Math.sqrt(disc);
}

/** Distance to the ground along the ray, or -1 when it misses (i.e. the view is above the horizon). */
function rayGroundHit(altitude: number, cosZenith: number): number {
  if (cosZenith >= 0) return -1;
  const b = altitude * cosZenith;
  const c = altitude * altitude - EARTH_RADIUS_M * EARTH_RADIUS_M;
  const disc = b * b - c;
  if (disc <= 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : -1;
}

/** Rayleigh, Mie and ozone optical depth from a point out to the top of the atmosphere. */
function opticalDepthToSpace(altitude: number, cosZenith: number): [number, number, number] {
  if (rayGroundHit(altitude, cosZenith) > 0) return [Infinity, Infinity, Infinity];
  const span = raySphereExit(ATMOSPHERE_RADIUS_M, altitude, cosZenith);
  if (span <= 0) return [0, 0, 0];
  let rayleigh = 0;
  let mie = 0;
  let ozone = 0;
  let edge = 0;
  for (let i = 0; i < LIGHT_STEPS; i++) {
    const next = warpedStepEnd(span, LIGHT_STEPS, i + 1);
    const step = next - edge;
    const t = (edge + next) / 2;
    edge = next;
    const h =
      Math.sqrt(altitude * altitude + t * t + 2 * altitude * t * cosZenith) - EARTH_RADIUS_M;
    if (h < 0) continue;
    rayleigh += Math.exp(-h / RAYLEIGH_SCALE_HEIGHT_M) * step;
    mie += Math.exp(-h / MIE_SCALE_HEIGHT_M) * step;
    ozone += ozoneDensity(h) * step;
  }
  return [rayleigh, mie, ozone];
}

function rayleighPhase(cosTheta: number): number {
  return (3 / (16 * Math.PI)) * (1 + cosTheta * cosTheta);
}

function miePhase(cosTheta: number): number {
  const g2 = MIE_G * MIE_G;
  const denom = 1 + g2 - 2 * MIE_G * cosTheta;
  // Clamp: exactly forward with g near 1 drives denom to a value whose 1.5 power underflows.
  return ((1 - g2) / (4 * Math.PI)) * Math.pow(Math.max(denom, 1e-6), -1.5);
}

/** Transmittance from the ground toward the sun; all-zero once the sun is below the horizon. */
function sunTransmittanceAt(sunElevationRad: number): [number, number, number] {
  const altitude = EARTH_RADIUS_M + CAMERA_ALTITUDE_M;
  const [dr, dm, doz] = opticalDepthToSpace(altitude, Math.sin(sunElevationRad));
  if (!Number.isFinite(dr)) return [0, 0, 0];
  const t = (c: 0 | 1 | 2): number =>
    Math.exp(-BETA_RAYLEIGH[c] * dr - BETA_MIE_EXTINCTION * dm - BETA_OZONE[c] * doz);
  return [t(0), t(1), t(2)];
}

/**
 * Scattering integral along one view ray, split into its Rayleigh and Mie parts so the
 * caller can apply the two phase functions (and the isotropic multiple-scattering term)
 * without integrating three times.
 *
 * Azimuth cannot be factored out of this the way the phase functions can: on a sphere the
 * sun's local zenith angle at a sample 800 km down a horizon ray depends on whether the ray
 * runs toward or away from the sun. Collapsing that was what made twilight brightest at the
 * zenith instead of along the sunlit horizon.
 */
function integrateRay(
  viewElevationRad: number,
  cosAzimuthToSun: number,
  sunElevationRad: number,
): RayIntegral {
  const altitude = EARTH_RADIUS_M + CAMERA_ALTITUDE_M;
  const sinView = Math.sin(viewElevationRad);
  const cosView = Math.cos(viewElevationRad);
  const ground = rayGroundHit(altitude, sinView);
  // Looking down we stop at the surface: a short, dark integral rather than a NaN or a miss.
  const span = ground > 0 ? ground : raySphereExit(ATMOSPHERE_RADIUS_M, altitude, sinView);
  const rayleigh: [number, number, number] = [0, 0, 0];
  const mie: [number, number, number] = [0, 0, 0];
  const transmittance: [number, number, number] = [1, 1, 1];
  if (span <= 0) return { rayleigh, mie, transmittance };

  const sinSun = Math.sin(sunElevationRad);
  // Sun direction is (cos(sunEl), 0, sin(sunEl)); the view ray's component along it per unit t.
  const alongSun = cosView * cosAzimuthToSun * Math.cos(sunElevationRad);
  const steps = ground > 0 ? GROUND_VIEW_STEPS : VIEW_STEPS;
  let viewDepthR = 0;
  let viewDepthM = 0;
  let viewDepthO = 0;
  let edge = 0;
  for (let i = 0; i < steps; i++) {
    const next = warpedStepEnd(span, steps, i + 1);
    const step = next - edge;
    const t = (edge + next) / 2;
    edge = next;
    const r = Math.sqrt(altitude * altitude + t * t + 2 * altitude * t * sinView);
    const h = Math.max(0, r - EARTH_RADIUS_M);
    const densityR = Math.exp(-h / RAYLEIGH_SCALE_HEIGHT_M);
    const densityM = Math.exp(-h / MIE_SCALE_HEIGHT_M);
    viewDepthR += densityR * step;
    viewDepthM += densityM * step;
    viewDepthO += ozoneDensity(h) * step;

    // Local sun zenith cosine at the sample: dot(sample position, sun direction) / |position|.
    const cosSunLocal = Math.min(
      1,
      Math.max(-1, (t * alongSun + (altitude + t * sinView) * sinSun) / r),
    );
    const [lightR, lightM, lightO] = opticalDepthToSpace(r, cosSunLocal);
    // Only this sample is in the planet's shadow; the lit part of the ray keeps contributing,
    // which is where the twilight arch above a set sun comes from.
    if (!Number.isFinite(lightR)) continue;

    const greyDepth = BETA_MIE_EXTINCTION * (viewDepthM + lightM);
    const rayleighDepth = viewDepthR + lightR;
    const ozoneDepth = viewDepthO + lightO;
    for (let c = 0; c < 3; c++) {
      const betaR = BETA_RAYLEIGH[c] ?? 0;
      const beam = Math.exp(-betaR * rayleighDepth - greyDepth - (BETA_OZONE[c] ?? 0) * ozoneDepth);
      rayleigh[c] = (rayleigh[c] ?? 0) + betaR * densityR * beam * step;
      mie[c] = (mie[c] ?? 0) + BETA_MIE * densityM * beam * step;
    }
  }
  for (let c = 0; c < 3; c++) {
    transmittance[c] = Math.exp(
      -(BETA_RAYLEIGH[c] ?? 0) * viewDepthR -
        BETA_MIE_EXTINCTION * viewDepthM -
        (BETA_OZONE[c] ?? 0) * viewDepthO,
    );
  }
  return { rayleigh, mie, transmittance };
}

/** Index of the row pinned exactly to the horizon. */
function horizonRowIndex(height: number): number {
  return Math.round((height - 1) / 2);
}

/**
 * Elevation of table row `row`, quadratically warped either side of a row pinned exactly to
 * the horizon. A uniform mapping leaves no row at elevation 0 — with 48 rows the nearest are
 * at +-1.9 degrees, and from a 2 m eye the -1.9 degree ray hits the ground 60 m away and is
 * black, so "the horizon" came out as half a ground ray. The warp also spends rows where the
 * sky actually changes: row 25 of 48 is 0.17 degrees up, row 30 is 6 degrees.
 */
export function skyElevationForRow(height: number, row: number): number {
  const pivot = horizonRowIndex(height);
  if (row <= pivot) {
    const u = (pivot - row) / Math.max(1, pivot);
    return -u * u * (Math.PI / 2);
  }
  const u = (row - pivot) / Math.max(1, height - 1 - pivot);
  return u * u * (Math.PI / 2);
}

/** Inverse of `skyElevationForRow`, as a fractional row for bilinear lookup. */
function skyRowForElevation(height: number, elevationRad: number): number {
  const pivot = horizonRowIndex(height);
  const clamped = Math.min(Math.PI / 2, Math.max(-Math.PI / 2, elevationRad));
  const u = Math.sqrt(Math.abs(clamped) / (Math.PI / 2));
  return clamped <= 0
    ? pivot - u * Math.max(1, pivot)
    : pivot + u * Math.max(1, height - 1 - pivot);
}

export function buildSkyTable(
  sunElevationRad: number,
  sunAzimuthRad: number,
  options?: { width?: number; height?: number },
): SkyTable {
  const width = Math.max(2, Math.floor(options?.width ?? 96));
  const height = Math.max(2, Math.floor(options?.height ?? 48));
  const data = new Float32Array(width * height * 3);

  const sinSun = Math.sin(sunElevationRad);
  const cosSun = Math.cos(sunElevationRad);
  const pivot = horizonRowIndex(height);
  // The sky is mirror-symmetric about the sun's meridian, so half the columns are integrated
  // and the rest copied. That is what pays for the now azimuth-dependent light rays.
  const half = Math.floor(width / 2);
  const opacity = new Float32Array(width * height * 3);

  const knotCount = Math.ceil(half / AZIMUTH_STRIDE) + 1;
  const knotColumn = (j: number): number => Math.min(j * AZIMUTH_STRIDE, half);
  const knots = new Float64Array(knotCount * 9);

  for (let row = 0; row < height; row++) {
    const elevation = skyElevationForRow(height, row);
    const sinView = Math.sin(elevation);
    const cosView = Math.cos(elevation);
    for (let j = 0; j < knotCount; j++) {
      const cosAzimuth = Math.cos((knotColumn(j) * 2 * Math.PI) / width);
      const ray = integrateRay(elevation, cosAzimuth, sunElevationRad);
      for (let c = 0; c < 3; c++) {
        knots[j * 9 + c] = ray.rayleigh[c] ?? 0;
        knots[j * 9 + 3 + c] = ray.mie[c] ?? 0;
        knots[j * 9 + 6 + c] = ray.transmittance[c] ?? 1;
      }
    }
    for (let col = 0; col <= half; col++) {
      const j = Math.min(knotCount - 2, Math.floor(col / AZIMUTH_STRIDE));
      const lo = knotColumn(j);
      const hi = knotColumn(j + 1);
      const f = hi > lo ? (col - lo) / (hi - lo) : 0;
      const cosAzimuth = Math.cos((col * 2 * Math.PI) / width);
      const cosPhase = Math.min(1, Math.max(-1, sinView * sinSun + cosView * cosSun * cosAzimuth));
      const pr = rayleighPhase(cosPhase);
      const pm = miePhase(cosPhase);
      const base = (row * width + col) * 3;
      const mirror = (row * width + (width - col)) * 3;
      for (let c = 0; c < 3; c++) {
        const blend = (slot: number): number =>
          (knots[j * 9 + slot + c] ?? 0) * (1 - f) + (knots[(j + 1) * 9 + slot + c] ?? 0) * f;
        const single = SUN_IRRADIANCE * (blend(0) * pr + blend(3) * pm);
        const fade = 1 - blend(6);
        const clean = Number.isFinite(single) && single > 0 ? single : 0;
        data[base + c] = clean;
        opacity[base + c] = Number.isFinite(fade) && fade > 0 ? fade : 0;
        if (width - col < width) {
          data[mirror + c] = clean;
          opacity[mirror + c] = opacity[base + c] ?? 0;
        }
      }
    }
  }

  // Mean upper-hemisphere radiance of the single-scattering pass, solid-angle weighted. This
  // is the source the multiple-scattering term relaxes toward, so it must be measured before
  // that term is added; one iteration is enough at this table's accuracy.
  const mean: [number, number, number] = [0, 0, 0];
  let weightSum = 0;
  for (let row = pivot; row < height; row++) {
    const e = skyElevationForRow(height, row);
    const lo = skyElevationForRow(height, Math.max(pivot, row - 1));
    const hi = skyElevationForRow(height, Math.min(height - 1, row + 1));
    const weight = (Math.cos(e) * (hi - lo)) / 2;
    if (weight <= 0) continue;
    weightSum += weight;
    for (let col = 0; col < width; col++) {
      const base = (row * width + col) * 3;
      for (let c = 0; c < 3; c++)
        mean[c] = (mean[c] ?? 0) + ((data[base + c] ?? 0) * weight) / width;
    }
  }
  for (let c = 0; c < 3; c++) mean[c] = weightSum > 0 ? (mean[c] ?? 0) / weightSum : 0;

  for (let i = 0; i < data.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const value =
        (data[i + c] ?? 0) + MULTI_SCATTER_GAIN * (mean[c] ?? 0) * (opacity[i + c] ?? 0);
      // Guard once, here, so no consumer can ever see a NaN or a negative radiance.
      data[i + c] = Number.isFinite(value) && value > 0 ? value : 0;
    }
  }

  const zenith = (row: number): [number, number, number] => {
    const base = row * width * 3;
    return [data[base] ?? 0, data[base + 1] ?? 0, data[base + 2] ?? 0];
  };
  const horizon: [number, number, number] = [0, 0, 0];
  for (let col = 0; col < width; col++) {
    const base = (pivot * width + col) * 3;
    for (let c = 0; c < 3; c++) horizon[c] = (horizon[c] ?? 0) + (data[base + c] ?? 0) / width;
  }

  return {
    data,
    width,
    height,
    sunElevationRad,
    sunAzimuthRad,
    sunTransmittance: sunTransmittanceAt(sunElevationRad),
    zenithColor: zenith(height - 1),
    horizonColor: horizon,
  };
}

/** Bilinear lookup by view direction, matching what the GPU shader will do. */
export function sampleSky(
  table: SkyTable,
  viewElevationRad: number,
  azimuthRelativeToSunRad: number,
): [number, number, number] {
  const { width, height, data } = table;
  const y = skyRowForElevation(height, viewElevationRad);
  const row0 = Math.min(height - 1, Math.max(0, Math.floor(y)));
  const row1 = Math.min(height - 1, row0 + 1);
  const fy = y - row0;

  const turns = azimuthRelativeToSunRad / (2 * Math.PI);
  const x = (turns - Math.floor(turns)) * width;
  const col0 = Math.min(width - 1, Math.floor(x));
  const col1 = (col0 + 1) % width; // Azimuth is periodic, so the last column blends into the first.
  const fx = x - col0;

  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const a = data[(row0 * width + col0) * 3 + c] ?? 0;
    const b = data[(row0 * width + col1) * 3 + c] ?? 0;
    const d = data[(row1 * width + col0) * 3 + c] ?? 0;
    const e = data[(row1 * width + col1) * 3 + c] ?? 0;
    out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
  }
  return out;
}

/** Horizon colour in a given world azimuth, for the single-colour scene fog. */
export function skyFogColor(table: SkyTable, viewAzimuthRad: number): [number, number, number] {
  return sampleSky(table, 0, viewAzimuthRad - table.sunAzimuthRad);
}

/**
 * True once the sun has moved more than `toleranceRad` (~0.25 degrees by default) from the
 * direction the table was baked for. Angular distance between the two sun directions, not a
 * per-component compare, so azimuth near the zenith cannot trigger a pointless rebuild.
 */
export function skyTableIsStale(
  table: SkyTable,
  sunElevationRad: number,
  sunAzimuthRad: number,
  toleranceRad = 0.0044,
): boolean {
  const cosAngle =
    Math.sin(table.sunElevationRad) * Math.sin(sunElevationRad) +
    Math.cos(table.sunElevationRad) *
      Math.cos(sunElevationRad) *
      Math.cos(sunAzimuthRad - table.sunAzimuthRad);
  return Math.acos(Math.min(1, Math.max(-1, cosAngle))) > toleranceRad;
}
