import assert from 'node:assert/strict';
import { openDesktop } from './desktop';

for (const aircraft of ['a4e', 'x31']) {
  const out = `extracted/aircraft-loadout-switch/${aircraft}`;
  const s = await openDesktop({
    binary: 'shell/node_modules/electron/dist/electron', app: 'shell',
    terrain: 'extracted/terrain/salt-lake',
    aircraftDirectory: '/home/john/.config/USNF-ATF/data/aircraft',
    bareLaunch: true, out,
  });
  const click = (selector: string) => s.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const ready = () => s.poll(async () => await s.evaluate(`document.querySelector('[data-loadout]')?.dataset.loadout === 'ready' && !document.querySelector('[data-menu-command="fly"]')?.disabled`) ? true : undefined, 'valid aircraft loadout');
  try {
    await s.poll(async () => await s.evaluate(`!!document.querySelector('[data-menu-command="free-flight"]')`) ? true : undefined, 'main menu');
    await s.evaluate(`(() => { const e = document.querySelector('[aria-label="Theater selection"]'); e.value='salt-lake'; e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await click('[data-menu-command="free-flight"]');
    await click('[data-menu-aircraft="f14"]');
    await ready();
    await click('[data-menu-command="select-plane"]');
    await click(`[data-menu-aircraft="${aircraft}"]`);
    await ready();
    await s.capture('loadout');
    await click('[data-menu-command="fly"]');
    const d = await s.poll(async () => {
      const terrain = await s.evaluate('window.__terrainDiagnostics?.()');
      if (terrain?.error) throw Error(terrain.error);
      return terrain?.flight && !terrain.flight.error && terrain.frames > 120 ? terrain : undefined;
    }, `${aircraft} flight`);
    assert.equal(d.name, 'Salt Lake & Front Range');
    assert.match(d.flight.aircraftName, aircraft === 'a4e' ? /A-4/i : /X-31/i);
    assert.equal(s.errors.length, 0);
    await s.capture('flight');
    await Bun.write(`${out}/report.json`, JSON.stringify(d,null,2));
  } finally { await s.close(); }
  console.log(`${aircraft}: F-14 → own loadout → Fly passed`);
}
