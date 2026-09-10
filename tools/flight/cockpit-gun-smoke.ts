/** Rebuild unpackaged source first; imports stay in the isolated desktop profile. */
import assert from 'node:assert/strict';
import { openDesktop } from './desktop';

const requested = process.argv[2];
for (const [id, time] of [['f14', '12'], ['a4e', '12'], ['x31', '12'], ['f14', '0'], ['x31', '0']] as const) {
  if (requested && requested !== `${id}${time === '0' ? '-night' : ''}`) continue;
  const session = await openDesktop({
    binary: 'shell/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
    app: 'shell',
    terrain: 'extracted/terrain/ukraine',
    aircraft: `extracted/flight/${id}.json`,
    flightProfile: `extracted/flight/${id}-flight.json`,
    cockpit: `extracted/flight/cockpits/${id}.json`,
    gun: `extracted/flight/${id}-gun.json`,
    audio: `extracted/flight/audio/${id}.json`,
    interactiveTest: true,
    out: `extracted/cockpit-gun-smoke/${id}${time === '0' ? '-night' : ''}`,
    query: { mode: 'flight', aircraft: id, flightStart: 'airborne', wind: 'calm', clouds: 'off', time },
  });
  try {
    const read = () => session.evaluate('window.__flightDiagnostics?.()');
    await session.poll(async () => {
      const d = await read();
      return d?.status === 'airborne' && d.simSteps > 10 ? d : undefined;
    }, 'airborne');
    const reticleVisible = () => session.evaluate(`getComputedStyle(document.querySelector('[data-gun-sight-overlay]')).display !== 'none'`);
    const initial = await read();
    assert.equal(initial.cameraMode, 'cockpit');
    assert.equal(await reticleVisible(), false, 'Safe weapons hide reticle');
    assert.equal(initial.flightModelId, 'retail-envelope');
    assert.equal(initial.gunSight.mode, 'terrain');
    assert.equal(initial.gunSight.status, 'solution');
    assert(initial.gunSight.rangeM <= 1000);
    assert.equal(await session.evaluate(`document.querySelector('[data-flight-hud]')?.textContent.includes('F1 COCKPIT')`), false);
    const key = (code: string, down: boolean, modifiers = 0) => session.send('Input.dispatchKeyEvent', {
      type: down ? 'keyDown' : 'keyUp', code,
      key: code === 'Slash' ? (modifiers ? '?' : '/') : code,
      modifiers,
    });
    const tap = async (code: string, modifiers = 0) => {
      await key(code, true, modifiers);
      await key(code, false, modifiers);
    };
    const advance = async (seconds: number) => session.evaluate(`new Promise(resolve => {
      const start=window.__flightDiagnostics().simTime;
      function frame(){const d=window.__flightDiagnostics();
        if(d.simTime-start<${seconds})requestAnimationFrame(frame);else resolve(d);}
      requestAnimationFrame(frame);
    })`);
    await session.evaluate(`document.querySelector('[aria-label="Minimize practice flight panel"]')?.click()`);
    await tap('KeyA');
    await advance(3);
    await tap('F1');
    const center = await advance(0.2);
    assert.equal(center.cameraMode, 'cockpit');
    await session.poll(async () => session.evaluate(`(() => {
      const overlay=document.querySelector('[data-cockpit-overlay="${id}"]');
      const img=overlay?.querySelector('img');
      return img?.complete && img.naturalWidth > 0 ? true : undefined;
    })()`), 'decoded cockpit image');
    if (id !== 'x31') await session.poll(async () => {
      const m = await session.evaluate('window.__terrainDiagnostics?.().mirrors');
      return m?.masksLoaded === 3 && m.updates > 1 ? m : undefined;
    }, 'three live cockpit mirror masks');
    const mirrors = await session.evaluate('window.__terrainDiagnostics?.().mirrors');
    await session.capture('cockpit-center');
    await key('ShiftLeft', true, 8);
    await key('ArrowRight', true, 8);
    const looking = await advance(0.5);
    await key('ArrowRight', false, 8);
    await key('ShiftLeft', false);
    assert(looking.viewYawRad > 0, 'Shift+right must rotate view');
    assert.equal(looking.controls.roll, 0, 'Look command must not bank aircraft');
    await session.capture('cockpit-right');
    await tap('Slash', 8);
    const recentered = await advance(0.2);
    assert.equal(recentered.viewYawRad, 0);
    assert.equal(recentered.viewPitchRad, 0);
    for (const mode of ['F2', 'F3']) {
      await tap(mode);
      await session.poll(async () => await session.evaluate(`document.querySelector('[data-flight-hud]') === null`) ? true : undefined, 'external HUD hidden');
      assert.equal(await reticleVisible(), false, 'External reticle hidden');
      await key('ShiftLeft', true, 8);
      await key('ArrowLeft', true, 8);
      await advance(0.4);
      await key('ArrowLeft', false, 8);
      await key('ShiftLeft', false);
      await session.capture(`${mode}-orbit`);
      await tap('Slash', 8);
    }
    await tap('F1');
    const before = await read();
    await key('Tab', true);
    const safe = await advance(0.25);
    await key('Tab', false);
    assert(before.gun.available && before.gun.audioLoaded, 'Imported gun and sound required');
    assert.equal(safe.gun.safe, true);
    assert.equal(safe.gun.fired, before.gun.fired, 'Safety must inhibit fire');
    await tap('Tab', 8);
    await session.poll(async () => await reticleVisible() ? true : undefined, 'armed reticle visible');
    await session.capture('armed-reticle');
    for (const external of ['F2', 'F3']) {
      await tap(external);
      await advance(0.1);
      assert.equal(await reticleVisible(), false, 'Armed reticle hidden externally');
      await session.poll(async () => await session.evaluate(`document.querySelector('[data-flight-hud]') === null`) ? true : undefined, 'armed external HUD hidden');
    }
    await tap('F1');
    await session.poll(async () => await reticleVisible() ? true : undefined, 'reticle restored in F1');
    const rangeArc = await session.evaluate(`document.querySelector('[data-gun-range-arc]').getAttribute('d')`);
    assert.equal(rangeArc, '', 'Base range has no closing-range bar');
    await key('Tab', true);
    const firing = await advance(0.6);
    assert.equal(firing.gun.safe, false);
    assert.equal(firing.gun.contextState, 'running');
    assert.equal(firing.gun.tracerColor, id === 'x31' ? 'green' : 'red');
    assert(firing.gun.fired > safe.gun.fired, 'Armed Tab must fire');
    assert.equal(firing.gun.remaining, before.gun.remaining - (firing.gun.fired - before.gun.fired));
    assert(firing.gun.tracers > 0 && firing.gun.tracers < firing.gun.activeRounds);
    await session.capture('tracers');
    await key('Tab', false);
    await tap('Tab', 8);
    const stopped = await advance(0.2);
    assert.equal(stopped.gun.safe, true);
    assert.equal(await reticleVisible(), false, 'Safety hides reticle again');
    const stoppedAgain = await advance(0.2);
    assert.equal(stoppedAgain.gun.fired, stopped.gun.fired);
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
    });
    await advance(0.2);
    await tap('Tab', 8);
    await session.poll(async () => await reticleVisible() ? true : undefined, 'armed 720p reticle');
    await session.capture('cockpit-720p');
    await tap('Tab', 8);
    assert.equal(session.errors.length, 0);
    await Bun.write(`${session.out}/report.json`, JSON.stringify({ id, mirrors, center, looking, recentered, before, safe, firing, stopped }, null, 2));
    console.log(JSON.stringify({ id, status: stopped.status, gun: stopped.gun, errors: session.errors.length }));
  } finally { await session.close(); }
}
