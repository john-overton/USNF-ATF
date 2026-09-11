import type { Platform } from '../platform/Platform';
import { expect, test } from 'bun:test';
import { parseRetailAircraft } from './RetailAircraft';
import type { DataTexture, Mesh, MeshStandardMaterial } from 'three';

const triangle = {
  version: 1,
  name: 'Synthetic aircraft',
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  colors: [1, 1, 1, 1, 1, 1, 1, 1, 1],
  limitations: [],
};
test('aircraft import rejects malformed triangles, nonfinite geometry and mismatched textures', () => {
  expect(parseRetailAircraft(triangle).name).toBe('Synthetic aircraft');
  expect(() => parseRetailAircraft({ ...triangle, positions: [0, 0, 0] })).toThrow();
  expect(() =>
    parseRetailAircraft({ ...triangle, positions: [NaN, ...triangle.positions.slice(1)] }),
  ).toThrow();
  expect(() => parseRetailAircraft({ ...triangle, uvs: [0, 0] })).toThrow();
  expect(() =>
    parseRetailAircraft({ ...triangle, texture: { width: 2, height: 2, rgba: [255] } }),
  ).toThrow();
  expect(() =>
    parseRetailAircraft({ ...triangle, parts: [{ ...triangle, pivot: [0, Infinity, 0] }] }),
  ).toThrow();
});

test('selected aircraft reads its own model and missing imports remain explicit', async () => {
  const { RetailAircraft } = await import('./RetailAircraft');
  const { aircraftId } = await import('./aircraft-catalog');
  const reads: string[] = [];
  const platform = {
    fs: {
      exists: (_root: string, path: string) => Promise.resolve(path === 'aircraft/x31.json'),
      readText: (_root: string, path: string) => {
        reads.push(path);
        return Promise.resolve(JSON.stringify(triangle));
      },
    },
  } as unknown as Platform;
  expect(await RetailAircraft.load(platform, 'a4e')).toBeUndefined();
  const model = await RetailAircraft.load(platform, 'x31');
  expect(model?.triangles).toBe(1);
  expect(reads).toEqual(['aircraft/x31.json']);
  model?.dispose();
  expect(aircraftId(null)).toBe('f14');
  for (const value of ['../f14', 'constructor', 'unknown', ''])
    expect(() => aircraftId(value)).toThrow('Unknown aircraft');
});

test('texture cutouts retain alpha testing and opaque depth writes', async () => {
  const { RetailAircraft } = await import('./RetailAircraft');
  const data = {
    ...triangle,
    uvs: [0, 0, 1, 0, 0, 1],
    texture: { width: 2, height: 1, rgba: [255, 255, 255, 0, 255, 255, 255, 255] },
  };
  const platform = {
    fs: {
      exists: () => Promise.resolve(true),
      readText: () => Promise.resolve(JSON.stringify(data)),
    },
  } as unknown as Platform;
  const model = await RetailAircraft.load(platform);
  const mesh = model!.parts.get(triangle.name)!.children[0] as Mesh;
  const material = mesh.material as MeshStandardMaterial;
  expect(material.alphaTest).toBe(0.5);
  expect(material.transparent).toBe(false);
  expect(material.depthWrite).toBe(true);
  expect((material.map as DataTexture).image.data![3]).toBe(0);
  expect((material.map as DataTexture).image.data![7]).toBe(255);
  model!.dispose();
});

test('keyed skin keeps its palette base through damage clones and cloud shadows', async () => {
  const { RetailAircraft } = await import('./RetailAircraft');
  const { AircraftDamage } = await import('./AircraftDamage');
  const { applyCloudShadow } = await import('../terrain/cloud-shadow');
  const { FrontSide, LinearMipmapLinearFilter } = await import('three');
  const data = {
    ...triangle,
    cullBackfaces: true,
    textureBase: true,
    decal: false,
    uvs: [0, 0, 1, 0, 0, 1],
    texture: { width: 1, height: 1, rgba: [255, 255, 255, 0] },
  };
  const model = await RetailAircraft.load({
    fs: {
      exists: () => Promise.resolve(true),
      readText: () => Promise.resolve(JSON.stringify(data)),
    },
  } as unknown as Platform);
  const damage = new AircraftDamage(model!.group);
  const mesh = model!.parts.get(triangle.name)!.children[0] as Mesh;
  const material = mesh.material as MeshStandardMaterial;
  applyCloudShadow(material, 'test-cloud');
  const shader = {
    uniforms: {},
    vertexShader: '#include <project_vertex>',
    fragmentShader:
      '#include <map_fragment>\n#include <color_fragment>\n#include <lights_fragment_end>',
  };
  material.onBeforeCompile(shader as never, {} as never);
  expect(shader.fragmentShader).toContain('mix(vColor.rgb, paint.rgb, paint.a)');
  expect(shader.fragmentShader).toContain('cloudShadow(vCloudWorld)');
  expect(shader.fragmentShader).not.toContain('#include <color_fragment>');
  expect(material.customProgramCacheKey()).toContain('retail-keyed-base-v1');
  expect(material.side).toBe(FrontSide);
  expect(material.polygonOffset).toBe(false);
  expect(material.map!.minFilter).toBe(LinearMipmapLinearFilter);
  damage.dispose();
  model!.dispose();
});

