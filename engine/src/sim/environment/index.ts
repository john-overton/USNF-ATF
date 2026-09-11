/**
 * The theater environment: a clock with a real sun and moon, a wind field the
 * flight model reads, and the authored cloud layers the renderer marches.
 * Pure TypeScript; nothing here imports Three.js or touches the DOM.
 */
import type { Vec3 } from '../flight';
import {
  moonPosition,
  seasonFor,
  sunPosition,
  dayOfYearFor,
  type MoonPosition,
  type Season,
  type SkyBody,
} from './solar';
import {
  createWindField,
  isWindPresetId,
  windAt,
  windProfile,
  WIND_PRESETS,
  type WindField,
  type WindPresetId,
} from './wind';
import { isWeatherId, WEATHER_PRESETS, type WeatherId, type WeatherPreset } from './clouds';

export * from './solar';
export * from './wind';
export * from './clouds';

export type CloudQuality = 'off' | 'quarter' | 'half' | 'full';
export const CLOUD_QUALITIES: readonly CloudQuality[] = ['off', 'quarter', 'half', 'full'];

export interface EnvironmentSettings {
  latitudeDeg: number;
  longitudeDeg: number;
  year: number;
  dayOfYear: number;
  /** Local mean solar time, hours. */
  timeOfDayHours: number;
  /** Clock rate; 1 is real time. Acceleration is deferred, so this stays 1. */
  rate: number;
  weather: WeatherId;
  wind: WindPresetId;
  /** Bearing the wind blows from, degrees clockwise from north. */
  windDirectionDeg: number;
  seed: number;
}

/** The plan's default startup weather: clear sky with a light surface wind. */
export function defaultEnvironmentSettings(now = new Date()): EnvironmentSettings {
  return {
    latitudeDeg: 46.5,
    longitudeDeg: 31.5,
    year: now.getFullYear(),
    dayOfYear: dayOfYearFor(now.getMonth() + 1, now.getDate()),
    timeOfDayHours: now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600,
    rate: 1,
    weather: 'clear',
    wind: 'light',
    windDirectionDeg: 250,
    seed: 1337,
  };
}

/**
 * The terrain pipeline writes a PROJ LAEA string, so its centre is the theater's
 * latitude and longitude. Returns undefined for any other projection rather
 * than guessing a location.
 */
export function theaterCenterFromCrs(
  crs: string,
): { latitudeDeg: number; longitudeDeg: number } | undefined {
  const lat = /\+lat_0=(-?\d+(?:\.\d+)?)/.exec(crs),
    lon = /\+lon_0=(-?\d+(?:\.\d+)?)/.exec(crs);
  if (!lat || !lon || !crs.includes('+proj=laea')) return undefined;
  return { latitudeDeg: Number(lat[1]), longitudeDeg: Number(lon[1]) };
}

export class Environment {
  readonly settings: EnvironmentSettings;
  private field: WindField;
  private cachedHours = NaN;
  private cachedSun: SkyBody | undefined;
  private cachedMoon: MoonPosition | undefined;
  constructor(settings: Partial<EnvironmentSettings> = {}) {
    this.settings = { ...defaultEnvironmentSettings(), ...settings };
    this.field = createWindField(this.settings.wind, {
      directionDeg: this.settings.windDirectionDeg,
      seed: this.settings.seed,
    });
  }
  /** Advance the clock by wall-clock seconds, wrapping the day. */
  advance(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const hours = this.settings.timeOfDayHours + (seconds * this.settings.rate) / 3600;
    this.settings.timeOfDayHours = ((hours % 24) + 24) % 24;
    if (hours >= 24) this.settings.dayOfYear = (this.settings.dayOfYear % 366) + 1;
  }
  setTimeOfDay(hours: number): void {
    if (!Number.isFinite(hours) || hours < 0 || hours > 24)
      throw new Error('Time of day must be 0 to 24 hours');
    this.settings.timeOfDayHours = hours % 24;
    this.cachedHours = NaN;
  }
  setDate(year: number, dayOfYear: number): void {
    if (!Number.isInteger(year) || year < 1600 || year > 2400)
      throw new Error('Year must be between 1600 and 2400');
    if (!Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > 366)
      throw new Error('Day of year must be 1 to 366');
    this.settings.year = year;
    this.settings.dayOfYear = dayOfYear;
    this.cachedHours = NaN;
  }
  setWeather(id: WeatherId): void {
    this.settings.weather = id;
  }
  setWind(id: WindPresetId): void {
    this.settings.wind = id;
    this.field = createWindField(id, {
      directionDeg: this.settings.windDirectionDeg,
      seed: this.settings.seed,
    });
  }
  private refresh(): void {
    if (this.cachedHours === this.settings.timeOfDayHours && this.cachedSun && this.cachedMoon)
      return;
    const s = this.settings;
    this.cachedHours = s.timeOfDayHours;
    this.cachedSun = sunPosition(s.latitudeDeg, s.dayOfYear, s.timeOfDayHours);
    this.cachedMoon = moonPosition(
      s.latitudeDeg,
      s.longitudeDeg,
      s.year,
      s.dayOfYear,
      s.timeOfDayHours,
    );
  }
  get sun(): SkyBody {
    this.refresh();
    return this.cachedSun!;
  }
  get moon(): MoonPosition {
    this.refresh();
    return this.cachedMoon!;
  }
  get season(): Season {
    return seasonFor(this.settings.dayOfYear, this.settings.latitudeDeg);
  }
  get weather(): WeatherPreset {
    return WEATHER_PRESETS[this.settings.weather];
  }
  get windField(): WindField {
    return this.field;
  }
  windAt(position: Vec3, seconds: number): Vec3 {
    return windAt(this.field, position, seconds);
  }
  /** Mean wind at a cloud layer's altitude; drives coverage drift. */
  layerWind(altitudeM: number): { speed: number; bearingDeg: number } {
    return windProfile(this.field, altitudeM);
  }
}

