import { GunSightOverlay } from '../flight/GunSightOverlay';
import {
  DataTexture,
  SRGBColorSpace,
  LinearMipmapLinearFilter,
  LinearFilter,
  Color,
  DoubleSide,
  Fog,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { FlightLayer, type FlightDiagnostics } from '../flight/FlightLayer';
import type { TerrainChunk, TheaterManifest } from '../data';
import type { FsRoot, Platform } from '../platform/Platform';
import { probeWebGL2 } from '../render/glProbe';
import { ByteCache } from './cache';
import { initialCamera } from './camera';
import type { MissionParams } from '../sim/mission/params';
import { WaterWorkerBuilder } from './water-worker-client';
import { ShoreLayer } from './shoreline';
import { parseShorelines } from './shoreline-data';
import type { Texture } from 'three';
import { WaterLayer } from './water';
import { decodeChunk, decodeTerrainBytes } from './chunk';
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
import { TerrainAntialias } from './antialias';
import { CockpitMirrors, type CockpitMirrorLayout } from './mirrors';
import { TerrainSeams, type SeamPatch } from './seams';
import { SourceTransition } from './transition';
import { waypointDestination, type TeleportWaypoint } from './teleport';
import { SkyLayer } from './sky';
import {
  orientManifest,
  orientShorelines,
  reflectedWidth,
  reflectPixels,
} from './world-orientation';
import { SeasonalSatellite } from './seasonal-satellite';
import { patchCloudShadow } from './cloud-shadow';
import { patchTerrainLightContrast, setTerrainContrast, TERRAIN_CONTRAST } from './light-contrast';
import { marchedLayer } from '../sim/environment/clouds';
import {
  Environment,
  theaterCenterFromCrs,
  WEATHER_PRESETS,
  WIND_PRESETS,
  type CloudQuality,
  type WeatherId,
  type WindPresetId,
} from '../sim/environment';

export interface EnvironmentDiagnostics {
  timeOfDayHours: number;
  timeText: string;
  year: number;
  dayOfYear: number;
  season: string;
  sunElevationDeg: number;
  sunAzimuthDeg: number;
  moonElevationDeg: number;
  moonAzimuthDeg: number;
  moonPhase: number;
  moonWaxing: boolean;
  weather: WeatherId;
  weatherLabel: string;
  wind: WindPresetId;
  windLabel: string;
  windAtCamera: { x: number; y: number; z: number };
  windBearingDeg: number;
  windSpeed: number;
  cloudQuality: CloudQuality;
  cloudSteps: number;
  shadow: ReturnType<SkyLayer['shadowDiagnostics']>;
}
export interface TerrainDiagnostics {
  environment: EnvironmentDiagnostics;
  shorelineTriangles?: number;
  shorelineBytes?: number;
  shorelinePending?: number;
  shorelineOmitted?: number;
  imageryAttribution?: string;
  paint?: string;
  paintModes?: string[];
  /** Extra separation between lit and shaded ground, as a fraction. */
  contrast: number;
  flight?: FlightDiagnostics;
  mirrors?: ReturnType<CockpitMirrors['diagnostics']>;
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
  shoreMaskUniform: { value: Texture | null };
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
  seam: SeamPatch;
}

export function startTerrainViewer(
  canvas: HTMLCanvasElement,
  platform: Platform,
  root: FsRoot,
  manifestPath: string,
  update: (d: TerrainDiagnostics) => void,
  mission: MissionParams,
): {
  dispose(): void;
  setPaused(paused: boolean): void;
  setGunMode(mode: MissionParams['gunMode']): void;
  setMusicEnabled(enabled: boolean): void;
  setMusicVolume(volume: number): void;
  setCockpitMirrors(layout: CockpitMirrorLayout): void;
  setFuelFraction(fraction: number): void;
  setTimeOfDay(hours: number): void;
  setDate(year: number, dayOfYear: number): void;
  setWeather(id: WeatherId): void;
  setWind(id: WindPresetId): void;
  setCloudQuality(quality: CloudQuality): void;
  setTerrainPaint(mode: string): Promise<void>;
  teleportToWaypoint(point: TeleportWaypoint): Promise<void>;
  setNavigationTarget(point: { id: number; x: number; z: number } | undefined): void;
} {
  const flightMode = mission.mode !== 'explorer';
  // Already parsed before any GPU resource exists: an invalid parameter surfaces
  // through the viewer's explicit error path without leaking a context.
  const query = mission.environment;
  let flight: FlightLayer | undefined;
  let gunMode = mission.gunMode;
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    // Preserve depth separation for terrain and manifest water across kilometer views.
    logarithmicDepthBuffer: true,
  });
  // CSS pixels, intentionally 1:1: 2560x1440 means a measured 1440p drawing buffer.
  renderer.setPixelRatio(1);
  renderer.info.autoReset = false;
  renderer.setClearColor(new Color(0x91b1c8));
  void platform.diagnostics.reportProbe(
    probeWebGL2(renderer.getContext() as WebGL2RenderingContext),
  );
  const scene = new Scene();
  const environment = new Environment({
    ...(query.timeOfDayHours === undefined ? {} : { timeOfDayHours: query.timeOfDayHours }),
    ...(query.dayOfYear === undefined ? {} : { dayOfYear: query.dayOfYear }),
    ...(query.weather === undefined ? {} : { weather: query.weather }),
    ...(query.wind === undefined ? {} : { wind: query.wind }),
  });
  let cloudQuality: CloudQuality = query.clouds ?? 'half';
  // Parsed before any GPU resource exists, so a bad value surfaces through the
  // viewer's explicit error path rather than leaking a context.
  const contrast = mission.contrast ?? TERRAIN_CONTRAST;
  setTerrainContrast(contrast);
  // Step count is a URL-only performance control; the panel exposes quality.
  const cloudSteps = query.cloudSteps ?? 40;
  // SkyLayer owns the background, fog and both lights from here on.
  const sky = new SkyLayer(scene);
  if (flightMode) sky.enableShadows(renderer);
  const camera = new PerspectiveCamera(60, 1, 5, 400000);
  const antialias = new TerrainAntialias(renderer, scene, camera);
  const gunSightOverlay =
    flightMode && canvas.parentElement ? new GunSightOverlay(canvas.parentElement) : undefined;
  const mirrors = flightMode ? new CockpitMirrors() : undefined;
  antialias.clouds.quality = cloudQuality;
  antialias.clouds.steps = cloudSteps;
  const world: WorldPosition = { x: 0, y: 4000, z: 0 };
  let yaw = 0,
    pitch = -0.45;
  const data = new ByteCache<Float32Array>(32 * 1024 * 1024);
  const terrainMaterials = new Set<MeshStandardMaterial>();
  let paintRequest = 0;
  const patches = new ByteCache<PatchResource>(96 * 1024 * 1024, (p) => {
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    terrainMaterials.delete(p.material);
    p.material.dispose();
  });
  const transition = new SourceTransition();
  const outgoing = new Set<string>();
  let seamSignature = '';
  let seams: TerrainSeams[] = [];
  const visible = new Set<string>(),
    pending = new Set<string>(),
    failed = new Set<string>();
  let imagery: DataTexture | undefined;
  let imageryBytes = 0;
  const seasonalSatellite = new SeasonalSatellite();
  let water: WaterLayer | undefined;
  let shoreline: ShoreLayer | undefined;
  let reportedWaterBytes = 0;
  let desired: TerrainChunk[] = [],
    displayed: TerrainChunk[] = [],
    manifest: TheaterManifest | undefined,
    folder = '';
  let disposed = false,
    paused = false,
    teleportRequest = 0,
    raf = 0,
    last = performance.now(),
    lastSelect = -Infinity,
    lastStats = last,
    lastFlightUi = last,
    uploadedAtStats = 0;
  const frameTimes: number[] = [];
  const SHADOW_TARGET = new Vector3();
  // Coverage drift, metres. Sampling is `worldXZ + cloudOffset`, so the pattern
  // travels with the wind when the offset moves against it.
  const cloudOffset = { x: 0, z: 0 };
  let cloudEvolutionSeconds = 0;
  const cirrusOffset = { x: 0, z: 0 };
  const cloudSun = new Vector3();
  const cloudFog = new Color();
  const environmentDiagnostics = (): EnvironmentDiagnostics => {
    const { sun, moon, settings } = {
      sun: environment.sun,
      moon: environment.moon,
      settings: environment.settings,
    };
    const hours = Math.floor(settings.timeOfDayHours);
    const minutes = Math.floor((settings.timeOfDayHours - hours) * 60);
    const wind = environment.windAt(world, environment.settings.timeOfDayHours * 3600);
    const speed = Math.hypot(wind.x, wind.z);
    return {
      timeOfDayHours: settings.timeOfDayHours,
      timeText: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      year: settings.year,
      dayOfYear: settings.dayOfYear,
      season: environment.season,
      sunElevationDeg: (sun.elevationRad * 180) / Math.PI,
      sunAzimuthDeg: (sun.azimuthRad * 180) / Math.PI,
      moonElevationDeg: (moon.elevationRad * 180) / Math.PI,
      moonAzimuthDeg: (moon.azimuthRad * 180) / Math.PI,
      moonPhase: moon.phase,
      moonWaxing: moon.waxing,
      weather: settings.weather,
      weatherLabel: WEATHER_PRESETS[settings.weather].label,
      wind: settings.wind,
      windLabel: WIND_PRESETS[settings.wind].label,
      windAtCamera: wind,
      windSpeed: speed,
      windBearingDeg:
        speed < 1e-6 ? 0 : ((Math.atan2(-wind.x, wind.z) * 180) / Math.PI + 540) % 360,
      cloudQuality,
      cloudSteps,
      shadow: sky.shadowDiagnostics(),
    };
  };
  const d: TerrainDiagnostics = {
    environment: environmentDiagnostics(),
    contrast,
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
    contrast,
    environment: environmentDiagnostics(),
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
    antialias.resize(w, h);
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
  const loadPaint = async (m: TheaterManifest, mode: string): Promise<void> => {
    const meta =
      mode === 'satellite'
        ? m.imagery
        : mode === 'summer' || mode === 'spring' || mode === 'autumn' || mode === 'winter'
          ? m.colorMaps?.[mode]
          : undefined;
    if (!meta) throw new Error('This terrain does not contain the selected color map');
    const request = ++paintRequest;
    if (Math.max(meta.width, meta.height) > renderer.capabilities.maxTextureSize)
      throw new Error('Terrain imagery exceeds this GPU’s texture size limit');
    const compressed = await platform.fs.readBytes(root, folder + meta.path);
    if (disposed || request !== paintRequest) return;
    const pixels = await decodeTerrainBytes(compressed, meta, meta.width * meta.height * 4);
    if (reflectedWidth(m) !== undefined) reflectPixels(pixels, meta.width, meta.height, 4);
    if (disposed || request !== paintRequest) return;
    const next = new DataTexture(pixels, meta.width, meta.height);
    next.colorSpace = SRGBColorSpace;
    next.generateMipmaps = true;
    next.minFilter = LinearMipmapLinearFilter;
    next.magFilter = LinearFilter;
    next.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    next.needsUpdate = true;
    const previous = imagery;
    imagery = next;
    for (const material of terrainMaterials) {
      material.map = next;
      material.vertexColors = false;
      material.needsUpdate = true;
    }
    previous?.dispose();
    imageryBytes = pixels.byteLength + Math.ceil((pixels.byteLength * 4) / 3);
    d.uploadBytesTotal += Math.ceil((pixels.byteLength * 4) / 3);
    d.paint = mode;
    delete d.imageryAttribution;
    if (meta.attributionDisplay !== 'credits') d.imageryAttribution = meta.attribution;
    update(diagnostics());
  };
  void (async () => {
    const path = safeRelativePath(manifestPath);
    folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    const text = await platform.fs.readText(root, path);
    const m = orientManifest(parseManifest(text));
    if (disposed) return;
    d.paintModes = [...(m.imagery ? ['satellite'] : []), ...Object.keys(m.colorMaps ?? {})];
    const requestedPaint = mission.paint;
    // The date picks the color map when the dataset has one; the manual
    // Ground colors selector still overrides it afterwards.
    const seasonal = environment.season;
    if (d.paintModes.length)
      await loadPaint(
        m,
        requestedPaint ??
          (m.colorMaps?.[seasonal]
            ? seasonal
            : m.colorMaps?.summer
              ? 'summer'
              : m.imagery
                ? 'satellite'
                : d.paintModes[0]!),
      );
    if (disposed) return;
    manifest = m;
    // The pipeline's LAEA centre is the theater's latitude and longitude.
    const centre = theaterCenterFromCrs(m.projection.crs);
    if (centre) {
      environment.settings.latitudeDeg = centre.latitudeDeg;
      environment.settings.longitudeDeg = centre.longitudeDeg;
    }
    d.name = m.name;
    d.source = m.source;
    d.attribution = [
      ...m.attribution,
      ...new Set(
        [...(m.imagery ? [m.imagery] : []), ...Object.values(m.colorMaps ?? {})].flatMap(
          (image) => [image.attribution, image.license],
        ),
      ),
    ];
    const pose = initialCamera(m, mission.camera);
    Object.assign(world, pose.position);
    yaw = pose.yaw;
    pitch = pose.pitch;
    water = new WaterLayer(scene, m.waterBodies, new WaterWorkerBuilder());
    if (m.shorelines) {
      const raw = await decodeTerrainBytes(
        await platform.fs.readBytes(root, folder + m.shorelines.path),
        m.shorelines,
        m.shorelines.decodedBytes,
      );
      if (disposed) return;
      shoreline = new ShoreLayer(
        scene,
        orientShorelines(m, parseShorelines(new TextDecoder().decode(raw), m.extents)),
        m.waterBodies,
        fail,
      );
    }
    if (flightMode) {
      const layer = await FlightLayer.create(scene, m, platform, root, folder, mission);
      if (disposed) {
        layer.dispose();
        return;
      }
      flight = layer;
      flight.setGunMode(gunMode);
      flight.setPaused(paused);
      flight.environmentModel = environment;
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
      if (water?.error) fail(new Error(water.error));
      if (scene.fog instanceof Fog) {
        scene.fog.near = horizon * 0.825;
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
          chunk.originX + patch.x + patch.span <= 0 ||
          chunk.originZ + patch.z >= manifest.extents.height
        )
          continue;
        const key = `${chunk.path}:${patch.key}`;
        nextVisible.add(key);
        let resource = patches.get(key);
        if (!resource) {
          const built = buildPatch(chunk, samples, patch, manifest.extents),
            material = new MeshStandardMaterial({
              vertexColors: !imagery,
              map: imagery ?? null,
              roughness: 1,
              side: DoubleSide,
            });
          terrainMaterials.add(material);
          const shoreMaskUniform: { value: Texture | null } = { value: null };
          const shoreMaskActive = { value: false };
          const morphUniform = { value: 0 };
          const fadeUniform = { value: 1 };
          const outgoingUniform = { value: false };
          material.onBeforeCompile = (shader) => {
            shader.uniforms.shoreWaterMask = shoreMaskUniform;
            shader.uniforms.shoreMaskActive = shoreMaskActive;
            shader.uniforms.shorePatchSpan = { value: patch.span };
            shader.uniforms.terrainMorph = morphUniform;
            shader.uniforms.sourceFade = fadeUniform;
            shader.uniforms.sourceOutgoing = outgoingUniform;
            shader.vertexShader =
              'varying vec2 vShoreMaskUv; uniform float shorePatchSpan;\nattribute float seamHeight;\nattribute vec3 seamNormal;\nattribute float seamWeight;\nattribute float coarseHeight;\nattribute vec3 coarseNormal;\nattribute vec3 coarseColor;\nuniform float terrainMorph;\n' +
              shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\nvShoreMaskUv=position.xz/shorePatchSpan;\ntransformed.y=mix(mix(position.y,coarseHeight,terrainMorph),seamHeight,seamWeight);',
            );
            shader.vertexShader = shader.vertexShader.replace(
              '#include <beginnormal_vertex>',
              '#include <beginnormal_vertex>\nobjectNormal=mix(normalize(mix(normal,coarseNormal,terrainMorph)),seamNormal,seamWeight);',
            );
            shader.vertexShader = shader.vertexShader.replace(
              '#include <color_vertex>',
              '#include <color_vertex>\n#ifdef USE_COLOR\nvColor.rgb=mix(color,coarseColor,terrainMorph);\n#endif',
            );
            shader.fragmentShader =
              'uniform sampler2D shoreWaterMask; uniform bool shoreMaskActive; varying vec2 vShoreMaskUv;\nuniform float sourceFade;\nuniform bool sourceOutgoing;\n' +
              shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <clipping_planes_fragment>',
              `#include <clipping_planes_fragment>
              if(shoreMaskActive && texture2D(shoreWaterMask,vShoreMaskUv).r>0.5) discard;
              // Complementary screen-space masks: depth-writing opaque surfaces,
              // no coincident alpha blend or dependence on source-grid nesting.
              float sourceNoise=fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(0.06711056,0.00583715))));
              if(sourceOutgoing ? sourceNoise<sourceFade : sourceNoise>=sourceFade) discard;`,
            );
            patchCloudShadow(shader);
            patchTerrainLightContrast(shader);
            seasonalSatellite.patch(shader);
          };
          material.customProgramCacheKey = () =>
            'terrain-shared-edge-imagery-v7-seasonal-satellite';
          const mesh = new Mesh(built.geometry, material);
          // The patch rewrites `transformed` inside begin_vertex, which runs
          // before Three's shadow chunk, so morphed heights reach the receiver.
          mesh.receiveShadow = true;
          mesh.onBeforeRender = () => {
            shoreMaskActive.value = shoreMaskUniform.value !== null;
          };
          resource = {
            mesh,
            shoreMaskUniform,
            material,
            morphUniform,
            patch,
            fadeUniform,
            outgoingUniform,
            chunk,
            x: patch.x,
            z: patch.z,
            bytes: built.bytes,
            seam: { geometry: built.geometry, chunk, patch, morph: 0 },
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
    if (paused) {
      raf = requestAnimationFrame(frame);
      return;
    }
    // The clock runs in real time; time acceleration is deferred.
    environment.advance(frameSeconds);
    cloudEvolutionSeconds += dt;
    seasonalSatellite.update(
      environment.settings.dayOfYear + environment.settings.timeOfDayHours / 24,
      environment.settings.latitudeDeg,
      manifest?.id,
      d.paint,
    );
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
    camera.updateMatrixWorld(true);
    gunSightOverlay?.update(d.flight, camera, d.origin, d.width, d.height);
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
      p.seam.morph = p.morphUniform.value;
    }
    const signature = [...visible].join('|') + ':' + [...outgoing].join('|');
    if (signature !== seamSignature) {
      seamSignature = signature;
      const previous = seams;
      seams = [visible, outgoing]
        .filter((set) => set.size > 0)
        .map((set) => {
          const items = [...set].flatMap((key) => {
            const p = patches.get(key);
            return p ? [p.seam] : [];
          });
          const old = previous.find((graph) => graph.patches[0]?.chunk.lod === items[0]?.chunk.lod);
          return new TerrainSeams(items, old);
        });
    }
    for (const seam of seams) {
      d.uploadBytesTotal += seam.update(dt);
    }
    shoreline?.update(
      [...visible, ...outgoing].flatMap((key) => {
        const p = patches.get(key);
        return p ? [p] : [];
      }),
      world,
    );
    d.shorelineTriangles = shoreline?.triangles ?? 0;
    d.shorelineBytes = shoreline?.bytes ?? 0;
    d.shorelinePending = shoreline?.pending ?? 0;
    d.shorelineOmitted = shoreline?.omitted ?? 0;
    water?.rebase(d.origin);
    d.waterCacheBytes = water?.bytes ?? 0;
    d.waterBatches = water?.count ?? 0;
    d.waterBatchesPending = water?.pending ?? 0;
    d.waterBatchesOmitted = water?.omitted ?? 0;
    const waterBytes = water?.uploadedBytes ?? 0;
    d.uploadBytesTotal += waterBytes - reportedWaterBytes;
    reportedWaterBytes = waterBytes;
    // Aim the shadow box at the aircraft, along the sun, down to the ground.
    if (flightMode && flight) {
      const pose = flight.pose();
      SHADOW_TARGET.set(
        pose.position.x - d.origin.x,
        pose.position.y,
        pose.position.z - d.origin.z,
      );
      const ground = flight.ground.sample(pose.position.x, pose.position.z)?.height ?? 0;
      const key = environment.sun.elevationRad > 0 ? environment.sun : environment.moon;
      // Distance along the light to reach the ground plane below the aircraft.
      const height = Math.max(1, pose.position.y - ground);
      sky.setShadowTarget(
        SHADOW_TARGET,
        height / Math.max(0.05, Math.abs(key.direction.y)),
        // Coarser source LODs have longer triangles, so acne needs a larger offset.
        1 + d.sourceLod * 1.5,
      );
    }
    sky.update(environment, camera, dt);
    const layer = marchedLayer(environment.weather);
    const cirrus = environment.weather.layers.find((l) => l.type === 'cirrus');
    if (layer) {
      const drift = environment.layerWind((layer.baseM + layer.topM) / 2);
      const bearing = ((drift.bearingDeg + 180) * Math.PI) / 180;
      cloudOffset.x += Math.sin(bearing) * drift.speed * dt;
      cloudOffset.z -= Math.cos(bearing) * drift.speed * dt;
    }
    if (cirrus) {
      const drift = environment.layerWind(cirrus.baseM);
      const bearing = ((drift.bearingDeg + 180) * Math.PI) / 180;
      cirrusOffset.x += Math.sin(bearing) * drift.speed * dt;
      cirrusOffset.z -= Math.cos(bearing) * drift.speed * dt;
    }
    const key = environment.sun.elevationRad > 0 ? environment.sun : environment.moon;
    cloudSun.set(key.direction.x, key.direction.y, key.direction.z);
    antialias.clouds.update({
      offset: cloudOffset,
      evolutionSeconds: cloudEvolutionSeconds,
      cirrusOffset,
      layer,
      cirrus,
      sunDirection: cloudSun,
      sunColor: sky.sun.color,
      sunIntensity: sky.sun.intensity,
      zenithColor: sky.ambient.color,
      groundColor: sky.ambient.groundColor,
      ambientIntensity: sky.ambient.intensity,
      origin: d.origin,
      fogColor: scene.fog instanceof Fog ? scene.fog.color : cloudFog,
      fogNear: scene.fog instanceof Fog ? scene.fog.near : 80000,
      fogFar: scene.fog instanceof Fog ? scene.fog.far : 180000,
    });
    renderer.info.reset();
    antialias.render();
    if (mirrors && flight && d.flight?.cameraMode === 'cockpit') {
      mirrors.render(renderer, scene, camera.position, flight.pose().attitude, now, (render) =>
        flight!.withAircraftVisible(render),
      );
      d.mirrors = mirrors.diagnostics();
    }
    d.frames++;
    d.triangles = renderer.info.render.triangles;
    d.drawCalls = renderer.info.render.calls;
    d.cpuMs = performance.now() - start;
    d.loadedChunks = data.size;
    d.pendingChunks = pending.size;
    d.cacheBytes =
      data.bytes +
      patches.bytes +
      d.waterCacheBytes +
      imageryBytes +
      antialias.bytes +
      (mirrors?.bytes ?? 0) +
      antialias.clouds.bytes +
      sky.bytes +
      (shoreline?.bytes ?? 0);
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
    setMusicEnabled(enabled: boolean): void {
      flight?.setMusicEnabled(enabled);
      if (flight) d.flight = flight.diagnostics();
      update(diagnostics());
    },
    setGunMode(mode: MissionParams['gunMode']): void {
      gunMode = mode;
      flight?.setGunMode(mode);
    },
    setMusicVolume(volume: number): void {
      flight?.setMusicVolume(volume);
      if (flight) d.flight = flight.diagnostics();
      update(diagnostics());
    },
    setCockpitMirrors(layout: CockpitMirrorLayout): void {
      mirrors?.setLayout(layout);
    },
    setPaused(value: boolean): void {
      paused = value;
      keys.clear();
      last = performance.now();
      flight?.setPaused(value);
    },
    async setTerrainPaint(mode: string): Promise<void> {
      if (disposed || !manifest) throw new Error('Terrain viewer is not ready');
      await loadPaint(manifest, mode);
    },
    setNavigationTarget(point: { id: number; x: number; z: number } | undefined): void {
      flight?.setNavigationTarget(point);
    },
    async teleportToWaypoint(point: TeleportWaypoint): Promise<void> {
      const request = ++teleportRequest;
      if (disposed || !manifest || (flightMode && !flight))
        throw new Error('Terrain viewer is not ready');
      if (flight) {
        await flight.teleportToWaypoint(point);
        if (disposed || request !== teleportRequest)
          throw new Error('Waypoint teleport was superseded');
        Object.assign(world, flight.pose().camera);
        d.flight = flight.diagnostics();
      } else {
        const destination = waypointDestination(manifest, point);
        const bytes = await platform.fs.readBytes(root, folder + destination.chunk.path);
        await decodeChunk(bytes, destination.chunk);
        if (disposed || request !== teleportRequest)
          throw new Error('Waypoint teleport was superseded');
        Object.assign(world, destination.position);
        yaw = destination.yaw;
        pitch = -0.45;
        d.yaw = yaw;
        d.pitch = pitch;
        keys.clear();
      }
      lastSelect = -Infinity;
      update(diagnostics());
    },
    setFuelFraction(fraction: number) {
      flight?.setFuelFraction(fraction);
    },
    setTimeOfDay(hours: number) {
      environment.setTimeOfDay(hours);
      update(diagnostics());
    },
    setDate(year: number, dayOfYear: number) {
      environment.setDate(year, dayOfYear);
      update(diagnostics());
    },
    setWeather(id: WeatherId) {
      environment.setWeather(id);
      update(diagnostics());
    },
    setWind(id: WindPresetId) {
      environment.setWind(id);
      update(diagnostics());
    },
    setCloudQuality(quality: CloudQuality) {
      cloudQuality = quality;
      antialias.clouds.quality = quality;
      update(diagnostics());
    },
    dispose() {
      disposed = true;
      teleportRequest++;
      paintRequest++;
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
      shoreline?.dispose();
      imagery?.dispose();
      flight?.dispose();
      mirrors?.dispose();
      gunSightOverlay?.dispose();
      antialias.dispose();
      sky.dispose();
      renderer.dispose();
      if (window.__terrainDiagnostics === diagnostics) delete window.__terrainDiagnostics;
    },
  };
}
