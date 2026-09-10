import type { MissionParams } from '../../sim/mission/params';
import { MenuScreen } from './MenuScreen';
import { BUTTON_HEIGHT, BUTTON_WIDTH, BUTTON_X, type MenuLayout } from './layout';
import type { MenuAction } from './navigation';

/**
 * The Fly / Select Plane pair from `LOADORD.DLG`, and nothing else yet: the
 * stations, the fuel dial and the weight readout are step 6 of the game shell
 * plan, on the `data/retail-loadout.ts` contract that already exists.
 */
function layout(mission: MissionParams): MenuLayout {
  return {
    rect: { x: 379, y: 80, width: 238, height: 220 },
    title: 'Loadout',
    widgets: [
      {
        type: 'text',
        x: BUTTON_X,
        y: 20,
        width: BUTTON_WIDTH,
        label: `${(mission.loadout.internalFuelFraction * 100).toFixed(0)}% internal fuel`,
      },
      {
        type: 'text',
        x: BUTTON_X,
        y: 44,
        width: BUTTON_WIDTH,
        label: 'Stations and fuel are not adjustable yet',
      },
      {
        type: 'action',
        x: BUTTON_X,
        y: 90,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
        command: 'fly',
        label: 'Fly',
      },
      {
        type: 'action',
        x: BUTTON_X,
        y: 122,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
        command: 'select-plane',
        label: 'Select Plane',
      },
      {
        type: 'action',
        x: BUTTON_X,
        y: 160,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
        command: 'main-menu',
        label: 'Main menu',
      },
    ],
  };
}

export function LoadoutScreen({
  mission,
  problems,
  onCommand,
}: {
  mission: MissionParams;
  problems: readonly string[];
  onCommand: (action: MenuAction) => void;
}) {
  return (
    <MenuScreen
      screen="loadout"
      layout={layout(mission)}
      problems={problems}
      onCommand={onCommand}
    />
  );
}
