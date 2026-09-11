/** Real desktop pause/resume: preserve the live simulation, not just the menu label. */
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
const out = option('--out', 'extracted/pause-smoke');
const session = await openDesktop({
  binary: option('--binary'),
  ...(args.includes('--app') ? { app: option('--app') } : {}),
  terrain: option('--terrain', 'extracted/terrain/ukraine'),
  aircraft: option('--aircraft'),
  flightProfile: option('--flight-profile'),
  audio: option('--audio'),
  gun: option('--gun'),
  menu: option('--menu'),
  out,
  interactiveTest: true,
  query: { mode: 'quick-fight', aircraft: 'f14', flightStart: 'airborne', opponents: '2', seed: '7', wind: 'calm', clouds: 'off' },
  initialization: `window.__pauseContexts=[];window.AudioContext=class extends AudioContext{constructor(...args){super(...args);window.__pauseContexts.push(this);}};`,
});
const report: Record<string, unknown> = {};
const press = (key: string, code = key, repeat = false) => session.evaluate(
  `window.dispatchEvent(new KeyboardEvent('keydown',${JSON.stringify({ key, code, repeat })}))`,
);
const screen = () => session.evaluate(`document.querySelector('[data-menu-screen]')?.dataset.menuScreen`);
const snapshot = () => session.evaluate(`(()=>{const d=window.__flightDiagnostics();return {
  state:d.state,simSteps:d.simSteps,fuel:d.fuelMassKg,gun:d.gun,entities:d.entities,
  throttle:d.throttle,gear:d.gearDown,camera:d.cameraMode,environment:window.__terrainDiagnostics().environment.timeOfDayHours
}})()`);
try {
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 960, deviceScaleFactor: 1, mobile: false });
  await session.poll(async () => (await session.evaluate('window.__flightDiagnostics?.()?.simSteps')) > 20 ? true : undefined, 'flight ready');
  await session.evaluate(`window.__retainedCanvas=document.querySelector('#terrain-canvas');document.querySelector('#terrain-canvas').focus()`);
  await session.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Digit3', key: '3', windowsVirtualKeyCode: 51 });
  await session.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Digit3', key: '3', windowsVirtualKeyCode: 51 });
  await session.poll(async () => (await session.evaluate('window.__flightDiagnostics().audio.contextState')) === 'running' ? true : undefined, 'flight audio unlocked');
  await press('ArrowDown');
  await press('Escape');
  await session.poll(async () => (await screen()) === 'paused' ? true : undefined, 'pause briefing');
  await session.poll(async () => {
    report.contexts=await session.evaluate('window.__pauseContexts.map(c=>c.state)');
    report.audio=await session.evaluate('(()=>{const d=window.__flightDiagnostics();return {audio:d.audio,music:d.music,gun:d.gun,combatAudio:d.combatAudio}})()');
    return await session.evaluate(`window.__pauseContexts.filter(c=>c.state!=='closed').every(c=>c.state==='suspended')`) ? true : undefined;
  }, 'flight audio suspended');
  const before = await snapshot();
  report.before = before;
  await session.capture('paused');
  await session.evaluate(`document.querySelector('[data-escape-page="briefing"]').click()`);
  await session.poll(async()=>await session.evaluate('!!document.querySelector(".brief-paper")')?true:undefined,'briefing page');
  await session.evaluate(`document.querySelector('[data-menu-command="brief-page-up"]').click()`);
  assert.equal(await session.evaluate(`document.querySelector('.brief-paper h2').textContent`), 'Flight status');
  await session.capture('paused-status');
  await session.evaluate(`document.querySelector('[data-menu-command="brief-page-down"]').click()`);
  assert.equal(await session.evaluate(`document.querySelector('[data-menu-value="brief-page"]').textContent`), '1 of 2');
  await press('Escape', 'Escape', true);
  assert.equal(await screen(), 'paused', 'Held Escape must not resume');
  for (const [key, code] of [['6', 'Digit6'], ['g', 'KeyG'], ['F3', 'F3'], ['Tab', 'Tab']]) await press(key!, code!);
  await Bun.sleep(3000);
  assert.deepEqual(await snapshot(), before, 'Aircraft, opponents, ammo, fuel, controls and clock must freeze');
  assert.equal(await session.evaluate(`document.querySelector('.mission-view').inert`), true);
  await session.evaluate(`document.querySelector('[data-menu-command="resume"]').click()`);
  await session.poll(async () => (await session.evaluate('window.__flightDiagnostics().simSteps')) > before.simSteps + 20 ? true : undefined, 'resumed simulation');
  const after = await snapshot();
  report.after = after;
  assert.equal(await session.evaluate(`window.__retainedCanvas===document.querySelector('#terrain-canvas')`), true, 'Resume must retain the same canvas');
  assert.ok(after.state.timeSeconds > before.state.timeSeconds);
  assert.ok(after.state.timeSeconds - before.state.timeSeconds < 1, 'Pause duration must not catch up');
  assert.equal(after.throttle, before.throttle, 'Pause controls must not change throttle');
  assert.equal(after.gear, before.gear);
  assert.equal(after.camera, before.camera);
  assert.equal(after.gun.fired, before.gun.fired);
  assert.equal(await session.evaluate('window.__flightDiagnostics().controls.pitch'), 0, 'Held input must clear');
  assert.equal(await session.evaluate('window.__flightDiagnostics().audio.contextState'), 'running');
  await press('Escape');
  await session.poll(async () => (await screen()) === 'paused' ? true : undefined, 'second pause');
  await press('Escape');
  await session.poll(async () => (await screen()) === undefined ? true : undefined, 'Escape resumes');
  await press('Escape');
  await session.poll(async () => (await screen()) === 'paused' ? true : undefined, 'third pause');
  await session.evaluate(`document.querySelector('[data-escape-page="leave"]').click()`);
  await session.poll(async()=>await session.evaluate('!!document.querySelector("[data-menu-command=main-menu]")')?true:undefined,'leave confirmation');
  await session.evaluate(`document.querySelector('[data-menu-command="main-menu"]').click()`);
  await session.poll(async () => (await screen()) === 'main-menu' ? true : undefined, 'quit to main menu');
  assert.equal(await session.evaluate(`!!document.querySelector('#terrain-canvas')`), false, 'Quitting disposes the viewer');
  assert.equal(await session.evaluate('window.__flightDiagnostics === undefined'), true);
  report.quit = true;
  console.log('Pause/resume passed: frozen state, blocked input, suspended audio, continuous resume, and quit.');
} finally {
  await Bun.write(path.join(out, 'report.json'), JSON.stringify({ date: new Date().toISOString(), report, errors: session.errors }, null, 2));
  await session.close();
}
