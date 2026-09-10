/**
 * Detection model recovered from the retail `.SEE` sensor files and the manual's
 * detection tables. See `Docs/formats/sensors.md`.
 *
 * A sensor reads exactly one of four signature channels and has two nested
 * cones: a wider search zone that produces a contact, and a narrower track zone
 * that supports a designation. Retail stores half-angles as 1/65536 of a turn
 * and ranges in feet; conversion belongs to the importer, so everything here is
 * radians and metres.
 *
 * Pure and allocation-light: called per observer/target pair inside the fixed
 * 120 Hz step, so it must stay deterministic and free of wall-clock or RNG.
 */
import type { Quaternion, Vec3 } from '../flight';

/** Retail `sig` 0..3. Channel 4 exists but no `.SEE` uses it. */
export type SensorKind = 'visual' | 'laser' | 'infrared' | 'radar';
export const SENSOR_KINDS: readonly SensorKind[] = ['visual', 'laser', 'infrared', 'radar'];

export interface SensorZone {
  /** Azimuth half-angle from the sensor boresight, radians. */
  halfAngleHRad: number;
  /** Elevation half-angle from the sensor boresight, radians. */
  halfAngleVRad: number;
  minRangeM: number;
  maxRangeM: number;
  /** Retail encodes "unlimited" as the int32 extremes; the importer widens those. */
  minAltM: number;
  maxAltM: number;
}
export interface Sensor {
  /** Retail short name, e.g. `AWG-9`. */
  name: string;
  kind: SensorKind;
  /**
   * Retail `lookDown`, 0..100. Read as a degradation percent applied to range
   * when looking down at a target, not as a capability rating: it is 0 on every
   * pulse-doppler set and 50 on the old pulse radars. Hypothesis, high
   * confidence; see `Docs/formats/sensors.md`.
   */
  lookDownPenaltyPercent: number;
  search: SensorZone;
  track: SensorZone;
}

/** Per-channel signature, retail `OBJ_TYPE.sigs[0..3]`, where 100 is baseline. */
export type Signatures = Record<SensorKind, number>;
export const BASELINE_SIGNATURE = 100;

/**
 * Weather range multipliers per sensor channel, from the manual's detection
 * table. Night extends infra-red past unity; cloud and fog gut visual and IR.
 */
export type WeatherCondition = 'day' | 'night' | 'twilight' | 'haze' | 'clouds' | 'fog';
export const WEATHER_SENSOR_RANGE: Readonly<Record<WeatherCondition, Signatures>> = Object.freeze({
  day: { visual: 1, laser: 1, infrared: 1, radar: 1 },
  night: { visual: 0.25, laser: 1, infrared: 1.25, radar: 1 },
  twilight: { visual: 0.75, laser: 1, infrared: 1, radar: 1 },
  haze: { visual: 0.75, laser: 1, infrared: 1, radar: 1 },
  clouds: { visual: 0.1, laser: 0.5, infrared: 0.1, radar: 0.75 },
  fog: { visual: 0.25, laser: 0.5, infrared: 0.1, radar: 1 },
});

/**
 * Signature multipliers the manual states for the target's own configuration.
 * Jamming is deliberately absent here: it reduces track probability while
 * raising detectability, so it is not a single range factor.
 */
export const AFTERBURNER_INFRARED_FACTOR = 2;
export const EXTERNAL_STORES_RADAR_FACTOR = 1.33;
export const GEAR_DOWN_RADAR_FACTOR = 1.25;
/**
 * "Pointing your aircraft at a sensor greatly reduces the corresponding
 * signature since an aircraft appears smallest when viewed from directly
 * ahead." The manual gives no number, so this nose-on floor is an original
 * approximation, not recovered retail behaviour.
 */
export const NOSE_ON_SIGNATURE_FLOOR = 0.55;

