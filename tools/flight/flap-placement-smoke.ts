/** Inspect installed wing surfaces through the production RetailAircraft renderer. */
import { openDesktop } from './desktop';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../engine/package.json', import.meta.url));
const bundle = await Bun.build({entrypoints:['tools/flight/aircraft-preview.ts'],target:'browser',format:'iife',plugins:[{name:'three',setup(b){b.onResolve({filter:/^three$/},()=>({path:require.resolve('three')}));}}]});
if (!bundle.success) throw new Error(String(bundle.logs));
const script = await bundle.outputs[0]!.text();
const directory = process.argv[2] ?? '/home/john/.config/USNF-ATF/data/aircraft';
const out = process.argv[3] ?? 'extracted/flap-placement/after';
for (const id of ['a4e','f14','x31'] as const) {
  const s = await openDesktop({binary:'shell/node_modules/electron/dist/electron',app:'shell',terrain:'extracted/terrain/ukraine',aircraft:`${directory}/${id}.json`,out:`${out}/${id}`,query:{mode:'flight',flightStart:'airborne',aircraft:id}});
  try {
    await s.poll(async()=>await s.evaluate('window.__flightDiagnostics?.()?.steps > 1 ? true : undefined'), 'flight ready');
    await s.evaluate(script);
    const data = await Bun.file(`${directory}/${id}.json`).json();
    await s.evaluate(`window.__previewData = ${JSON.stringify(data)}; true`);
    for (const view of ['top','side','oblique','rear']) for (const flap of [0,1]) {
      await s.evaluate(`window.aircraftPreview(window.__previewData,${JSON.stringify(id)},${JSON.stringify({pitch:0,roll:0,yaw:0,flap,airbrake:0})},0,${JSON.stringify(view)})`);
      await s.capture(`${view}-${flap ? 'down':'neutral'}`);
    }
    if(s.errors.length) throw new Error(JSON.stringify(s.errors));
    console.log(`${id}: neutral/deployed top, side, oblique, rear rendered without errors`);
  } finally {await s.close();}
}
