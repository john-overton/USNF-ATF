import type { MissionParams } from '../../sim/mission/params';
import { MenuScreen } from './MenuScreen';
import type { MenuAssets } from './assets';
import { retailRect } from './assets';
import { mainMenuLayout } from './layout';
import type { MenuAction } from './navigation';

export function MainMenu({
  mission,
  assets,
  onCommand,
}: {
  mission: MissionParams;
  assets?: MenuAssets;
  onCommand: (action: MenuAction) => void;
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
          </div>
        </>
      }
    />
  );
}