export interface TargetConfiguration {
  afterburner?: boolean;
  externalStores?: boolean;
  gearDown?: boolean;
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Rotate a body vector into world space by a unit quaternion. */
export function rotate(q: Quaternion, v: Vec3): Vec3 {
  const { x, y, z, w } = q;
  const tx = 2 * (y * v.z - z * v.y),
    ty = 2 * (z * v.x - x * v.z),
    tz = 2 * (x * v.y - y * v.x);
  return {
    x: v.x + w * tx + (y * tz - z * ty),
    y: v.y + w * ty + (z * tx - x * tz),
    z: v.z + w * tz + (x * ty - y * tx),
  };
}
/** Aircraft nose direction: the flight model's body forward is -Z. */
export function forwardAxis(attitude: Quaternion): Vec3 {
  return rotate(attitude, { x: 0, y: 0, z: -1 });
}

/**
 * The effective signature the observer sees, after configuration multipliers and
 * the nose-on aspect reduction. `toObserver` need not be normalized.
 */
export function effectiveSignature(
  kind: SensorKind,
  signatures: Signatures,
  target: { attitude: Quaternion; configuration?: TargetConfiguration },
  toObserver: Vec3,
): number {
  const configuration = target.configuration ?? {};
  let signature = signatures[kind];
  if (kind === 'infrared' && configuration.afterburner === true)
    signature *= AFTERBURNER_INFRARED_FACTOR;
  if (kind === 'radar') {
    if (configuration.externalStores === true) signature *= EXTERNAL_STORES_RADAR_FACTOR;
    if (configuration.gearDown === true) signature *= GEAR_DOWN_RADAR_FACTOR;
  }
  // Aspect: 1 abeam or tail-on, falling to the nose-on floor when the target
  // points its nose at the observer. Laser and infra-red are also aspect
  // dependent in the original, so this applies to every channel.
  const length = Math.hypot(toObserver.x, toObserver.y, toObserver.z);
  if (length > 1e-6) {
    const nose = forwardAxis(target.attitude);
    const facing = Math.max(
      0,
      dot(nose, {
        x: toObserver.x / length,
        y: toObserver.y / length,
        z: toObserver.z / length,
      }),
    );
    signature *= 1 - (1 - NOSE_ON_SIGNATURE_FLOOR) * facing;
  }
  return Math.max(0, signature);
}

/** The range at which this zone detects a target of the given signature. */
export function zoneRangeM(
  zone: SensorZone,
  sensor: Sensor,
  signature: number,
  weather: WeatherCondition,
  lookingDown: boolean,
): number {
  const weatherFactor = WEATHER_SENSOR_RANGE[weather][sensor.kind];
  const lookDown = lookingDown
    ? Math.max(0, 1 - Math.min(100, Math.max(0, sensor.lookDownPenaltyPercent)) / 100)
    : 1;
  return zone.maxRangeM * weatherFactor * lookDown * (signature / BASELINE_SIGNATURE);
}

export type DetectionLevel = 'none' | 'search' | 'track';
export interface DetectionResult {
  level: DetectionLevel;
  rangeM: number;
  /** Off-boresight angle to the target, radians; useful for scope azimuth. */
  bearingRad: number;
  elevationRad: number;
}

function withinZone(
  zone: SensorZone,
  bearingRad: number,
  elevationRad: number,
  rangeM: number,
  targetAltitudeM: number,
): boolean {
  return (
    Math.abs(bearingRad) <= zone.halfAngleHRad &&
    Math.abs(elevationRad) <= zone.halfAngleVRad &&
    rangeM >= zone.minRangeM &&
    targetAltitudeM >= zone.minAltM &&
    targetAltitudeM <= zone.maxAltM
  );
}

/**
 * Evaluate one sensor against one target, returning the best level achieved.
 *
 * The two zones are tested independently rather than nested. The track zone is
 * normally the narrower of the two, but three retail IRST files invert it
 * (9 nm search against 10 nm track), so assuming containment would silently drop
 * their tracks. See `Docs/formats/sensors.md`.
 */
export function detect(
  observer: { position: Vec3; attitude: Quaternion },
  sensor: Sensor,
  target: {
    position: Vec3;
    attitude: Quaternion;
    signatures: Signatures;
    configuration?: TargetConfiguration;
  },
  weather: WeatherCondition = 'day',
): DetectionResult {
  const delta = {
    x: target.position.x - observer.position.x,
    y: target.position.y - observer.position.y,
    z: target.position.z - observer.position.z,
  };
  const rangeM = Math.hypot(delta.x, delta.y, delta.z);
  // Boresight-relative angles. Bearing is measured in the observer's horizontal
  // plane so a rolled aircraft does not appear to slew its own radar.
  const nose = forwardAxis(observer.attitude);
  const noseHeading = Math.atan2(nose.x, -nose.z);
  const targetHeading = Math.atan2(delta.x, -delta.z);
  let bearingRad = targetHeading - noseHeading;
  while (bearingRad > Math.PI) bearingRad -= 2 * Math.PI;
  while (bearingRad < -Math.PI) bearingRad += 2 * Math.PI;
  const horizontal = Math.hypot(delta.x, delta.z);
  const nosePitch = Math.atan2(nose.y, Math.hypot(nose.x, nose.z));
  const elevationRad = Math.atan2(delta.y, horizontal) - nosePitch;
  const miss: DetectionResult = { level: 'none', rangeM, bearingRad, elevationRad };
  if (rangeM < 1e-6) return miss;

  const signature = effectiveSignature(sensor.kind, target.signatures, target, {
    x: -delta.x,
    y: -delta.y,
    z: -delta.z,
  });
  if (signature <= 0) return miss;
  const lookingDown = delta.y < 0;
  const altitude = target.position.y;
  if (
    withinZone(sensor.track, bearingRad, elevationRad, rangeM, altitude) &&
    rangeM <= zoneRangeM(sensor.track, sensor, signature, weather, lookingDown)
  )
    return { level: 'track', rangeM, bearingRad, elevationRad };
  if (
    withinZone(sensor.search, bearingRad, elevationRad, rangeM, altitude) &&
    rangeM <= zoneRangeM(sensor.search, sensor, signature, weather, lookingDown)
  )
    return { level: 'search', rangeM, bearingRad, elevationRad };
  return miss;
}

/** The best level any of the observer's sensors achieves against a target. */
export function detectBest(
  observer: { position: Vec3; attitude: Quaternion },
  sensors: readonly Sensor[],
  target: Parameters<typeof detect>[2],
  weather: WeatherCondition = 'day',
): { result: DetectionResult; sensor?: Sensor } {
  let best: DetectionResult | undefined;
  let bestSensor: Sensor | undefined;
  const rank = { none: 0, search: 1, track: 2 } as const;
  for (const sensor of sensors) {
    const result = detect(observer, sensor, target, weather);
    if (!best || rank[result.level] > rank[best.level]) {
      best = result;
      if (result.level !== 'none') bestSensor = sensor;
    }
  }
  const result = best ?? { level: 'none', rangeM: 0, bearingRad: 0, elevationRad: 0 };
  return bestSensor ? { result, sensor: bestSensor } : { result };
}
