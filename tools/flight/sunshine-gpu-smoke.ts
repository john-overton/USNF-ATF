import assert from 'node:assert/strict';
import {openDesktop} from './desktop';
const root='extracted/reference/SunshineClouds2/addons/SunshineClouds2/';
const upstream=await Bun.file(root+'SunshineCloudsCompute.glsl').text();
let reference=upstream.slice(upstream.indexOf('float sampleScene('),upstream.indexOf('float sampleSceneCoarse('))
 .replace('sampleScene(', 'referenceScene(').replaceAll('genericData.data.WindDirection','sunshineWind')
 .replaceAll('genericData.data.windSweptPower','0.0').replaceAll('genericData.data.windSweptRange','0.54')
 .replace('1.0 - mediumShapes.b','1.0 - mediumShapes.r');
reference += upstream.slice(upstream.indexOf('float sampleLighting('),upstream.indexOf('float sampleAO(')).replace('sampleLighting(', 'referenceLighting(').replaceAll('sampleScene(', 'referenceScene(');
const encoded:Record<string,string>={};
for(const name of ['large','medium','small','coverage','height','curl','dither'])
 encoded[name]=Buffer.from(await Bun.file('engine/public/dev-root/sunshine/'+name+'.bin.gz').arrayBuffer()).toString('base64');
const build=await Bun.build({entrypoints:['tools/flight/sunshine-gpu-probe.ts'],target:'browser',format:'iife',minify:true,
 plugins:[{name:'three',setup(b){b.onResolve({filter:/^three(\/|$)/},a=>({path:Bun.resolveSync(a.path,process.cwd()+'/engine')}));}}]});
assert(build.success,String(build.logs));
const s=await openDesktop({binary:'shell/node_modules/electron/dist/electron',app:'shell',terrain:'extracted/terrain/synthetic',out:'extracted/cloud-review/sunshine-gpu',query:{mode:'explorer',clouds:'off',fog:'off'}});
try{
 await s.evaluate(await build.outputs[0]!.text());
 const report=await s.evaluate('window.sunshineProbe('+JSON.stringify(encoded)+','+JSON.stringify(reference)+')');
 await Bun.write(s.out+'/reference-view.png',Buffer.from(report.png.split(',')[1],'base64'));delete report.png;
 await Bun.write(s.out+'/report.json',JSON.stringify(report,null,2));
 assert.equal(s.errors.length,0);assert.equal(report.glError,0);assert(report.nonzero>5);
 for(const sample of report.samples) for(const [ported,original] of [[sample[0],sample[1]],[sample[2],sample[3]]]) {assert(Number.isFinite(ported));assert(Number.isFinite(original));assert(Math.abs(ported-original)<.0001);}
 assert(report.maxRebase<=2);assert(report.lowLayerMinimumTransmittance < 15360, 'low clouds must remain visible from 20km altitude');
 console.log({nonzero:report.nonzero,maxRebase:report.maxRebase,densitySamples:report.samples.length,glError:report.glError});
}finally{await s.close();}
