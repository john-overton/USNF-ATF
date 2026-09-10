import type { MissionParams } from '../../sim/mission/params';
import { MenuScreen } from './MenuScreen';
import type { MenuAssets } from './assets';
import { aircraftSelectLayout } from './layout';
import type { MenuAction } from './navigation';

export function AircraftSelect({
  mission,
  assets,
  onCommand,
}: {
  mission: MissionParams;
  assets?: MenuAssets;
  onCommand: (action: MenuAction) => void;
}) {
  return (
    <MenuScreen
      screen="aircraft-select"
      layout={aircraftSelectLayout(mission.aircraft)}
      {...(assets ? { assets } : {})}
      onCommand={onCommand}
    >
      <p className="menu-summary">
        {mission.mode === 'quick-fight'
          ? 'Quick fight · opponents are not flown yet'
          : 'Free flight'}
      </p>
    </MenuScreen>
  );
}
