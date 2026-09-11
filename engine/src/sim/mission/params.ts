/**
 * One object describes a session: which mode, which theater, which aircraft, how it
 * is loaded, and what the weather is doing. Before this existed the same facts were
 * read imperatively out of `window.location.search` in seven separate places, which
 * made a loadout screen impossible — a chosen loadout is not something a player can
 * type into a URL.
 *
 * The URL therefore becomes one *serializer* for these params rather than their
 * home. That matters beyond tidiness: thirteen Electron smoke scripts deep-link into
 * the app with the query keys the old scattered reads understood, so every legacy key
 * is still parsed here, with the same clamping and the same errors. New keys are added
 * alongside the old ones and old ones are never renamed.
 *
 * The module is pure: no DOM, no platform, no three.js. `parseMissionQuery` is
 * deliberately split between tolerant and strict keys, matching what the code it
 * replaces did. Structural keys (`mode`, `root`, `manifest`, `flightStart`,
 * `flightModel`, `flightFuel`, `flightPayload`) fall back to a default rather than
 * failing a load. Keys where a typo would silently change what is being measured
 * (`aircraft`, the environment set, `contrast`, the camera pose) throw, so the
 * viewer's existing explicit error path reports them.
 */
import { AIRCRAFT, aircraftId, type AircraftId } from '../../flight/aircraft-catalog';
import type { Loadout } from '../../data/retail-loadout';
import type { FsRoot } from '../../platform/Platform';
import { parseContrastQuery } from '../../terrain/light-contrast';
import { parseEnvironmentQuery, type EnvironmentQuery } from '../environment';
import type { GunMode } from '../../data/retail-gun';
import { DEFAULT_THEATER_ID, theaterById } from '../../terrain/theaters';

export type GameMode = 'explorer' | 'free-flight' | 'quick-fight';
export type FlightStart = 'runway' | 'approach' | 'airborne';
export type FlightModelId = 'assisted' | 'retail-envelope' | 'recovered-envelope';
/** Retail skill 0..3: Novice, Average, Experienced, Ace. */
export type AiSkill = 0 | 1 | 2 | 3;

/** The environment set is already parsed and validated by `sim/environment`. */
export type EnvironmentParams = EnvironmentQuery;

/** Reproducible projected meters and radians; clamping needs the manifest, so it is not done here. */
export interface CameraOverrides {
  x?: number;
  z?: number;
  y?: number;
  yaw?: number;
  pitch?: number;
}

/**
 * Stations and internal fuel come from the retail loadout contract. `payloadMassKg`
 * is the interim single-number payload the practice flight has today; the loadout
 * screen replaces it with the summed weight of the chosen stores.
 */
export interface MissionLoadout extends Loadout {
  payloadMassKg: number;
}

export interface OpponentSlot {
  aircraft: AircraftId;
  skill: AiSkill;
}

export const ENCOUNTER_ORIENTATIONS = ['head-on', 'tail-chase', 'behind', 'crossing'] as const;
export type EncounterOrientation = (typeof ENCOUNTER_ORIENTATIONS)[number];
export interface EncounterParams {
  /** Initial horizontal separation of the opposing formation, metres. */
  distanceM: number;
  orientation: EncounterOrientation;
  /** Opponent height relative to the player's initial altitude, metres. */
  altitudeOffsetM: number;
  /** Player airborne-start height above the terrain, metres. */
  altitudeM: number;
  /** Runway starts: continuous safe airborne time before opponents enter, seconds. Zero disables staging. */
  departureGraceSeconds: number;
}
export const DEFAULT_ENCOUNTER: EncounterParams = {
  distanceM: 6000,
  orientation: 'head-on',
  altitudeOffsetM: 0,
  altitudeM: 3000,
  departureGraceSeconds: 30,
};

