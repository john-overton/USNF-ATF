import { expect, test } from 'bun:test';
import {
  dayOfYearFor,
  daysSinceJ2000,
  monthDayFor,
  monthOfYear,
  moonPosition,
  seasonFor,
  sunPosition,
} from './solar';
import { createWindField, windAt, windProfile, WIND_PRESETS } from './wind';
import {
  cloudDensityAt,
  layerHeightGradient,
  marchedLayer,
  WEATHER_PRESETS,
  COVERAGE_TILE_METERS,
} from './clouds';
import { Environment, parseEnvironmentQuery, theaterCenterFromCrs } from './index';

const DEG = 180 / Math.PI;
const LAT = 46.5;

test('solar elevation matches published solstice and equinox values at 46.5 N', () => {
  const solstice = sunPosition(LAT, dayOfYearFor(6, 21), 12);
  expect(solstice.elevationRad * DEG).toBeCloseTo(67, 0);
  const equinox = sunPosition(LAT, dayOfYearFor(3, 20), 12);
  expect(equinox.elevationRad * DEG).toBeCloseTo(43.5, 0);
  const winter = sunPosition(LAT, dayOfYearFor(12, 21), 12);
  expect(winter.elevationRad * DEG).toBeCloseTo(20, 0);
  expect(sunPosition(LAT, dayOfYearFor(6, 21), 0).elevationRad).toBeLessThan(0);
});

test('solar azimuth is south at noon and east of south in the morning', () => {
  const noon = sunPosition(LAT, dayOfYearFor(6, 21), 12);
  // The equation of time offsets true solar noon from the mean-time slider by a minute or two.
  expect(Math.abs(noon.azimuthRad * DEG - 180)).toBeLessThan(2);
  const morning = sunPosition(LAT, dayOfYearFor(6, 21), 8);
  expect(morning.azimuthRad * DEG).toBeGreaterThan(60);
  expect(morning.azimuthRad * DEG).toBeLessThan(180);
  const evening = sunPosition(LAT, dayOfYearFor(6, 21), 17);
  expect(evening.azimuthRad * DEG).toBeGreaterThan(180);
});

test('sun direction uses world axes: +Y up, +Z north, +X west', () => {
  const noon = sunPosition(LAT, dayOfYearFor(6, 21), 12);
  // Due south is -Z; the sun is high, so +Y dominates and X is ~0.
  expect(noon.direction.y).toBeGreaterThan(0.9);
  expect(noon.direction.z).toBeLessThan(0);
  expect(Math.abs(noon.direction.x)).toBeLessThan(0.02);
  const morning = sunPosition(LAT, dayOfYearFor(6, 21), 7);
  // East is -X.
  expect(morning.direction.x).toBeLessThan(0);
  for (const body of [noon, morning])
    expect(Math.hypot(body.direction.x, body.direction.y, body.direction.z)).toBeCloseTo(1, 12);
});

test('J2000 epoch and calendar helpers agree with the Julian day standard', () => {
  expect(daysSinceJ2000(2000, 1, 12, 0)).toBeCloseTo(0, 9);
  expect(monthOfYear(dayOfYearFor(7, 15))).toBe(7);
  expect(dayOfYearFor(1, 1)).toBe(1);
  expect(dayOfYearFor(12, 31)).toBe(366);
  expect(monthDayFor(dayOfYearFor(9, 11))).toEqual({ month: 9, day: 11 });
});

test('moon position is finite, unit length and phased between new and full', () => {
  for (let day = 1; day <= 366; day += 7)
    for (const hour of [0, 6, 12, 18]) {
      const moon = moonPosition(LAT, 31.5, 2026, day, hour);
      expect(Number.isFinite(moon.elevationRad)).toBe(true);
      expect(Math.hypot(moon.direction.x, moon.direction.y, moon.direction.z)).toBeCloseTo(1, 12);
      expect(moon.phase).toBeGreaterThanOrEqual(0);
      expect(moon.phase).toBeLessThanOrEqual(1);
      expect(typeof moon.waxing).toBe('boolean');
    }
  // A synodic month of phases must span nearly new to nearly full.
  const phases = Array.from(
    { length: 30 },
    (_, i) => moonPosition(LAT, 31.5, 2026, 1 + i, 0).phase,
  );
  expect(Math.min(...phases)).toBeLessThan(0.1);
  expect(Math.max(...phases)).toBeGreaterThan(0.9);
});

