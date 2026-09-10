/**
 * The loadout screen is the reason `MissionParams` exists: a chosen loadout cannot
 * be expressed as a URL the player typed, so it has to survive an in-app transition
 * into the flight. This walks the menu to the screen, changes fuel and a station,
 * flies, and checks the flight actually got what was chosen.
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
const out = option('--out', 'extracted/loadout-smoke');
const session = await openDesktop({
  binary: option('--binary'),
  ...(args.includes('--app') ? { app: option('--app') } : {}),
  terrain: option('--terrain', 'extracted/terrain/ukraine'),
  aircraft: option('--aircraft', 'extracted/flight/f14.json'),
  flightProfile: option('--flight-profile', 'extracted/flight/f14-flight.json'),
  loadout: option('--loadout', 'extracted/flight/f14-loadout.json'),
  out,
  bareLaunch: true,
  interactiveTest: true,
});
const evidence: Record<string, unknown> = {};
const screen = () =>
  session.evaluate(
    `document.querySelector('[data-menu-screen]')?.getAttribute('data-menu-screen')`,
  );
const click = (selector: string) =>
  session.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
try {
  await session.poll(async () => ((await screen()) === 'main-menu' ? true : undefined), 'main menu');
  await click('[data-menu-command="free-flight"]');
  await click('[data-menu-aircraft="f14"]');
  assert.equal(await screen(), 'loadout');
  const ready = await session.poll(
    async () =>
      (await session.evaluate(
        `document.querySelector('[data-loadout]')?.getAttribute('data-loadout')`,
      )) === 'ready'
        ? true
        : undefined,
    'ported stations',
  );
  assert.ok(ready, 'The ported hardpoints must reach the screen');
  const stations = await session.evaluate(
    `Array.from(document.querySelectorAll('[data-station]'), (li) => ({
       index: Number(li.dataset.station),
       store: li.querySelector('[data-menu-value$="-store"]').textContent,
       count: li.querySelector('[data-menu-value$="-count"]').textContent,
     }))`,
  );
  evidence.stations = stations;
  assert.ok(stations.length >= 3, `Expected the F-14's selectable racks, got ${stations.length}`);
  const before = await session.evaluate(
    `document.querySelector('[data-loadout-value="gross"]').textContent`,
  );

  // Empty one rack through the real rocker, and check the gross weight follows.
  const first = stations[0].index;
  await click(`[data-menu-command="station-${first}-store-down"]`);
  const after = await session.evaluate(
    `({gross: document.querySelector('[data-loadout-value="gross"]').textContent,
       store: document.querySelector('[data-menu-value="station-${first}-store"]').textContent})`,
  );
  evidence.emptied = { before, after };
  assert.notEqual(after.gross, before, 'Emptying a rack must change the gross weight');

  // The fuel dial is a real range input; drive it the way a browser would.
  await session.evaluate(`(() => {
    const input = document.querySelector('#menu-dial-fuel');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '40');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const fuelText = await session.evaluate(
    `document.querySelector('[data-menu-value="fuel"]').textContent`,
  );
  evidence.fuelText = fuelText;
  assert.match(String(fuelText), /^40%/, 'The dial must read back what it was set to');
  await session.capture('loadout');

  await click('[data-menu-command="fly"]');
  const flight = await session.poll(async () => {
    const state = await session.evaluate('window.__flightDiagnostics?.()');
    return state?.simSteps > 10 && state.status !== 'waiting-terrain' ? state : undefined;
  }, 'flight from the loadout screen');
  evidence.flight = {
    aircraftId: flight.aircraftId,
    fuelFraction: flight.fuelFraction,
    fuelMassKg: flight.fuelMassKg,
    simSteps: flight.simSteps,
  };
  assert.equal(flight.aircraftId, 'f14');
  // Fuel burns from the moment the flight starts, so this is a band, not a point.
  assert.ok(
    flight.fuelFraction > 0.35 && flight.fuelFraction <= 0.4,
    `Chosen fuel did not reach the flight: ${flight.fuelFraction}`,
  );
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