export interface MissionParams {
  mode: GameMode;
  theater: string;
  /** Where the theater is read from, and its manifest path within that root. */
  root: FsRoot;
  manifestPath: string;
  aircraft: AircraftId;
  flightModel: FlightModelId;
  gunMode: GunMode;
  start: FlightStart;
  loadout: MissionLoadout;
  environment: EnvironmentParams;
  camera: CameraOverrides;
  /** Ground colour map id; the viewer picks a seasonal default when this is unset. */
  paint?: string;
  /** Terrain shading contrast boost, for comparing values without a rebuild. */
  contrast?: number;
  /** Empty except in a quick fight. */
  opponents: OpponentSlot[];
  encounter: EncounterParams;
  /** Deterministic RNG for AI and spawns. */
  seed: number;
}

export const DEFAULT_THEATER = DEFAULT_THEATER_ID;
export const DEFAULT_MANIFEST_PATH = theaterById(DEFAULT_THEATER)!.manifestPath;
/** A sanity bound only. The real limit needs the aircraft profile and stays in `FlightLayer`. */
export const MAX_PAYLOAD_KG = 50000;
export const MAX_OPPONENTS = 3;
export const DEFAULT_SEED = 1;

export const DEFAULT_MISSION: MissionParams = {
  mode: 'explorer',
  theater: DEFAULT_THEATER,
  root: 'appData',
  manifestPath: DEFAULT_MANIFEST_PATH,
  aircraft: 'f14',
  flightModel: 'retail-envelope',
  gunMode: 'remake',
  start: 'runway',
  loadout: { stations: {}, internalFuelFraction: 1, payloadMassKg: 0 },
  environment: {},
  camera: {},
  opponents: [],
  encounter: { ...DEFAULT_ENCOUNTER },
  seed: DEFAULT_SEED,
};

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

/** `?view=probe` selects the renderer diagnostic; everything else is the game. */
export function isProbeQuery(search: string): boolean {
  return new URLSearchParams(search).get('view') === 'probe';
}

export function parseMissionQuery(search: string): MissionParams {
  const params = new URLSearchParams(search);
  /** Tolerant: a non-numeric value falls back rather than failing the load. */
  const number = (key: string, fallback: number): number => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };
  /** Strict: an unreadable camera pose is a typo worth reporting, not a silent default. */
  const pose = (key: string): number | undefined => {
    const raw = params.get(key);
    if (raw === null) return undefined;
    const value = Number(raw);
    if (!raw.trim() || !Number.isFinite(value))
      throw new Error(`Invalid camera ${key}: expected finite number`);
    return value;
  };
  const camera: CameraOverrides = {};
  for (const key of ['x', 'z', 'y', 'yaw', 'pitch'] as const) {
    const value = pose(key);
    if (value !== undefined) camera[key] = value;
  }
  // Legacy `mode=flight` is the practice flight; anything else meant the explorer.
  const mode = params.get('mode');
  const paint = params.get('paint');
  const contrast = parseContrastQuery(search);
  const flightModel = params.get('flightModel');
  const start = params.get('flightStart');
  const orientation = params.get('orientation') as EncounterOrientation;
  const opponents = Math.round(clamp(number('opponents', 0), 0, MAX_OPPONENTS));
  const opponent: OpponentSlot = {
    aircraft: aircraftId(params.get('opponentAircraft')),
    skill: Math.round(clamp(number('skill', 2), 0, 3)) as AiSkill,
  };
  const theater = params.get('theater') ?? DEFAULT_THEATER;
  const definition = theaterById(theater);
  return {
    mode:
      mode === 'flight' || mode === 'free-flight'
        ? 'free-flight'
        : mode === 'quick-fight'
          ? 'quick-fight'
          : 'explorer',
    theater,
    root: params.get('root') === 'assets' ? 'assets' : 'appData',
    manifestPath: params.get('manifest') ?? definition?.manifestPath ?? DEFAULT_MANIFEST_PATH,
    aircraft: aircraftId(params.get('aircraft')),
    gunMode: params.get('gunMode') === 'retail' ? 'retail' : 'remake',
    flightModel:
      flightModel === 'assisted'
        ? 'assisted'
        : flightModel === 'recovered-envelope'
          ? 'recovered-envelope'
          : 'retail-envelope',
    start:
      start === 'approach'
        ? 'approach'
        : start === 'airborne'
          ? 'airborne'
          : start === 'runway'
            ? 'runway'
            : mode === 'quick-fight'
              ? 'airborne'
              : 'runway',
    loadout: {
      stations: {},
      internalFuelFraction: clamp(number('flightFuel', 1), 0, 1),
      payloadMassKg: clamp(number('flightPayload', 0), 0, MAX_PAYLOAD_KG),
    },
    environment: parseEnvironmentQuery(search),
    camera,
    ...(paint === null ? {} : { paint }),
    ...(contrast === undefined ? {} : { contrast }),
    opponents: Array.from({ length: opponents }, () => ({ ...opponent })),
    encounter: {
      distanceM: clamp(number('distance', DEFAULT_ENCOUNTER.distanceM), 2000, 40000),
      orientation: ENCOUNTER_ORIENTATIONS.includes(orientation)
        ? orientation
        : DEFAULT_ENCOUNTER.orientation,
      altitudeOffsetM: clamp(number('altitudeOffset', 0), -3000, 3000),
      altitudeM: clamp(number('altitude', DEFAULT_ENCOUNTER.altitudeM), 500, 8000),
      departureGraceSeconds: clamp(
        number('departureGrace', DEFAULT_ENCOUNTER.departureGraceSeconds),
        0,
        120,
      ),
    },
    seed: Math.round(clamp(number('seed', DEFAULT_SEED), 0, 0x7fffffff)),
  };
}

