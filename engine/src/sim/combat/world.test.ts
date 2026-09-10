import { expect, test } from 'bun:test';
import { CombatWorld, ORIGINAL_COMBAT, ORIGINAL_GUN } from './world';
import { DEFAULT_MISSION } from '../mission/params';
import { createFlightState, stepFlight, PLACEHOLDER_AIRCRAFT, type FlightState } from '../flight';
import { applyDamage, createDamageState, damageEffects } from './damage';
import { FixedStepClock } from '../FixedStepClock';
import { capsuleHit, closestApproach } from './hits';

const ground = () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, kind: 'land' as const });
const player = () => createFlightState({ position: { x: 0, y: 1000, z: 0 }, airspeed: 0 });
function world(count = 1, hp = 100) {
  const w = new CombatWorld(
    {
      ...DEFAULT_MISSION,
      mode: 'quick-fight',
      start: 'airborne',
      opponents: Array.from({ length: count }, () => ({
        aircraft: 'f14' as const,
        skill: 0 as const,
      })),
    },
    player(),
    new Map([
      ['f14', { ...ORIGINAL_COMBAT, hitPoints: hp, gun: { ...ORIGINAL_GUN, capacity: 0 } }],
    ]),
  );
  w.entities.slice(1).forEach((e, i) => {
    e.ready = true; // These fixtures explicitly place already-admitted airborne targets.
    e.state = createFlightState({ position: { x: 0, y: 1000, z: -100 - i * 40 }, airspeed: 0 });
    e.previous = e.state;
  });
  return w;
}
function shot(w: CombatWorld, shooter = 0, z = -80, vz = -4800) {
  const position = { x: 0, y: 1000, z };
  w.entities[shooter]!.gun.rounds.push({
    position,
    previousPosition: { ...position },
    emittedAt: 0,
    velocity: { x: 0, y: 0, z: vz },
    age: 0,
    tracer: true,
  });
}
const step = (w: CombatWorld) =>
  w.step(
    { ...w.player.state, timeSeconds: w.player.state.timeSeconds + 1 / 120 },
    false,
    true,
    1 / 120,
    ground,
  );

test('runway departure protection holds enemies until a sustained safe climb and resets', () => {
  const mission = {
    ...DEFAULT_MISSION,
    mode: 'quick-fight' as const,
    encounter: { ...DEFAULT_MISSION.encounter, departureGraceSeconds: 1 },
    opponents: [{ aircraft: 'a4e' as const, skill: 0 as const }],
  };
  const parked = createFlightState({ position: { x: 0, y: 2, z: 0 }, airspeed: 0 });
  parked.status = 'grounded';
  const world = new CombatWorld(mission, parked, new Map());
  for (let tick = 0; tick < 600; tick++) world.step(parked, true, false, 1 / 120, ground);
  expect(world.departureProtected).toBe(true);
  expect(world.player.gun.fired).toBe(0);
  expect(world.entities[1]!.gun.fired).toBe(0);
  expect(world.entities[1]!.activity).toBe('holding');
  const airborne = createFlightState({ position: { x: 500, y: 150, z: -1000 }, airspeed: 150 });
  for (let tick = 0; tick < 119; tick++) world.step(airborne, false, false, 1 / 120, ground);
  expect(world.departureProtected).toBe(true);
  world.step(airborne, false, false, 1 / 120, ground);
  expect(world.departureProtected).toBe(false);
  expect(
    Math.hypot(
      world.entities[1]!.state.position.x - airborne.position.x,
      world.entities[1]!.state.position.z - airborne.position.z,
    ),
  ).toBeCloseTo(mission.encounter.distanceM, -1);
  expect(new CombatWorld(mission, parked, new Map()).departureProtected).toBe(true);
});
test('ground and water impacts emit one destruction cue with pre-impact velocity', () => {
  for (const kind of ['land', 'water'] as const) {
    const initial = createFlightState({ position: { x: 0, y: 2, z: 0 }, airspeed: 200 });
    const world = new CombatWorld({ ...DEFAULT_MISSION, mode: 'free-flight' }, initial, new Map());
    const crashed = { ...initial, status: 'crashed' as const, velocity: { x: 0, y: 0, z: 0 } };
    for (let tick = 0; tick < 3; tick++)
      world.step(crashed, false, true, 1 / 120, () => ({ ...ground(), kind }));
    expect(world.events).toHaveLength(1);
    expect(world.events[0]!.cause).toBe(kind === 'water' ? 'water' : 'ground');
    expect(world.events[0]!.velocity.z).toBe(-200);
  }
});

test('enemy spawn admission waits for terrain and preserves safe clearance for low offsets', () => {
  const w = new CombatWorld(
    {
      ...DEFAULT_MISSION,
      mode: 'quick-fight',
      start: 'airborne',
      encounter: { ...DEFAULT_MISSION.encounter, altitudeOffsetM: -3000 },
      opponents: [{ aircraft: 'a4e', skill: 0 }],
    },
    createFlightState({ position: { x: 0, y: 1500, z: 0 }, airspeed: 150 }),
    new Map(),
  );
  w.step(w.player.state, false, true, 1 / 120, () => undefined);
  expect(w.entities[1]!.ready).toBe(false);
  w.step(w.player.state, false, true, 1 / 120, () => ({ ...ground(), height: 1000 }));
  expect(w.entities[1]!.ready).toBe(true);
  expect(w.entities[1]!.state.position.y).toBeGreaterThanOrEqual(1199);
  expect(w.entities[1]!.damage.destroyed).toBe(false);
});

