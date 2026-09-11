/** Real desktop selector persistence, retail geometry, firing and live switching. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { openDesktop } from './desktop';
const data = process.argv[2];
if (!data) throw new Error('Pass local app data directory');
const s = await openDesktop({ interactiveTest: true, binary: 'shell/node_modules/electron/dist/electron', app: 'shell', terrain: 'extracted/terrain/ukraine',
  aircraftDirectory: path.join(data, 'aircraft'), cockpit: path.join(data, 'cockpits/f14.json'), audio: path.join(data, 'audio/f14.json'), menu: path.join(data, 'menu'),
  out: 'extracted/retail-guns-live', bareLaunch: true });
const tap = async (code: string, modifiers = 0) => {
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code === 'Tab' ? 'Tab' : code === 'Escape' ? 'Escape' : code.slice(3), modifiers });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code === 'Tab' ? 'Tab' : code === 'Escape' ? 'Escape' : code.slice(3), modifiers });
};
const select = async (value: string) => {
  await s.evaluate(`(() => { const e=document.querySelector('select[aria-label="Bullet mechanics"]'); e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
};
try {
  await s.poll(async () => await s.evaluate('!!document.querySelector("[data-menu-command=quick-mission]")') ? true : undefined, 'main menu');
  await select('retail');
  await s.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await Bun.sleep(500);
  await s.capture('main-retail-selected');
  for (const command of ['quick-mission', 'continue', 'fly']) {
    await s.poll(async () => await s.evaluate(`!!document.querySelector('[data-menu-command="${command}"]:not(:disabled)')`) ? true : undefined, command);
    await s.evaluate(`document.querySelector('[data-menu-command="${command}"]').click()`);
  }
  await s.poll(async () => (await s.evaluate('window.__flightDiagnostics?.()'))?.simSteps > 20 ? true : undefined, 'flight');
  await tap('KeyA');
  await s.evaluate(`(() => { document.querySelector('button[aria-controls="flight-helper-content"]')?.click(); })()`);
  await s.evaluate(`(() => { const e=document.querySelector('#environment-time'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'12'); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await s.evaluate(`document.querySelector('button[aria-controls="flight-helper-content"]')?.click()`);
  const initial = await s.evaluate('window.__flightDiagnostics()');
  assert.equal(initial.gun.effectiveMode, 'retail');
  assert.equal(initial.gun.bulletArtwork, 'retail-geometry');
  await s.evaluate('document.querySelector("#terrain-canvas").dataset.testIdentity="retained"');
  await tap('Tab', 8);
  await s.poll(async () => await s.evaluate(`(() => { const e=document.querySelector('[data-gun-sight-overlay]'); return !!e && e.style.display !== 'none'; })()`) ? true : undefined, 'armed shared pipper');
  await s.capture('retail-pipper');
  await tap('F3');
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Tab', key: 'Tab' });
  const firing = await s.poll(async () => { const d = await s.evaluate('window.__flightDiagnostics()'); return d.gun.fired >= 8 && d.gun.renderedDiamonds > 0 ? d : undefined; }, 'retail representative rounds and diamonds');
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Tab', key: 'Tab' });
  assert.ok(firing.gun.activeRounds <= firing.gun.fired / 2);
  assert.equal(firing.gun.remaining, initial.gun.remaining - firing.gun.fired);
  await s.capture('retail-diamonds');
  await tap('Escape');
  await s.poll(async () => await s.evaluate('!!document.querySelector("[data-menu-screen=paused]")') ? true : undefined, 'pause');
  const paused = await s.evaluate('window.__flightDiagnostics()');
  await Bun.sleep(150);
  assert.equal((await s.evaluate('window.__flightDiagnostics()')).simSteps, paused.simSteps);
  await tap('Escape');
  await s.evaluate('document.querySelector("button[aria-controls=flight-helper-content]")?.click()');
  await select('remake');
  const switched = await s.poll(async () => { const d = await s.evaluate('window.__flightDiagnostics()'); return d.gun.mode === 'remake' ? d : undefined; }, 'live switch');
  assert.equal(await s.evaluate('document.querySelector("#terrain-canvas").dataset.testIdentity'), 'retained');
  assert.ok(switched.simSteps >= paused.simSteps);
  assert.equal(switched.gun.remaining, paused.gun.remaining);
  assert.equal(switched.gun.safe, true);
  assert.equal(switched.gun.activeRounds, 0);
  await tap('Tab', 8);
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Tab', key: 'Tab' });
  await s.poll(async () => { const d = await s.evaluate('window.__flightDiagnostics()'); return d.gun.tracers > 0 && d.gun.fired > switched.gun.fired + 10 ? d : undefined; }, 'remake tracers');
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Tab', key: 'Tab' });
  await s.capture('remake-tracers');
  await select('retail');
  await tap('KeyR');
  const reset = await s.poll(async () => { const d=await s.evaluate('window.__flightDiagnostics()'); return d.gun.fired === 0 && d.gun.mode === 'retail' ? d : undefined; }, 'reset retains mode');
  assert.equal(reset.gun.safe, true);
  await tap('Escape');
  await s.poll(async () => await s.evaluate('!!document.querySelector("[data-menu-screen=paused]")') ? true : undefined, 'pause again');
  await s.evaluate('document.querySelector("[data-escape-page=leave]").click()');
  await s.poll(async()=>await s.evaluate('!!document.querySelector("[data-menu-command=main-menu]")')?true:undefined,'leave confirmation');
  await s.evaluate('document.querySelector("[data-menu-command=main-menu]").click()');
  await s.poll(async () => await s.evaluate('!!document.querySelector("[data-menu-screen=main-menu]")') ? true : undefined, 'main menu again');
  assert.equal(await s.evaluate(`document.querySelector('select[aria-label="Bullet mechanics"]').value`), 'retail');
  assert.equal(s.errors.length, 0);
  await Bun.write(path.join(s.out, 'report.json'), JSON.stringify({ initial, firing, switched, reset, errors:s.errors }, null, 2));
  console.log('Retail gun/menu/live switch/geometry/pause/reset: pass');
} finally { await s.close(); }
