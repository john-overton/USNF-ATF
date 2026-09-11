/** Inspect aircraft materials, decals and native gear through the production RetailAircraft renderer. */
import { openDesktop } from './desktop';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../engine/package.json', import.meta.url));
const bundle = await Bun.build({entrypoints:['tools/flight/aircraft-preview.ts'],target:'browser',format:'iife',plugins:[{name:'three',setup(b){b.onResolve({filter:/^three$/},()=>({path:require.resolve('three')}));}}]});
if (!bundle.success) throw new Error(String(bundle.logs));
const script = await bundle.outputs[0]!.text();
const directory = process.argv[2] ?? 'extracted/aircraft-textures/models';
const out = process.argv[3] ?? 'extracted/aircraft-textures/views';
const runway = process.argv[4] === 'runway';
for (const id of ['a4e','f14','x31'] as const) {
  const s = await openDesktop({binary:'shell/node_modules/electron/dist/electron',app:'shell',terrain:'extracted/terrain/ukraine',aircraft:`${directory}/${id}.json`,out:`${out}/${id}`,query:{mode:'flight',flightStart:runway ? 'runway' : 'airborne',aircraft:id}});
  try {
    await s.poll(async()=>await s.evaluate('window.__flightDiagnostics?.()?.steps > 1 ? true : undefined'), 'flight ready');
    const read = () => s.evaluate('window.__flightDiagnostics()');
    const tap = (code: string) => s.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{code:${JSON.stringify(code)},bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:${JSON.stringify(code)},bubbles:true}));`);
    const live: Record<string, unknown> = {};
    await tap('F3');
    for (const down of runway ? [true] : [true, false, true]) {
      if ((await read()).gearDown !== down) await tap('KeyG');
      const d = await s.poll(async()=>{
        const d = await read();
        return Math.abs(d.systems.gearFraction - Number(down)) < 0.01 ? d : undefined;
      }, 'gear endpoint');
      if (d.gearSource !== 'retail') throw new Error(`${id}: placeholder gear still active`);
      const angles = Object.entries(d.animation).filter(([name]) => name.startsWith('gear-'));
      if (!angles.length || angles.some(([,angle]) => Math.abs(Number(angle) - (down ? 0 : Math.PI/2)) > 0.02))
        throw new Error(`${id}: imported gear does not follow actuator`);
      live[down ? 'down' : 'up'] = d;
      await s.capture(`live-gear-${down ? 'down':'up'}`);
    }
    await Bun.write(`${s.out}/live-report.json`, JSON.stringify(live,null,2));
    if (runway) {
      const d = await read();
      if (d.status !== 'grounded' || !Number.isFinite(d.altitudeAGL) || Math.abs(d.altitudeAGL) > 0.03) throw new Error(`${id}: native gear support does not settle on ground`);
      if (s.errors.length) throw new Error(JSON.stringify(s.errors));
      console.log(`${id}: grounded with native gear support ${d.gearSupportHeightM}m`);
      continue;
    }
    await s.evaluate(script);
    const data = await Bun.file(`${directory}/${id}.json`).json();
    await s.evaluate(`window.__previewData = ${JSON.stringify(data)}; true`);
    for (const view of ['top','side','oblique','rear','underside']) for (const gear of [0,1]) {
      await s.evaluate(`window.aircraftPreview(window.__previewData,${JSON.stringify(id)},${JSON.stringify({pitch:0,roll:0,yaw:0,flap:0,airbrake:0})},0,${JSON.stringify(view)},${gear})`);
      await s.capture(`${view}-${gear ? 'gear-down':'gear-up'}`);
    }
    if(s.errors.length) throw new Error(JSON.stringify(s.errors));
    console.log(`${id}: textures/decals and gear-up/down from five views rendered without errors`);
  } finally {await s.close();}
}
