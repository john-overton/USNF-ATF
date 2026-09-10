import type { MissionParams } from '../../sim/mission/params';
import {
  AIRCRAFT_ITEMS,
  MAIN_MENU_ITEMS,
  type MenuAction,
  type MenuItem,
  type Screen,
} from './navigation';

/**
 * Structure only. The recovered retail layouts, artwork and chrome arrive in steps 4
 * and 5 of the game shell plan; what this establishes now is the test surface those
 * screens will keep: `data-menu-screen` on the screen, `data-menu-command` on every
 * widget. Prop-driven and effect-free, because renderToStaticMarkup is the only React
 * test tool in the repo.
 */
const TITLES: Record<Exclude<Screen, 'explorer' | 'flight' | 'probe'>, string> = {
  'main-menu': 'Jane’s USNF — fan remake',
  'aircraft-select': 'Select aircraft',
  loadout: 'Loadout',
  debrief: 'Debrief',
};

const LOADOUT_ITEMS: readonly MenuItem[] = [
  { command: 'fly', label: 'Fly', enabled: true },
  { command: 'select-plane', label: 'Select Plane', enabled: true },
  { command: 'main-menu', label: 'Main menu', enabled: true },
];

const DEBRIEF_ITEMS: readonly MenuItem[] = [
  { command: 'main-menu', label: 'Main menu', enabled: true },
];

export function PlaceholderMenu({
  screen,
  mission,
  problems,
  onCommand,
}: {
  screen: 'main-menu' | 'aircraft-select' | 'loadout' | 'debrief';
  mission: MissionParams;
  problems: readonly string[];
  onCommand: (action: MenuAction) => void;
}) {
  const items =
    screen === 'main-menu'
      ? MAIN_MENU_ITEMS
      : screen === 'loadout'
        ? LOADOUT_ITEMS
        : screen === 'debrief'
          ? DEBRIEF_ITEMS
          : [];
  return (
    <main className="menu-placeholder" data-menu-screen={screen}>
      <h1>{TITLES[screen]}</h1>
      {screen === 'aircraft-select' && (
        <ul className="menu-items">
          {AIRCRAFT_ITEMS.map((item) => (
            <li key={item.aircraft}>
              <button
                type="button"
                data-menu-command="choose-aircraft"
                data-menu-aircraft={item.aircraft}
                aria-pressed={mission.aircraft === item.aircraft}
                onClick={() => onCommand({ command: 'choose-aircraft', aircraft: item.aircraft })}
              >
                {item.label}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              data-menu-command="back"
              onClick={() => onCommand({ command: 'back' })}
            >
              Back
            </button>
          </li>
        </ul>
      )}
      <ul className="menu-items">
        {items.map((item) => (
          <li key={item.command}>
            <button
              type="button"
              data-menu-command={item.command}
              disabled={!item.enabled}
              onClick={() => onCommand({ command: item.command })}
            >
              {item.label}
            </button>
            {item.note && <small>{item.note}</small>}
          </li>
        ))}
      </ul>
      <p className="menu-summary">
        {mission.mode === 'explorer'
          ? 'Terrain explorer'
          : mission.mode === 'quick-fight'
            ? 'Quick fight · opponents are not flown yet'
            : 'Free flight'}{' '}
        · {mission.aircraft.toUpperCase()} · {mission.theater} ·{' '}
        {(mission.loadout.internalFuelFraction * 100).toFixed(0)}% internal fuel
      </p>
      {problems.length > 0 && (
        <ul className="menu-problems" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
