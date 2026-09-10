import type { MissionParams } from '../../sim/mission/params';
import { MenuScreen } from './MenuScreen';
import { mainMenuLayout } from './layout';
import type { MenuAction } from './navigation';

export function MainMenu({
  mission,
  onCommand,
}: {
  mission: MissionParams;
  onCommand: (action: MenuAction) => void;
}) {
  const layout = mainMenuLayout();
  return (
    <MenuScreen screen="main-menu" layout={layout} onCommand={onCommand}>
      <p className="menu-summary">
        {mission.aircraft.toUpperCase()} · {mission.theater} ·{' '}
        {(mission.loadout.internalFuelFraction * 100).toFixed(0)}% internal fuel
      </p>
    </MenuScreen>
  );
}
