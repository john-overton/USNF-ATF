/** Fresh-build desktop cloud comparison. Outputs stay in ignored extracted/. */
import assert from 'node:assert/strict';
import { openDesktop } from './desktop';

const label = process.argv[2] ?? 'after';
const cases = [
  { name: 'below', y: 800, pitch: 0.3 },
  { name: 'side', y: 2100, pitch: 0 },
  { name: 'above', y: 3400, pitch: -0.25 },
  { name: 'inside', y: 1700, pitch: 0.05 },
  { name: 'above-96', y: 3400, pitch: -0.25, cloudSteps: '96' },
  { name: 'above-full', y: 3400, pitch: -0.25, clouds: 'full' },
  { name: 'above-off', y: 3400, pitch: -0.25, clouds: 'off' },
  { name: 'scattered', y: 3200, pitch: -0.2, weather: 'scattered' },
  { name: 'overcast', y: 2000, pitch: -0.2, weather: 'overcast' },
  { name: 'storm', y: 12000, pitch: -0.2, weather: 'storm' },
  { name: 'tower-side', y: 5500, pitch: 0.08, weather: 'storm', x: '4000', z: '10000' },
  { name: 'cirrus', y: 6000, pitch: 0.4, weather: 'clear' },
  { name: 'sunset', y: 3400, pitch: -0.25, time: '18' },
  { name: 'night', y: 3400, pitch: -0.25, time: '0' },
];
const selected = process.argv[3] ? cases.filter(c => process.argv[3]!.split(',').includes(c.name)) : cases;
assert(selected.length);
const s = await openDesktop({ binary: 'shell/node_modules/electron/dist/electron', app: 'shell',
  terrain: 'extracted/terrain/synthetic', out: `extracted/cloud-review/${label}`,
  query: { mode: 'explorer', weather: 'broken', clouds: 'half', wind: 'calm', time: '12', date: '170' },
});
try {
  const base = await s.evaluate('location.href');
  const results = [];
  for (const c of selected) {
    const url = new URL(base);
    for (const [k, v] of Object.entries({ x: '4000', z: '4000', yaw: '0', weather: 'broken', clouds: 'half', cloudSteps: '40', time: '12', ...c })) {
      if (k !== 'name') url.searchParams.set(k, String(v));
    }
    await s.send('Page.navigate', { url: url.href });
    await s.poll(async () => {
      const d = await s.evaluate('window.__terrainDiagnostics?.()');
      if (d?.error) throw Error(d.error);
      return d?.frames > 90 && d.status === 'ready' ? d : undefined;
    }, `${c.name} ready`);
    // Let startup shader compilation and terrain loading leave the frame window.
    const timings = await s.evaluate(`new Promise(resolve => {
      let last; const samples=[]; let warmup=120;
      function frame(t) {
        if (last !== undefined && warmup-- <= 0) samples.push(t-last);
        last=t;
        if(samples.length < 180) requestAnimationFrame(frame);
        else { samples.sort((a,b)=>a-b); resolve({median:samples[90],p95:samples[171],mean:samples.reduce((a,b)=>a+b,0)/samples.length}); }
      } requestAnimationFrame(frame);
    })`);
    await s.capture(c.name);
    const diagnostics = await s.evaluate('window.__terrainDiagnostics()');
    assert.equal(s.errors.length, 0);
    results.push({ name: c.name, url: url.href, timings, diagnostics });
    await Bun.write(`${s.out}/report.json`, JSON.stringify(results, null, 2));
    console.log(c.name, timings);
  }
} finally { await s.close(); }