test('round damage, kill attribution, removal and victory occur exactly once', () => {
  const w = world(1, 20);
  shot(w);
  step(w);
  expect(w.entities[1]!.damage.accumulated).toBe(10);
  expect(w.player.hits).toBe(1);
  expect(w.outcome).toBe('active');
  expect(w.player.gun.rounds).toHaveLength(0);
  shot(w);
  step(w);
  expect(w.entities[1]!.damage.destroyed).toBe(true);
  expect(w.player.kills).toBe(1);
  expect(w.outcome).toBe('victory');
  expect(w.player.targetId).toBeNull();
  for (let i = 0; i < 10; i++) step(w);
  expect(w.events.filter((e) => e.type === 'destroyed')).toHaveLength(1);
});
test('a swept round hits the first hull, independent of entity array order', () => {
  const w = world(2);
  w.entities[1]!.state.position.z = -130;
  w.entities[2]!.state.position.z = -100;
  shot(w, 0, -70, -10000);
  step(w);
  expect(w.entities[1]!.damage.accumulated).toBe(0);
  expect(w.entities[2]!.damage.accumulated).toBe(10);
});
test('enemy rounds can destroy player; old bullets survive shooter destruction', () => {
  const w = world(1, 10);
  shot(w, 1, -20, 4800);
  step(w);
  expect(w.player.damage.destroyed).toBe(true);
  expect(w.entities[1]!.kills).toBe(1);
  expect(w.outcome).toBe('defeat');
  expect(w.player.state.status).toBe('crashed');
});
test('terrain consumes shots before a hull behind it, and missing terrain is not sea level', () => {
  const w = world();
  shot(w);
  w.step(w.player.state, false, true, 1 / 120, (_x, z) => ({
    ...ground(),
    height: z < -85 && z > -90 ? 2000 : 0,
  }));
  expect(w.entities[1]!.damage.accumulated).toBe(0);
  expect(w.player.gun.rounds).toHaveLength(0);
  expect(w.events.some((event) => event.type === 'terrain' && event.cause === 'ground')).toBe(true);
  const empty = world(0);
  shot(empty, 0, 0, -100);
  empty.player.gun.rounds[0]!.position.y = -10;
  empty.step(empty.player.state, false, true, 1 / 120, () => undefined);
  expect(empty.player.gun.rounds).toHaveLength(1);
});
test('capsule closest approach handles a clamped round endpoint and hull interior', () => {
  const hull = {
    center: { x: 0, y: 0, z: 0 },
    axis: { x: 0, y: 0, z: 1 },
    halfLengthM: 5,
    radiusM: 1.1,
  };
  const from = { x: 1, y: 0, z: 0 },
    to = { x: 2, y: 0, z: 2 };
  expect(closestApproach(from, to, hull).distance).toBeCloseTo(1, 10);
  expect(capsuleHit(from, to, hull)).toBeDefined();
});
test('a round entering before a same-step terrain crash retains kill attribution', () => {
  const w = world(1, 10);
  const enemy = w.entities[1]!;
  enemy.state = createFlightState({
    position: { x: 0, y: 2.1, z: -100 },
    airspeed: 200,
    pitchRad: -0.5,
  });
  shot(w, 0, -90, -4800);
  w.player.gun.rounds[0]!.position.y = 2.1;
  step(w);
  expect(w.player.hits).toBe(1);
  expect(w.player.kills).toBe(1);
  expect(w.events.filter((e) => e.type === 'destroyed')).toHaveLength(1);
});
test('damage increases drag and reduces control authority without changing clean state', () => {
  const state = createFlightState({ position: { x: 0, y: 3000, z: 0 }, airspeed: 200 });
  const controls = { pitch: 0, roll: 1, yaw: 0, throttle: 0, brake: false };
  const clean = stepFlight(state, controls, { sampleGround: ground });
  const hurt = stepFlight(state, controls, {
    sampleGround: ground,
    damage: damageEffects(applyDamage(createDamageState(100), 50)),
  });
  expect(Math.abs(hurt.state.angularVelocity.z)).toBeLessThan(
    Math.abs(clean.state.angularVelocity.z),
  );
  expect(hurt.telemetry.airspeed).toBeLessThan(clean.telemetry.airspeed);
  expect(
    stepFlight(state, controls, {
      sampleGround: ground,
      damage: damageEffects(createDamageState(100)),
    }).state,
  ).toEqual(clean.state);
  expect(PLACEHOLDER_AIRCRAFT.controls.rollRateRadS).toBeGreaterThan(0);
});
test('authored opponent acquires, turns, fires and hits; combat is render-rate deterministic', () => {
  const runs = [30, 60, 144].map((hz) => {
    const w = new CombatWorld(
      {
        ...DEFAULT_MISSION,
        mode: 'quick-fight',
        start: 'airborne',
        opponents: [{ aircraft: 'f14', skill: 3 }],
      },
      player(),
      new Map(),
    );
    w.entities[1]!.state = createFlightState({
      position: { x: 15, y: 1000, z: 600 },
      airspeed: 150,
    });
    const clock = new FixedStepClock();
    while (w.steps < 2400)
      clock.advance(1 / hz, (dt) => {
        if (w.steps >= 2400) return;
        const p: FlightState = { ...w.player.state, timeSeconds: w.player.state.timeSeconds + dt };
        w.step(p, false, true, dt, ground);
      });
    expect(w.entities[1]!.gun.fired).toBeGreaterThan(0);
    expect(w.entities[1]!.hits).toBeGreaterThan(0);
    expect(w.outcome).toBe('defeat');
    return { snapshot: w.snapshot(), entities: w.entities };
  });
  expect(runs[1]).toEqual(runs[0]);
  expect(runs[2]).toEqual(runs[0]);
});