test('seasons follow the date and flip south of the equator', () => {
  expect(seasonFor(dayOfYearFor(1, 15), LAT)).toBe('winter');
  expect(seasonFor(dayOfYearFor(4, 15), LAT)).toBe('spring');
  expect(seasonFor(dayOfYearFor(7, 15), LAT)).toBe('summer');
  expect(seasonFor(dayOfYearFor(10, 15), LAT)).toBe('autumn');
  expect(seasonFor(dayOfYearFor(12, 15), LAT)).toBe('winter');
  expect(seasonFor(dayOfYearFor(7, 15), -33)).toBe('winter');
});

test('calm wind is exactly zero so the preserved flight model is unchanged', () => {
  const field = createWindField('calm');
  for (const y of [0, 100, 5000])
    expect(windAt(field, { x: 1234, y, z: -987 }, 42)).toEqual({ x: 0, y: 0, z: 0 });
});

test('wind profile shears with altitude and veers clockwise aloft', () => {
  const field = createWindField('light', { directionDeg: 250 });
  const surface = windProfile(field, 10),
    gradient = windProfile(field, 600),
    upper = windProfile(field, 3000);
  expect(surface.speed).toBeCloseTo(WIND_PRESETS.light.surfaceSpeed, 9);
  expect(gradient.speed).toBeGreaterThan(surface.speed);
  expect(upper.speed).toBeGreaterThan(gradient.speed);
  expect(surface.bearingDeg).toBe(250);
  expect(upper.bearingDeg).toBeGreaterThan(250);
  // Above the upper layer the profile is constant, not unbounded.
  expect(windProfile(field, 12000).speed).toBeCloseTo(upper.speed, 9);
});

test('wind blows toward the reciprocal of its named bearing', () => {
  // A wind from 270 (west) moves air east, and east is -X.
  const field = createWindField('light', { directionDeg: 270 });
  const v = windAt(field, { x: 0, y: 10, z: 0 }, 0);
  expect(v.x).toBeCloseTo(-WIND_PRESETS.light.surfaceSpeed, 6);
  expect(Math.abs(v.z)).toBeLessThan(1e-9);
  // A wind from 180 (south) moves air north, and north is +Z.
  const southerly = windAt(
    createWindField('light', { directionDeg: 180 }),
    { x: 0, y: 10, z: 0 },
    0,
  );
  expect(southerly.z).toBeCloseTo(WIND_PRESETS.light.surfaceSpeed, 6);
});

test('gusts are deterministic, bounded and vary in time and space', () => {
  const a = createWindField('gusty', { seed: 7 }),
    b = createWindField('gusty', { seed: 7 }),
    c = createWindField('gusty', { seed: 8 });
  const at = (field: ReturnType<typeof createWindField>, t: number) =>
    windAt(field, { x: 0, y: 10, z: 0 }, t);
  expect(at(a, 3)).toEqual(at(b, 3));
  expect(at(a, 3)).not.toEqual(at(c, 3));
  expect(at(a, 3)).not.toEqual(at(a, 9));
  expect(windAt(a, { x: 0, y: 10, z: 0 }, 3)).not.toEqual(windAt(a, { x: 4000, y: 10, z: 0 }, 3));
  const mean = windProfile(a, 10).speed;
  for (let t = 0; t < 300; t += 0.37) {
    const v = at(a, t);
    expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(
      mean + WIND_PRESETS.gusty.gustAmplitude + 1e-6,
    );
    expect(Math.abs(v.y)).toBeLessThanOrEqual(WIND_PRESETS.gusty.gustAmplitude);
  }
});

test('cloud presets keep a cirrus sheet and one marched layer below it', () => {
  for (const preset of Object.values(WEATHER_PRESETS)) {
    expect(preset.layers.some((layer) => layer.type === 'cirrus')).toBe(true);
    const marched = marchedLayer(preset);
    if (marched) {
      expect(marched.topM).toBeGreaterThan(marched.baseM);
      expect(marched.coverage).toBeGreaterThan(0);
      expect(marched.topM).toBeLessThan(
        preset.layers.find((layer) => layer.type === 'cirrus')!.baseM,
      );
    }
  }
  expect(marchedLayer(WEATHER_PRESETS.clear)).toBeUndefined();
});

