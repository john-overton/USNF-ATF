import assert from 'node:assert/strict';
import { openDesktop } from './desktop';
import { dayOfYearFor } from '../../engine/src/sim/environment/solar';

const out = 'extracted/seasonal-satellite-review';
const session = await openDesktop({
  binary: 'shell/node_modules/electron/dist/electron', app: 'shell',
  terrain: 'extracted/terrain/salt-lake', out,
  query: { theater: 'salt-lake', mode: 'explorer', paint: 'satellite',
    x: '270000', z: '188000', y: '7500', yaw: '0', pitch: '-0.65',
    clouds: 'off', wind: 'calm', time: '12', date: '07-24' },
});
const evidence: Record<string, unknown> = {};
try {
  await session.poll(async () => {
    const d = await session.evaluate('window.__terrainDiagnostics?.()');
    if (d?.error) throw Error(d.error);
    return d?.status === 'ready' && d.paint === 'satellite' && d.frames > 120 && !d.pendingChunks && !d.transitionActive ? d : undefined;
  }, 'satellite mountains settled');
  for (const date of ['2026-07-24', '2026-10-17', '2026-01-15', '2026-04-20']) {
    await session.evaluate(`(() => { const el = document.querySelector('input[aria-label="Date"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, '${date}'); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    const start = await session.evaluate('window.__terrainDiagnostics().frames');
    await session.poll(async () => (await session.evaluate('window.__terrainDiagnostics().frames')) > start + 30 ? true : undefined, 'date rendered');
    evidence[date] = await session.evaluate('window.__terrainDiagnostics()');
    assert.equal((evidence[date] as any).paint, 'satellite');
    const expectedDay = dayOfYearFor(Number(date.slice(5, 7)), Number(date.slice(8, 10)));
    assert.equal((evidence[date] as any).environment.dayOfYear, expectedDay);
    await session.capture(date);
  }
  assert.equal(session.errors.length, 0);
} finally {
  await Bun.write(`${out}/report.json`, JSON.stringify({evidence,errors:session.errors},null,2));
  await session.close();
}
console.log('Satellite date cycle rendered without runtime errors');
