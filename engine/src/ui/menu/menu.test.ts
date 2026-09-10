import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlaceholderMenu } from './PlaceholderMenu';
import { MAIN_MENU_ITEMS } from './navigation';
import { DEFAULT_MISSION } from '../../sim/mission/params';

/** Component tests only: the menu takes props and returns markup, with no effects. */
const render = (
  screen: 'main-menu' | 'aircraft-select' | 'loadout' | 'debrief',
  problems: string[] = [],
) =>
  renderToStaticMarkup(
    createElement(PlaceholderMenu, {
      screen,
      mission: DEFAULT_MISSION,
      problems,
      onCommand: () => undefined,
    }),
  );

test('the main menu renders every retail item, in order, with no retail asset present', () => {
  const markup = render('main-menu');
  expect(markup).toContain('data-menu-screen="main-menu"');
  const commands = [...markup.matchAll(/data-menu-command="([^"]*)"/g)].map((m) => m[1]);
  expect(commands).toEqual(MAIN_MENU_ITEMS.map((item) => item.command));
  expect([...markup.matchAll(/disabled=""/g)]).toHaveLength(
    MAIN_MENU_ITEMS.filter((item) => !item.enabled).length,
  );
  expect(markup).toContain('Create Quick Mission');
  expect(markup).toContain('Terrain Explorer');
});

test('aircraft select offers the three aircraft with imported assets and marks the current one', () => {
  const markup = render('aircraft-select');
  expect([...markup.matchAll(/data-menu-aircraft="([^"]*)"/g)].map((m) => m[1])).toEqual([
    'f14',
    'a4e',
    'x31',
  ]);
  expect(markup).toContain('data-menu-aircraft="f14" aria-pressed="true"');
  expect(markup).toContain('data-menu-command="back"');
});

test('the loadout screen keeps the retail Fly and Select Plane pair', () => {
  const markup = render('loadout');
  expect(markup).toContain('data-menu-command="fly"');
  expect(markup).toContain('data-menu-command="select-plane"');
  expect(markup).toContain('100% internal fuel');
});

test('problems are announced rather than silently blocking the button', () => {
  const markup = render('loadout', ['Payload mass cannot be negative.']);
  expect(markup).toContain('role="alert"');
  expect(markup).toContain('Payload mass cannot be negative.');
  expect(render('debrief')).toContain('data-menu-screen="debrief"');
});
