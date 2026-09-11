/** Executes actual weather GLSL against a known sloping elevation atlas. */
import { Color, Data3DTexture, DataTexture, FloatType, PerspectiveCamera, RedFormat, ShaderMaterial, Vector2, Vector3, Vector4, WebGLRenderer, WebGLRenderTarget } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CloudPass, MARCH_FRAGMENT, type CloudUniformState } from '../../engine/src/terrain/cloud-pass';
import { heightField } from '../../engine/src/terrain/weather-height';
import { WEATHER_PRESETS, marchedLayer } from '../../engine/src/sim/environment/clouds';

function weatherProbe() {
  const renderer = new WebGLRenderer();
  renderer.setSize(1,1);
  const target = new WebGLRenderTarget(1,1,{type:FloatType});
  const terrain=heightField(new Float32Array([0,2000,0,2000]),2,2,new Vector4(0,0,10000,10000));
  const state: CloudUniformState={terrain,fogTerrain:terrain,groundFog:true,offset:{x:0,z:0},cirrusOffset:{x:0,z:0},evolutionSeconds:0,
    layer:marchedLayer(WEATHER_PRESETS.broken),cirrus:undefined,sunDirection:new Vector3(0,1,0),sunColor:new Color(1,1,1),sunIntensity:2.4,
    zenithColor:new Color(.3,.5,.8),groundColor:new Color(.2,.2,.2),ambientIntensity:1.7,origin:{x:0,z:0},fogColor:new Color(.5,.6,.7),fogNear:80000,fogFar:180000};
  const pass=new CloudPass(new PerspectiveCamera());pass.update(state);
  const uniforms=(pass as unknown as {marchMaterial:ShaderMaterial}).marchMaterial.uniforms;
  const coverage=new DataTexture(new Uint8Array([255,255,255,255]),2,2,RedFormat);coverage.needsUpdate=true;
  const shape=new Data3DTexture(new Uint8Array(8).fill(255),2,2,2);shape.format=RedFormat;shape.needsUpdate=true;
  uniforms.cloudCoverage!.value=coverage;uniforms.cloudShape!.value=shape;
  const material=new ShaderMaterial({defines:{LIGHT_STEPS:6},uniforms:{...uniforms,samplePosition:{value:new Vector3()}},
    vertexShader:'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:MARCH_FRAGMENT.slice(0,MARCH_FRAGMENT.indexOf('void main()'))+'\nuniform vec3 samplePosition;\nvoid main(){vec2 h=cloudGroundAt(samplePosition.xz);gl_FragColor=vec4(h.x,coarseDensity(samplePosition),fogSigma(samplePosition),h.y);}',depthTest:false,depthWrite:false});
  const quad=new FullScreenQuad(material);
  const samples=[];
  for(const [name,x,y] of [['low-cloud',0,1900],['hill-cloud',10000,3900],['below-hill-cloud',10000,1900],['low-fog',0,100],['hill-fog',10000,2100],['fog-200ft',0,60.96],['fog-600ft',10000,2182.88],['underground',10000,1999],['unknown',11000,100]] as const){
    material.uniforms.samplePosition!.value.set(x,y,5000);
    renderer.setRenderTarget(target);quad.render(renderer);
    const pixels=new Float32Array(4);renderer.readRenderTargetPixels(target,0,0,1,1,pixels);
    samples.push({name,values:Array.from(pixels)});
  }
  pass.quality='off';
  const enabledForFog=pass.enabled;
  pass.update({...state,groundFog:false});
  const disabledWithoutFog=!pass.enabled;
  const error=renderer.getContext().getError();
  quad.dispose();material.dispose();pass.dispose();terrain.texture.dispose();coverage.dispose();shape.dispose();target.dispose();renderer.dispose();
  return {samples,enabledForFog,disabledWithoutFog,error};
}
Object.assign(window,{weatherProbe});
