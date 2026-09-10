import { expect, test } from 'bun:test';
import { BoxGeometry, DataTexture, Group, Mesh, MeshStandardMaterial, Scene } from 'three';
import { AircraftDamage, splitAirframe, disposeFragments } from './AircraftDamage';
import { AircraftBreakup } from './AircraftBreakup';
import { CombatWorld } from '../sim/combat/world';
import { DEFAULT_MISSION } from '../sim/mission/params';
import { createFlightState } from '../sim/flight';

function airframe() {
  const group = new Group();
  group.add(new Mesh(new BoxGeometry(12, 2, 16), new MeshStandardMaterial({ color: 0xabcdef })));
  return group;
}
test('damage materials are per-instance and clean appearance restores exactly', () => {
  const first = airframe(),
    second = first.clone(true);
  const source = (first.children[0] as Mesh).material as MeshStandardMaterial;
  const map = new DataTexture();
  source.userData.originalMap = map;
  const skin = new AircraftDamage(second);
  skin.update(80);
  const damaged = (second.children[0] as Mesh).material as MeshStandardMaterial;
  expect(damaged.userData.originalMap).toBe(map);
  expect(damaged.color.r).toBeLessThan(source.color.r);
  expect(source.color.getHex()).toBe(0xabcdef);
  skin.update(0);
  expect(damaged.color).toEqual(source.color);
  skin.dispose();
});
test('breakup conserves indexed triangles and UVs without changing the source', () => {
  const model = airframe();
  model.position.set(100000, 5000, 250000);
  const original = (model.children[0] as Mesh).geometry.getAttribute('position').array.slice();
  const pieces = splitAirframe(model);
  let vertices = 0;
  for (const { group } of pieces)
    for (const child of group.children) {
      const geometry = (child as Mesh).geometry;
      vertices += geometry.getAttribute('position').count;
      expect(geometry.getAttribute('uv').count).toBe(geometry.getAttribute('position').count);
    }
  expect(vertices).toBe(36);
  expect((model.children[0] as Mesh).geometry.getAttribute('position').array).toEqual(original);
  expect(pieces.filter((p) => p.group.children.length).length).toBeGreaterThan(1);
  disposeFragments(pieces);
});
test('breakup advances deterministically, expires, and resets for a new world', () => {
  const state = createFlightState({ position: { x: 0, y: 100, z: 0 }, airspeed: 150 });
  const world = new CombatWorld(DEFAULT_MISSION, state, new Map());
  world.events.push({
    id: 1,
    step: 0,
    type: 'destroyed',
    cause: 'gun',
    point: state.position,
    velocity: state.velocity,
    attitude: state.attitude,
    shooterId: 1,
    targetId: 0,
  });
  const run = (stride: number) => {
    const scene = new Scene(),
      effects = new AircraftBreakup(scene),
      model = airframe();
    for (let tick = 0; tick <= 240; tick += stride) {
      world.steps = tick;
      effects.render(
        world,
        { x: 1000, z: 2000 },
        () => model,
        () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, kind: 'land' }),
      );
    }
    const positions = scene.children.map((p) => p.position.toArray());
    expect(effects.diagnostics().wrecks).toBe(1);
    world.steps = 2401;
    effects.render(
      world,
      { x: 0, z: 0 },
      () => model,
      () => undefined,
    );
    expect(effects.diagnostics().wrecks).toBe(0);
    effects.reset();
    world.steps = 0;
    effects.render(
      world,
      { x: 0, z: 0 },
      () => model,
      () => undefined,
    );
    expect(effects.diagnostics().wrecks).toBe(1);
    effects.dispose();
    expect(scene.children).toHaveLength(0);
    return positions;
  };
  expect(run(1)).toEqual(run(4));
});
