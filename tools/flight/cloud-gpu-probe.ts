/** Browser-side real WebGL2 invariants; bundled only by cloud-gpu-smoke.ts. */
import { Color, FloatType, PerspectiveCamera, ShaderMaterial, Vector3, WebGLRenderer, WebGLRenderTarget } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CloudPass, MARCH_FRAGMENT, type CloudUniformState } from '../../engine/src/terrain/cloud-pass';
import { WEATHER_PRESETS, marchedLayer } from '../../engine/src/sim/environment/clouds';

export function probe() {
  const renderer = new WebGLRenderer();
  renderer.setSize(192, 108);
  const target = new WebGLRenderTarget(192, 108);
  const input = new WebGLRenderTarget(192, 108);
  renderer.setRenderTarget(input);
  renderer.setClearColor(0x345678);
  renderer.clear();
  const camera = new PerspectiveCamera(60, 192 / 108, 5, 400000);
  const pass = new CloudPass(camera);
  pass.quality = 'full';
  pass.setSize(192, 108);
  const state: CloudUniformState = {
    offset: { x: 0, z: 0 }, cirrusOffset: { x: 0, z: 0 }, evolutionSeconds: 0,
    layer: marchedLayer(WEATHER_PRESETS.broken), cirrus: undefined,
    sunDirection: new Vector3(0.3, 0.9, -0.2).normalize(),
    sunColor: new Color(1, 0.94, 0.82), sunIntensity: 2.4,
    zenithColor: new Color(0.2, 0.35, 0.7), groundColor: new Color(0.3, 0.29, 0.26),
    ambientIntensity: 1.7, origin: { x: 0, z: 0 }, fogColor: new Color(0x91b1c8), fogNear: 80000, fogFar: 180000,
  };
  const draw = (steps: number) => {
    pass.steps = steps;
    camera.position.set(4000 - state.origin.x, 3400, 4000 - state.origin.z);
    camera.lookAt(4000 - state.origin.x, 1400, -4000 - state.origin.z);
    camera.updateMatrixWorld();
    pass.update(state);
    pass.render(renderer, target, input, 0, false);
    const pixels = new Uint8Array(192 * 108 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 192, 108, pixels);
    return pixels;
  };
  const difference = (a: Uint8Array, b: Uint8Array) => {
    let total = 0, max = 0;
    for (let i = 0; i < a.length; i++) if (i % 4 !== 3) { const delta = Math.abs(a[i]! - b[i]!); total += delta; max = Math.max(max, delta); }
    return { mean: total / (a.length * .75) / 255, max: max / 255 };
  };
  const first = draw(40);
  const repeated = difference(first, draw(40));
  const convergence = difference(first, draw(96));
  state.origin = { x: 8192, z: -16384 };
  const rebased = difference(first, draw(40));
  state.evolutionSeconds = 120;
  const evolved = difference(first, draw(40));
  state.evolutionSeconds = Math.PI * 200 - 0.001;
  const wrapBefore = draw(40);
  state.evolutionSeconds = Math.PI * 200 + 0.001;
  const wrapped = difference(wrapBefore, draw(40));

  // Execute the production light integrator with a uniform density fixture. Only
  // density is substituted; integration/range/GLSL precision are the real code.
  const prefix = MARCH_FRAGMENT.slice(0, MARCH_FRAGMENT.indexOf('void main()'))
    .replace('float coarseDensity(vec3 p)', 'float originalCoarseDensity(vec3 p)')
    .replace('float lightOpticalDepth(vec3 p)', 'float coarseDensity(vec3 p) { return 0.5; }\nfloat lightOpticalDepth(vec3 p)');
  const material = new ShaderMaterial({
    defines: { LIGHT_STEPS: 6 },
    uniforms: { cloudBaseM: { value: 1200 }, cloudTopM: { value: 2800 }, cloudSunDirection: { value: new Vector3(0, 1, 0) } },
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: prefix + '\nvoid main(){float tau=lightOpticalDepth(vec3(0.0,1300.0,0.0)); gl_FragColor=vec4(tau,exp(-tau),skyOpticalDepth(vec3(0.0,1300.0,0.0)),1.0);}',
    depthTest: false, depthWrite: false,
  });
  const floatTarget = new WebGLRenderTarget(1, 1, { type: FloatType });
  const quad = new FullScreenQuad(material);
  const optical = [];
  for (const y of [1, 0.5, 0.01, -1]) {
    material.uniforms.cloudSunDirection!.value.set(Math.sqrt(1 - y*y), y, 0);
    renderer.setRenderTarget(floatTarget);
    quad.render(renderer);
    const values = new Float32Array(4);
    renderer.readRenderTargetPixels(floatTarget, 0, 0, 1, 1, values);
    const distance = Math.min(12000, (y > 0 ? 1500 : 100) / Math.abs(y));
    optical.push({ y, actual: Array.from(values), expectedTau: distance * .5 * .0025 });
  }
  const gl = renderer.getContext();
  const extension = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const error = gl.getError();
  quad.dispose(); material.dispose(); floatTarget.dispose(); pass.dispose(); target.dispose(); input.dispose(); renderer.dispose();
  return { gpu, error, repeated, convergence, rebased, evolved, wrapped, optical };
}
Object.assign(window, { cloudGpuProbe: probe });
