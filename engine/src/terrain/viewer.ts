import {
  AmbientLight,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { FlightLayer, type FlightDiagnostics } from '../flight/FlightLayer';
import type { TerrainChunk, TheaterManifest } from '../data';
import type { FsRoot, Platform } from '../platform/Platform';
import { probeWebGL2 } from '../render/glProbe';
import { ByteCache } from './cache';
import { initialCamera } from './camera';
import { WaterLayer } from './water';
import { decodeChunk } from './chunk';
import {
  floatingOrigin,
  patchMorph,
  type Patch,
  selectPatches,
  selectSourceChunks,
  viewDistance,
  type WorldPosition,
} from './lod';
import { parseManifest, safeRelativePath } from './manifest';
import { buildPatch } from './mesh';
import { SourceTransition } from './transition';

export interface TerrainDiagnostics {
  flight?: FlightDiagnostics;
  status: 'loading' | 'ready' | 'error';
  error: string;
  frames: number;
  frameMs: number;
  frameP95Ms: number;
  cpuMs: number;
  triangles: number;
  drawCalls: number;
  loadedChunks: number;
  pendingChunks: number;
  cacheBytes: number;
  waterCacheBytes: number;
  waterBatches: number;
  waterBatchesPending: number;
  waterBatchesOmitted: number;
  uploadBytesTotal: number;
  uploadBytesPerSecond: number;
  camera: WorldPosition;
  yaw: number;
  pitch: number;
  origin: { x: number; z: number };
  sourceLod: number;
  transitionActive: boolean;
  transitionProgress: number;
  transitionFrom: number;
  transitionTo: number;
  transitionsCompleted: number;
  geometryCacheBytes: number;
  outgoingPatches: number;
  depthBuffer: 'logarithmic';
  patches: number;
  width: number;
  height: number;
  name: string;
  source: string;
  attribution: readonly string[];
}
declare global {
  interface Window {
    __terrainDiagnostics?: () => TerrainDiagnostics;
  }
}
interface PatchResource {
  mesh: Mesh;
  material: MeshStandardMaterial;
  morphUniform: { value: number };
  patch: Patch;
  fadeUniform: { value: number };
  outgoingUniform: { value: boolean };
  chunk: TerrainChunk;
  x: number;
  z: number;
  bytes: number;
}

export function startTerrainViewer(
  canvas: HTMLCanvasElement,
  platform: Platform,
  root: FsRoot,
  manifestPath: string,
  update: (d: TerrainDiagnostics) => void,
): { dispose(): void; setFuelFraction(fraction: number): void } {
  const flightMode = new URLSearchParams(window.location.search).get('mode') === 'flight';
  let flight: FlightLayer | undefined;
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    // Preserve depth separation for terrain and manifest water across kilometer views.
    logarithmicDepthBuffer: true,
  });
  // CSS pixels, intentionally 1:1: 2560x1440 means a measured 1440p drawing buffer.
  renderer.setPixelRatio(1);
  renderer.setClearColor(new Color(0x91b1c8));
  void platform.diagnostics.reportProbe(
    probeWebGL2(renderer.getContext() as WebGL2RenderingContext),
  );
  const scene = new Scene();
  scene.fog = new Fog(0x91b1c8, 80000, 180000);
  scene.add(new AmbientLight(0xffffff, 1.7));
  const sun = new DirectionalLight(0xfff0d0, 2.4);
  sun.position.set(-1, 2, -0.5);
  scene.add(sun);
  const camera = new PerspectiveCamera(60, 1, 5, 400000);
  const world: WorldPosition = { x: 0, y: 4000, z: 0 };
  let yaw = 0,
    pitch = -0.45;
  const data = new ByteCache<Float32Array>(32 * 1024 * 1024);
  const patches = new ByteCache<PatchResource>(96 * 1024 * 1024, (p) => {
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.material.dispose();
  });
  const transition = new SourceTransition();
  const outgoing = new Set<string>();
  const visible = new Set<string>(),
    pending = new Set<string>(),
    failed = new Set<string>();
  let water: WaterLayer | undefined;
  let reportedWaterBytes = 0;
  let desired: TerrainChunk[] = [],
    displayed: TerrainChunk[] = [],
    manifest: TheaterManifest | undefined,
    folder = '';
  let disposed = false,
    raf = 0,
    last = performance.now(),
    lastSelect = -Infinity,
    lastStats = last,
    lastFlightUi = last,
    uploadedAtStats = 0;
  const frameTimes: number[] = [];
  const d: TerrainDiagnostics = {
    status: 'loading',
    error: '',
    frames: 0,
    frameMs: 0,
    frameP95Ms: 0,
    cpuMs: 0,
    triangles: 0,
    drawCalls: 0,
    loadedChunks: 0,
    pendingChunks: 0,
    cacheBytes: 0,
    waterCacheBytes: 0,
    waterBatches: 0,
    waterBatchesPending: 0,
    waterBatchesOmitted: 0,
    uploadBytesTotal: 0,
    uploadBytesPerSecond: 0,
    camera: world,
    yaw,
    pitch,
    origin: { x: 0, z: 0 },
    sourceLod: 0,
    transitionActive: false,
    transitionProgress: 1,
    transitionFrom: -1,
    transitionTo: -1,
    transitionsCompleted: 0,
    geometryCacheBytes: 0,
    outgoingPatches: 0,
    depthBuffer: 'logarithmic',
    patches: 0,
    width: 0,
    height: 0,
    name: '',
    source: '',
    attribution: [],
  };
  const diagnostics = (): TerrainDiagnostics => ({
    ...d,
    camera: { ...world },
    origin: { ...d.origin },
  });
  window.__terrainDiagnostics = diagnostics;
  const keys = new Set<string>();
  const onKey = (event: KeyboardEvent): void => {
    if (flightMode) return;
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLButtonElement
    )
      return;
    if (
      [
        'KeyW',
        'KeyS',
        'KeyA',
        'KeyD',
        'KeyQ',
        'KeyE',
        'ShiftLeft',
        'ShiftRight',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
      ].includes(event.code)
    ) {
      event.preventDefault();
      if (event.type === 'keydown') keys.add(event.code);
      else keys.delete(event.code);
    }
  };
  const blur = (): void => {
    keys.clear();
  };
  const move = (event: PointerEvent): void => {
    if (!flightMode && event.buttons === 1) {
      yaw -= event.movementX * 0.003;
      pitch = Math.max(-1.5, Math.min(1.5, pitch - event.movementY * 0.003));
    }
  };
  const down = (event: PointerEvent): void => {
    canvas.focus();
    canvas.setPointerCapture(event.pointerId);
  };
  const resize = (): void => {
    const w = canvas.clientWidth || 1280,
      h = canvas.clientHeight || 800;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    d.width = w;
    d.height = h;
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', blur);
  window.addEventListener('resize', resize);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerdown', down);
  resize();
  const fail = (error: unknown): void => {
    if (disposed) return;
    d.status = 'error';
    d.error = error instanceof Error ? error.message : String(error);
    update(diagnostics());
  };
  const pump = (): void => {
    if (disposed) return;
    for (const chunk of desired) {
      if (pending.size >= 4) break;
      if (data.get(chunk.path) || pending.has(chunk.path) || failed.has(chunk.path)) continue;
      pending.add(chunk.path);
      void platform.fs
        .readBytes(root, folder + chunk.path)
        .then((bytes) => decodeChunk(bytes, chunk))
        .then((samples) => {
          if (!disposed) {
            data.put(chunk.path, samples, samples.byteLength);
            lastSelect = -Infinity;
          }
        })
        .catch((error: unknown) => {
          failed.add(chunk.path);
          fail(error);
        })
        .finally(() => {
          pending.delete(chunk.path);
          pump();
        });
    }
  };
  void (async () => {
    const path = safeRelativePath(manifestPath);
    folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    const text = await platform.fs.readText(root, path);
    const m = parseManifest(text);
    if (disposed) return;
    manifest = m;
    d.name = m.name;
    d.source = m.source;
    d.attribution = m.attribution;
    const pose = initialCamera(m, window.location.search);
    Object.assign(world, pose.position);
    yaw = pose.yaw;
    pitch = pose.pitch;
    water = new WaterLayer(scene, m.waterBodies);
    if (flightMode) {
      const layer = await FlightLayer.create(scene, m, platform, root, folder);
      if (disposed) {
        layer.dispose();
        return;
      }
      flight = layer;
      flight.activate();
      Object.assign(world, flight.pose().camera);
    }
  })().catch(fail);

  function select(now: number): void {
    if (!manifest) return;
    if (now - lastSelect >= 200) {
      lastSelect = now;
      const horizon = viewDistance(world);
      water?.select(world, horizon);
      if (scene.fog instanceof Fog) {
        scene.fog.near = horizon * 0.65;
        scene.fog.far = horizon;
      }
      camera.far = horizon * 1.2;
      camera.updateProjectionMatrix();
      const selection = selectSourceChunks(manifest, world);
      desired = selection.chunks;
      pump();
      // A stable complete set starts one transition at a time. Freeze both patch
      // hierarchies during the fade so topology churn cannot interrupt the blend.
      const loaded = desired.every((c) => data.get(c.path));
      if (transition.consider(selection.lod, loaded, now)) {
        if (transition.active) for (const key of visible) outgoing.add(key);
        displayed = desired;
        d.sourceLod = selection.lod;
      } else if (!transition.active && selection.lod === transition.to && loaded) {
        displayed = desired;
      } else if (!displayed.length) displayed = desired.filter((c) => data.get(c.path));
      if (d.status !== 'error')
        d.status = loaded && !transition.active && !water?.pending ? 'ready' : 'loading';
    }
    // Keep mesh topology synchronized with the per-frame morph metric; a 200ms
    // source/water cadence could otherwise insert already-unmorphed children.
    if (transition.active && [...visible].some((key) => !outgoing.has(key))) return;
    // Touch retained outgoing resources before allocations, keeping inactive LRU
    // entries first in the eviction queue. Each active hierarchy is capped below.
    for (const key of outgoing) patches.get(key);
    let maxDepth = 4;
    while (
      maxDepth > 0 &&
      displayed.reduce((sum, chunk) => sum + selectPatches(chunk, world, maxDepth).length, 0) > 1000
    )
      maxDepth--;
    const nextVisible = new Set<string>();
    for (const chunk of displayed) {
      const samples = data.get(chunk.path);
      if (!samples) continue;
      for (const patch of selectPatches(chunk, world, maxDepth)) {
        if (
          chunk.originX + patch.x >= manifest.extents.width ||
          chunk.originZ + patch.z >= manifest.extents.height
        )
          continue;
        const key = `${chunk.path}:${patch.key}`;
        nextVisible.add(key);
        let resource = patches.get(key);
        if (!resource) {
          const built = buildPatch(chunk, samples, patch, manifest.extents),
            material = new MeshStandardMaterial({
              vertexColors: true,
              roughness: 1,
              side: DoubleSide,
            });
          const morphUniform = { value: 0 };
          const fadeUniform = { value: 1 };
          const outgoingUniform = { value: false };
          material.onBeforeCompile = (shader) => {
            shader.uniforms.terrainMorph = morphUniform;
            shader.uniforms.sourceFade = fadeUniform;
            shader.uniforms.sourceOutgoing = outgoingUniform;
            shader.vertexShader =
              'attribute float coarseHeight;\nattribute vec3 coarseNormal;\nattribute vec3 coarseColor;\nuniform float terrainMorph;\n' +
              shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\ntransformed.y=mix(position.y,coarseHeight,terrainMorph);',
            );
            shader.vertexShader = shader.vertexShader.replace(
              '#include <beginnormal_vertex>',
              '#include <beginnormal_vertex>\nobjectNormal=normalize(mix(normal,coarseNormal,terrainMorph));',
            );
            shader.vertexShader = shader.vertexShader.replace(
              '#include <color_vertex>',
              '#include <color_vertex>\nvColor.rgb=mix(color,coarseColor,terrainMorph);',
            );
            shader.fragmentShader =
              'uniform float sourceFade;\nuniform bool sourceOutgoing;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <clipping_planes_fragment>',
              `#include <clipping_planes_fragment>
              // Complementary screen-space masks: depth-writing opaque surfaces,
              // no coincident alpha blend or dependence on source-grid nesting.
              float sourceNoise=fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(0.06711056,0.00583715))));
              if(sourceOutgoing ? sourceNoise<sourceFade : sourceNoise>=sourceFade) discard;`,
            );
          };
          material.customProgramCacheKey = () => 'terrain-normal-source-morph-v3';
          const mesh = new Mesh(built.geometry, material);
          resource = {
            mesh,
            material,
            morphUniform,
            patch,
            fadeUniform,
            outgoingUniform,
            chunk,
            x: patch.x,
            z: patch.z,
            bytes: built.bytes,
          };
          patches.put(key, resource, built.bytes);
          scene.add(mesh);
          d.uploadBytesTotal += built.bytes;
        }
        resource.mesh.visible = true;
      }
    }
    for (const key of visible)
      if (!nextVisible.has(key)) {
        const p = patches.get(key);
        if (p && !outgoing.has(key)) p.mesh.visible = false;
      }
    visible.clear();
    for (const key of nextVisible) visible.add(key);
  }
  function frame(now: number): void {
    if (disposed) return;
    const start = performance.now(),
      frameSeconds = (now - last) / 1000,
      dt = Math.min(0.1, frameSeconds);
    frameTimes.push(now - last);
    if (frameTimes.length > 240) frameTimes.shift();
    last = now;
    if (flight) {
      flight.advance(frameSeconds);
      Object.assign(world, flight.pose().camera);
      d.flight = flight.diagnostics();
    } else if (!flightMode) {
      const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6000 : 1200) * dt;
      if (keys.has('ArrowLeft')) yaw += dt;
      if (keys.has('ArrowRight')) yaw -= dt;
      if (keys.has('ArrowUp')) pitch = Math.min(1.5, pitch + dt);
      if (keys.has('ArrowDown')) pitch = Math.max(-1.5, pitch - dt);
      const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
        right = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      world.x += (-Math.sin(yaw) * forward + Math.cos(yaw) * right) * speed;
      world.z += (-Math.cos(yaw) * forward - Math.sin(yaw) * right) * speed;
      world.y = Math.max(
        25,
        world.y + (Number(keys.has('KeyE')) - Number(keys.has('KeyQ'))) * speed,
      );
      if (manifest) {
        world.x = Math.max(0, Math.min(manifest.extents.width, world.x));
        world.z = Math.max(0, Math.min(manifest.extents.height, world.z));
      }
    }
    if (transition.update(now)) {
      for (const key of outgoing) {
        const p = patches.get(key);
        if (p) p.mesh.visible = false;
      }
      outgoing.clear();
      lastSelect = -Infinity;
    }
    select(now);
    d.origin = floatingOrigin(world);
    camera.position.set(world.x - d.origin.x, world.y, world.z - d.origin.z);
    if (flight) {
      const pose = flight.pose();
      const target = pose.look;
      camera.up.copy(pose.up);
      camera.lookAt(target.x - d.origin.x, target.y, target.z - d.origin.z);
      flight.render(d.origin);
      yaw = camera.rotation.y;
      pitch = camera.rotation.x;
    } else camera.rotation.set(pitch, yaw, 0, 'YXZ');
    d.yaw = yaw;
    d.pitch = pitch;
    for (const key of new Set([...visible, ...outgoing])) {
      const p = patches.get(key);
      if (!p) continue;
      p.fadeUniform.value = transition.active ? transition.progress : 1;
      p.outgoingUniform.value = outgoing.has(key);
      p.mesh.position.set(
        p.chunk.originX + p.x - d.origin.x,
        0,
        p.chunk.originZ + p.z - d.origin.z,
      );
      p.morphUniform.value = patchMorph(p.chunk, p.patch, world);
    }
    water?.rebase(d.origin);
    d.waterCacheBytes = water?.bytes ?? 0;
    d.waterBatches = water?.count ?? 0;
    d.waterBatchesPending = water?.pending ?? 0;
    d.waterBatchesOmitted = water?.omitted ?? 0;
    const waterBytes = water?.uploadedBytes ?? 0;
    d.uploadBytesTotal += waterBytes - reportedWaterBytes;
    reportedWaterBytes = waterBytes;
    renderer.render(scene, camera);
    d.frames++;
    d.triangles = renderer.info.render.triangles;
    d.drawCalls = renderer.info.render.calls;
    d.cpuMs = performance.now() - start;
    d.loadedChunks = data.size;
    d.pendingChunks = pending.size;
    d.cacheBytes = data.bytes + patches.bytes + d.waterCacheBytes;
    d.patches = visible.size + outgoing.size;
    d.geometryCacheBytes = patches.bytes;
    d.outgoingPatches = outgoing.size;
    d.transitionActive = transition.active;
    d.transitionProgress = transition.progress;
    d.transitionFrom = transition.from;
    d.transitionTo = transition.to;
    d.transitionsCompleted = transition.completed;
    if (now - lastStats >= 500) {
      d.frameMs = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const sorted = [...frameTimes].sort((a, b) => a - b);
      d.frameP95Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
      d.uploadBytesPerSecond = (d.uploadBytesTotal - uploadedAtStats) / ((now - lastStats) / 1000);
      uploadedAtStats = d.uploadBytesTotal;
      lastStats = now;
      if (!flight) update(diagnostics());
    }
    if (flight && now - lastFlightUi >= 1000 / 30) {
      lastFlightUi = now;
      update(diagnostics());
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return {
    setFuelFraction(fraction: number) {
      flight?.setFuelFraction(fraction);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', blur);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', down);
      data.clear();
      patches.clear();
      water?.dispose();
      flight?.dispose();
      renderer.dispose();
      if (window.__terrainDiagnostics === diagnostics) delete window.__terrainDiagnostics;
    },
  };
}
