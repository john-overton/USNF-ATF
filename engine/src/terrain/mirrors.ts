import {
  DoubleSide,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  TextureLoader,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Quaternion,
  type Texture,
  type WebGLRenderer,
} from 'three';

export interface CockpitMirrorRegion {
  id: string;
  /** Viewport-normalized rectangle, origin at top left. */
  x: number;
  y: number;
  width: number;
  height: number;
  maskPngBase64: string;
}
export interface CockpitMirrorLayout {
  regions: CockpitMirrorRegion[];
  visible: boolean;
  opacity: number;
}

/** Authored adjacent thirds of a wide rear feed; native mirror optics are not recovered. */
export function mirrorRearCrop(id: string): { offset: number; width: number } {
  return { offset: id === 'left' ? 2 / 3 : id === 'right' ? 0 : 1 / 3, width: 1 / 3 };
}

/** One shared rear scene at 10 Hz; exact imported masks composite into the cockpit art. */
export class CockpitMirrors {
  readonly bytes = 512 * 256 * 8;
  private target = new WebGLRenderTarget(512, 256);
  private camera = new PerspectiveCamera(70, 2, 0.5, 400000);
  private overlay = new Scene();
  private overlayCamera = new OrthographicCamera(0, 1, 0, 1, 0, 1);
  private geometry = new PlaneGeometry(1, 1);
  private entries = new Map<
    string,
    { source: string; mesh: Mesh; material: ShaderMaterial; mask?: Texture }
  >();
  private layout: CockpitMirrorLayout = { regions: [], visible: false, opacity: 0 };
  private disposed = false;
  private lastUpdate = -Infinity;
  private updates = 0;
  private lastCpuMs = 0;
  private maskErrors = 0;
  setLayout(layout: CockpitMirrorLayout): void {
    if (this.disposed) return;
    this.layout = layout;
    const ids = new Set(layout.regions.map((r) => r.id));
    for (const [id, entry] of this.entries) {
      if (ids.has(id) && layout.regions.find((r) => r.id === id)?.maskPngBase64 === entry.source)
        continue;
      entry.mesh.removeFromParent();
      entry.material.dispose();
      entry.mask?.dispose();
      this.entries.delete(id);
    }
    for (const region of layout.regions) {
      let entry = this.entries.get(region.id);
      if (!entry) {
        const crop = mirrorRearCrop(region.id);
        const material = new ShaderMaterial({
          uniforms: {
            rear: { value: this.target.texture },
            mask: { value: null },
            opacity: { value: 0 },
            crop: { value: new Vector2(crop.offset, crop.width) },
          },
          vertexShader:
            'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
          fragmentShader: `uniform sampler2D rear; uniform sampler2D mask; uniform float opacity; uniform vec2 crop; varying vec2 vUv;
            void main(){
              float coverage=texture2D(mask,vUv).a*opacity;
              if(coverage<0.001) discard;
              gl_FragColor=vec4(texture2D(rear,vec2(crop.x+(1.0-vUv.x)*crop.y,vUv.y)).rgb,coverage);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`,
          side: DoubleSide,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        });
        const mesh = new Mesh(this.geometry, material);
        mesh.frustumCulled = false;
        // The top-down overlay camera reverses the quad winding.
        mesh.scale.y = -1;
        entry = { source: region.maskPngBase64, mesh, material };
        this.entries.set(region.id, entry);
        this.overlay.add(mesh);
        const loading = entry;
        void new TextureLoader()
          .loadAsync(`data:image/png;base64,${region.maskPngBase64}`)
          .then((mask) => {
            if (this.disposed || this.entries.get(region.id) !== loading) {
              mask.dispose();
              return;
            }
            loading.mask = mask;
            loading.material.uniforms.mask!.value = mask;
          })
          .catch(() => {
            if (!this.disposed && this.entries.get(region.id) === loading) this.maskErrors++;
          });
      }
      entry.mesh.position.set(region.x + region.width / 2, region.y + region.height / 2, -0.5);
      entry.mesh.scale.set(region.width, -region.height, 1);
      entry.material.uniforms.opacity!.value = layout.opacity;
    }
  }
  render(
    renderer: WebGLRenderer,
    scene: Scene,
    eye: Vector3,
    attitude: Quaternion,
    now: number,
    withAircraft: (render: () => void) => void,
  ): void {
    if (!this.layout.visible || this.layout.opacity <= 0 || !this.entries.size) return;
    const active = [...this.entries.values()].some(
      (e) =>
        e.mask &&
        e.mesh.position.x + Math.abs(e.mesh.scale.x) / 2 > 0 &&
        e.mesh.position.x - Math.abs(e.mesh.scale.x) / 2 < 1,
    );
    if (!active) return;
    const target = renderer.getRenderTarget();
    const viewport = renderer.getViewport(new Vector4());
    const scissor = renderer.getScissor(new Vector4());
    const scissorTest = renderer.getScissorTest();
    const autoClear = renderer.autoClear;
    const shadowAuto = renderer.shadowMap.autoUpdate;
    try {
      if (now - this.lastUpdate >= 100) {
        const start = performance.now();
        this.camera.position.copy(eye);
        this.camera.up.set(0, 1, 0).applyQuaternion(attitude);
        this.camera.lookAt(new Vector3(0, 0, 1).applyQuaternion(attitude).add(eye));
        renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(this.target);
        renderer.setScissorTest(false);
        renderer.autoClear = true;
        withAircraft(() => renderer.render(scene, this.camera));
        this.lastUpdate = now;
        this.lastCpuMs = performance.now() - start;
        this.updates++;
      }
      renderer.setRenderTarget(target);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
      renderer.autoClear = false;
      for (const entry of this.entries.values()) entry.mesh.visible = !!entry.mask;
      renderer.render(this.overlay, this.overlayCamera);
    } finally {
      renderer.setRenderTarget(target);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
      renderer.autoClear = autoClear;
      renderer.shadowMap.autoUpdate = shadowAuto;
    }
  }
  diagnostics() {
    return {
      regions: this.entries.size,
      maskErrors: this.maskErrors,
      optics: 'authored-wide-rear-crops',
      masksLoaded: [...this.entries.values()].filter((e) => e.mask).length,
      updates: this.updates,
      lastCpuMs: this.lastCpuMs,
      width: 512,
      height: 256,
      refreshHz: 10,
    };
  }
  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) {
      entry.material.dispose();
      entry.mask?.dispose();
    }
    this.entries.clear();
    this.target.dispose();
    this.geometry.dispose();
  }
}
