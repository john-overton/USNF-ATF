import type { MissionParams } from '../../sim/mission/params';
import type { RetailLoadout } from '../../data/retail-loadout';
import { MenuScreen } from './MenuScreen';
import { MenuDial, MenuRocker } from './MenuControls';
import type { MenuAssets } from './assets';
import { BUTTON_HEIGHT, BUTTON_WIDTH, BUTTON_X, type MenuLayout } from './layout';
import { cycleStore, kilograms, loadoutView, stepCount } from './loadout-view';
import type { MenuAction } from './navigation';

/**
 * The pre-mission screen: stations, fuel, and what the aircraft weighs. Modelled on
 * `LOADORD.DLG`, which recovers as two dials, two rockers and the Fly / Select Plane
 * pair (Docs/formats/mnu.md).
 *
 * Two things it is honest about. Stores are **displayed** against the `.PT`
 * `loadedDrag` family of penalties; the flight model does not apply them yet. And
 * because the hardpoint `flags` compatibility mask is undecoded, a station offers
 * its own default and an empty rack, and nothing else unless the developer toggle
 * named after the original's own "Cheat (load anything anywhere)" is on.
 */
const pounds = (lb: number) => `${Math.round(lb).toLocaleString()} lb`;
const tonnes = (lb: number) => `${(kilograms(lb) / 1000).toFixed(2)} t`;

function layout(title: string): MenuLayout {
  return {
    rect: { x: 24, y: 40, width: 592, height: 400 },
    title,
    widgets: [
      {
        type: 'action',
        x: BUTTON_X,
        y: 350,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
        command: 'fly',
        label: 'Fly',
      },
      {
        type: 'action',
        x: BUTTON_X + 200,
        y: 350,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
        command: 'select-plane',
        label: 'Select Plane',
      },
      {
        type: 'action',
        x: BUTTON_X + 400,
        y: 350,
        width: 120,
        height: BUTTON_HEIGHT,
        command: 'main-menu',
        label: 'Main menu',
      },
    ],
  };
}

export function LoadoutScreen({
  mission,
  loadout,
  unrestricted = false,
  problems,
  assets,
  onMission,
  onUnrestricted,
  onCommand,
}: {
  mission: MissionParams;
  /** Absent until an aircraft's `<id>-loadout.json` has been ported and installed. */
  loadout?: RetailLoadout;
  unrestricted?: boolean;
  problems: readonly string[];
  assets?: MenuAssets;
  onMission: (mission: MissionParams) => void;
  onUnrestricted: (value: boolean) => void;
  onCommand: (action: MenuAction) => void;
}) {
  if (!loadout)
    return (
      <MenuScreen
        screen="loadout"
        layout={layout('Loadout')}
        {...(assets ? { assets } : {})}
        problems={problems}
        onCommand={onCommand}
      >
        <p className="menu-summary" data-loadout="unavailable">
          No stations to show: {mission.aircraft.toUpperCase()} has no ported loadout installed. See
          Docs/aircraft-porting.md. Fuel still follows the practice flight&rsquo;s own slider.
        </p>
      </MenuScreen>
    );
  const view = loadoutView(loadout, mission.loadout, { unrestricted });
  const setStation = (index: number, selection: { store: string | null; count: number }) =>
    onMission({
      ...mission,
      loadout: {
        ...mission.loadout,
        stations: { ...mission.loadout.stations, [index]: selection },
      },
    });
  return (
    <MenuScreen
      screen="loadout"
      layout={layout(view.aircraft)}
      {...(assets ? { assets } : {})}
      problems={[...problems, ...view.problems]}
      onCommand={onCommand}
    >
      <div className="menu-loadout" data-loadout="ready">
        <ul className="menu-stations">
          {view.stations.map((row) => (
            <li key={row.index} data-station={row.index}>
              <span className="menu-station-name">Station {row.index}</span>
              <MenuRocker
                label={`Station ${row.index} store`}
                command={`station-${row.index}-store`}
                value={row.label}
                onStep={(direction) => setStation(row.index, cycleStore(row, direction))}
                disabled={row.choices.length < 2}
              />
              <MenuRocker
                label={`Station ${row.index} count`}
                command={`station-${row.index}-count`}
                value={`${row.count} / ${row.maxItems}`}
                onStep={(direction) => setStation(row.index, stepCount(row, direction))}
                disabled={row.store === null}
              />
              <span className="menu-station-weight">{pounds(row.weightLb)}</span>
            </li>
          ))}
        </ul>
        <MenuDial
          label="Internal fuel"
          command="fuel"
          value={view.internalFuelFraction}
          readout={`${(view.internalFuelFraction * 100).toFixed(0)}% · ${pounds(view.internalFuelLb)}`}
          onChange={(value) =>
            onMission({
              ...mission,
              loadout: { ...mission.loadout, internalFuelFraction: value },
            })
          }
        />
        <dl className="menu-weights">
          <dt>Fuel, internal + external</dt>
          <dd data-loadout-value="fuel">
            {pounds(view.totalFuelLb)}
            {view.externalFuelLb > 0 ? ` (${pounds(view.externalFuelLb)} in tanks)` : ''}
          </dd>
          <dt>Stores</dt>
          <dd data-loadout-value="stores">{pounds(view.storesWeightLb)}</dd>
          <dt>Gross weight</dt>
          <dd data-loadout-value="gross" data-over-weight={view.overWeight}>
            {pounds(view.grossWeightLb)} · {tonnes(view.grossWeightLb)} of{' '}
            {pounds(view.maxTakeoffWeightLb)}
          </dd>
        </dl>
        <p className="menu-penalties">
          Loaded penalties, from the aircraft&rsquo;s own data and <strong>shown only</strong>:{' '}
          {view.penalties.map((p) => `${p.label} ${p.percent}%`).join(' · ')}. The flight model does
          not apply them yet.
        </p>
        <label className="menu-toggle">
          <input
            type="checkbox"
            data-menu-command="unrestricted"
            checked={unrestricted}
            onChange={(event) => onUnrestricted(event.target.checked)}
          />
          Load anything anywhere — the compatibility mask is undecoded, so this offers every store
          rather than the ones the original would allow.
        </label>
      </div>
    </MenuScreen>
  );
}
