/** Real Electron fixed-step combat, pause/resume, reset and debrief acceptance. */
import assert from 'node:assert/strict';
import { openDesktop } from './desktop';
const session = await openDesktop({ binary: 'shell/node_modules/electron/dist/electron', app: 'shell',
  terrain: 'extracted/terrain/ukraine', out: 'extracted/combat-smoke',
  query: { mode: 'quick-fight', flightStart: 'airborne', aircraft: 'f14', opponents: '1', skill: '3', seed: '7', wind: 'calm', clouds: 'off', time: '12' } });
const evidence: Record<string, unknown> = {};
const read = () => session.evaluate('window.__flightDiagnostics()');
const tap = (code: string, key = code) => session.evaluate(`for (const type of ['keydown','keyup']) window.dispatchEvent(new KeyboardEvent(type,{code:${JSON.stringify(code)},key:${JSON.stringify(key)},bubbles:true}));`);
try {
  await session.poll(async () => {
    const d = await session.evaluate('window.__flightDiagnostics?.()');
    return d?.simSteps > 10 && d.status === 'airborne' ? d : undefined;
  }, 'airborne');
  await tap('KeyA'); await tap('Digit3');
  await session.poll(async () => (await read()).combat.target ? true : undefined, 'visual acquisition');
  evidence.acquisition = await read();
  await session.capture('acquired');
  await tap('Escape', 'Escape');
  await session.poll(async () => await session.evaluate('!!document.querySelector("[data-menu-screen=paused]")') ? true : undefined, 'paused');
  const frozen = await read(); await Bun.sleep(300);
  const after = await read();
  assert.equal(after.simSteps, frozen.simSteps);
  assert.deepEqual(after.combat, frozen.combat);
  assert.deepEqual(after.entities, frozen.entities);
  await tap('Escape', 'Escape');
  const outcome = await session.poll(async () => {
    const d = await read();
    return d.combat.outcome === 'defeat' || d.combat.outcome === 'victory' ? d : undefined;
  }, 'guns-only engagement outcome', 120000);
  evidence.firstOutcome = outcome;
  assert.ok(outcome.combat.hits + outcome.entities.reduce((n: number, e: { hits: number }) => n + e.hits, 0) > 0, 'Actual rounds must hit an aircraft');
  assert.ok(outcome.combat.events.some((e: { type: string }) => e.type === 'destroyed'));
  await session.capture('outcome');
  await tap('KeyR');
  const reset = await session.poll(async () => {
    const d = await read(); return d.combat.outcome === 'active' && d.combat.steps < outcome.combat.steps ? d : undefined;
  }, 'reset after destruction');
  assert.equal(reset.combat.damagePercent, 0); assert.equal(reset.combat.hits, 0); assert.equal(reset.combat.kills, 0);
  assert.equal(reset.combat.events.length, 0); assert.equal(reset.gun.remaining, 600);
  assert.ok(reset.entities.every((e: { destroyed: boolean; roundsFired: number }) => !e.destroyed && e.roundsFired === 0));
  evidence.reset = reset;
  await tap('KeyA'); await tap('Digit3');
  evidence.outcome = await session.poll(async () => {
    const d = await read(); return d.combat.outcome === 'defeat' ? d : undefined;
  }, 'second engagement after reset', 120000);
  await tap('Escape', 'Escape');
  await session.evaluate('document.querySelector("[data-menu-command=end-flight]").click()');
  await session.poll(async () => await session.evaluate('!!document.querySelector("[data-menu-screen=debrief]")') ? true : undefined, 'debrief');
  const text = await session.evaluate('document.body.innerText');
  assert.ok(text.includes(outcome.combat.outcome.toUpperCase()));
  assert.ok(text.includes('Airframe damage'));
  await session.capture('debrief');
  assert.equal(session.errors.length, 0);
  console.log('Combat acquisition, return fire, damage/destruction, pause/resume and debrief pass');
} finally {
  await Bun.write(`${session.out}/report.json`, JSON.stringify(evidence, null, 2) + '\n');
  await session.close();
}