/**
 * The inverse, emitting only what differs from the defaults so a shared link stays
 * readable. Legacy key names are used deliberately, because the smoke scripts and the
 * existing in-app links speak them.
 *
 * One thing the URL cannot carry is a per-slot opponent list; it records the common
 * aircraft and skill. Chosen stations are not in the query either — they belong to the
 * loadout screen, which is the whole reason this object exists.
 */
export function missionQuery(mission: MissionParams): URLSearchParams {
  const query = new URLSearchParams();
  const set = (key: string, value: string | number | undefined, fallback: string | number) => {
    if (value !== undefined && value !== fallback) query.set(key, String(value));
  };
  set('mode', mission.mode === 'free-flight' ? 'flight' : mission.mode, 'explorer');
  set('theater', mission.theater, DEFAULT_THEATER);
  set('root', mission.root, 'appData');
  set('manifest', mission.manifestPath, DEFAULT_MANIFEST_PATH);
  set('aircraft', mission.aircraft, 'f14');
  set('flightModel', mission.flightModel, 'retail-envelope');
  set('gunMode', mission.gunMode, 'remake');
  set('flightStart', mission.start, mission.mode === 'quick-fight' ? 'airborne' : 'runway');
  set('distance', mission.encounter.distanceM, DEFAULT_ENCOUNTER.distanceM);
  set('orientation', mission.encounter.orientation, DEFAULT_ENCOUNTER.orientation);
  set('altitudeOffset', mission.encounter.altitudeOffsetM, DEFAULT_ENCOUNTER.altitudeOffsetM);
  set('altitude', mission.encounter.altitudeM, DEFAULT_ENCOUNTER.altitudeM);
  set(
    'departureGrace',
    mission.encounter.departureGraceSeconds,
    DEFAULT_ENCOUNTER.departureGraceSeconds,
  );
  set('flightFuel', mission.loadout.internalFuelFraction, 1);
  set('flightPayload', mission.loadout.payloadMassKg, 0);
  const environment = mission.environment;
  set('time', environment.timeOfDayHours, Number.NaN);
  set('date', environment.dayOfYear, Number.NaN);
  set('weather', environment.weather, '');
  set('wind', environment.wind, '');
  set('clouds', environment.clouds, '');
  set('cloudSteps', environment.cloudSteps, Number.NaN);
  set('fog', environment.fog, '');
  set('cloudAppearance', environment.cloudAppearance, '');
  set('paint', mission.paint, '');
  set('contrast', mission.contrast, Number.NaN);
  for (const key of ['x', 'z', 'y', 'yaw', 'pitch'] as const)
    set(key, mission.camera[key], Number.NaN);
  const [first] = mission.opponents;
  if (first) {
    query.set('opponents', String(mission.opponents.length));
    set('opponentAircraft', first.aircraft, 'f14');
    set('skill', first.skill, 2);
  }
  set('seed', mission.seed, DEFAULT_SEED);
  return query;
}

