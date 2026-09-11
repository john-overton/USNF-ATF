/**
 * Sun and moon geometry for the theater clock. NOAA-style solar position is
 * accurate to a fraction of a degree; the moon uses truncated Meeus mean
 * elements and is explicitly approximate — good enough for a night-lit
 * silhouette and a plausible phase, not for navigation.
 */
import type { Vec3 } from '../flight';

const DEG = Math.PI / 180;
const norm360 = (d: number): number => ((d % 360) + 360) % 360;

export interface SkyBody {
  /** Radians above the horizon; negative below. */
  elevationRad: number;
  /** Radians clockwise from north. */
  azimuthRad: number;
  /** Unit world vector pointing at the body: +Y up, +Z north, +X west. */
  direction: Vec3;
}
export interface MoonPosition extends SkyBody {
  /** Illuminated fraction, 0 new to 1 full. Approximate. */
  phase: number;
  /** Whether illumination is increasing; used for the eight conventional phase icons. */
  waxing: boolean;
}
export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

/**
 * World +Y is up, +Z is north and +X is west, so east is -X and a compass
 * bearing measured clockwise from north maps to (-sin, 0, cos).
 */
export function directionFromHorizontal(elevationRad: number, azimuthRad: number): Vec3 {
  const c = Math.cos(elevationRad);
  return { x: -c * Math.sin(azimuthRad), y: Math.sin(elevationRad), z: c * Math.cos(azimuthRad) };
}

/** Horizontal coordinates from equatorial hour angle and declination. */
function horizontal(latitudeRad: number, hourAngleRad: number, declinationRad: number): SkyBody {
  const sinLat = Math.sin(latitudeRad),
    cosLat = Math.cos(latitudeRad);
  const sinDec = Math.sin(declinationRad),
    cosDec = Math.cos(declinationRad);
  const elevationRad = Math.asin(
    Math.max(-1, Math.min(1, sinLat * sinDec + cosLat * cosDec * Math.cos(hourAngleRad))),
  );
  // Normalised to 0..2pi so diagnostics read as a compass bearing.
  const azimuthRad =
    (Math.atan2(
      -cosDec * Math.sin(hourAngleRad),
      sinDec * cosLat - cosDec * sinLat * Math.cos(hourAngleRad),
    ) +
      2 * Math.PI) %
    (2 * Math.PI);
  return { elevationRad, azimuthRad, direction: directionFromHorizontal(elevationRad, azimuthRad) };
}

/** Days since J2000.0 from a local mean solar time and the theater longitude. */
export function daysSinceJ2000(
  year: number,
  dayOfYear: number,
  localHours: number,
  longitudeDeg: number,
): number {
  // Julian day of January 0.0 of the year, then add the day of year.
  const y = year - 1,
    a = Math.floor(y / 100);
  const januaryZero =
    Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * 14) + 2 - a + Math.floor(a / 4) - 1524.5;
  const universalHours = localHours - longitudeDeg / 15;
  return januaryZero + dayOfYear + universalHours / 24 - 2451545;
}

/**
 * NOAA general solar position. `localHours` is local mean solar time, which is
 * what the helper panel's slider sets; the equation of time supplies the
 * difference to true solar time.
 */
export function sunPosition(latitudeDeg: number, dayOfYear: number, localHours: number): SkyBody {
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (localHours - 12) / 24);
  const equationOfTimeMinutes =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const declinationRad =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const trueSolarMinutes = localHours * 60 + equationOfTimeMinutes;
  return horizontal(latitudeDeg * DEG, (trueSolarMinutes / 4 - 180) * DEG, declinationRad);
}

/** Truncated Meeus lunar terms: within a degree or so, and labeled approximate. */
export function moonPosition(
  latitudeDeg: number,
  longitudeDeg: number,
  year: number,
  dayOfYear: number,
  localHours: number,
): MoonPosition {
  const d = daysSinceJ2000(year, dayOfYear, localHours, longitudeDeg);
  const meanLongitude = norm360(218.316 + 13.176396 * d),
    meanAnomaly = norm360(134.963 + 13.064993 * d) * DEG,
    argumentOfLatitude = norm360(93.272 + 13.22935 * d) * DEG;
  const lambda = (meanLongitude + 6.289 * Math.sin(meanAnomaly)) * DEG;
  const beta = 5.128 * Math.sin(argumentOfLatitude) * DEG;
  const obliquity = 23.4397 * DEG;
  const declinationRad = Math.asin(
    Math.max(
      -1,
      Math.min(
        1,
        Math.sin(beta) * Math.cos(obliquity) +
          Math.cos(beta) * Math.sin(obliquity) * Math.sin(lambda),
      ),
    ),
  );
  const rightAscensionRad = Math.atan2(
    Math.sin(lambda) * Math.cos(obliquity) - Math.tan(beta) * Math.sin(obliquity),
    Math.cos(lambda),
  );
  const siderealDeg = norm360(280.46061837 + 360.98564736629 * d + longitudeDeg);
  const body = horizontal(
    latitudeDeg * DEG,
    (siderealDeg - rightAscensionRad / DEG) * DEG,
    declinationRad,
  );
  const sunAnomaly = norm360(357.529 + 0.98560028 * d) * DEG;
  const sunLongitude =
    norm360(
      280.459 + 0.98564736 * d + 1.915 * Math.sin(sunAnomaly) + 0.02 * Math.sin(2 * sunAnomaly),
    ) * DEG;
  const phaseAngle = lambda - sunLongitude;
  return {
    ...body,
    phase: (1 - Math.cos(phaseAngle)) / 2,
    waxing: Math.sin(phaseAngle) >= 0,
  };
}

/** Meteorological seasons, flipped south of the equator. */
export function seasonFor(dayOfYear: number, latitudeDeg: number): Season {
  const month = monthOfYear(dayOfYear);
  const northern: Season =
    month <= 2 || month === 12
      ? 'winter'
      : month <= 5
        ? 'spring'
        : month <= 8
          ? 'summer'
          : 'autumn';
  if (latitudeDeg >= 0) return northern;
  const opposite: Record<Season, Season> = {
    winter: 'summer',
    spring: 'autumn',
    summer: 'winter',
    autumn: 'spring',
  };
  return opposite[northern];
}

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Month 1-12 for a day of year, using a leap-year calendar so seasons never shift. */
export function monthOfYear(dayOfYear: number): number {
  let remaining = Math.max(1, Math.min(366, Math.floor(dayOfYear)));
  for (let month = 0; month < 12; month++) {
    if (remaining <= MONTH_DAYS[month]!) return month + 1;
    remaining -= MONTH_DAYS[month]!;
  }
  return 12;
}
/** Day of year for a 1-based month and day, on the same leap-year calendar. */
export function dayOfYearFor(month: number, day: number): number {
  let total = day;
  for (let m = 0; m < month - 1; m++) total += MONTH_DAYS[m]!;
  return total;
}

/** Inverse of `dayOfYearFor`, retaining its deliberate leap-calendar convention. */
export function monthDayFor(dayOfYear: number): { month: number; day: number } {
  let remaining = Math.max(1, Math.min(366, Math.floor(dayOfYear)));
  for (let month = 0; month < MONTH_DAYS.length; month++) {
    const days = MONTH_DAYS[month]!;
    if (remaining <= days) return { month: month + 1, day: remaining };
    remaining -= days;
  }
  return { month: 12, day: 31 };
}
