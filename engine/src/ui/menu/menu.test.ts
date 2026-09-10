import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MainMenu } from './MainMenu';
import { AircraftSelect } from './AircraftSelect';
import { LoadoutScreen } from './LoadoutScreen';
import { Debrief, debriefLines } from './Debrief';
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
  // Our two extra rows sit below the retail group, inside our slightly taller panel.
  const ours = layout.widgets.slice(RETAIL_MAIN_MENU_ROWS.length);
  expect(ours.map((widget) => widget.command)).toEqual(['free-flight', 'terrain-explorer']);
  for (const widget of ours) expect(widget.y).toBeGreaterThan(RETAIL_MAIN_MENU_ROWS.at(-1)!);
  expect(layout.rect.width).toBe(RETAIL_MAIN_MENU_RECT.width);
  expect(layout.rect.y + layout.rect.height).toBeLessThanOrEqual(DESIGN_HEIGHT);
  expect(layout.rect.x + layout.rect.width).toBeLessThanOrEqual(DESIGN_WIDTH);
  for (const widget of layout.widgets)
    expect(widget.y + (widget.height ?? 0)).toBeLessThanOrEqual(layout.rect.height);
});

test('widget positions become percentages of the design box, so CSS does the scaling', () => {
  const markup = renderToStaticMarkup(
    createElement(MainMenu, { mission: DEFAULT_MISSION, onCommand: () => undefined }),
  );
  // 379/640 and 40/480 — the panel, placed without measuring the window.
  expect(markup).toContain('left:59.21875%');
  expect(markup).toContain('top:8.333333333333332%');
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
  expect(commands(markup)).toEqual(['fly', 'select-plane', 'main-menu']);
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
