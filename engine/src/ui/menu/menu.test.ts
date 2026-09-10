import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MainMenu } from './MainMenu';
import { MissionBrief } from './MissionBrief';
import { AircraftSelect } from './AircraftSelect';
import { LoadoutScreen } from './LoadoutScreen';
import { Debrief, debriefLines } from './Debrief';
import { QuickFightSetup, SKILLS } from './QuickFightSetup';
import { MAIN_MENU_ITEMS } from './navigation';
import {
  BUTTON_WIDTH,
  BUTTON_X,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  RETAIL_MAIN_MENU_RECT,
  RETAIL_MAIN_MENU_ROWS,
  mainMenuLayout,
} from './layout';
import { DEFAULT_MISSION } from '../../sim/mission/params';

/** Component tests only: menus take props and return markup, and have no effects. */
const commands = (markup: string) =>
  [...markup.matchAll(/data-menu-command="([^"]*)"/g)].map((match) => match[1]);

test('paused briefing has resume and menu actions plus a two-page rocker', () => {
  const render = (page: number) =>
    renderToStaticMarkup(
      createElement(MissionBrief, {
        mission: DEFAULT_MISSION,
        page,
        onPage: () => undefined,
        onCommand: () => undefined,
      }),
    );
  expect(commands(render(0))).toEqual(['resume', 'main-menu', 'brief-page-down', 'brief-page-up']);
  expect(render(0)).toContain('Mission orders');
  expect(render(0)).toContain('1 of 2');
  expect(render(1)).toContain('Flight status');
  expect(render(1)).toContain('2 of 2');
  expect(render(0)).toContain(
    'aria-label="Previous page" data-menu-command="brief-page-down" disabled=""',
  );
  expect(render(1)).toContain(
    'aria-label="Next page" data-menu-command="brief-page-up" disabled=""',
  );
});

test('the main menu keeps the whole retail item list, disabled where we cannot deliver', () => {
  const markup = renderToStaticMarkup(
    createElement(MainMenu, { mission: DEFAULT_MISSION, onCommand: () => undefined }),
  );
  expect(markup).toContain('data-menu-screen="main-menu"');
  expect(commands(markup)).toEqual(MAIN_MENU_ITEMS.map((item) => item.command));
  expect([...markup.matchAll(/disabled=""/g)]).toHaveLength(
    MAIN_MENU_ITEMS.filter((item) => !item.enabled).length,
  );
  expect(markup).toContain('Create Quick Mission');
  expect(markup).toContain('Missions are phase 8');
  // Nothing retail is needed to draw it.
  expect(markup).not.toContain('<img');
  expect(markup).not.toContain('.PIC');
});

test('the main menu is laid out at the geometry recovered from CHOOSEAC.DLG', () => {
  const layout = mainMenuLayout();
  const retail = layout.widgets.slice(0, RETAIL_MAIN_MENU_ROWS.length);
  expect(retail.map((widget) => widget.y)).toEqual([...RETAIL_MAIN_MENU_ROWS]);
  expect(new Set(retail.map((widget) => widget.x))).toEqual(new Set([BUTTON_X]));
  expect(new Set(retail.map((widget) => widget.width))).toEqual(new Set([BUTTON_WIDTH]));
  // Practice controls sit beside the original panel, within the design frame.
  const ours = layout.widgets.slice(RETAIL_MAIN_MENU_ROWS.length);
  expect(ours.map((widget) => widget.command)).toEqual(['free-flight', 'terrain-explorer', 'exit']);
  for (const widget of ours.filter((widget) => widget.command !== 'exit'))
    expect(widget.y).toBeGreaterThan(RETAIL_MAIN_MENU_ROWS.at(-1)!);
  expect(layout.rect.width).toBe(RETAIL_MAIN_MENU_RECT.width);
  expect(layout.rect.y + layout.rect.height).toBeLessThanOrEqual(DESIGN_HEIGHT);
  expect(layout.rect.x + layout.rect.width).toBeLessThanOrEqual(DESIGN_WIDTH);
  for (const widget of layout.widgets) {
    expect(layout.rect.x + widget.x).toBeGreaterThanOrEqual(0);
    expect(layout.rect.x + widget.x + widget.width).toBeLessThanOrEqual(DESIGN_WIDTH);
    expect(layout.rect.y + widget.y + (widget.height ?? 0)).toBeLessThanOrEqual(DESIGN_HEIGHT);
  }
});

