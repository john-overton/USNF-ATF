/**
 * Which screen the player is on, as a pure function of where they were and what they
 * pressed. No router and no dependency: five screens do not need one, and keeping the
 * transitions pure means they can be tested without rendering anything.
 *
 * The rule that keeps the machine-facing entry point alive: a query string wins. The
 * menu is the human-facing default, so it appears only when the app is launched with
 * nothing in the URL at all. Every existing Electron smoke script deep-links with at
 * least `view`, `root` and `manifest`, so every one of them still lands where it did.
 */
import { AIRCRAFT, type AircraftId } from '../../flight/aircraft-catalog';
import { validateMission, type MissionParams } from '../../sim/mission/params';

export type Screen =
  | 'main-menu'
  | 'explorer'
  | 'quick-fight'
  | 'aircraft-select'
  | 'loadout'
  | 'flight'
  | 'debrief'
  | 'probe';

/**
 * Command ids double as the `data-menu-command` test surface, the way the MFD bezel's
 * `aria-label`s do. The retail names come from `CHOOSEAC.DLG`; the last two are ours.
 */
export type MenuCommand =
  | 'single-mission'
  | 'quick-mission'
  | 'pro-mission'
  | 'replay-mission'
  | 'new-campaign'
  | 'old-campaign'
  | 'pilot-records'
  | 'reference'
  | 'free-flight'
  | 'terrain-explorer'
  | 'choose-aircraft'
  | 'continue'
  | 'fly'
  | 'select-plane'
  | 'end-flight'
  | 'main-menu'
  | 'back';

export interface MenuAction {
  command: MenuCommand;
  /** Only `choose-aircraft` carries one. */
  aircraft?: AircraftId;
}

/**
 * What the debrief shows. It is taken from the flight's own diagnostics snapshot
 * at the moment the player leaves, which is the same interface the Electron smoke
 * scripts read, rather than new plumbing through the render loop.
 */
export interface FlightSummary {
  aircraftName: string;
  simTimeSeconds: number;
  takeoffs: number;
  landings: number;
  roundsFired: number;
  fuelFraction: number;
}

export interface ShellState {
  screen: Screen;
  mission: MissionParams;
  /** Present once a flight has been flown and left. */
  summary?: FlightSummary;
}

/** Narrow a diagnostics snapshot to the handful of numbers a debrief reads out. */
export function flightSummary(diagnostics: unknown): FlightSummary | undefined {
  const d = diagnostics as
    | (Partial<FlightSummary> & {
        simTime?: number;
        gun?: { fired?: number };
      })
    | undefined;
  if (!d || typeof d.simTime !== 'number') return undefined;
  return {
    aircraftName: typeof d.aircraftName === 'string' ? d.aircraftName : 'Unknown aircraft',
    simTimeSeconds: d.simTime,
    takeoffs: d.takeoffs ?? 0,
    landings: d.landings ?? 0,
    roundsFired: d.gun?.fired ?? 0,
    fuelFraction: d.fuelFraction ?? 0,
  };
}

export interface MenuItem {
  command: MenuCommand;
  label: string;
  enabled: boolean;
  /** Shown next to a disabled item so the menu says why, rather than hiding the game's shape. */
  note?: string;
}

/**
 * The retail item list is kept whole, with what we cannot yet deliver visibly disabled.
 * The disabled sprite set exists for exactly this, and showing the real shape of the
 * game is more honest than a three-item menu.
 */
export const MAIN_MENU_ITEMS: readonly MenuItem[] = [
  {
    command: 'single-mission',
    label: 'Play Single Mission',
    enabled: false,
    note: 'Missions are phase 8',
  },
  {
    command: 'quick-mission',
    label: 'Create Quick Mission',
    enabled: true,
    note: 'Opponents are not flown yet',
  },
  {
    command: 'pro-mission',
    label: 'Create Pro Mission',
    enabled: false,
    note: 'Missions are phase 8',
  },
  {
    command: 'replay-mission',
    label: 'Replay Last Mission',
    enabled: false,
    note: 'No recording yet',
  },
  {
    command: 'new-campaign',
    label: 'Start New Campaign',
    enabled: false,
    note: 'Campaign is phase 8',
  },
  {
    command: 'old-campaign',
    label: 'Continue Old Campaign',
    enabled: false,
    note: 'Campaign is phase 8',
  },
  {
    command: 'pilot-records',
    label: 'View Pilot Records',
    enabled: false,
    note: 'No pilot records yet',
  },
  { command: 'reference', label: 'Reference', enabled: false, note: 'Encyclopedia is phase 8' },
  { command: 'free-flight', label: 'Free Flight', enabled: true },
  { command: 'terrain-explorer', label: 'Terrain Explorer', enabled: true },
];

