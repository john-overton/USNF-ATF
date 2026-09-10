/**
 * The menu is the human-facing default: launched with no query at all, the app shows
 * the main menu, and reaching a mode from it is a state transition rather than a page
 * reload. A reload would tear down the viewer and, later, lose a chosen loadout.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { openDesktop } from './desktop';

const args = process.argv.slice(2);
function option(name: string, fallback?: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? fallback : args[index + 1];
  if (!value) throw new Error(`Required: ${name}`);
  return value;
}
const out = option('--out', 'extracted/menu-smoke');
const session = await openDesktop({
  binary: option('--binary'),
  ...(args.includes('--app') ? { app: option('--app') } : {}),
  terrain: option('--terrain', 'extracted/terrain/ukraine'),
  ...(args.includes('--menu') ? { menu: option('--menu') } : {}),
  out,
  bareLaunch: true,
});
const withBundle = args.includes('--menu');
const evidence: Record<string, unknown> = {};
try {
  const screen = await session.poll(
    async () =>
      (await session.evaluate(
        `document.querySelector('[data-menu-screen]')?.getAttribute('data-menu-screen')`,
      )) ?? undefined,
    'main menu',
  );
  assert.equal(screen, 'main-menu', 'A bare launch must show the main menu');
  // With a ported bundle installed the screen is drawn from the user's own disc;
  // without one it is our chrome, and the menu must work identically either way.
  const art = await session.evaluate(
    `document.querySelector('[data-menu-art]')?.getAttribute('data-menu-art')`,
  );
  evidence.art = art;
  assert.equal(art, withBundle ? 'retail' : 'original');
  await session.capture('main-menu');
  const items = await session.evaluate(
    `Array.from(document.querySelectorAll('[data-menu-command]'), (b) => ({command: b.dataset.menuCommand, disabled: b.disabled}))`,
  );
  evidence.items = items;
  assert.deepEqual(
    items.filter((item: { disabled: boolean }) => !item.disabled).map((item: { command: string }) => item.command),
    ['quick-mission', 'free-flight', 'terrain-explorer'],
    'Only what this build delivers may be enabled',
  );
  assert.equal(items.length, 10, 'The retail item list stays whole, with the rest disabled');

  // The quick fight is set up before an aircraft is chosen, and backing out
  // returns to the setup rather than jumping to the main menu.
  await session.evaluate(`document.querySelector('[data-menu-command="quick-mission"]').click()`);
  const setup = await session.evaluate(
    `document.querySelector('[data-menu-screen]')?.getAttribute('data-menu-screen')`,
  );
  assert.equal(setup, 'quick-fight');
  await session.evaluate(`document.querySelector('[data-menu-command="continue"]').click()`);
  assert.equal(
    await session.evaluate(
      `document.querySelector('[data-menu-screen]')?.getAttribute('data-menu-screen')`,
    ),
    'aircraft-select',
  );
  await session.evaluate(`document.querySelector('[data-menu-command="back"]').click()`);
  assert.equal(
    await session.evaluate(
      `document.querySelector('[data-menu-screen]')?.getAttribute('data-menu-screen')`,
    ),
    'quick-fight',
  );
  await session.capture('quick-fight');
  await session.evaluate(`document.querySelector('[data-menu-command="back"]').click()`);
  assert.equal(
    await session.evaluate(
      `document.querySelector('[data-menu-screen]')?.getAttribute('data-menu-screen')`,
    ),
    'main-menu',
  );

  // A page reload would discard this marker; an in-app transition keeps it.
  await session.evaluate(`window.__menuSmokeMarker = 'kept'`);
  await session.evaluate(`document.querySelector('[data-menu-command="single-mission"]').click()`);
  assert.equal(
    await session.evaluate(
      `document.querySelector('[data-menu-screen]')?.getAttribute('data-menu-screen')`,
    ),
    'main-menu',
    'A disabled item must not transition',
  );
  await session.evaluate(`document.querySelector('[data-menu-command="terrain-explorer"]').click()`);
  const explorer = await session.poll(async () => {
    const state = await session.evaluate(
      `({marker: window.__menuSmokeMarker, canvas: !!document.querySelector('#terrain-canvas'), terrain: window.__terrainDiagnostics?.()?.status})`,
    );
    return state.terrain === 'ready' ? state : undefined;
  }, 'terrain explorer ready');
  evidence.explorer = explorer;
  assert.equal(explorer.marker, 'kept', 'Entering a mode must not reload the page');
  assert.ok(explorer.canvas, 'The explorer must mount the terrain canvas');
  assert.equal(
    await session.evaluate(`window.__flightDiagnostics === undefined`),
    true,
    'The explorer flies no aircraft',
  );
  await session.capture('explorer');

  // Esc leaves the mode again, still without a reload.
  await session.evaluate(
    `window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`,
  );
  const back = await session.poll(async () => {
    const state = await session.evaluate(
      `({screen: document.querySelector('[data-menu-screen]')?.getAttribute('data-menu-screen'), marker: window.__menuSmokeMarker})`,
    );
    return state.screen ? state : undefined;
  }, 'back at the menu');
  assert.equal(back.screen, 'main-menu');
  assert.equal(back.marker, 'kept', 'Leaving a mode must not reload the page either');
  evidence.back = back;

  // Free Flight walks the aircraft-select and loadout screens into a real flight.
  await session.evaluate(`document.querySelector('[data-menu-command="free-flight"]').click()`);
  await session.evaluate(`document.querySelector('[data-menu-aircraft="a4e"]').click()`);
  assert.equal(
    await session.evaluate(
      `document.querySelector('[data-menu-screen]')?.getAttribute('data-menu-screen')`,
    ),
    'loadout',
  );
  await session.evaluate(`document.querySelector('[data-menu-command="fly"]').click()`);
  const flight = await session.poll(async () => {
    const state = await session.evaluate(
      `({marker: window.__menuSmokeMarker, flight: window.__flightDiagnostics?.()})`,
    );
    return state.flight?.simSteps > 10 && state.flight.status !== 'waiting-terrain'
      ? state
      : undefined;
  }, 'flight from the menu');
  evidence.flight = { marker: flight.marker, aircraftId: flight.flight.aircraftId, simSteps: flight.flight.simSteps };
  assert.equal(flight.marker, 'kept', 'Flying from the menu must not reload the page');
  assert.equal(flight.flight.aircraftId, 'a4e', 'The chosen aircraft must reach the flight');
  await session.capture('flight');
} finally {
  await Bun.write(
    path.join(out, 'report.json'),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        buildSourceCommit: option('--build-commit', 'unrecorded'),
        evidence,
        errors: session.errors,
      },
      null,
      2,
    ) + '\n',
  );
  await session.close();
}
