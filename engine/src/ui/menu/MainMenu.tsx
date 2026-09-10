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
  // With a bundle installed the panel is the original's own rect, and the two rows
  // we add move below it, where the artwork is plain.
  const rect = retailRect(assets, 'main-menu');
  const layout = rect ? mainMenuLayout(rect) : mainMenuLayout();
  return (
    <MenuScreen
      screen="main-menu"
      layout={layout}
      {...(assets ? { assets } : {})}
      onCommand={onCommand}
    >
      <p className="menu-summary">
        {mission.aircraft.toUpperCase()} · {mission.theater} ·{' '}
        {(mission.loadout.internalFuelFraction * 100).toFixed(0)}% internal fuel
      </p>
    </MenuScreen>
  );
}