export interface EnvironmentQuery {
  timeOfDayHours?: number;
  dayOfYear?: number;
  weather?: WeatherId;
  wind?: WindPresetId;
  clouds?: CloudQuality;
  cloudSteps?: number;
  fog?: 'off' | 'ground';
  cloudAppearance?: 'sunshine' | 'solid' | 'volume';
}
/**
 * URL overrides. Invalid values throw so the viewer's existing explicit error
 * path reports them, rather than a silent default hiding a typo.
 */
export function parseEnvironmentQuery(search: string): EnvironmentQuery {
  const params = new URLSearchParams(search);
  const query: EnvironmentQuery = {};
  const time = params.get('time');
  if (time !== null) {
    const hours = Number(time);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24)
      throw new Error(`Invalid time parameter “${time}”: expected hours 0 to 24`);
    query.timeOfDayHours = hours % 24;
  }
  const date = params.get('date');
  if (date !== null) {
    const monthDay = /^(\d{1,2})-(\d{1,2})$/.exec(date);
    if (monthDay) {
      const month = Number(monthDay[1]),
        day = Number(monthDay[2]);
      if (month < 1 || month > 12 || day < 1 || day > 31)
        throw new Error(`Invalid date parameter “${date}”: expected MM-DD or a day of year`);
      query.dayOfYear = dayOfYearFor(month, day);
    } else {
      const dayOfYear = Number(date);
      if (!Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > 366)
        throw new Error(`Invalid date parameter “${date}”: expected MM-DD or a day of year`);
      query.dayOfYear = dayOfYear;
    }
  }
  const weather = params.get('weather');
  if (weather !== null) {
    if (!isWeatherId(weather))
      throw new Error(
        `Invalid weather parameter “${weather}”: expected ${Object.keys(WEATHER_PRESETS).join(', ')}`,
      );
    query.weather = weather;
  }
  const wind = params.get('wind');
  if (wind !== null) {
    if (!isWindPresetId(wind))
      throw new Error(
        `Invalid wind parameter “${wind}”: expected ${Object.keys(WIND_PRESETS).join(', ')}`,
      );
    query.wind = wind;
  }
  const clouds = params.get('clouds');
  if (clouds !== null) {
    if (!(CLOUD_QUALITIES as readonly string[]).includes(clouds))
      throw new Error(
        `Invalid clouds parameter “${clouds}”: expected ${CLOUD_QUALITIES.join(', ')}`,
      );
    query.clouds = clouds as CloudQuality;
  }
  const appearance = params.get('cloudAppearance');
  if (appearance !== null) {
    if (appearance !== 'sunshine' && appearance !== 'solid' && appearance !== 'volume')
      throw new Error('Invalid cloudAppearance parameter: expected sunshine, solid or volume');
    query.cloudAppearance = appearance;
  }
  const fog = params.get('fog');
  if (fog !== null) {
    if (fog !== 'off' && fog !== 'ground')
      throw new Error('Invalid fog parameter: expected off or ground');
    query.fog = fog;
  }
  const steps = params.get('cloudSteps');
  if (steps !== null) {
    const count = Number(steps);
    if (!Number.isInteger(count) || count < 8 || count > 192)
      throw new Error(`Invalid cloudSteps parameter “${steps}”: expected an integer 8 to 192`);
    query.cloudSteps = count;
  }
  return query;
}
