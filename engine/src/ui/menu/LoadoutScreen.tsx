import type { MissionParams } from '../../sim/mission/params';
import { storeLabel, type RetailLoadout } from '../../data/retail-loadout';
import { AIRCRAFT } from '../../flight/aircraft-catalog';
import { MenuScreen } from './MenuScreen';
import { MenuDial, MenuRocker } from './MenuControls';
import { storeImage, type MenuAssets } from './assets';
import { cycleStore, loadoutView, stepCount } from './loadout-view';
import type { MenuAction } from './navigation';

const pounds = (lb: number) => Math.round(lb).toLocaleString() + ' lb';

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
  loadout?: RetailLoadout;
  unrestricted?: boolean;
  problems: readonly string[];
  assets?: MenuAssets;
  onMission: (mission: MissionParams) => void;
  onUnrestricted: (value: boolean) => void;
  onCommand: (action: MenuAction) => void;
}) {
  const view = loadout ? loadoutView(loadout, mission.loadout, { unrestricted }) : undefined;
  const stores =
    loadout && view
      ? [
          ...new Set(
            view.stations.flatMap((row) =>
              row.choices.flatMap((choice) => (choice.store ? [choice.store] : [])),
            ),
          ),
        ]
          .map((file) => loadout.stores[file]!)
          .filter(Boolean)
      : [];
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
      layout={{
        rect: { x: 0, y: 0, width: 640, height: 480 },
        title: 'Load ordnance',
        widgets: [
          {
            type: 'action',
            x: 383,
            y: 414,
            width: 80,
            height: 26,
            command: 'fly',
            label: 'Fly',
            disabled: !!view?.problems.length || problems.length > 0,
          },
          {
            type: 'action',
            x: 473,
            y: 414,
            width: 100,
            height: 26,
            command: 'select-plane',
            label: 'Select Plane',
          },
          {
            type: 'action',
            x: 508,
            y: 39,
            width: 84,
            height: 16,
            command: 'main-menu',
            label: 'Main menu',
          },
        ],
      }}
      {...(assets ? { assets } : {})}
      problems={[...problems, ...(view?.problems ?? [])]}
      onCommand={onCommand}
      frameContent={
        <p className="mission-topbar">
          {view?.aircraft ?? AIRCRAFT[mission.aircraft].name} · Select stores and fuel
        </p>
      }
    >
      <div className="ordnance-content" data-loadout={view ? 'ready' : 'unavailable'}>
        <h2 className="ordnance-stores-title">Available stores</h2>
        <ul className="ordnance-stores">
          {stores.map((store) => {
            const image = storeImage(assets, store.file);
            return (
              <li key={store.file} title={storeLabel(store)}>
                <span>{storeLabel(store)}</span>
                {image ? (
                  <img src={image} alt="" />
                ) : (
                  <span className="ordnance-store-kind">
                    {store.kind === 'tank' ? 'External fuel tank' : 'Weapon store'}
                  </span>
                )}
                <small>{pounds(store.weightLb)} each</small>
              </li>
            );
          })}
          {!view && <li className="ordnance-empty">No stores installed</li>}
        </ul>
        <h2 className="ordnance-stations-title">Aircraft hardpoints</h2>
        <ul className="ordnance-stations">
          {view?.stations.map((row) => (
            <li key={row.index} data-station={row.index}>
              <div className="ordnance-station-heading">
                Station {row.index}
                <span>{pounds(row.weightLb)}</span>
              </div>
              <MenuRocker
                label={'Station ' + row.index + ' store'}
                command={'station-' + row.index + '-store'}
                value={row.label}
                onStep={(direction) => setStation(row.index, cycleStore(row, direction))}
                disabled={row.choices.length < 2}
              />
              <MenuRocker
                label={'Station ' + row.index + ' count'}
                command={'station-' + row.index + '-count'}
                value={row.count + ' / ' + row.maxItems}
                onStep={(direction) => setStation(row.index, stepCount(row, direction))}
                disabled={row.store === null}
              />
            </li>
          ))}
        </ul>
        <div className="ordnance-weight">
          <dl>
            <dt>Max</dt>
            <dd>{view ? pounds(view.maxTakeoffWeightLb) : '—'}</dd>
            <dt>Current</dt>
            <dd data-loadout-value="gross" data-over-weight={view?.overWeight}>
              {view ? pounds(view.grossWeightLb) : '—'}
            </dd>
            <dt>Avail</dt>
            <dd>{view ? pounds(view.maxTakeoffWeightLb - view.grossWeightLb) : '—'}</dd>
          </dl>
        </div>
        <div className="ordnance-fuel">
          <MenuDial
            label="Internal fuel"
            command="fuel"
            value={mission.loadout.internalFuelFraction}
            readout={Math.round(mission.loadout.internalFuelFraction * 100) + '%'}
            onChange={(value) =>
              onMission({
                ...mission,
                loadout: { ...mission.loadout, internalFuelFraction: value },
              })
            }
          />
        </div>
        <div className="ordnance-options">
          <label>
            <input
              type="checkbox"
              data-menu-command="unrestricted"
              checked={unrestricted}
              onChange={(event) => onUnrestricted(event.target.checked)}
            />{' '}
            Unrestricted loadout
          </label>
          <p>
            {view
              ? 'Use the station arrows to load or remove stores. Stores do not affect flight performance yet.'
              : 'No stations to show: this aircraft has no loadout installed. You can still set fuel and fly.'}
          </p>
        </div>
        {view && (
          <p className="ordnance-totals">
            Fuel <span data-loadout-value="fuel">{pounds(view.totalFuelLb)}</span> · Stores{' '}
            <span data-loadout-value="stores">{pounds(view.storesWeightLb)}</span>
          </p>
        )}
      </div>
    </MenuScreen>
  );
}