export const AIRCRAFT_ITEMS: readonly { aircraft: AircraftId; label: string }[] = (
  Object.keys(AIRCRAFT) as AircraftId[]
).map((aircraft) => ({ aircraft, label: AIRCRAFT[aircraft].name }));

/** A deep link wins; the menu is what a bare launch gets. */
export function initialScreen(search: string): Screen {
  const params = new URLSearchParams(search);
  if (params.get('view') === 'probe') return 'probe';
  if ([...params.keys()].length === 0) return 'main-menu';
  const mode = params.get('mode');
  return mode === 'flight' || mode === 'free-flight' || mode === 'quick-fight'
    ? 'flight'
    : 'explorer';
}

/** What a command means for the session itself, separate from where it leads. */
export function nextMission(action: MenuAction, mission: MissionParams): MissionParams {
  switch (action.command) {
    case 'free-flight':
      return { ...mission, mode: 'free-flight', opponents: [] };
    case 'quick-mission':
      // One opponent by default; the setup screen and real opponents are still to come.
      return {
        ...mission,
        mode: 'quick-fight',
        opponents: mission.opponents.length ? mission.opponents : [{ aircraft: 'f14', skill: 2 }],
      };
    case 'terrain-explorer':
      return { ...mission, mode: 'explorer', opponents: [] };
    case 'choose-aircraft':
      return action.aircraft ? { ...mission, aircraft: action.aircraft } : mission;
    default:
      return mission;
  }
}

export function nextScreen(screen: Screen, action: MenuAction, mission: MissionParams): Screen {
  switch (screen) {
    case 'main-menu':
      if (action.command === 'quick-mission') return 'quick-fight';
      if (action.command === 'free-flight') return 'aircraft-select';
      if (action.command === 'terrain-explorer') return 'explorer';
      // Everything else on the main menu is disabled and goes nowhere.
      return 'main-menu';
    case 'quick-fight':
      if (action.command === 'continue') return 'aircraft-select';
      if (action.command === 'back' || action.command === 'main-menu') return 'main-menu';
      return 'quick-fight';
    case 'aircraft-select':
      if (action.command === 'choose-aircraft') return 'loadout';
      if (action.command === 'back' || action.command === 'main-menu')
        return mission.mode === 'quick-fight' ? 'quick-fight' : 'main-menu';
      return 'aircraft-select';
    case 'loadout':
      // Per LOADORD.DLG: Fly, or go back and Select Plane. A mission that does not
      // add up keeps the player on the screen that can fix it.
      if (action.command === 'fly') return validateMission(mission).length ? 'loadout' : 'flight';
      if (action.command === 'select-plane' || action.command === 'back') return 'aircraft-select';
      if (action.command === 'main-menu') return 'main-menu';
      return 'loadout';
    case 'flight':
      return action.command === 'end-flight' || action.command === 'back' ? 'debrief' : 'flight';
    case 'debrief':
      return action.command === 'main-menu' || action.command === 'back' ? 'main-menu' : 'debrief';
    case 'explorer':
      return action.command === 'back' || action.command === 'main-menu' ? 'main-menu' : 'explorer';
    case 'probe':
      return 'probe';
  }
}

export function applyMenuAction(
  state: ShellState,
  action: MenuAction,
  summary?: FlightSummary,
): ShellState {
  const mission = nextMission(action, state.mission);
  const screen = nextScreen(state.screen, action, mission);
  const kept = screen === 'debrief' ? (summary ?? state.summary) : state.summary;
  return { screen, mission, ...(kept ? { summary: kept } : {}) };
}
