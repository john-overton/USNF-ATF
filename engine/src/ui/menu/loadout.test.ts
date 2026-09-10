import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoadoutScreen } from './LoadoutScreen';
import { EMPTY_RACK, cycleStore, loadoutView, stepCount } from './loadout-view';
import { DEFAULT_MISSION } from '../../sim/mission/params';
import { defaultLoadout, type Loadout, type RetailLoadout } from '../../data/retail-loadout';

/** A synthetic aircraft in the shape `python3 -m retail.loadout` produces. */
const hash = 'a'.repeat(64);
const store = (file: string, weightLb: number, extra: Record<string, unknown> = {}) => ({
  file,
  sourceSha256: hash,
  kind: 'weapon' as const,
  structType: 7,
  name: file.replace('.JT', ''),
  displayName: file.replace('.JT', ''),
  weightLb,
  ...extra,
});
const station = (index: number, defaultStore: string | null, maxItems: number, extra = {}) => ({
  index,
  flags: 0x1f5,
  position: [0, 0, 0] as [number, number, number],
  slew: [0, 0, 0, 0] as [number, number, number, number],
  maxWeight: 40,
  maxItems,
  nameIndex: 0,
  defaultStore,
  kind: defaultStore ? ('weapon' as const) : ('empty' as const),
  selectable: true,
  internalGun: false,
  ...extra,
});
const LOADOUT: RetailLoadout = {
  schemaVersion: 1,
  aircraftSource: 'F14.PT',
  aircraftSha256: hash,
  name: 'Test Tomcat',
  emptyWeightLb: 40000,
  maxTakeoffWeightLb: 74349,
  internalFuelLb: 16000,
  fuelConsumptionLbPerS: 1,
  afterburnerFuelConsumptionLbPerS: 4,
  hitPoints: 100,
  loadedPenalties: { drag: 12, gPullDrag: 8, elevator: 5, aileron: 4, rudder: 3 },
  stations: [
    station(0, 'AIM54C.JT', 4),
    station(1, 'AIM9M.JT', 2),
    station(2, 'F250.GAS', 2, { kind: 'tank' as const }),
    { ...station(3, 'M61.JT', 675), selectable: false, internalGun: true },
  ],
  stores: {
    'AIM54C.JT': store('AIM54C.JT', 985),
    'AIM9M.JT': store('AIM9M.JT', 190),
    'F250.GAS': store('F250.GAS', 198, { kind: 'tank', fuelLb: 1650 }),
    // Per round, the way the retail cannon store is weighed.
    'M61.JT': store('M61.JT', 0.25, { internalGun: true, roundsPerPod: 1 }),
  },
  missingStores: [],
  units: { weight: 'pounds' },
  unresolved: ['hardpoint flags mask'],
};

const chosen = (): Loadout => defaultLoadout(LOADOUT);

test('the view shows only the stations a player may load, with their weights', () => {
  const view = loadoutView(LOADOUT, chosen());
  // The internal cannon is not a rack the player loads.
  expect(view.stations.map((row) => row.index)).toEqual([0, 1, 2]);
  expect(view.aircraft).toBe('Test Tomcat');
  expect(view.stations[0]!.label).toContain('AIM54C');
  expect(view.stations[0]!.count).toBe(4);
  expect(view.stations[0]!.weightLb).toBe(985 * 4);
  expect(view.problems).toEqual([]);
});

test('fuel and gross weight follow the retail arithmetic, tanks included', () => {
  const full = loadoutView(LOADOUT, chosen());
  expect(full.internalFuelLb).toBe(16000);
  // Two 250-gallon tanks at 1,650 lb of fuel each.
  expect(full.externalFuelLb).toBe(3300);
  expect(full.totalFuelLb).toBe(19300);
  const stores = 985 * 4 + 190 * 2 + 198 * 2 + 675 * 0.25;
  expect(full.storesWeightLb).toBeCloseTo(stores, 6);
  expect(full.grossWeightLb).toBeCloseTo(40000 + 19300 + stores, 6);
  expect(full.overWeight).toBe(false);
  const half = loadoutView(LOADOUT, { ...chosen(), internalFuelFraction: 0.5 });
  expect(half.internalFuelLb).toBe(8000);
  expect(half.grossWeightLb).toBeCloseTo(full.grossWeightLb - 8000, 6);
});

test('a station offers its own default and an empty rack, and everything only when told', () => {
  const restricted = loadoutView(LOADOUT, chosen());
  expect(restricted.stations[0]!.choices.map((choice) => choice.store)).toEqual([
    null,
    'AIM54C.JT',
  ]);
  const anything = loadoutView(LOADOUT, chosen(), { unrestricted: true });
  expect(anything.stations[0]!.choices.length).toBeGreaterThan(2);
});

test('the rockers cycle stores and step counts within the station limit', () => {
  const view = loadoutView(LOADOUT, chosen());
  const row = view.stations[1]!;
  expect(row.count).toBe(2);
  expect(stepCount(row, 1)).toEqual({ store: 'AIM9M.JT', count: 2 });
  expect(stepCount(row, -1)).toEqual({ store: 'AIM9M.JT', count: 1 });
  // Stepping to zero empties the rack rather than leaving a phantom store.
  expect(stepCount({ ...row, count: 1 }, -1)).toEqual({ store: null, count: 0 });
  expect(cycleStore(row, 1)).toEqual({ store: null, count: 0 });
  expect(cycleStore({ ...row, store: null, count: 0, label: EMPTY_RACK }, 1)).toEqual({
    store: 'AIM9M.JT',
    count: 1,
  });
});

test('an overweight aircraft is reported, not silently flown', () => {
  const heavy: Loadout = {
    internalFuelFraction: 1,
    stations: {
      0: { store: 'AIM54C.JT', count: 4 },
      1: { store: 'AIM9M.JT', count: 2 },
      2: { store: 'F250.GAS', count: 2 },
    },
  };
  const tiny: RetailLoadout = { ...LOADOUT, maxTakeoffWeightLb: 50000 };
  const view = loadoutView(tiny, heavy);
  expect(view.overWeight).toBe(true);
  expect(view.problems.some((problem) => problem.toLowerCase().includes('weight'))).toBe(true);
});

test('the screen draws the store bank, a station per rack, fuel and the flight limitation', () => {
  const markup = renderToStaticMarkup(
    createElement(LoadoutScreen, {
      mission: { ...DEFAULT_MISSION, loadout: { ...chosen(), payloadMassKg: 0 } },
      loadout: LOADOUT,
      problems: [],
      onMission: () => undefined,
      onUnrestricted: () => undefined,
      onCommand: () => undefined,
    }),
  );
  expect(markup).toContain('data-menu-screen="loadout"');
  expect(markup).toContain('data-loadout="ready"');
  expect([...markup.matchAll(/data-station="(\d+)"/g)].map((m) => m[1])).toEqual(['0', '1', '2']);
  expect(markup).toContain('data-menu-dial="fuel"');
  expect(markup).toContain('data-menu-command="station-0-store-up"');
  expect(markup).toContain('data-menu-command="station-0-count-down"');
  expect(markup).toContain('data-menu-command="unrestricted"');
  expect(markup).toContain('data-loadout-value="gross"');
  expect(markup).toContain('Available stores');
  expect(markup).toContain('Stores do not affect flight performance yet');
  expect(markup).toContain('data-over-weight="false"');
});
