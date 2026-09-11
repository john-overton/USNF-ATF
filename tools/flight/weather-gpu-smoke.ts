import assert from 'node:assert/strict';
import { openDesktop } from './desktop';
import { groundFogDensity, FOG_EXTINCTION } from '../../engine/src/sim/environment/fog';
const build=await Bun.build({entrypoints:['tools/flight/weather-gpu-probe.ts'],target:'browser',format:'iife',minify:true,
  plugins:[{name:'engine-three',setup(b){b.onResolve({filter:/^three(\/|$)/},args=>({path:Bun.resolveSync(args.path,process.cwd()+'/engine')}));}}]});
assert(build.success,String(build.logs));
const s=await openDesktop({binary:'shell/node_modules/electron/dist/electron',app:'shell',terrain:'extracted/terrain/synthetic',out:'extracted/cloud-agl/gpu',query:{mode:'explorer',clouds:'off',fog:'off'}});
try{
  await s.evaluate(await build.outputs[0]!.text());
  const report=await s.evaluate('window.weatherProbe()');
  await Bun.write(`${s.out}/report.json`,JSON.stringify(report,null,2));
  assert.equal(s.errors.length,0);assert.equal(report.error,0);
  const values=Object.fromEntries(report.samples.map((x:any)=>[x.name,x.values]));
  assert(values['low-cloud'][1]>.1);
  assert(Math.abs(values['low-cloud'][1]-values['hill-cloud'][1])<1e-5);
  assert.equal(values['below-hill-cloud'][1],0);
  assert.equal(values['hill-cloud'][0],2000);
  for(const name of ['low-fog','hill-fog'])assert(Math.abs(values[name][2]-groundFogDensity(100)*FOG_EXTINCTION)<1e-7);
  assert(Math.abs(values['fog-200ft'][2]-FOG_EXTINCTION)<1e-7);
  assert(values['fog-600ft'][2]<1e-7);assert.equal(values.underground[2],0);
  assert.deepEqual(values.unknown,[0,0,0,0]);
  assert(report.enabledForFog);assert(report.disabledWithoutFog);
  console.log(report);
}finally{await s.close();}
