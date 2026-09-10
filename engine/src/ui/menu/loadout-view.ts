/**
 * The loadout screen as data: pure functions from the aircraft's recovered
 * hardpoints plus the player's choices to the rows and readouts a screen draws.
 * Keeping it separate from the markup is what makes the arithmetic testable
 * without rendering anything, and it is the same split `flight/hud.ts` uses.
 *
 * All of the weight and fuel arithmetic lives in `data/retail-loadout.ts`; this
 * file only arranges it. Retail units are pounds, converted for display only.
 */
import {
  allowedStores,
  externalFuelLb,
  grossWeightLb,
  internalFuelLb,
  poundsToKilograms,
  selectableStations,
  storeLabel,
  storesWeightLb,
  totalFuelLb,
  validateLoadout,
  type Loadout,
  type RetailLoadout,
} from '../../data/retail-loadout';

export interface StationRow {
  index: number;
  /** What is on the rack now, ready to show. */
  label: string;
  store: string | null;
  count: number;
  maxItems: number;
  /** Everything this station may carry, empty rack first. */
  choices: { store: string | null; label: string }[];
  weightLb: number;
}

export interface LoadoutView {
  aircraft: string;
  stations: StationRow[];
  internalFuelFraction: number;
  internalFuelLb: number;
  externalFuelLb: number;
  totalFuelLb: number;
  storesWeightLb: number;
  grossWeightLb: number;
  maxTakeoffWeightLb: number;
  overWeight: boolean;
  /** `.PT` percentage corrections. Displayed; the flight model does not apply them. */
  penalties: { label: string; percent: number }[];
  problems: string[];
}

export const EMPTY_RACK = 'Empty';

export function loadoutView(
  loadout: RetailLoadout,
  chosen: Loadout,
  options: { unrestricted?: boolean } = {},
): LoadoutView {
  const stations = selectableStations(loadout).map((station): StationRow => {
    const selection = chosen.stations[station.index] ?? { store: null, count: 0 };
    const store = selection.store ? loadout.stores[selection.store] : undefined;
    const choices = [
      { store: null, label: EMPTY_RACK },
      ...allowedStores(loadout, station, options.unrestricted).map((file) => ({
        store: file,
        label: loadout.stores[file] ? storeLabel(loadout.stores[file]) : file,
      })),
    ];
    return {
      index: station.index,
      label: store ? storeLabel(store) : EMPTY_RACK,
      store: selection.store,
      count: selection.count,
      maxItems: station.maxItems,
      choices,
      weightLb: store ? store.weightLb * selection.count : 0,
    };
  });
  const gross = grossWeightLb(loadout, chosen);
  const penalties = [
    { label: 'Drag', percent: loadout.loadedPenalties.drag },
    { label: 'G-pull drag', percent: loadout.loadedPenalties.gPullDrag },
    { label: 'Elevator', percent: loadout.loadedPenalties.elevator },
    { label: 'Aileron', percent: loadout.loadedPenalties.aileron },
    { label: 'Rudder', percent: loadout.loadedPenalties.rudder },
  ];
  return {
    aircraft: loadout.name,
    stations,
    internalFuelFraction: chosen.internalFuelFraction,
    internalFuelLb: internalFuelLb(loadout, chosen),
    externalFuelLb: externalFuelLb(loadout, chosen),
    totalFuelLb: totalFuelLb(loadout, chosen),
    storesWeightLb: storesWeightLb(loadout, chosen),
    grossWeightLb: gross,
    maxTakeoffWeightLb: loadout.maxTakeoffWeightLb,
    overWeight: gross > loadout.maxTakeoffWeightLb,
    penalties,
    problems: validateLoadout(loadout, chosen, options),
  };
}

/** Move a station to the next store it may carry, wrapping through the empty rack. */
export function cycleStore(row: StationRow, direction: 1 | -1): Loadout['stations'][number] {
  const index = row.choices.findIndex((choice) => choice.store === row.store);
  const next = row.choices[(index + direction + row.choices.length) % row.choices.length];
  const store = next?.store ?? null;
  return { store, count: store === null ? 0 : Math.max(1, Math.min(row.count || 1, row.maxItems)) };
}

/** A rocker steps the count between an empty rack and the station's own limit. */
export function stepCount(row: StationRow, direction: 1 | -1): Loadout['stations'][number] {
  if (row.store === null) return { store: null, count: 0 };
  const count = Math.max(0, Math.min(row.maxItems, row.count + direction));
  return count === 0 ? { store: null, count: 0 } : { store: row.store, count };
}

export const kilograms = (lb: number): number => poundsToKilograms(lb);