test('layer height gradient is zero outside the slab and peaks inside', () => {
  const layer = marchedLayer(WEATHER_PRESETS.scattered)!;
  expect(layerHeightGradient(layer, layer.baseM - 1)).toBe(0);
  expect(layerHeightGradient(layer, layer.topM + 1)).toBe(0);
  expect(layerHeightGradient(layer, (layer.baseM + layer.topM) / 2)).toBeGreaterThan(0.5);
});

test('cloud density rises with coverage and is zero above and below the layers', () => {
  const solid = () => 1;
  const scattered = cloudDensityAt(
    WEATHER_PRESETS.scattered,
    { x: 0, y: 2000, z: 0 },
    solid,
    undefined,
    () => 0,
  );
  const overcast = cloudDensityAt(
    WEATHER_PRESETS.overcast,
    { x: 0, y: 1100, z: 0 },
    solid,
    undefined,
    () => 0,
  );
  expect(scattered).toBeGreaterThan(0);
  expect(overcast).toBeGreaterThan(scattered);
  expect(
    cloudDensityAt(WEATHER_PRESETS.scattered, { x: 0, y: 500, z: 0 }, solid, undefined, () => 0),
  ).toBe(0);
  expect(
    cloudDensityAt(WEATHER_PRESETS.scattered, { x: 0, y: 6000, z: 0 }, solid, undefined, () => 0),
  ).toBe(0);
  // Clear noise below the coverage threshold leaves a hole in the layer.
  expect(
    cloudDensityAt(
      WEATHER_PRESETS.scattered,
      { x: 0, y: 2000, z: 0 },
      () => 0.1,
      undefined,
      () => 0,
    ),
  ).toBe(0);
  expect(COVERAGE_TILE_METERS).toBeGreaterThan(1000);
});

test('environment advances the clock, wraps the day and reports the season', () => {
  const env = new Environment({ year: 2026, dayOfYear: dayOfYearFor(7, 15), timeOfDayHours: 23.9 });
  expect(env.season).toBe('summer');
  env.advance(600);
  expect(env.settings.timeOfDayHours).toBeCloseTo(0.0666, 3);
  expect(env.settings.dayOfYear).toBe(dayOfYearFor(7, 16));
  expect(env.sun.elevationRad).toBeLessThan(0);
  env.setTimeOfDay(12);
  expect(env.sun.elevationRad * DEG).toBeGreaterThan(60);
  expect(() => env.setTimeOfDay(25)).toThrow();
});

test('environment wind follows the selected preset', () => {
  const env = new Environment({ wind: 'calm' });
  expect(env.windAt({ x: 0, y: 100, z: 0 }, 0)).toEqual({ x: 0, y: 0, z: 0 });
  env.setWind('storm');
  expect(
    Math.hypot(env.windAt({ x: 0, y: 10, z: 0 }, 0).x, env.windAt({ x: 0, y: 10, z: 0 }, 0).z),
  ).toBeGreaterThan(10);
  expect(env.layerWind(2000).speed).toBeGreaterThan(env.layerWind(10).speed);
});

test('theater centre comes from the pipeline LAEA projection string', () => {
  expect(theaterCenterFromCrs('+proj=laea +lat_0=46.5 +lon_0=31.5 +datum=WGS84 +units=m')).toEqual({
    latitudeDeg: 46.5,
    longitudeDeg: 31.5,
  });
  expect(theaterCenterFromCrs('EPSG:4326')).toBeUndefined();
});

test('environment URL parameters parse or fail explicitly', () => {
  expect(parseEnvironmentQuery('?time=14.5&date=07-15&weather=broken&wind=gusty')).toEqual({
    timeOfDayHours: 14.5,
    dayOfYear: dayOfYearFor(7, 15),
    weather: 'broken',
    wind: 'gusty',
  });
  expect(parseEnvironmentQuery('?date=196').dayOfYear).toBe(196);
  expect(parseEnvironmentQuery('?clouds=half&cloudSteps=64')).toEqual({
    clouds: 'half',
    cloudSteps: 64,
  });
  expect(parseEnvironmentQuery('')).toEqual({});
  for (const bad of [
    '?time=25',
    '?time=noon',
    '?date=13-40',
    '?date=400',
    '?weather=hail',
    '?wind=breeze',
    '?clouds=ultra',
    '?cloudSteps=4',
    '?cloudSteps=2.5',
  ])
    expect(() => parseEnvironmentQuery(bad)).toThrow();
});