/**
 * Problems stated the way a player would read them. Parsing already clamps, so this
 * catches what a screen can still get wrong: an unavailable theater, a loadout that
 * does not add up, opponents in a mode that has none.
 */
export function validateMission(mission: MissionParams): string[] {
  const problems: string[] = [];
  if (!theaterById(mission.theater))
    problems.push(`Theater “${mission.theater}” is not available.`);
  if (!mission.manifestPath.trim()) problems.push('A theater manifest path is required.');
  if (!Object.hasOwn(AIRCRAFT, mission.aircraft))
    problems.push(`Unknown aircraft “${mission.aircraft}”.`);
  const fuel = mission.loadout.internalFuelFraction;
  if (!Number.isFinite(fuel) || fuel < 0 || fuel > 1)
    problems.push('Internal fuel must be between 0 and 100 percent.');
  const payload = mission.loadout.payloadMassKg;
  if (!Number.isFinite(payload) || payload < 0) problems.push('Payload mass cannot be negative.');
  for (const [index, selection] of Object.entries(mission.loadout.stations))
    if (!Number.isInteger(selection.count) || selection.count < 0)
      problems.push(`Station ${index} has an invalid store count.`);
  if (mission.mode === 'quick-fight' && mission.opponents.length === 0)
    problems.push('A quick fight needs at least one opponent.');
  if (mission.mode !== 'quick-fight' && mission.opponents.length > 0)
    problems.push('Opponents are only flown in a quick fight.');
  if (mission.opponents.length > MAX_OPPONENTS)
    problems.push(`At most ${MAX_OPPONENTS} opponents can be flown.`);
  const encounter = mission.encounter;
  if (
    !Number.isFinite(encounter.departureGraceSeconds) ||
    encounter.departureGraceSeconds < 0 ||
    encounter.departureGraceSeconds > 120
  )
    problems.push('Departure grace must be between 0 and 120 seconds.');
  if (
    !Number.isFinite(encounter.distanceM) ||
    encounter.distanceM < 2000 ||
    encounter.distanceM > 40000
  )
    problems.push('Opponent distance must be between 2 and 40 km.');
  if (!ENCOUNTER_ORIENTATIONS.includes(encounter.orientation))
    problems.push('Select a supported encounter orientation.');
  if (!Number.isFinite(encounter.altitudeOffsetM) || Math.abs(encounter.altitudeOffsetM) > 3000)
    problems.push('Opponent altitude offset must be between −3000 and 3000 m.');
  if (
    !Number.isFinite(encounter.altitudeM) ||
    encounter.altitudeM < 500 ||
    encounter.altitudeM > 8000
  )
    problems.push('Airborne start altitude must be between 500 and 8000 m above terrain.');
  for (const slot of mission.opponents)
    if (!Object.hasOwn(AIRCRAFT, slot.aircraft))
      problems.push(`Unknown opponent aircraft “${slot.aircraft}”.`);
  if (!Number.isInteger(mission.seed) || mission.seed < 0)
    problems.push('The mission seed must be a whole number of zero or more.');
  return problems;
}
