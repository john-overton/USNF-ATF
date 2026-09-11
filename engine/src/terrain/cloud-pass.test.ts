import { expect, test } from 'bun:test';
import { Color, PerspectiveCamera, Vector2, Vector3 } from 'three';
import {
  CloudPass,
  MARCH_FRAGMENT,
  SHADOW_CHUNK,
  cloudLightingFactors,
  cloudScaleFor,
  createCloudShadowUniforms,
  updateCloudShadowUniforms,
  type CloudUniformState,
} from './cloud-pass';
import { COVERAGE_TILE_METERS, WEATHER_PRESETS, marchedLayer } from '../sim/environment/clouds';

/** Three constructs headlessly under bun; only an actual draw needs a GL context. */
const pass = (): CloudPass => new CloudPass(new PerspectiveCamera(60, 1, 5, 400000));

const state = (): CloudUniformState => ({
  offset: { x: 1200, z: -400 },
  evolutionSeconds: 120,
  cirrusOffset: { x: 100, z: 200 },
  layer: marchedLayer(WEATHER_PRESETS.broken),
  cirrus: WEATHER_PRESETS.broken.layers[1]!,
  sunDirection: new Vector3(0.3, 0.9, -0.2).normalize(),
  sunColor: new Color(1, 0.94, 0.82),
  sunIntensity: 2.4,
  zenithColor: new Color(0.2, 0.35, 0.7),
  groundColor: new Color(0.3, 0.29, 0.26),
  ambientIntensity: 1.7,
  origin: { x: 8192, z: -16384 },
  fogColor: new Color(0x91b1c8),
  fogNear: 80000,
  fogFar: 180000,
});

test('cloud quality maps to a march scale and off disables the pass', () => {
  expect(cloudScaleFor('full')).toBe(1);
  expect(cloudScaleFor('half')).toBe(0.5);
  expect(cloudScaleFor('quarter')).toBe(0.25);
  expect(cloudScaleFor('off')).toBe(0);
  const p = pass();
  expect(p.enabled).toBe(true);
  p.quality = 'off';
  expect(p.enabled).toBe(false);
  expect(p.bytes).toBe(0);
  p.quality = 'full';
  expect(p.enabled).toBe(true);
  p.dispose();
});

test('cloud lighting follows direct and hemisphere intensity rather than retaining white fill', () => {
  expect(cloudLightingFactors(2.4, 1.7)).toEqual({ direct: 1, ambient: 1 });
  const twilight = cloudLightingFactors(1.08, 0.2);
  expect(twilight.direct).toBeCloseTo(0.45, 5);
  expect(twilight.ambient).toBeLessThan(0.12);
  expect(MARCH_FRAGMENT).toContain('uniform float cloudSunStrength;');
  expect(MARCH_FRAGMENT).toContain('uniform float cloudAmbientStrength;');
});

test('setSize recomputes the low-resolution target and its byte estimate', () => {
  const p = pass();
  p.quality = 'half';
  p.setSize(2560, 1440);
  expect(p.resolution).toEqual({ width: 1280, height: 720 });
  expect(p.bytes).toBe(1280 * 720 * 4);
  p.quality = 'quarter';
  expect(p.resolution).toEqual({ width: 640, height: 360 });
  expect(p.bytes).toBe(640 * 360 * 4);
  p.quality = 'full';
  expect(p.resolution).toEqual({ width: 2560, height: 1440 });
  expect(p.bytes).toBe(2560 * 1440 * 4);
  p.dispose();
});

test('step count is a uniform so the panel can retune the march', () => {
  const p = pass();
  expect(p.steps).toBe(40);
  p.steps = 96;
  expect(p.steps).toBe(96);
  p.dispose();
});

