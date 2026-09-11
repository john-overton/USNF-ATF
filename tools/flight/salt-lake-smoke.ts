import assert from 'node:assert/strict';
import { openDesktop } from './desktop';

const session = await openDesktop({
  binary: 'shell/node_modules/electron/dist/electron', app: 'shell',
  terrain: 'extracted/terrain/salt-lake',
  aircraftDirectory: '/home/john/.config/USNF-ATF/data/aircraft',
  out: 'extracted/salt-lake-review',
  query: { theater: 'salt-lake', mode: 'flight', flightStart: 'runway', clouds: 'off', wind: 'calm' },
});
const evidence: Record<string, unknown> = {};
const settle = async () => {
  const start = await session.evaluate('window.__terrainDiagnostics().frames');
  return session.poll(async () => {
    const d = await session.evaluate('window.__terrainDiagnostics()');
    return d.frames > start + 120 && d.status === 'ready' && d.pendingChunks === 0 && !d.transitionActive ? d : undefined;
  }, 'terrain settled');
};
try {
  const ready = async () => session.poll(async () => {
    const d = await session.evaluate('window.__terrainDiagnostics?.()');
    if (d?.error) throw Error(d.error);
    return d?.flight && !d.flight.error && await session.evaluate(`document.querySelector('[data-terrain-map]')?.dataset.terrainMap === 'ready'`) ? d : undefined;
  }, 'Salt Lake flight and map ready');
  evidence.runway = await ready();
  assert.equal((evidence.runway as any).name, 'Salt Lake & Front Range');
  const zoom = await session.evaluate(`Number(document.querySelector('[data-map-zoom]').dataset.mapZoom)`);
  assert(Math.abs(863257.4857287335 / zoom / 1609.344 - 400) < 0.1);
  evidence.zoom = zoom;
  const points = await session.evaluate(`Array.from(document.querySelectorAll('[data-waypoint-id]'), el => ({id:Number(el.dataset.waypointId),x:Number(el.dataset.worldX)}))`);
  const slc = points.find((p:any)=>p.id===1), flats = points.find((p:any)=>p.id===2), denver = points.find((p:any)=>p.id===3);
  assert(Math.abs(slc.x - (863257.4857287335 - 221030)) < 0.01);
  assert(denver.x < slc.x && flats.x > slc.x, 'world -X east: Denver east, salt flats west');
  evidence.orientedWaypoints = points;
  evidence.runwaySettled = await settle();
  await session.capture('runway');
  for (const season of ['spring', 'summer', 'autumn', 'winter', 'satellite']) {
    await session.evaluate(`(() => { const el = document.querySelector('#terrain-paint'); el.value = '${season}'; el.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    await session.poll(async () => (await session.evaluate('window.__terrainDiagnostics()')).paint === season ? true : undefined, season);
    await session.capture('season-' + season);
  }
  for (const start of ['approach', 'airborne']) {
    await session.evaluate(`document.querySelector('a[href*="flightStart=${start}"]').click()`);
    evidence[start] = await ready();
    assert.equal((evidence[start] as any).name, 'Salt Lake & Front Range');
  }
  for (const id of [2, 3, 1]) {
    await session.evaluate(`document.querySelector('[data-teleport-id="${id}"]').click()`);
    await session.poll(async () => await session.evaluate(`document.querySelector('[data-waypoint-id="${id}"]')?.dataset.selected === 'true' && !document.querySelector('[data-teleport-id="${id}"]').disabled`) ? true : undefined, 'teleport ' + id);
    const d = await session.evaluate('window.__flightDiagnostics()');
    assert.equal(d.status, 'airborne');
    assert(d.altitudeAGL > 0);
    evidence['waypoint' + id] = d;
    evidence['settled' + id] = await settle();
    await session.capture('waypoint-' + id);
  }
  for (const model of ['assisted', 'retail-envelope', 'recovered-envelope']) {
    await session.evaluate(`(() => { const el = document.querySelector('#flight-model-selector'); el.value = '${model}'; el.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    const d = await ready();
    assert.equal(d.name, 'Salt Lake & Front Range');
    assert.equal(d.flight.flightModelId, model);
    assert.equal(d.flight.status, 'airborne');
    evidence[model] = await settle();
  }
  assert.equal(session.errors.length, 0);
} finally {
  await Bun.write('extracted/salt-lake-review/report.json', JSON.stringify({evidence, errors: session.errors}, null, 2));
  await session.close();
}
console.log('Salt Lake flight starts, seasonal paints, map range and teleports passed');
