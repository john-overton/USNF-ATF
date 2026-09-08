/**
 * Minimal Three.js scene: one wireframe cube. Exists to prove Three runs on WebGL2 in
 * every shell. Nothing here is part of the real renderer.
 */
import {
  BoxGeometry,
  Color,
  LineSegments,
  LineBasicMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  WireframeGeometry,
} from 'three';

export interface SpinningCube {
  readonly gl: WebGL2RenderingContext;
  dispose(): void;
}

export function startSpinningCube(canvas: HTMLCanvasElement): SpinningCube {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  const gl = renderer.getContext();
  if (!(gl instanceof WebGL2RenderingContext)) {
    renderer.dispose();
    throw new Error('WebGL2 context unavailable');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(new Color(0x000000), 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  const cube = new LineSegments(
    new WireframeGeometry(new BoxGeometry(2.4, 2.4, 2.4)),
    new LineBasicMaterial({ color: 0x3fa7ff, transparent: true, opacity: 0.55 }),
  );
  scene.add(cube);

  function resize(): void {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let raf = 0;
  let last = performance.now();
  function frame(now: number): void {
    const dt = (now - last) / 1000;
    last = now;
    cube.rotation.x += dt * 0.5;
    cube.rotation.y += dt * 0.8;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);

  return {
    gl,
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      cube.geometry.dispose();
      cube.material.dispose();
      renderer.dispose();
    },
  };
}
