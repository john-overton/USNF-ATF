import {
  WebGLRenderTarget,
  type Vector2,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

/** Post-process antialiasing avoids MSAA/log-depth cracks on large water triangles. */
export class TerrainAntialias {
  private readonly composer: EffectComposer;
  private readonly output = new OutputPass();
  private readonly fxaa = new ShaderPass(FXAAShader);
  private readonly scenePass: RenderPass;
  bytes = 0;
  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    this.composer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1));
    this.scenePass = new RenderPass(scene, camera);
    this.composer.addPass(this.scenePass);
    this.composer.addPass(this.output);
    this.composer.addPass(this.fxaa);
  }
  resize(width: number, height: number): void {
    this.composer.setSize(width, height);
    const resolution = this.fxaa.uniforms.resolution!.value as Vector2;
    resolution.set(1 / width, 1 / height);
    // Two RGBA8 color + approximate 32-bit depth attachments (driver-dependent).
    this.bytes = width * height * 16;
  }
  render(): void {
    this.composer.render();
  }
  dispose(): void {
    this.scenePass.dispose();
    this.output.dispose();
    this.fxaa.dispose();
    this.composer.dispose();
  }
}
