import { AIRCRAFT, type AircraftId } from '../../flight/aircraft-catalog';
import { MAX_OPPONENTS, type AiSkill, type MissionParams } from '../../sim/mission/params';
import { MenuScreen } from './MenuScreen';
import { MenuRocker } from './MenuControls';
import type { MenuAssets } from './assets';
import { BUTTON_HEIGHT, BUTTON_WIDTH, BUTTON_X, type MenuLayout } from './layout';
import type { MenuAction } from './navigation';

/**
 * One page of what the original spreads over its 24-page wizard, and **mocked**:
 * the opponents this sets up fly fixed profiles. The AI virtual machine in
 * `sim/ai/` is not bound to aircraft state, nothing acquires anything and no round
 * does damage. See Docs/game-shell-plan.md section 8.
 */
export const SKILLS = ['Novice', 'Average', 'Experienced', 'Ace'] as const;
const IDS = Object.keys(AIRCRAFT) as AircraftId[];

function layout(): MenuLayout {
  return {
    rect: { x: 100, y: 60, width: 440, height: 320 },
    title: 'Quick fight',
    widgets: [
      {
        type: 'action',
        x: BUTTON_X,
        y: 250,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
        command: 'continue',
        label: 'Choose your aircraft',
      },
      {
        type: 'action',
        x: BUTTON_X + 200,
        y: 250,
        width: 120,
        height: BUTTON_HEIGHT,
        command: 'back',
        label: 'Back',
      },
    ],
  };
}

export function QuickFightSetup({
  mission,
  assets,
  onMission,
  onCommand,
}: {
  mission: MissionParams;
  assets?: MenuAssets;
  onMission: (mission: MissionParams) => void;
  onCommand: (action: MenuAction) => void;
}) {
  const first = mission.opponents[0] ?? { aircraft: 'f14' as AircraftId, skill: 2 as AiSkill };
  const set = (count: number, aircraft: AircraftId, skill: AiSkill) =>
    onMission({
      ...mission,
      mode: 'quick-fight',
      opponents: Array.from({ length: count }, () => ({ aircraft, skill })),
    });
  const count = Math.max(1, mission.opponents.length);
  return (
    <MenuScreen
      screen="quick-fight"
      layout={layout()}
      {...(assets ? { assets } : {})}
      onCommand={onCommand}
    >
      <div className="menu-loadout" data-quick-fight="ready">
        <ul className="menu-stations">
          <li>
            <span className="menu-station-name">Opponents</span>
            <MenuRocker
              label="Opponent count"
              command="opponent-count"
              value={`${count}`}
              onStep={(direction) =>
                set(
                  Math.max(1, Math.min(MAX_OPPONENTS - 1, count + direction)),
                  first.aircraft,
                  first.skill,
                )
              }
            />
            <span className="menu-station-weight">
              {count + 1} aircraft in the sky, including you
            </span>
          </li>
          <li>
            <span className="menu-station-name">They fly</span>
            <MenuRocker
              label="Opponent aircraft"
              command="opponent-aircraft"
              value={AIRCRAFT[first.aircraft].name}
              onStep={(direction) =>
                set(
                  count,
                  IDS[(IDS.indexOf(first.aircraft) + direction + IDS.length) % IDS.length] ?? 'f14',
                  first.skill,
                )
              }
            />
          </li>
          <li>
            <span className="menu-station-name">Skill</span>
            <MenuRocker
              label="Opponent skill"
              command="opponent-skill"
              value={SKILLS[first.skill] ?? 'Average'}
              onStep={(direction) =>
                set(
                  count,
                  first.aircraft,
                  Math.max(0, Math.min(3, first.skill + direction)) as AiSkill,
                )
              }
            />
            <span className="menu-station-weight">Recorded, not yet flown</span>
          </li>
        </ul>
        <p className="menu-penalties">
          <strong>This is a mock.</strong> Your opponents hold a heading, a speed and an altitude.
          The retail AI is parsed and unit-tested but is not bound to aircraft state, so nothing
          hunts you, nothing shoots, and no round does damage. Spawns are deterministic from the
          mission seed ({mission.seed}).
        </p>
      </div>
    </MenuScreen>
  );
}
