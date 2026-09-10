import { expect, test } from 'bun:test';
import {
  DEFAULT_MISSION,
  MAX_OPPONENTS,
  MAX_PAYLOAD_KG,
  isProbeQuery,
  missionQuery,
  parseMissionQuery,
  validateMission,
  type MissionParams,
} from './params';

const parse = (search: string) => parseMissionQuery(search);
const roundTrip = (mission: MissionParams) =>
  parseMissionQuery(`?${missionQuery(mission).toString()}`);

test('an empty query is the default mission, and the defaults serialize to nothing', () => {
  expect(parse('')).toEqual(DEFAULT_MISSION);
  expect(parse('?')).toEqual(DEFAULT_MISSION);
  expect(missionQuery(DEFAULT_MISSION).toString()).toBe('');
  expect(roundTrip(DEFAULT_MISSION)).toEqual(DEFAULT_MISSION);
});

test('every legacy smoke-script key still parses with its old meaning', () => {
  // These are exactly the parameters tools/flight/*.ts deep-links with today.
  const mission = parse(
    '?mode=flight&root=appData&manifest=terrains/ukraine/manifest.json' +
      '&aircraft=a4e&flightStart=airborne&flightModel=recovered-envelope' +
      '&flightFuel=0.4&flightPayload=1200&time=7.5&weather=broken&wind=gusty' +
      '&clouds=half&cloudSteps=64&date=6-21&paint=summer&contrast=0.25' +
      '&x=1000&z=2000&y=3000&yaw=0.4&pitch=-0.3',
  );
  expect(mission.mode).toBe('free-flight');
  expect(mission.aircraft).toBe('a4e');
  expect(mission.start).toBe('airborne');
  expect(mission.flightModel).toBe('recovered-envelope');
  expect(mission.loadout.internalFuelFraction).toBe(0.4);
  expect(mission.loadout.payloadMassKg).toBe(1200);
  expect(mission.environment).toEqual({
    timeOfDayHours: 7.5,
    dayOfYear: 173,
    weather: 'broken',
    wind: 'gusty',
    clouds: 'half',
    cloudSteps: 64,
  });
  expect(mission.paint).toBe('summer');
  expect(mission.contrast).toBe(0.25);
  expect(mission.camera).toEqual({ x: 1000, z: 2000, y: 3000, yaw: 0.4, pitch: -0.3 });
  expect(roundTrip(mission)).toEqual(mission);
});

test('legacy mode values keep their old meaning and round-trip through the legacy key', () => {
  expect(parse('?mode=flight').mode).toBe('free-flight');
  expect(parse('?mode=free-flight').mode).toBe('free-flight');
  expect(parse('?mode=explore').mode).toBe('explorer');
  expect(parse('?mode=nonsense').mode).toBe('explorer');
  expect(parse('?mode=quick-fight').mode).toBe('quick-fight');
  expect(missionQuery({ ...DEFAULT_MISSION, mode: 'free-flight' }).get('mode')).toBe('flight');
  expect(missionQuery({ ...DEFAULT_MISSION, mode: 'quick-fight' }).get('mode')).toBe('quick-fight');
});

test('the flight model defaults to the retail envelope and only assisted opts out', () => {
  expect(parse('').flightModel).toBe('retail-envelope');
  expect(parse('?flightModel=assisted').flightModel).toBe('assisted');
  expect(parse('?flightModel=retail-envelope').flightModel).toBe('retail-envelope');
  // FlightLayer treated anything that was not "assisted" as the retail fit.
  expect(parse('?flightModel=typo').flightModel).toBe('retail-envelope');
});

test('the data root and manifest keep the viewer defaults', () => {
  expect(parse('?root=assets').root).toBe('assets');
  expect(parse('?root=nonsense').root).toBe('appData');
  expect(parse('?manifest=terrains/other/manifest.json').manifestPath).toBe(
    'terrains/other/manifest.json',
  );
});

test('fuel, payload, opponent count and skill clamp instead of failing a load', () => {
  expect(parse('?flightFuel=-3').loadout.internalFuelFraction).toBe(0);
  expect(parse('?flightFuel=9').loadout.internalFuelFraction).toBe(1);
  expect(parse('?flightFuel=banana').loadout.internalFuelFraction).toBe(1);
  expect(parse('?flightPayload=-500').loadout.payloadMassKg).toBe(0);
  expect(parse('?flightPayload=1e9').loadout.payloadMassKg).toBe(MAX_PAYLOAD_KG);
  expect(parse('?flightPayload=banana').loadout.payloadMassKg).toBe(0);
  expect(parse('?mode=quick-fight&opponents=9').opponents).toHaveLength(MAX_OPPONENTS);
  expect(parse('?mode=quick-fight&opponents=-1').opponents).toHaveLength(0);
  expect(parse('?mode=quick-fight&opponents=2&skill=99').opponents).toEqual([
    { aircraft: 'f14', skill: 3 },
    { aircraft: 'f14', skill: 3 },
  ]);
  expect(parse('?mode=quick-fight&opponents=1&opponentAircraft=x31&skill=0').opponents).toEqual([
    { aircraft: 'x31', skill: 0 },
  ]);
  expect(parse('?seed=12.6').seed).toBe(13);
  expect(parse('?seed=-4').seed).toBe(0);
});

