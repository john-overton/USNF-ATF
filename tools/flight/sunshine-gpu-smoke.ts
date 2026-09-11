import assert from 'node:assert/strict';
import {openDesktop} from './desktop';
const baseline=process.argv[2];
if(baseline)assert(/^[0-9a-f]{7,40}$/.test(baseline));
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
 plugins:[{name:'three',setup(b){if(baseline)b.onLoad({filter:/\/(sunshine-shader|sunshine-history|cloud-pass)\.ts$/},a=>({contents:Bun.spawnSync(['git','show',baseline+':'+a.path.slice(process.cwd().length+1)]).stdout.toString(),loader:'ts'}));b.onResolve({filter:/^three(\/|$)/},a=>({path:Bun.resolveSync(a.path,process.cwd()+'/engine')}));}}]});
assert(build.success,String(build.logs));
const s=await openDesktop({binary:'shell/node_modules/electron/dist/electron',app:'shell',terrain:'extracted/terrain/synthetic',out:'extracted/cloud-review/sunshine-gpu'+(baseline?'-'+baseline:''),query:{mode:'explorer',clouds:'off',fog:'off'}});
try{
 await s.evaluate(await build.outputs[0]!.text());
 const report=await s.evaluate('window.sunshineProbe('+JSON.stringify(encoded)+','+JSON.stringify(reference)+')');
 await Bun.write(s.out+'/reference-view.png',Buffer.from(report.png.split(',')[1],'base64'));delete report.png;
 await Bun.write(s.out+'/report.json',JSON.stringify(report,null,2));
 assert.equal(s.errors.length,0);assert.equal(report.glError,0);assert(report.nonzero>5);
 for(const sample of report.samples) for(const [ported,original] of [[sample[0],sample[1]],[sample[2],sample[3]]]) {assert(Number.isFinite(ported));assert(Number.isFinite(original));assert(Math.abs(ported-original)<.0001);}
 if(!baseline){
  assert(report.groundShadowMinima[0]>=.74 && report.groundShadowMinima[0]<.8);
  assert(report.groundShadowMinima[1]>=.49 && report.groundShadowMinima[1]<.6);
  assert.equal(report.clearShadowReady,0);
  assert.equal(report.secondaryHistory,1,'mirror history must survive repeated renders');
  for(let i=0;i<2;i++)assert(Math.abs(report.groundLightingRatios[i]-report.groundShadowMinima[i])<.01,'ground material must receive cloud shade');
  assert(report.secondaryDifference<=2,'secondary camera must composite the same cloud view');
  assert(report.geometryNonzero>5);
  assert(report.geometryLodDifference<.00001, 'camera distance must not deform cloud silhouettes');
  assert(report.constantLightSpread<.00001, 'opaque cloud light must not jump at primary-step boundaries');
  for(const sample of report.constantSamples)assert(sample[3]>.999);
  assert.equal(report.farClipHistory,1, 'far-clip retuning must preserve temporal history');
  assert.equal(report.fovHistory,0, 'lens changes must reset temporal history');
 }
 assert(report.depthInvariant[0]<.00001);assert(report.depthInvariant[1]>.99);assert(report.depthInvariant[2]<60000);
 assert(Math.abs(report.brightnessRatios[1]-.75)<.002);
 assert(Math.abs(report.brightnessRatios[2]-(baseline?.5:1))<.002);
 assert(report.distantMinimumTransmittance < 15360, 'clouds must render on known terrain 80km away');
 assert(report.maxRebase<=2);assert(report.lowLayerMinimumTransmittance < 15360, 'low clouds must remain visible from 20km altitude');
 console.log({groundLightingRatios:report.groundLightingRatios,groundShadowMinima:report.groundShadowMinima,secondaryDifference:report.secondaryDifference,geometryLodDifference:report.geometryLodDifference,constantLightSpread:report.constantLightSpread,flicker:report.flicker,farClipHistory:report.farClipHistory,fovHistory:report.fovHistory,depthInvariant:report.depthInvariant,brightnessRatios:report.brightnessRatios,distantMinimumTransmittance:report.distantMinimumTransmittance,nonzero:report.nonzero,maxRebase:report.maxRebase,densitySamples:report.samples.length,glError:report.glError});
}finally{await s.close();}
