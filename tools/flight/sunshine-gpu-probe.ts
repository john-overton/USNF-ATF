/** Actual GL comparison of ported and upstream density on exact exported textures. */
import {Color,DataUtils,FloatType,PerspectiveCamera,ShaderMaterial,Vector3,Vector4,WebGLRenderer,WebGLRenderTarget} from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {CloudPass,MARCH_FRAGMENT,type CloudUniformState} from '../../engine/src/terrain/cloud-pass';
import {heightField} from '../../engine/src/terrain/weather-height';
async function sunshineProbe(encoded:Record<string,string>, reference:string) {
 const renderer=new WebGLRenderer(); renderer.setSize(192,108);
 const camera=new PerspectiveCamera(60,192/108,5,400000);
 const pass=new CloudPass(camera);pass.quality='full';pass.setSize(192,108);
 await pass.loadSunshine(async name=>Uint8Array.from(atob(encoded[name]!),c=>c.charCodeAt(0)));
 const terrain=heightField(new Float32Array(4),2,2,new Vector4(-300000,-300000,600000,600000));
 const state:CloudUniformState={appearance:'sunshine',terrain,offset:{x:0,z:0},cirrusOffset:{x:0,z:0},evolutionSeconds:0,
  layer:{type:'cumulonimbus',baseM:1500,topM:25000,coverage:.874,density:1},cirrus:undefined,
  sunDirection:new Vector3(.3,.9,-.2).normalize(),sunColor:new Color(1,1,1),sunIntensity:2.4,
  zenithColor:new Color(.3,.5,.8),groundColor:new Color(.2,.2,.2),ambientIntensity:1.7,origin:{x:0,z:0},
  fogColor:new Color(.5,.6,.7),fogNear:80000,fogFar:180000};
 pass.update(state);
 const uniforms=(pass as unknown as {marchMaterial:ShaderMaterial}).marchMaterial.uniforms;
 const target=new WebGLRenderTarget(1,1,{type:FloatType});
 const prefix=MARCH_FRAGMENT.slice(0,MARCH_FRAGMENT.indexOf('void main()'));
 const sampleShader = '\nuniform vec3 probePosition; void main(){vec3 p=probePosition; float extra=texture(extra_large_noise,p.xz/320000.0).a; float a=sampleScene(vec3(0),vec3(0),vec3(0),p,25000.0,1500.0,extra,120000.0,20000.0,8500.0,.874*1.01,1.075,4500.0,1.0,false); float b=referenceScene(vec3(0),vec3(0),vec3(0),p,25000.0,1500.0,extra,120000.0,20000.0,8500.0,.874*1.01,1.075,4500.0,1.0,false); float c=sampleLighting(32,p,vec3(0),vec3(0),vec3(0),vec3(0),cloudSunDirection,.14*.982*(1.0+3.0*.874*1.01),1.0,10000.0,25000.0,1500.0,320000.0,120000.0,20000.0,8500.0,.874*1.01,1.075,4500.0,1.0); float d=referenceLighting(32,p,vec3(0),vec3(0),vec3(0),vec3(0),cloudSunDirection,.14*.982*(1.0+3.0*.874*1.01),1.0,10000.0,25000.0,1500.0,320000.0,120000.0,20000.0,8500.0,.874*1.01,1.075,4500.0,1.0); gl_FragColor=vec4(a,b,c,d);}';
 const material=new ShaderMaterial({defines:{LIGHT_STEPS:6},uniforms:{...uniforms,probePosition:{value:new Vector3()}},
 vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',fragmentShader:prefix+reference+sampleShader,depthTest:false,depthWrite:false});
 const quad=new FullScreenQuad(material);
 const samples=[];
 for(let i=0;i<128;i++){
  material.uniforms.probePosition!.value.set((i*7319)%150000,1600+(i*1193)%23000,(i*3727)%150000);
  renderer.setRenderTarget(target);quad.render(renderer);const pixel=new Float32Array(4);
  renderer.readRenderTargetPixels(target,0,0,1,1,pixel); samples.push(Array.from(pixel));
 }
 const output=new WebGLRenderTarget(192,108);const input=new WebGLRenderTarget(192,108);
 renderer.setRenderTarget(input);renderer.setClearColor(0x345678);renderer.clear();
 const render=(x:number,y:number,z:number)=>{
  camera.position.set(x-state.origin.x,y,z-state.origin.z);
  camera.lookAt(x-state.origin.x,10000,z-30000-state.origin.z);camera.updateMatrixWorld();
  pass.update(state);pass.render(renderer,output,input,0,false);
  const pixels=new Uint8Array(192*108*4);renderer.readRenderTargetPixels(output,0,0,192,108,pixels);return pixels;
 };
 const first=render(50000,28000,50000);
 for(let i=0;i<16;i++){state.evolutionSeconds=i/60;render(50000,28000,50000);}
 state.origin={x:8192,z:-16384};state.evolutionSeconds=0;
 (pass as unknown as {historyValid:boolean}).historyValid=false;
 const rebased=render(50000,28000,50000);
 let maxRebase=0;for(let i=0;i<first.length;i++)maxRebase=Math.max(maxRebase,Math.abs(first[i]!-rebased[i]!));
 // Interior and upper-edge temporal variation during a 480 m/s approach.
 state.origin={x:0,z:0};
 const flicker=[];
 for(const [moving,altitude] of [[false,10000],[true,10000],[true,26000]] as const){
  let previous:Uint8Array|undefined;let delta=0;let count=0;
  for(let frame=0;frame<48;frame++){
   state.evolutionSeconds=frame/60;
   const pixels=render(50000,altitude,50000-(moving?frame*8:0));
   if(previous&&frame>=16)for(let i=0;i<pixels.length;i++)if(i%4!==3){delta+=Math.abs(pixels[i]!-previous[i]!);count++;}
   previous=pixels;
  }
  flicker.push(delta/count);
 }
 // The terrain viewer adjusts far clip while flying; this must retain history.
 render(50000,10000,49906);
 camera.far=350000;camera.updateProjectionMatrix();render(50000,10000,49906);
 const farClipHistory=(pass as unknown as {historyMaterial:ShaderMaterial}).historyMaterial.uniforms.validHistory!.value;
 camera.fov=55;camera.updateProjectionMatrix();render(50000,10000,49906);
 const fovHistory=(pass as unknown as {historyMaterial:ShaderMaterial}).historyMaterial.uniforms.validHistory!.value;
 camera.fov=60;camera.far=400000;camera.updateProjectionMatrix();state.evolutionSeconds=0;
 const brightnessSums:number[]=[];
 state.fogNear=1e9;state.fogFar=2e9;
 for(const type of ['cumulus','stratus','cumulonimbus'] as const){
  state.layer={...state.layer!,type};
  render(50000,28000,50000);
  const values=new Uint16Array(192*108*4);
  renderer.readRenderTargetPixels((pass as unknown as {target:WebGLRenderTarget}).target,0,0,192,108,values);
  let sum=0;for(let i=0;i<values.length;i++)if(i%4!==3)sum+=DataUtils.fromHalfFloat(values[i]!);
  brightnessSums.push(sum);
 }
 const brightnessRatios=brightnessSums.map(sum=>sum/brightnessSums[0]!);
 const canvas=document.createElement('canvas');canvas.width=192;canvas.height=108;
 const ctx=canvas.getContext('2d')!;const flipped=new Uint8ClampedArray(first.length);
 for(let y=0;y<108;y++)flipped.set(first.subarray(y*192*4,(y+1)*192*4),(107-y)*192*4);
 ctx.putImageData(new ImageData(flipped,192,108),0,0);
 const png=canvas.toDataURL();
 state.layer={type:'stratus',baseM:800,topM:1400,coverage:.97,density:1};
 state.sunshine={coverage:.985,density:.14};
 render(4000,20000,4000);
 const marchPixels=new Uint16Array(192*108*4);
 renderer.readRenderTargetPixels((pass as unknown as {target:WebGLRenderTarget}).target,0,0,192,108,marchPixels);
 let lowLayerMinimumTransmittance=15360;
 for(let i=3;i<marchPixels.length;i+=4)lowLayerMinimumTransmittance=Math.min(lowLayerMinimumTransmittance,marchPixels[i]!);
 // Only terrain at 80–180 km is known: all cloud opacity must come from far
 // beyond the former thin-layer budget. Narrow FOV resolves the thin horizon.
 const distantTerrain=heightField(new Float32Array(4),2,2,new Vector4(80000,-100000,100000,200000));
 state.terrain=distantTerrain;state.origin={x:0,z:0};
 camera.fov=20;camera.updateProjectionMatrix();camera.position.set(0,1100,0);
 camera.lookAt(100000,1100,0);camera.updateMatrixWorld();
 pass.update(state);pass.render(renderer,output,input,0,false);
 renderer.readRenderTargetPixels((pass as unknown as {target:WebGLRenderTarget}).target,0,0,192,108,marchPixels);
 let distantMinimumTransmittance=15360;
 for(let i=3;i<marchPixels.length;i+=4)distantMinimumTransmittance=Math.min(distantMinimumTransmittance,marchPixels[i]!);
 const middleTerrain=heightField(new Float32Array(4),2,2,new Vector4(20000,-100000,160000,200000));
 state.terrain=middleTerrain;pass.update(state);
 const depthMaterial=new ShaderMaterial({defines:{LIGHT_STEPS:6},uniforms,
 vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
 fragmentShader:prefix+'void main(){vec4 ad,bd;vec4 a=sunshineMarch(vec3(0,1100,0),vec3(1,0,0),60000.0,ad);vec4 b=sunshineMarch(vec3(0,1100,0),vec3(1,0,0),180000.0,bd);vec4 diff=abs(a-b);gl_FragColor=vec4(max(max(diff.r,diff.g),max(diff.b,diff.a)),a.a,ad.g,bd.g);}',depthTest:false,depthWrite:false});
 quad.material=depthMaterial;renderer.setRenderTarget(target);quad.render(renderer);
 const depthValues=new Float32Array(4);renderer.readRenderTargetPixels(target,0,0,1,1,depthValues);
 const depthInvariant=Array.from(depthValues);
 depthMaterial.dispose();middleTerrain.texture.dispose();
 distantTerrain.texture.dispose();
 // Uniform illuminated cloud: crossing an opacity cutoff must not change
 // radiance as the number of primary steps or partial first interval changes.
 const constantBody=(shader:string,name:string,body:string)=>{
  const start=shader.indexOf('{',shader.indexOf('float '+name+'('));
  let end=start+1,depth=1;
  while(depth){const ch=shader[end++];if(ch==='{')depth++;if(ch==='}')depth--;}
  return shader.slice(0,start+1)+body+shader.slice(end-1);
 };
 state.terrain=terrain;state.layer={type:'cumulus',baseM:1500,topM:25000,coverage:.874,density:1};
 state.sunshine=undefined;state.ambientIntensity=0;state.fogNear=1e9;state.fogFar=2e9;pass.update(state);
 let constantPrefix=constantBody(prefix,'sampleScene','return fixtureDensity;');
 constantPrefix=constantBody(constantPrefix,'sampleLighting','return 0.0;');
 const constantMaterial=new ShaderMaterial({defines:{LIGHT_STEPS:6},uniforms:{...uniforms,fixtureDensity:{value:.1}},
 vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
 fragmentShader:'uniform float fixtureDensity;\n'+constantPrefix+'void main(){vec4 data;gl_FragColor=sunshineMarch(vec3(0,10000,0),vec3(1,0,0),180000.0,data);}',depthTest:false,depthWrite:false});
 quad.material=constantMaterial;
 const constantSamples=[];
 for(let i=0;i<32;i++){
  constantMaterial.uniforms.fixtureDensity!.value=.03+i*.013;
  uniforms.sunshineTime!.value=i*15.111/60;
  renderer.setRenderTarget(target);quad.render(renderer);
  const pixel=new Float32Array(4);renderer.readRenderTargetPixels(target,0,0,1,1,pixel);constantSamples.push(Array.from(pixel));
 }
 const constantLightSpread=Math.max(...constantSamples.map(p=>p[0]!))-Math.min(...constantSamples.map(p=>p[0]!));
 constantMaterial.dispose();
 const glError=renderer.getContext().getError();
 quad.dispose();material.dispose();target.dispose();output.dispose();input.dispose();pass.dispose();terrain.texture.dispose();renderer.dispose();
 return {constantLightSpread,constantSamples,flicker,farClipHistory,fovHistory,samples,depthInvariant,brightnessRatios,distantMinimumTransmittance,lowLayerMinimumTransmittance,maxRebase,glError,png,nonzero:samples.filter(s=>s[0]!>.001).length};
}
Object.assign(window,{sunshineProbe});
