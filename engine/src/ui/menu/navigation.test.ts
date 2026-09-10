import { expect, test } from 'bun:test';
import {
  applyMenuAction,
  initialScreen,
  MAIN_MENU_ITEMS,
  nextMission,
  nextScreen,
  type MenuAction,
  type Screen,
} from './navigation';
import { DEFAULT_MISSION, type MissionParams } from '../../sim/mission/params';

const go = (screen: Screen, command: MenuAction['command'], mission = DEFAULT_MISSION) =>
  nextScreen(screen, { command }, mission);

test('a bare launch shows the menu and every existing deep link still wins', () => {
  expect(initialScreen('')).toBe('main-menu');
  expect(initialScreen('?')).toBe('main-menu');
  expect(initialScreen('?view=probe')).toBe('probe');
  expect(initialScreen('?mode=flight')).toBe('flight');
  expect(initialScreen('?mode=free-flight')).toBe('flight');
  expect(initialScreen('?mode=quick-fight')).toBe('flight');
  expect(initialScreen('?mode=explore')).toBe('explorer');
  // What the Electron harness always sets, with and without a mode: the explorer
  // cases of teleport-smoke.ts arrive with only these three keys.
  expect(initialScreen('?view=terrain&root=appData&manifest=terrains/ukraine/manifest.json')).toBe(
    'explorer',
  );
  expect(
    initialScreen('?view=terrain&root=appData&manifest=terrains/ukraine/manifest.json&mode=flight'),
  ).toBe('flight');
});

test('the main menu offers exactly the three things this build can deliver', () => {
  expect(MAIN_MENU_ITEMS.filter((item) => item.enabled).map((item) => item.command)).toEqual([
    'quick-mission',
    'free-flight',
    'terrain-explorer',
  ]);
  expect(MAIN_MENU_ITEMS).toHaveLength(10);
  for (const item of MAIN_MENU_ITEMS.filter((i) => !i.enabled)) expect(item.note).toBeTruthy();
});

test('disabled main-menu items go nowhere', () => {
  for (const item of MAIN_MENU_ITEMS.filter((i) => !i.enabled))
    expect(go('main-menu', item.command)).toBe('main-menu');
});

test('the enabled main-menu items reach their screens', () => {
  expect(go('main-menu', 'free-flight')).toBe('aircraft-select');
  expect(go('main-menu', 'quick-mission')).toBe('aircraft-select');
  expect(go('main-menu', 'terrain-explorer')).toBe('explorer');
});

test('aircraft select, loadout, flight and debrief follow the LOADORD.DLG shape', () => {
  expect(
    nextScreen('aircraft-select', { command: 'choose-aircraft', aircraft: 'a4e' }, DEFAULT_MISSION),
  ).toBe('loadout');
  expect(go('aircraft-select', 'back')).toBe('main-menu');
  expect(go('loadout', 'fly')).toBe('flight');
  expect(go('loadout', 'select-plane')).toBe('aircraft-select');
  expect(go('loadout', 'main-menu')).toBe('main-menu');
  expect(go('flight', 'end-flight')).toBe('debrief');
  expect(go('flight', 'back')).toBe('debrief');
  expect(go('debrief', 'main-menu')).toBe('main-menu');
  expect(go('explorer', 'back')).toBe('main-menu');
  expect(go('probe', 'back')).toBe('probe');
});

test('a mission that does not add up keeps the player on the screen that can fix it', () => {
  const broken: MissionParams = { ...DEFAULT_MISSION, theater: 'nevada' };
  expect(go('loadout', 'fly', broken)).toBe('loadout');
  expect(go('loadout', 'fly')).toBe('flight');
});

test('commands change the mission as well as the screen', () => {
  expect(nextMission({ command: 'free-flight' }, DEFAULT_MISSION).mode).toBe('free-flight');
  expect(nextMission({ command: 'terrain-explorer' }, DEFAULT_MISSION).mode).toBe('explorer');
  const quick = nextMission({ command: 'quick-mission' }, DEFAULT_MISSION);
  expect(quick.mode).toBe('quick-fight');
  expect(quick.opponents).toHaveLength(1);
  expect(
    nextMission({ command: 'choose-aircraft', aircraft: 'x31' }, DEFAULT_MISSION).aircraft,
  ).toBe('x31');
  expect(nextMission({ command: 'back' }, DEFAULT_MISSION)).toBe(DEFAULT_MISSION);
});

test('a whole run from the menu to a flight and back leaves a flyable mission', () => {
  let state = { screen: 'main-menu' as Screen, mission: DEFAULT_MISSION };
  state = applyMenuAction(state, { command: 'free-flight' });
  expect(state.screen).toBe('aircraft-select');
  state = applyMenuAction(state, { command: 'choose-aircraft', aircraft: 'a4e' });
  expect(state.screen).toBe('loadout');
  state = applyMenuAction(state, { command: 'fly' });
  expect(state).toEqual({
    screen: 'flight',
    mission: { ...DEFAULT_MISSION, mode: 'free-flight', aircraft: 'a4e' },
  });
  state = applyMenuAction(state, { command: 'end-flight' });
  expect(state.screen).toBe('debrief');
  state = applyMenuAction(state, { command: 'main-menu' });
  expect(state.screen).toBe('main-menu');
  // A quick fight keeps its opponents when it comes back round.
  state = applyMenuAction(state, { command: 'quick-mission' });
  expect(state.mission.mode).toBe('quick-fight');
  expect(state.mission.opponents).toEqual([{ aircraft: 'f14', skill: 2 }]);
});
