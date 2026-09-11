import {
  DepthTexture,
  HalfFloatType,
  UnsignedByteType,
  UnsignedIntType,
  WebGLRenderTarget,
  type Vector2,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { CloudPass } from './cloud-pass';

/** Post-process antialiasing avoids MSAA/log-depth cracks on large water triangles. */
export class TerrainAntialias {
  private readonly composer: EffectComposer;
  private readonly output = new OutputPass();
  private readonly fxaa = new ShaderPass(FXAAShader);
  private readonly scenePass: RenderPass;
  /** The cloud march, between the scene and tone mapping; drives the quality selector. */
  readonly clouds: CloudPass;
  bytes = 0;
  private readonly colorBytes: number;
  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
    // The cloud march reads scene depth. EffectComposer clones this target for its second
    // buffer and RenderTarget.copy clones a non-null depthTexture, so both buffers end up
    // with one — which they must, since later passes swap read/write every frame.
    const highPrecision = renderer.extensions.has('EXT_color_buffer_float');
    this.colorBytes = highPrecision ? 8 : 4;
    const target = new WebGLRenderTarget(1, 1, {
      type: highPrecision ? HalfFloatType : UnsignedByteType,
      depthTexture: new DepthTexture(1, 1, UnsignedIntType),
    });
    this.composer = new EffectComposer(renderer, target);
    this.scenePass = new RenderPass(scene, camera);
    this.clouds = new CloudPass(camera, highPrecision);
    this.composer.addPass(this.scenePass);
    this.composer.addPass(this.clouds);
    this.composer.addPass(this.output);
    this.composer.addPass(this.fxaa);
  }
  resize(width: number, height: number): void {
    this.composer.setSize(width, height);
    const resolution = this.fxaa.uniforms.resolution!.value as Vector2;
    resolution.set(1 / width, 1 / height);
    // Two color + approximate 32-bit depth attachments (driver-dependent).
    this.bytes = width * height * (this.colorBytes + 4) * 2;
  }
  render(): void {
    this.composer.render();
  }
  dispose(): void {
    this.scenePass.dispose();
    this.clouds.dispose();
    this.output.dispose();
    this.fxaa.dispose();
    this.composer.dispose();
  }
}
