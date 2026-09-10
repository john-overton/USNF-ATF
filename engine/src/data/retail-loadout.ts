/**
 * Hardpoints and stores recovered from a retail `.PT`, plus the pure arithmetic
 * a loadout screen needs. Produced by `python3 -m retail.loadout`; see
 * `Docs/formats/pt.md` for the `:hards` block and `Docs/formats/sensors.md` for
 * the shared `STORE_ITEM` shape.
 *
 * Retail units are kept as retail units — pounds and feet — because that is what
 * the source data says and converting on the way in would hide rounding. The
 * flight model's SI conversion happens at the boundary, via `poundsToKilograms`.
 *
 * What this file deliberately does not do is decide which stores may hang on
 * which station. The hardpoint `flags` word is the original's compatibility
 * rule and its bits are undecoded, so `allowedStores` offers a station its own
 * default and nothing else unless the caller explicitly asks for the
 * unrestricted set — the same choice the original exposes as
 * "Cheat (load anything anywhere)" in `ARMPLANE.MNU`.
 */

export type StoreKind = 'weapon' | 'tank' | 'ecm' | 'sensor';
export type StationKind = StoreKind | 'empty';
/** Retail `sig` 0..3, the signature channel a seeker reads. */
export type Guidance = 'visual' | 'laser' | 'infrared' | 'radar';

export const STORE_KINDS: readonly StoreKind[] = ['weapon', 'tank', 'ecm', 'sensor'];
export const STATION_KINDS: readonly StationKind[] = [...STORE_KINDS, 'empty'];
export const GUIDANCE_KINDS: readonly Guidance[] = ['visual', 'laser', 'infrared', 'radar'];

/** Exact by definition; the retail data is in pounds throughout. */
export const POUNDS_PER_KILOGRAM = 2.2046226218487757;
export const poundsToKilograms = (lb: number): number => lb / POUNDS_PER_KILOGRAM;
export const kilogramsToPounds = (kg: number): number => kg * POUNDS_PER_KILOGRAM;

export interface StoreDefinition {
  /** Retail file name, e.g. `AIM54C.JT`. This is the key used everywhere. */
  file: string;
  sourceSha256: string;
  kind: StoreKind;
  structType: number;
  /** Retail `si_names[0]`. Empty for several sensors and ECM pods. */
  name: string;
  /** Retail `si_names[1]`. Also empty in those cases; use `storeLabel`. */
  displayName: string;
  weightLb: number;
  roundsPerPod?: number;
  guidance?: Guidance;
  maxRangeFt?: number;
  initialSpeedFtPerS?: number;
  finalSpeedFtPerS?: number;
  fuzeRadiusFt?: number;
  /** `damage[0..4]`: damage inflicted per target hardness class, not armour. */
  damage?: [number, number, number, number, number];
  /** True for the internal cannon, which is not a rack the player loads. */
  internalGun?: boolean;
  /** Tanks only, pounds of fuel carried. */
  fuelLb?: number;
}

export interface Station {
  index: number;
  /** The undecoded compatibility mask. Reported, never interpreted. */
  flags: number;
  /** Raw `.PT` hardpoint words; the unit is unverified. */
  position: [number, number, number];
  slew: [number, number, number, number];
  /** Raw `.PT` byte. Not pounds; probably a rack or pylon class. */
  maxWeight: number;
  maxItems: number;
  nameIndex: number;
  defaultStore: string | null;
  kind: StationKind;
  /** False for sensor and ECM slots and for the internal cannon. */
  selectable: boolean;
  internalGun: boolean;
}

export interface LoadedPenalties {
  drag: number;
  gPullDrag: number;
  elevator: number;
  aileron: number;
  rudder: number;
}

