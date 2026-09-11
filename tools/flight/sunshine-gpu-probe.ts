/** Actual GL comparison of ported and upstream density on exact exported textures. */
import {Color,FloatType,PerspectiveCamera,ShaderMaterial,Vector3,Vector4,WebGLRenderer,WebGLRenderTarget} from 'three';
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
 const glError=renderer.getContext().getError();
 quad.dispose();material.dispose();target.dispose();output.dispose();input.dispose();pass.dispose();terrain.texture.dispose();renderer.dispose();
 return {samples,lowLayerMinimumTransmittance,maxRebase,glError,png,nonzero:samples.filter(s=>s[0]!>.001).length};
}
Object.assign(window,{sunshineProbe});