test('a typo in a measured parameter throws rather than silently changing the run', () => {
  expect(() => parse('?aircraft=f18')).toThrow('Unknown aircraft: f18');
  expect(() => parse('?weather=sunny')).toThrow('Invalid weather');
  expect(() => parse('?time=99')).toThrow('Invalid time');
  expect(() => parse('?contrast=9')).toThrow('Invalid contrast');
  for (const query of ['?x=NaN', '?y=Infinity', '?yaw=no', '?pitch='])
    expect(() => parse(query)).toThrow('finite');
});

test('the renderer probe deep link is still recognized', () => {
  expect(isProbeQuery('?view=probe')).toBe(true);
  expect(isProbeQuery('?view=terrain')).toBe(false);
  expect(isProbeQuery('')).toBe(false);
});

test('validateMission reports problems in words a player can act on', () => {
  expect(validateMission(DEFAULT_MISSION)).toEqual([]);
  expect(validateMission({ ...DEFAULT_MISSION, theater: 'nevada' })[0]).toContain('not available');
  expect(validateMission({ ...DEFAULT_MISSION, manifestPath: '  ' })).toContain(
    'A theater manifest path is required.',
  );
  expect(
    validateMission({
      ...DEFAULT_MISSION,
      loadout: { ...DEFAULT_MISSION.loadout, internalFuelFraction: 1.5 },
    }),
  ).toContain('Internal fuel must be between 0 and 100 percent.');
  expect(
    validateMission({
      ...DEFAULT_MISSION,
      loadout: { ...DEFAULT_MISSION.loadout, payloadMassKg: -1 },
    }),
  ).toContain('Payload mass cannot be negative.');
  expect(
    validateMission({
      ...DEFAULT_MISSION,
      loadout: {
        ...DEFAULT_MISSION.loadout,
        stations: { 3: { store: 'AIM9M.JT', count: -2 } },
      },
    }),
  ).toContain('Station 3 has an invalid store count.');
  expect(validateMission({ ...DEFAULT_MISSION, mode: 'quick-fight' })).toContain(
    'A quick fight needs at least one opponent.',
  );
  expect(
    validateMission({ ...DEFAULT_MISSION, opponents: [{ aircraft: 'f14', skill: 1 }] }),
  ).toContain('Opponents are only flown in a quick fight.');
  expect(validateMission({ ...DEFAULT_MISSION, seed: 1.5 })).toContain(
    'The mission seed must be a whole number of zero or more.',
  );
});

test('a fully specified mission survives the URL round trip', () => {
  const mission: MissionParams = {
    mode: 'quick-fight',
    theater: 'ukraine',
    root: 'assets',
    manifestPath: 'terrains/ukraine/manifest.json',
    aircraft: 'x31',
    flightModel: 'assisted',
    start: 'approach',
    loadout: { stations: {}, internalFuelFraction: 0.35, payloadMassKg: 2400 },
    environment: { timeOfDayHours: 18.25, dayOfYear: 200, weather: 'overcast', wind: 'light' },
    camera: { x: 12, z: 34 },
    paint: 'winter',
    contrast: 0.5,
    opponents: [
      { aircraft: 'a4e', skill: 3 },
      { aircraft: 'a4e', skill: 3 },
    ],
    encounter: {
      distanceM: 12000,
      orientation: 'crossing',
      altitudeOffsetM: -500,
      altitudeM: 4500,
      departureGraceSeconds: 45,
    },
    seed: 7,
  };
  expect(roundTrip(mission)).toEqual(mission);
});

test('quick missions default airborne while explicit runway and legacy practice starts survive', () => {
  expect(parse('?mode=quick-fight').start).toBe('airborne');
  expect(parse('?mode=flight').start).toBe('runway');
  for (const start of ['runway', 'approach', 'airborne'] as const) {
    const mission = parse(`?mode=quick-fight&flightStart=${start}`);
    expect(mission.start).toBe(start);
    expect(roundTrip(mission)).toEqual(mission);
  }
});

test('encounter parameters clamp malformed deep links and validate authored mission values', () => {
  const bounded = parse(
    '?distance=1e10&orientation=typo&altitudeOffset=-9000&altitude=bad&departureGrace=900',
  );
  expect(bounded.encounter).toEqual({
    distanceM: 40000,
    orientation: 'head-on',
    altitudeOffsetM: -3000,
    altitudeM: 3000,
    departureGraceSeconds: 120,
  });
  expect(parse('?distance=-1&altitude=-1&departureGrace=-1').encounter).toMatchObject({
    distanceM: 2000,
    altitudeM: 500,
    departureGraceSeconds: 0,
  });
  for (const [key, value] of [
    ['distanceM', NaN],
    ['altitudeM', 0],
    ['altitudeOffsetM', Infinity],
    ['departureGraceSeconds', -1],
    ['orientation', 'bad'],
  ] as const) {
    expect(
      validateMission({
        ...DEFAULT_MISSION,
        encounter: { ...DEFAULT_MISSION.encounter, [key]: value },
      }).length,
    ).toBe(1);
  }
});
