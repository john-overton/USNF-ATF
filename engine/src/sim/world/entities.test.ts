import { expect, test } from 'bun:test';
import {
  MIN_ALTITUDE_M,
  SPAWN_RANGE_M,
  seededUnit,
  spawnEntities,
  stepEntities,
  type WorldEntity,
} from './entities';
import { FixedStepClock } from '../FixedStepClock';
import { DEFAULT_MISSION, type MissionParams } from '../mission/params';

const mission = (seed: number, count = 2): MissionParams => ({
  ...DEFAULT_MISSION,
  mode: 'quick-fight',
  seed,
  opponents: Array.from({ length: count }, (_, index) => ({
    aircraft: index === 0 ? ('a4e' as const) : ('x31' as const),
    skill: 2 as const,
  })),
});
const player = { position: { x: 300000, y: 4000, z: 400000 }, headingRad: 0.6 };

test('the same seed spawns the same aircraft in the same places, and a different one does not', () => {
  expect(spawnEntities(mission(7), player)).toEqual(spawnEntities(mission(7), player));
  expect(spawnEntities(mission(8), player)).not.toEqual(spawnEntities(mission(7), player));
  expect(seededUnit(7, 0)).toBe(seededUnit(7, 0));
  expect(seededUnit(7, 0)).not.toBe(seededUnit(7, 1));
  for (let index = 0; index < 200; index++) {
    const value = seededUnit(index * 31, index);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  }
});

test('opponents spawn ahead of the player, spread across its track and never underground', () => {
  const entities = spawnEntities(mission(3), player);
  expect(entities).toHaveLength(2);
  expect(entities.map((entity) => entity.aircraft)).toEqual(['a4e', 'x31']);
  expect(entities.map((entity) => entity.id)).toEqual([1, 2]);
  for (const entity of entities) {
    const range = Math.hypot(
      entity.position.x - player.position.x,
      entity.position.z - player.position.z,
    );
    expect(range).toBeGreaterThan(SPAWN_RANGE_M * 0.7);
    expect(range).toBeLessThan(SPAWN_RANGE_M * 1.3);
    expect(entity.position.y).toBeGreaterThanOrEqual(MIN_ALTITUDE_M);
    // Head-on: the opponent flies back down the player's own bearing.
    expect(Math.cos(entity.profile.headingRad - (player.headingRad + Math.PI))).toBeCloseTo(1, 12);
  }
  // Both in the same piece of sky would be a spawn bug, not a formation.
  expect(
    Math.hypot(
      entities[0]!.position.x - entities[1]!.position.x,
      entities[0]!.position.z - entities[1]!.position.z,
    ),
  ).toBeGreaterThan(1);
});

test('a fixed step moves an entity by exactly its speed, and counts the step', () => {
  const [entity] = spawnEntities(mission(11, 1), player) as [WorldEntity];
  const dt = 1 / 120;
  const [stepped] = stepEntities([entity], dt) as [WorldEntity];
  expect(stepped.steps).toBe(1);
  expect(
    Math.hypot(stepped.position.x - entity.position.x, stepped.position.z - entity.position.z),
  ).toBeCloseTo(entity.profile.speedMps * dt, 9);
  // Straight and level: the mock holds its altitude exactly.
  expect(stepped.position.y).toBe(entity.profile.altitudeM);
});

test('three aircraft advance at exactly 120 Hz and are bit-identical across render rates', () => {
  const results: WorldEntity[][] = [];
  const stepCounts: number[] = [];
  for (const hz of [30, 60, 144]) {
    const clock = new FixedStepClock();
    let entities = spawnEntities(mission(42, 2), player);
    let steps = 0;
    let frames = 0;
    while (steps < 2400) {
      const update = clock.advance(1 / hz, (dt) => {
        if (steps >= 2400) return;
        entities = stepEntities(entities, dt);
        steps++;
      });
      expect(update.clamped).toBe(false);
      frames++;
      expect(frames).toBeLessThan(4000);
    }
    // Twenty simulated seconds, whatever the frame rate was.
    expect(steps).toBe(2400);
    expect(entities.every((entity) => entity.steps === 2400)).toBe(true);
    results.push(entities);
    stepCounts.push(steps);
  }
  expect(stepCounts).toEqual([2400, 2400, 2400]);
  // The player makes three aircraft in the sky with two opponents.
  expect(results[0]).toHaveLength(2);
  expect(results[1]).toEqual(results[0]);
  expect(results[2]).toEqual(results[0]);
});
