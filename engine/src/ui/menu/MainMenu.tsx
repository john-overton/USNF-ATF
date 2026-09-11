import type { MissionParams } from '../../sim/mission/params';
import { MenuScreen } from './MenuScreen';
import type { MenuAssets } from './assets';
import { retailRect } from './assets';
import { mainMenuLayout } from './layout';
import type { MenuAction } from './navigation';
import { GunModeSelect } from '../GunModeSelect';
import type { GunMode } from '../../data/retail-gun';
import { THEATERS, theaterById } from '../../terrain/theaters';

export function MainMenu({
  mission,
  assets,
  onCommand,
  onGunMode,
  onMission,
}: {
  mission: MissionParams;
  assets?: MenuAssets;
  onCommand: (action: MenuAction) => void;
  onGunMode?: (mode: GunMode) => void;
  onMission?: (mission: MissionParams) => void;
}) {
  // Preserve the original activity panel; practice controls occupy the lower left.
  const rect = retailRect(assets, 'main-menu');
  const layout = rect ? mainMenuLayout(rect) : mainMenuLayout();
  return (
    <MenuScreen
      screen="main-menu"
      layout={layout}
      {...(assets ? { assets } : {})}
      onCommand={onCommand}
      frameContent={
        <>
          <p className="menu-main-status">
            Development build · Dimmed activities are unavailable · M: mute
          </p>
          <div className="menu-main-caption">
            <strong>Practice & exploration</strong>
            <span>
              {mission.aircraft.toUpperCase()} · {mission.theater} ·{' '}
              {(mission.loadout.internalFuelFraction * 100).toFixed(0)}% fuel
            </span>
            <label className="menu-theater-select">
              Theater{' '}
              <select
                aria-label="Theater selection"
                value={mission.theater}
                onChange={(event) => {
                  const theater = theaterById(event.target.value);
                  if (theater)
                    onMission?.({
                      ...mission,
                      theater: theater.id,
                      manifestPath: theater.manifestPath,
                    });
                }}
              >
                {THEATERS.map((theater) => (
                  <option key={theater.id} value={theater.id}>
                    {theater.name}
                  </option>
                ))}
              </select>
            </label>
            <GunModeSelect
              value={mission.gunMode}
              {...(onGunMode ? { onChange: onGunMode } : {})}
            />
          </div>
        </>
      }
    />
  );
}