export interface RetailLoadout {
  schemaVersion: 1;
  aircraftSource: string;
  aircraftSha256: string;
  name: string;
  emptyWeightLb: number;
  maxTakeoffWeightLb: number;
  internalFuelLb: number;
  fuelConsumptionLbPerS: number;
  afterburnerFuelConsumptionLbPerS: number;
  hitPoints: number;
  /** Percentage corrections applied when loaded; displayed, not yet applied. */
  loadedPenalties: LoadedPenalties;
  stations: Station[];
  stores: Record<string, StoreDefinition>;
  missingStores: string[];
  units: Record<string, string>;
  unresolved: string[];
}

/** What the player chose for one station. `store` null means the rack is empty. */
export interface StationSelection {
  store: string | null;
  count: number;
}

export interface Loadout {
  /** Keyed by `Station.index`. */
  stations: Record<number, StationSelection>;
  /** 0..1 of `internalFuelLb`. External tanks are always carried full. */
  internalFuelFraction: number;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const inRange = (value: unknown, low: number, high: number): value is number =>
  isFiniteNumber(value) && value >= low && value <= high;
const isCountingNumber = (value: unknown, high: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= high;
const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isTuple = (value: unknown, length: number, low: number, high: number): boolean =>
  Array.isArray(value) && value.length === length && value.every((n) => inRange(n, low, high));
const isStringRecord = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  Object.values(value as Record<string, unknown>).every((v) => typeof v === 'string');

function parseStore(value: unknown, key: string): StoreDefinition {
  const store = value as StoreDefinition;
  const bad = (reason: string): never => {
    throw new Error(`Invalid store ${key}: ${reason}`);
  };
  if (typeof store?.file !== 'string' || store.file.toUpperCase() !== key.toUpperCase())
    bad('file name does not match its key');
  if (!isSha256(store.sourceSha256)) bad('missing source hash');
  if (!STORE_KINDS.includes(store.kind)) bad('unknown kind');
  if (!isCountingNumber(store.structType, 255)) bad('bad structType');
  if (typeof store.name !== 'string' || typeof store.displayName !== 'string') bad('bad names');
  // Retail weights run from 1 lb (the M61 round) to a few thousand.
  if (!inRange(store.weightLb, 0, 100000)) bad('weight out of range');
  if (store.roundsPerPod !== undefined && !isCountingNumber(store.roundsPerPod, 10000))
    bad('bad roundsPerPod');
  if (store.guidance !== undefined && !GUIDANCE_KINDS.includes(store.guidance))
    bad('unknown guidance channel');
  for (const field of [
    'maxRangeFt',
    'initialSpeedFtPerS',
    'finalSpeedFtPerS',
    'fuzeRadiusFt',
  ] as const)
    if (store[field] !== undefined && !inRange(store[field], 0, 100_000_000)) bad(`bad ${field}`);
  if (store.damage !== undefined && !isTuple(store.damage, 5, 0, 65535)) bad('bad damage table');
  if (store.internalGun !== undefined && typeof store.internalGun !== 'boolean')
    bad('bad internalGun');
  if (store.fuelLb !== undefined && !inRange(store.fuelLb, 0, 100000)) bad('bad fuelLb');
  if (store.kind === 'tank' && store.fuelLb === undefined) bad('tank carries no fuel figure');
  return store;
}

function parseStation(value: unknown, index: number): Station {
  const station = value as Station;
  const bad = (reason: string): never => {
    throw new Error(`Invalid station ${index}: ${reason}`);
  };
  if (!isCountingNumber(station?.index, 255)) bad('bad index');
  if (!isCountingNumber(station.flags, 0xffffffff)) bad('bad flags');
  if (!isTuple(station.position, 3, -100000, 100000)) bad('bad position');
  if (!isTuple(station.slew, 4, -1000000, 1000000)) bad('bad slew');
  if (!isCountingNumber(station.maxWeight, 255)) bad('bad maxWeight');
  if (!isCountingNumber(station.maxItems, 32767)) bad('bad maxItems');
  if (!isCountingNumber(station.nameIndex, 255)) bad('bad nameIndex');
  if (station.defaultStore !== null && typeof station.defaultStore !== 'string')
    bad('bad defaultStore');
  if (!STATION_KINDS.includes(station.kind)) bad('unknown kind');
  if (typeof station.selectable !== 'boolean' || typeof station.internalGun !== 'boolean')
    bad('bad flags');
  return station;
}

export function parseRetailLoadout(value: unknown): RetailLoadout {
  const loadout = value as RetailLoadout;
  if (loadout?.schemaVersion !== 1) throw new Error('Invalid retail loadout manifest: schema');
  if (typeof loadout.aircraftSource !== 'string' || !isSha256(loadout.aircraftSha256))
    throw new Error('Invalid retail loadout manifest: aircraft identity');
  if (typeof loadout.name !== 'string') throw new Error('Invalid retail loadout manifest: name');
  for (const field of [
    'emptyWeightLb',
    'maxTakeoffWeightLb',
    'internalFuelLb',
    'fuelConsumptionLbPerS',
    'afterburnerFuelConsumptionLbPerS',
    'hitPoints',
  ] as const)
    if (!inRange(loadout[field], 0, 10_000_000))
      throw new Error(`Invalid retail loadout manifest: ${field}`);
  if (loadout.emptyWeightLb > loadout.maxTakeoffWeightLb)
    throw new Error(
      'Invalid retail loadout manifest: empty weight exceeds maximum take-off weight',
    );
  const penalties = loadout.loadedPenalties;
  if (
    typeof penalties !== 'object' ||
    penalties === null ||
    !(['drag', 'gPullDrag', 'elevator', 'aileron', 'rudder'] as const).every((k) =>
      inRange(penalties[k], -10000, 10000),
    )
  )
    throw new Error('Invalid retail loadout manifest: loaded penalties');
  if (
    !Array.isArray(loadout.stations) ||
    loadout.stations.length < 1 ||
    loadout.stations.length > 64
  )
    throw new Error('Invalid retail loadout manifest: stations');
  loadout.stations.forEach((station, index) => parseStation(station, index));
  if (typeof loadout.stores !== 'object' || loadout.stores === null)
    throw new Error('Invalid retail loadout manifest: stores');
  const names = Object.keys(loadout.stores);
  if (names.length > 512) throw new Error('Invalid retail loadout manifest: too many stores');
  for (const key of names) parseStore(loadout.stores[key], key);
  for (const station of loadout.stations)
    if (station.defaultStore !== null && loadout.stores[station.defaultStore] === undefined)
      throw new Error(
        `Invalid retail loadout manifest: station ${station.index} names a missing store`,
      );
  if (
    !Array.isArray(loadout.missingStores) ||
    !loadout.missingStores.every((n) => typeof n === 'string')
  )
    throw new Error('Invalid retail loadout manifest: missingStores');
  if (!isStringRecord(loadout.units)) throw new Error('Invalid retail loadout manifest: units');
  if (!Array.isArray(loadout.unresolved) || !loadout.unresolved.every((n) => typeof n === 'string'))
    throw new Error('Invalid retail loadout manifest: unresolved');
  return loadout;
}

/** Several retail sensors and ECM pods carry empty names; fall back to the file stem. */
export function storeLabel(store: StoreDefinition): string {
  return store.displayName || store.name || store.file.replace(/\.[^.]+$/, '');
}

export function selectableStations(loadout: RetailLoadout): Station[] {
  return loadout.stations.filter((station) => station.selectable);
}

export function station(loadout: RetailLoadout, index: number): Station | undefined {
  return loadout.stations.find((s) => s.index === index);
}

/** Every station carrying its retail default, full internal fuel. */
export function defaultLoadout(loadout: RetailLoadout): Loadout {
  const stations: Record<number, StationSelection> = {};
  for (const s of loadout.stations)
    stations[s.index] = { store: s.defaultStore, count: s.defaultStore ? s.maxItems : 0 };
  return { stations, internalFuelFraction: 1 };
}

/**
 * The stores this station may carry. Without the `flags` mask that is its own
 * default and empty; `unrestricted` widens it to every weapon and tank in the
 * manifest, matching the original's own load-anything option.
 */
export function allowedStores(
  loadout: RetailLoadout,
  target: Station,
  unrestricted = false,
): string[] {
  if (!target.selectable) return target.defaultStore ? [target.defaultStore] : [];
  if (!unrestricted) return target.defaultStore ? [target.defaultStore] : [];
  return Object.values(loadout.stores)
    .filter((store) => (store.kind === 'weapon' || store.kind === 'tank') && !store.internalGun)
    .map((store) => store.file)
    .sort();
}

function selectionsWith(loadout: RetailLoadout, chosen: Loadout) {
  return loadout.stations.map((s) => {
    const selection = chosen.stations[s.index] ?? { store: s.defaultStore, count: 0 };
    const store = selection.store ? loadout.stores[selection.store] : undefined;
    return { station: s, selection, store };
  });
}

/** Weight of everything hanging on the stations, tank shells included, empty. */
export function storesWeightLb(loadout: RetailLoadout, chosen: Loadout): number {
  let total = 0;
  for (const { selection, store } of selectionsWith(loadout, chosen))
    if (store) total += store.weightLb * Math.max(0, selection.count);
  return total;
}

/** Fuel in mounted drop tanks. Tanks are carried full or not at all. */
export function externalFuelLb(loadout: RetailLoadout, chosen: Loadout): number {
  let total = 0;
  for (const { selection, store } of selectionsWith(loadout, chosen))
    if (store?.kind === 'tank') total += (store.fuelLb ?? 0) * Math.max(0, selection.count);
  return total;
}

export function internalFuelLb(loadout: RetailLoadout, chosen: Loadout): number {
  const fraction = Math.min(1, Math.max(0, chosen.internalFuelFraction));
  return loadout.internalFuelLb * fraction;
}

export function totalFuelLb(loadout: RetailLoadout, chosen: Loadout): number {
  return internalFuelLb(loadout, chosen) + externalFuelLb(loadout, chosen);
}

export function grossWeightLb(loadout: RetailLoadout, chosen: Loadout): number {
  return loadout.emptyWeightLb + totalFuelLb(loadout, chosen) + storesWeightLb(loadout, chosen);
}

/**
 * Human-readable problems with a selection, empty when it is flyable. Not a
 * compatibility check: with `flags` undecoded there is nothing to check against
 * beyond each station's own default.
 */
export function validateLoadout(
  loadout: RetailLoadout,
  chosen: Loadout,
  options: { unrestricted?: boolean } = {},
): string[] {
  const problems: string[] = [];
  if (!inRange(chosen.internalFuelFraction, 0, 1))
    problems.push('Internal fuel must be 0 to 100%.');
  for (const [key, selection] of Object.entries(chosen.stations)) {
    const index = Number(key);
    const target = station(loadout, index);
    if (!target) {
      problems.push(`Station ${index} does not exist on the ${loadout.name}.`);
      continue;
    }
    if (!Number.isInteger(selection.count) || selection.count < 0) {
      problems.push(`Station ${index} carries an impossible number of stores.`);
      continue;
    }
    if (selection.count > target.maxItems)
      problems.push(`Station ${index} holds at most ${target.maxItems}, not ${selection.count}.`);
    if (selection.store === null) {
      if (selection.count > 0) problems.push(`Station ${index} is empty but carries a count.`);
      continue;
    }
    if (loadout.stores[selection.store] === undefined) {
      problems.push(`Station ${index} names an unknown store, ${selection.store}.`);
      continue;
    }
    if (!allowedStores(loadout, target, options.unrestricted).includes(selection.store))
      problems.push(
        `${storeLabel(loadout.stores[selection.store]!)} is not carried on station ${index}.`,
      );
  }
  const gross = grossWeightLb(loadout, chosen);
  if (gross > loadout.maxTakeoffWeightLb)
    problems.push(
      `Gross weight ${Math.round(gross)} lb exceeds the ${Math.round(loadout.maxTakeoffWeightLb)} lb maximum.`,
    );
  return problems;
}