test('shadow uniform boxes are shared so one write updates every material', () => {
  const a = createCloudShadowUniforms(),
    b = createCloudShadowUniforms();
  for (const key of Object.keys(a)) expect(a[key]).toBe(b[key]);
  const s = state();
  updateCloudShadowUniforms(a, s);
  expect(b.cloudOffset!.value).toEqual(new Vector2(1200, -400));
  expect(b.cloudOrigin!.value).toEqual(new Vector2(8192, -16384));
  expect(b.cloudSunDirection!.value).toEqual(s.sunDirection);
  expect(b.cloudBaseM!.value).toBe(1200);
  expect(b.cloudCoverageAmount!.value).toBe(0.6);
  expect(b.cloudTileMeters!.value).toBe(COVERAGE_TILE_METERS);
  // A cirrus-only preset must not leave the last layer's coverage casting shadows.
  updateCloudShadowUniforms(a, { ...s, layer: marchedLayer(WEATHER_PRESETS.clear) });
  expect(b.cloudCoverageAmount!.value).toBe(0);
});

test('the shadow chunk declares every uniform the shared set provides', () => {
  const declared = new Set(
    [...SHADOW_CHUNK.matchAll(/^uniform\s+\w+\s+(\w+)\s*;/gm)].map((m) => m[1]!),
  );
  const provided = Object.keys(createCloudShadowUniforms());
  for (const name of provided) expect([...declared]).toContain(name);
  expect(declared.size).toBe(provided.length);
});

test('the march shader reconstructs log depth, clips to it and honours the step uniform', () => {
  expect(MARCH_FRAGMENT).toContain('pow(cameraFar + 1.0, d) - 1.0');
  expect(MARCH_FRAGMENT).toContain('uniform int cloudSteps;');
  expect(MARCH_FRAGMENT).toContain('i < cloudSteps');
  expect(MARCH_FRAGMENT).toContain('sceneDistance');
  // The march must share the shadow chunk's coverage sampling, not a copy of it.
  expect(MARCH_FRAGMENT).toContain(SHADOW_CHUNK);
  expect(CloudPass.SHADOW_CHUNK).toBe(SHADOW_CHUNK);
});

test('the composite resolves the marched clouds against scene depth at silhouettes', () => {
  const pass = new CloudPass(new PerspectiveCamera(60, 1, 5, 400000));
  const uniforms = (pass as unknown as { compositeMaterial: { uniforms: Record<string, unknown> } })
    .compositeMaterial.uniforms;
  // Without the scene depth and the marched texel size the composite can only blend,
  // which is what smeared cloud over the aircraft whenever cloud rendered behind it.
  for (const name of ['tDiffuse', 'tClouds', 'tDepth', 'cloudTexel', 'cloudHasDepth'])
    expect(Object.keys(uniforms)).toContain(name);
  pass.dispose();
});

test('weather switches reset tower shading and retain explicit animation state', () => {
  const p = pass();
  const s = state();
  const uniforms = (
    p as unknown as { marchMaterial: { uniforms: Record<string, { value: unknown }> } }
  ).marchMaterial.uniforms;
  const storm = marchedLayer(WEATHER_PRESETS.storm)!;
  expect(storm.type).toBe('cumulonimbus');
  expect(storm.topM - storm.baseM).toBeGreaterThan(8000);
  expect(WEATHER_PRESETS.storm.layers[1]!.baseM).toBeGreaterThan(storm.topM);
  p.update({ ...s, layer: storm });
  expect(uniforms.cloudTower!.value).toBe(1);
  p.update(s);
  expect(uniforms.cloudTower!.value).toBe(0);
  expect(uniforms.cloudStratus!.value).toBe(0);
  const phase = uniforms.cloudEvolution!.value;
  p.update(s);
  expect(uniforms.cloudEvolution!.value).toBe(phase);
  expect(uniforms.cirrusOffset!.value).toEqual(new Vector2(100, 200));
  p.update({ ...s, layer: marchedLayer(WEATHER_PRESETS.overcast) });
  expect(uniforms.cloudStratus!.value).toBe(1);
  p.update({ ...s, layer: undefined });
  expect(uniforms.cloudMarch!.value).toBe(0);
  expect(uniforms.cloudTower!.value).toBe(0);
  p.dispose();
});