test('widget positions become percentages of the design box, so CSS does the scaling', () => {
  const markup = renderToStaticMarkup(
    createElement(MainMenu, { mission: DEFAULT_MISSION, onCommand: () => undefined }),
  );
  // 379/640 and 80/480 — the panel, placed without measuring the window.
  expect(markup).toContain('left:59.21875%');
  expect(markup).toContain('top:16.666666666666664%');
  expect(markup).not.toContain('px');
});

test('aircraft select offers the three aircraft with imported assets and marks the current one', () => {
  const markup = renderToStaticMarkup(
    createElement(AircraftSelect, {
      mission: { ...DEFAULT_MISSION, aircraft: 'a4e' },
      onCommand: () => undefined,
    }),
  );
  expect([...markup.matchAll(/data-menu-aircraft="([^"]*)"/g)].map((m) => m[1])).toEqual([
    'f14',
    'a4e',
    'x31',
  ]);
  expect(markup).toContain('data-menu-aircraft="a4e" aria-pressed="true"');
  expect(commands(markup)).toEqual([
    'choose-aircraft',
    'choose-aircraft',
    'choose-aircraft',
    'back',
  ]);
});

test('the loadout screen keeps the retail Fly and Select Plane pair and says what is missing', () => {
  const markup = renderToStaticMarkup(
    createElement(LoadoutScreen, {
      mission: DEFAULT_MISSION,
      problems: ['Payload mass cannot be negative.'],
      onMission: () => undefined,
      onUnrestricted: () => undefined,
      onCommand: () => undefined,
    }),
  );
  expect(commands(markup)).toEqual(['fly', 'select-plane', 'main-menu', 'unrestricted']);
  // With no ported hardpoints it says so rather than inventing stations.
  expect(markup).toContain('data-loadout="unavailable"');
  expect(markup).toContain('role="alert"');
  expect(markup).toContain('Payload mass cannot be negative.');
});

test('the debrief reads back the flight it was given, and says so when there was none', () => {
  expect(debriefLines(undefined)).toEqual(['No flight was flown.']);
  expect(
    debriefLines({
      aircraftName: 'F-14 Tomcat',
      simTimeSeconds: 185.4,
      takeoffs: 1,
      landings: 1,
      roundsFired: 240,
      fuelFraction: 0.62,
    }),
  ).toEqual([
    'Time aloft 3:05',
    'Takeoffs 1 · landings 1',
    'Rounds fired 240',
    'Fuel remaining 62%',
  ]);
  const markup = renderToStaticMarkup(
    createElement(Debrief, {
      mission: DEFAULT_MISSION,
      summary: {
        aircraftName: 'A-4E Skyhawk',
        simTimeSeconds: 60,
        takeoffs: 1,
        landings: 0,
        roundsFired: 0,
        fuelFraction: 1,
      },
      onCommand: () => undefined,
    }),
  );
  expect(markup).toContain('data-menu-screen="debrief"');
  expect(markup).toContain('A-4E Skyhawk');
  expect(markup).toContain('Time aloft 1:00');
  expect(commands(markup)).toEqual(['main-menu']);
  expect(markup).toContain('Damage is not modelled yet');
});

test('the quick fight setup says it is a mock, and its rockers describe the sky', () => {
  const markup = renderToStaticMarkup(
    createElement(QuickFightSetup, {
      mission: {
        ...DEFAULT_MISSION,
        mode: 'quick-fight',
        opponents: [
          { aircraft: 'x31', skill: 3 },
          { aircraft: 'x31', skill: 3 },
        ],
      },
      onMission: () => undefined,
      onCommand: () => undefined,
    }),
  );
  expect(markup).toContain('data-menu-screen="quick-fight"');
  expect(markup).toContain('data-menu-rocker="opponent-count"');
  expect(markup).toContain('3 aircraft in the sky, including you');
  expect(markup).toContain('X-31 EFM');
  expect(markup).toContain(SKILLS[3]);
  expect(markup).toContain('Mock quick fight.');
  expect(commands(markup)).toEqual([
    'continue',
    'back',
    'player-aircraft-down',
    'player-aircraft-up',
    'weather-down',
    'weather-up',
    'time-down',
    'time-up',
    'opponent-aircraft-down',
    'opponent-aircraft-up',
    'opponent-count-down',
    'opponent-count-up',
    'opponent-skill-down',
    'opponent-skill-up',
  ]);
});
