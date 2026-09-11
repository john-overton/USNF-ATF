/** Cloud depth composition and real pause/resume with a locally imported aircraft. */
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import path from 'node:path';
import { openDesktop } from './desktop';
const data = process.argv[2] ?? path.join(homedir(), '.config/USNF-ATF/data');
const s = await openDesktop({ binary:'shell/node_modules/electron/dist/electron', app:'shell',
  terrain: 'extracted/terrain/salt-lake', cockpit:path.join(data,'cockpits/f14.json'), aircraft:path.join(data,'aircraft/f14.json'),
  flightProfile:path.join(data,'aircraft/f14-flight.json'), out:'extracted/cloud-review/flight',
  query:{mode:'flight',aircraft:'f14',flightStart:'airborne',altitude:'2000',weather:'broken',clouds:'half',wind:'calm',time:'12',date:'170'},
});
const tap = (code: string) => s.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{code:${JSON.stringify(code)},key:${JSON.stringify(code)},bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:${JSON.stringify(code)},bubbles:true}));`);
try {
  await s.poll(async () => (await s.evaluate('window.__terrainDiagnostics?.()?.frames > 120')) ? true : undefined, 'flight rendered');
  await tap('F1');
  await s.poll(async () => (await s.evaluate('window.__terrainDiagnostics?.()?.mirrors?.cloudUpdates > 0')) ? true : undefined, 'mirror clouds rendered');
  await s.capture('cockpit-cloud-mirrors');
  await tap('F3');
  await s.poll(async () => (await s.evaluate('window.__flightDiagnostics().cameraMode')) === 'world-up' ? true : undefined, 'chase');
  await s.capture('clouds-aircraft');
  await tap('Escape');
  await s.poll(async () => (await s.evaluate('document.querySelector("[data-menu-screen]")?.dataset.menuScreen')) === 'paused' ? true : undefined, 'paused');
  const frozen = await s.evaluate('window.__terrainDiagnostics().frames');
  await s.evaluate('new Promise(resolve => setTimeout(resolve, 1200))');
  assert.equal(await s.evaluate('window.__terrainDiagnostics().frames'), frozen, 'cloud renderer and its clock must freeze during pause');
  await s.capture('paused');
  await s.evaluate('document.querySelector("[data-menu-command=resume]").click()');
  await s.poll(async () => (await s.evaluate('window.__terrainDiagnostics().frames')) > frozen + 30 ? true : undefined, 'resumed');
  await s.capture('resumed');
  await Bun.write(`${s.out}/report.json`,JSON.stringify({terrain:await s.evaluate('window.__terrainDiagnostics()'),flight:await s.evaluate('window.__flightDiagnostics()'),pauseFrames:frozen,errors:s.errors},null,2));
  assert.equal(s.errors.length,0);
  console.log('Imported F14/cloud scene, pause freeze and resume passed.');
} finally { await s.close(); }
