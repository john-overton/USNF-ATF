import { describe, expect, test } from 'bun:test';
import {
  allowedStores,
  defaultLoadout,
  externalFuelLb,
  grossWeightLb,
  kilogramsToPounds,
  parseRetailLoadout,
  poundsToKilograms,
  selectableStations,
  storeLabel,
  storesWeightLb,
  totalFuelLb,
  validateLoadout,
  type Loadout,
  type RetailLoadout,
  type Station,
  type StoreDefinition,
} from './retail-loadout';

const HASH = 'a'.repeat(64);

const store = (over: Partial<StoreDefinition> & { file: string }): StoreDefinition => ({
  sourceSha256: HASH,
  kind: 'weapon',
  structType: 7,
  name: over.file.replace(/\..*$/, ''),
  displayName: '',
  weightLb: 100,
  ...over,
});

const station = (over: Partial<Station> & { index: number }): Station => ({
  flags: 0x1f5,
  position: [0, 0, 0],
  slew: [0, 0, 0, 0],
  maxWeight: 40,
  maxItems: 2,
  nameIndex: 1,
  defaultStore: null,
  kind: 'weapon',
  selectable: true,
  internalGun: false,
  ...over,
});

/**
 * Synthetic, in the shape the exporter emits but with figures of our own. The
 * real numbers are asserted in `tools/retail/tests/test_loadout.py`, which reads
 * locally supplied media and skips without it.
 */
function fixture(): RetailLoadout {
  return {
    schemaVersion: 1,
    aircraftSource: 'SYNTH.PT',
    aircraftSha256: HASH,
    name: 'Synthetic Fighter',
    emptyWeightLb: 10000,
    maxTakeoffWeightLb: 20000,
    internalFuelLb: 4000,
    fuelConsumptionLbPerS: 2,
    afterburnerFuelConsumptionLbPerS: 10,
    hitPoints: 150,
    loadedPenalties: { drag: 10, gPullDrag: 5, elevator: 3, aileron: 3, rudder: 2 },
    stations: [
      station({
        index: 0,
        kind: 'sensor',
        selectable: false,
        defaultStore: 'EYE.SEE',
        maxItems: 1,
      }),
      station({
        index: 1,
        kind: 'weapon',
        selectable: false,
        internalGun: true,
        defaultStore: 'GUN.JT',
        maxItems: 500,
      }),
      station({ index: 2, defaultStore: 'MISSILE.JT', maxItems: 2 }),
      station({ index: 3, kind: 'tank', defaultStore: 'TANK.GAS', maxItems: 2 }),
      station({ index: 4, kind: 'empty', selectable: false, defaultStore: null, maxItems: 1 }),
    ],
    stores: {
      'EYE.SEE': store({ file: 'EYE.SEE', kind: 'sensor', structType: 10, name: '', weightLb: 0 }),
      'GUN.JT': store({
        file: 'GUN.JT',
        displayName: 'Synthetic Cannon',
        weightLb: 1,
        internalGun: true,
      }),
      'MISSILE.JT': store({
        file: 'MISSILE.JT',
        displayName: 'Synthetic Missile',
        weightLb: 500,
        guidance: 'radar',
        damage: [200, 20, 60, 40, 200],
      }),
      'TANK.GAS': store({
        file: 'TANK.GAS',
        kind: 'tank',
        structType: 8,
        displayName: 'Synthetic Tank',
        weightLb: 200,
        fuelLb: 1500,
      }),
    },
    missingStores: [],
    units: { weight: 'lb' },
    unresolved: ['flags is undecoded'],
  };
}

describe('parsing', () => {
  test('accepts the exporter shape and rejects malformed manifests', () => {
    expect(parseRetailLoadout(fixture()).name).toBe('Synthetic Fighter');
    const rejects: [string, (l: RetailLoadout) => void][] = [
      ['schema', (l) => ((l as { schemaVersion: number }).schemaVersion = 2)],
      ['identity', (l) => (l.aircraftSha256 = 'not-a-hash')],
      ['weight order', (l) => (l.emptyWeightLb = l.maxTakeoffWeightLb + 1)],
      ['negative fuel', (l) => (l.internalFuelLb = -1)],
      ['no stations', (l) => (l.stations = [])],
      ['bad station kind', (l) => ((l.stations[2] as { kind: string }).kind = 'ordnance')],
      [
        'bad position',
        (l) => (l.stations[2]!.position = [0, 0] as unknown as [number, number, number]),
      ],
      ['store key mismatch', (l) => (l.stores['MISSILE.JT']!.file = 'OTHER.JT')],
      [
        'unknown guidance',
        (l) => ((l.stores['MISSILE.JT'] as { guidance: string }).guidance = 'psychic'),
      ],
      ['tank without fuel', (l) => delete l.stores['TANK.GAS']!.fuelLb],
      ['dangling default', (l) => (l.stations[2]!.defaultStore = 'GHOST.JT')],
      [
        'bad damage table',
        (l) =>
          (l.stores['MISSILE.JT']!.damage = [1, 2, 3] as unknown as [
            number,
            number,
            number,
            number,
            number,
          ]),
      ],
    ];
    for (const [reason, mutate] of rejects) {
      const broken = fixture();
      mutate(broken);
      expect(() => parseRetailLoadout(broken)).toThrow();
      expect(reason).toBeTruthy();
    }
  });

  test('labels fall back when retail leaves the name empty', () => {
    const loadout = fixture();
    expect(storeLabel(loadout.stores['MISSILE.JT']!)).toBe('Synthetic Missile');
    // Retail genuinely ships empty names for several sensors and ECM pods.
    expect(storeLabel(loadout.stores['EYE.SEE']!)).toBe('EYE');
  });
});

