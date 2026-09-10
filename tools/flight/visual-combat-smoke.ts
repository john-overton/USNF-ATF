/** Fresh-source Linux exterior inspection and combat UI smoke. Retail evidence stays ignored. */
import { openDesktop } from './desktop';
import { readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const engineRequire = createRequire(new URL('../../engine/package.json', import.meta.url));
const preview = await Bun.build({ entrypoints: ['tools/flight/aircraft-preview.ts'], target: 'browser', format: 'iife', minify: true, plugins: [{name: 'engine-three', setup(build) { build.onResolve({filter: /^three$/}, () => ({path: engineRequire.resolve('three')})); }}] });
if (!preview.success) throw new Error(String(preview.logs));
const previewScript = await preview.outputs[0]!.text();
const selected = process.argv[2];
for (const id of ['f14', 'a4e', 'x31'] as const) {
  if (selected && selected !== id) continue;
  const root = `extracted/aircraft-ports/${id}`;
  const latest = (await readdir(root)).filter((s) => !s.startsWith('.')).sort().at(-1)!;
  const bundle = `${root}/${latest}`;
  const session = await openDesktop({ binary: 'shell/node_modules/electron/dist/electron', app: 'shell',
    terrain: 'extracted/terrain/ukraine', aircraft: `${bundle}/${id}.json`,
    cockpit: `${bundle}/cockpits/${id}.json`, gun: `${bundle}/${id}-gun.json`, loadout: `${bundle}/${id}-loadout.json`,
    out: `extracted/combat-visual/${id}`, query: { mode: 'quick-fight', flightStart: 'airborne', aircraft: id, opponents: '1', opponentAircraft: id, wind: 'calm', clouds: 'off' } });
  try {
    await session.poll(async () => (await session.evaluate('window.__flightDiagnostics?.()?.simSteps')) > 10 ? true : undefined, 'flight ready');
    await session.poll(async () => await session.evaluate('!!document.querySelector("[data-cockpit-overlay] img")') ? true : undefined, 'cockpit art ready');
    await session.capture('cockpit');
    await session.evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}))");
    const data = await Bun.file(`${bundle}/${id}.json`).json();
    await session.evaluate(previewScript);
    for (const view of ['top', 'side', 'oblique']) for (const flap of [0, 1]) {
      await session.evaluate(`window.aircraftPreview(${JSON.stringify(data)},${JSON.stringify(id)},${JSON.stringify({pitch:0,roll:0,yaw:0,flap,airbrake:0})},0,${JSON.stringify(view)})`);
      await session.capture(`${view}-${flap ? 'flaps' : 'neutral'}`);
    }
    if (session.errors.length) throw new Error(JSON.stringify(session.errors));
    console.log(`${id}: cockpit and neutral/deployed exterior captured`);
  } finally { await session.close(); }
}