test('imported textured gear retracts, hides, and reverses without adding placeholder gear', async () => {
  const { RetailAircraft } = await import('./RetailAircraft');
  const data = {
    ...triangle,
    gearHeightM: 1.8,
    parts: [{ ...triangle, name: 'gear-left', gearPose: 'deployed', rotationAxis: [0, 0, 1] }],
  };
  const model = await RetailAircraft.load({
    fs: {
      exists: () => Promise.resolve(true),
      readText: () => Promise.resolve(JSON.stringify(data)),
    },
  } as unknown as Platform);
  expect(model!.hasGear).toBe(true);
  const gear = model!.parts.get('gear-left')!;
  expect(gear.visible).toBe(false);
  model!.setGearFraction(1);
  expect(gear.visible).toBe(true);
  expect(gear.quaternion.w).toBe(1);
  model!.setGearFraction(0.5);
  expect(gear.rotation.z).toBeCloseTo(Math.PI / 4);
  model!.setGearFraction(0);
  expect(gear.visible).toBe(false);
  model!.setGearFraction(1);
  expect(gear.quaternion.w).toBe(1);
  expect(() => parseRetailAircraft({ ...data, gearHeightM: -1 })).toThrow();
  expect(() => parseRetailAircraft({ ...data, cullBackfaces: 'yes' })).toThrow();
  model!.dispose();
});

test('native brakes retain backing and burner state preserves nozzle textures', async () => {
  const { RetailAircraft } = await import('./RetailAircraft');
  const textured = {
    ...triangle,
    uvs: [0, 0, 1, 0, 0, 1],
    texture: { width: 1, height: 1, rgba: [200, 120, 60, 255] },
  };
  const data = {
    ...triangle,
    parts: [
      { ...textured, name: 'exhaust-left-textured' },
      { ...textured, name: 'afterburner-left-textured' },
      {
        ...textured,
        name: 'airbrake-native-left-panel',
        nativeBrakeAngle: -1,
        rotationAxis: [0, 1, 0],
      },
      { ...triangle, name: 'airbrake-native-left-support', nativeBrakeAngle: 0 },
    ],
  };
  const model = (await RetailAircraft.load({
    fs: {
      exists: () => Promise.resolve(true),
      readText: () => Promise.resolve(JSON.stringify(data)),
    },
  } as unknown as Platform))!;
  const nozzle = (model.parts.get('exhaust-left-textured')!.children[0] as Mesh)
    .material as MeshStandardMaterial;
  const map = nozzle.map;
  const brake = model.parts.get('airbrake-native-left-panel')!;
  expect(model.hasAfterburner).toBe(true);
  expect(model.afterburnerVisible).toBe(false);
  expect(brake.visible).toBe(false);
  model.setAirbrakeFraction(0.5);
  expect(brake.rotation.y).toBeCloseTo(0.5);
  expect(model.parts.get(triangle.name)!.visible).toBe(true);
  model.setAirbrakeFraction(1);
  expect(brake.quaternion.w).toBe(1);
  model.setAfterburner(true);
  expect(model.afterburnerVisible).toBe(true);
  model.setAfterburner(false);
  expect(nozzle.map).toBe(map);
  expect(nozzle.color.getHex()).toBe(0xffffff);
  model.setAirbrakeFraction(0);
  expect(model.parts.get('airbrake-native-left-support')!.visible).toBe(false);
  expect(() => parseRetailAircraft({ ...data, nativeBrakeAngle: NaN })).toThrow();
  model.dispose();
});