describe('stations', () => {
  test('sensor slots and the internal cannon are not player-selectable', () => {
    const indices = selectableStations(fixture()).map((s) => s.index);
    expect(indices).toEqual([2, 3]);
  });

  test('a station offers only its own default until compatibility is decoded', () => {
    const loadout = fixture();
    const missile = loadout.stations[2]!;
    expect(allowedStores(loadout, missile)).toEqual(['MISSILE.JT']);
    // The original's own "load anything anywhere" option: weapons and tanks,
    // never the internal cannon or a sensor.
    expect(allowedStores(loadout, missile, true)).toEqual(['MISSILE.JT', 'TANK.GAS']);
  });
});

describe('weights', () => {
  const loadout = fixture();

  test('the default is every station at its retail default with full internal fuel', () => {
    const chosen = defaultLoadout(loadout);
    expect(chosen.internalFuelFraction).toBe(1);
    expect(chosen.stations[1]).toEqual({ store: 'GUN.JT', count: 500 });
    expect(chosen.stations[4]).toEqual({ store: null, count: 0 });
  });

  test('gross weight adds stores, tank shells and every pound of fuel', () => {
    const chosen: Loadout = {
      internalFuelFraction: 1,
      stations: {
        0: { store: 'EYE.SEE', count: 1 },
        1: { store: 'GUN.JT', count: 500 },
        2: { store: 'MISSILE.JT', count: 2 },
        3: { store: 'TANK.GAS', count: 1 },
        4: { store: null, count: 0 },
      },
    };
    // 500 rounds at 1 lb + two 500 lb missiles + one 200 lb tank shell.
    expect(storesWeightLb(loadout, chosen)).toBe(500 + 1000 + 200);
    expect(externalFuelLb(loadout, chosen)).toBe(1500);
    expect(totalFuelLb(loadout, chosen)).toBe(4000 + 1500);
    expect(grossWeightLb(loadout, chosen)).toBe(10000 + 5500 + 1700);
    expect(validateLoadout(loadout, chosen)).toEqual([]);
  });

  test('half internal fuel halves only the internal figure', () => {
    const chosen = { ...defaultLoadout(loadout), internalFuelFraction: 0.5 };
    chosen.stations[3] = { store: 'TANK.GAS', count: 2 };
    expect(totalFuelLb(loadout, chosen)).toBe(2000 + 3000);
  });

  test('pounds convert to kilograms for the flight model boundary', () => {
    expect(poundsToKilograms(kilogramsToPounds(1000))).toBeCloseTo(1000, 9);
    // The F-14's internal fuel, in the units the flight model wants.
    expect(poundsToKilograms(15741)).toBeCloseTo(7140, 1);
  });
});

describe('validation', () => {
  const loadout = fixture();

  test('reports over-count, unknown stores, phantom stations and empties with a count', () => {
    const problems = validateLoadout(loadout, {
      internalFuelFraction: 1,
      stations: {
        2: { store: 'MISSILE.JT', count: 9 },
        3: { store: 'GHOST.GAS', count: 1 },
        4: { store: null, count: 3 },
        9: { store: null, count: 0 },
      },
    });
    // Station 4 trips two rules at once: it is over its single-item limit and
    // it is empty while carrying a count. Both are true, so both are reported.
    expect(problems).toHaveLength(5);
    expect(problems.some((p) => p.includes('holds at most 2'))).toBe(true);
    expect(problems.some((p) => p.includes('holds at most 1'))).toBe(true);
    expect(problems.some((p) => p.includes('unknown store'))).toBe(true);
    expect(problems.some((p) => p.includes('does not exist'))).toBe(true);
    expect(problems.some((p) => p.includes('empty but carries a count'))).toBe(true);
  });

  test('rejects a store the station does not carry unless unrestricted', () => {
    const chosen: Loadout = {
      internalFuelFraction: 0,
      stations: { 2: { store: 'TANK.GAS', count: 1 } },
    };
    expect(validateLoadout(loadout, chosen)).toEqual([
      'Synthetic Tank is not carried on station 2.',
    ]);
    expect(validateLoadout(loadout, chosen, { unrestricted: true })).toEqual([]);
  });

  test('rejects an over-weight aeroplane', () => {
    const heavy = fixture();
    heavy.maxTakeoffWeightLb = 12000;
    const problems = validateLoadout(heavy, defaultLoadout(heavy));
    expect(problems.some((p) => p.includes('exceeds the 12000 lb maximum'))).toBe(true);
  });
});
