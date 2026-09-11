/** Native brake/burner endpoints through the production renderer and live keyboard input. */
import { openDesktop } from './desktop';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../engine/package.json', import.meta.url));
const bundle = await Bun.build({entrypoints:['tools/flight/aircraft-preview.ts'],target:'browser',format:'iife',plugins:[{name:'three',setup(b){b.onResolve({filter:/^three$/},()=>({path:require.resolve('three')}));}}]});
if (!bundle.success) throw new Error(String(bundle.logs));
const script = await bundle.outputs[0]!.text();
const directory = process.argv[2] ?? `${process.env.HOME}/.config/USNF-ATF/data/aircraft`;
const out = process.argv[3] ?? 'extracted/aircraft-devices/views';
for (const id of ['a4e','f14','x31'] as const) {
  const s = await openDesktop({binary:'shell/node_modules/electron/dist/electron',app:'shell',terrain:'extracted/terrain/ukraine',aircraft:`${directory}/${id}.json`,out:`${out}/${id}`,query:{mode:'flight',flightStart:'airborne',aircraft:id}});
  try {
    await s.poll(async()=>await s.evaluate('window.__flightDiagnostics?.()?.steps > 1 ? true : undefined'), 'flight ready');
    const read = () => s.evaluate('window.__flightDiagnostics()');
    const tap = (code: string) => s.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{code:${JSON.stringify(code)},bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:${JSON.stringify(code)},bubbles:true}));`);
    const live: Record<string, unknown> = {};
    await tap('F3');
    for (const down of [true, false, true]) {
      if ((await read()).airbrakeDown !== down) await tap('KeyB');
      const d = await s.poll(async()=>{
        const d = await read();
        return Math.abs(d.systems.airbrakeFraction - Number(down)) < 0.01 ? d : undefined;
      }, 'brake endpoint');
      const angles = Object.entries(d.animation).filter(([name]) => name.startsWith('airbrake-native-'));
      if (!angles.length || (down && angles.some(([,angle]) => Number(angle) > 0.02))) throw new Error(`${id}: native deployed brake endpoint missing`);
      live[down ? 'brake-open' : 'brake-closed'] = d;
    }
    await tap('Digit6');
    const burning = await s.poll(async()=>{
      const d = await read();
      return id === 'a4e' || d.animation.burnerVisible === 1 ? d : undefined;
    }, 'burner on');
    if (id === 'a4e' && burning.animation.burnerVisible === 1) throw new Error('A4 has a burner');
    live.burning = burning;
    await s.capture('live-brakes-burner');
    await tap('KeyT');
    live.engineOff = await s.poll(async()=>{const d = await read();return !d.engineRunning && d.animation.burnerVisible !== 1 ? d : undefined;}, 'engine off');
    await Bun.write(`${s.out}/live-report.json`, JSON.stringify(live,null,2));
    await s.evaluate(script);
    const data = await Bun.file(`${directory}/${id}.json`).json();
    await s.evaluate(`window.__previewData = ${JSON.stringify(data)}; true`);
    for (const view of ['top','side','rear','underside']) for (const fraction of [0,0.5,1]) {
      await s.evaluate(`window.aircraftPreview(window.__previewData,${JSON.stringify(id)},${JSON.stringify({pitch:0,roll:0,yaw:0,flap:0,airbrake:fraction})},0,${JSON.stringify(view)},0,${id !== 'a4e' && fraction === 1})`);
      await s.capture(`${view}-brake-${fraction}`);
    }
    if(s.errors.length) throw new Error(JSON.stringify(s.errors));
    console.log(`${id}: native brakes, burner and engine-off endpoints verified; four views captured`);
  } finally {await s.close();}
}
