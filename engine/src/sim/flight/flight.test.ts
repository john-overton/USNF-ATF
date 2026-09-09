import { expect, test } from 'bun:test';
import { parseAircraftDefinition } from '../../data/aircraft';
import {
  PLACEHOLDER_AIRCRAFT,
  NEUTRAL_CONTROLS,
  createFlightState,
  attitudeFromEuler,
  flightEuler,
  stepFlight,
  lookupTable,
  type FlightEnvironment,
} from './index';

const flat: FlightEnvironment = {
  sampleGround: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, kind: 'land' }),
};
test('original aircraft validation rejects unordered axes, malformed rows and invalid coefficients', () => {
  expect(parseAircraftDefinition(PLACEHOLDER_AIRCRAFT).id).toBe('peregrine-trainer');
  for (const change of [
    (a: typeof PLACEHOLDER_AIRCRAFT) => {
      a.aero.alphaRad[2] = a.aero.alphaRad[1]!;
    },
    (a: typeof PLACEHOLDER_AIRCRAFT) => {
      a.engine.thrustN[0]!.pop();
    },
    (a: typeof PLACEHOLDER_AIRCRAFT) => {
      a.aero.drag[0]![0] = -1;
    },
    (a: typeof PLACEHOLDER_AIRCRAFT) => {
      a.massKg = Number.NaN;
    },
    (a: typeof PLACEHOLDER_AIRCRAFT) => {
      a.aero.alphaRad = [0, 0.1];
    },
  ]) {
    const bad = structuredClone(PLACEHOLDER_AIRCRAFT);
    change(bad);
    expect(() => parseAircraftDefinition(bad)).toThrow();
  }
});
test('table interpolation and envelope clamps preserve authored corner values', () => {
  const rows = [0, 10],
    cols = [0, 2],
    values = [
      [0, 20],
      [100, 120],
    ];
  expect(lookupTable(rows, cols, values, 5, 1)).toBe(60);
  expect(lookupTable(rows, cols, values, -100, 20)).toBe(20);
  expect(lookupTable(rows, cols, values, 100, -20)).toBe(100);
});
test('orientation uses the renderer YXZ convention without a renderer dependency', () => {
  const angles = flightEuler(attitudeFromEuler(0.2, 0.4, -0.3));
  expect(angles.pitchRad).toBeCloseTo(0.2, 12);
  expect(angles.yawRad).toBeCloseTo(0.4, 12);
  expect(angles.rollRad).toBeCloseTo(-0.3, 12);
  const s = createFlightState({
    position: { x: 1, y: 2, z: 3 },
    airspeed: 10,
    yawRad: Math.PI / 2,
  });
  expect(s.velocity.x).toBeCloseTo(-10, 12);
  expect(s.velocity.z).toBeCloseTo(0, 12);
});
test('missing current or predicted ground preserves the complete physics pose and resumes', () => {
  const initial = createFlightState({ position: { x: 0, y: 1000, z: 0 }, airspeed: 100 });
  const paused = stepFlight(initial, NEUTRAL_CONTROLS, { sampleGround: () => undefined });
  expect(paused.state.status).toBe('waiting-terrain');
  expect(paused.state.position).toEqual(initial.position);
  expect(paused.state.timeSeconds).toBe(0);
  expect(paused.telemetry.groundClearance).toBeUndefined();
  const edge = stepFlight(initial, NEUTRAL_CONTROLS, {
    sampleGround: (_x, z) => (z < 0 ? undefined : flat.sampleGround(0, 0)),
  });
  expect(edge.state.position).toEqual(initial.position);
  expect(edge.state.velocity).toEqual(initial.velocity);
  const resumed = stepFlight(paused.state, NEUTRAL_CONTROLS, flat);
  expect(resumed.state.status).toBe('airborne');
  expect(resumed.state.position.z).toBeLessThan(0);
  expect(initial.position.z).toBe(0);
});
test('ground support is stable; unsafe water contact crashes and remains terminal', () => {
  let state = createFlightState({ position: { x: 0, y: PLACEHOLDER_AIRCRAFT.gearHeightM, z: 0 } });
  for (let i = 0; i < 120; i++) state = stepFlight(state, NEUTRAL_CONTROLS, flat).state;
  expect(state.status).toBe('grounded');
  expect(state.position.y).toBe(2.2);
  expect(state.velocity).toEqual({ x: 0, y: 0, z: 0 });
  const result = stepFlight(state, NEUTRAL_CONTROLS, {
    sampleGround: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, kind: 'water' }),
  });
  expect(result.state.status).toBe('crashed');
  expect(stepFlight(result.state, { ...NEUTRAL_CONTROLS, throttle: 1 }, flat).state).toEqual(
    result.state,
  );
});
test('fixed step and controls reject invalid input, quaternion stays normalized during maneuver', () => {
  let state = createFlightState({ position: { x: 0, y: 5000, z: 0 }, airspeed: 170 });
  expect(() => stepFlight(state, NEUTRAL_CONTROLS, flat, PLACEHOLDER_AIRCRAFT, 1 / 60)).toThrow();
  expect(() => stepFlight(state, { ...NEUTRAL_CONTROLS, pitch: NaN }, flat)).toThrow();
  for (let i = 0; i < 1200; i++)
    state = stepFlight(
      state,
      { pitch: 0.1, roll: 0.1, yaw: 0.05, throttle: 0.5, brake: false },
      flat,
    ).state;
  const q = state.attitude;
  expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 12);
  expect(Object.values(state.position).every(Number.isFinite)).toBe(true);
});

test('a nearly vertical touchdown cannot be accepted as safe gear contact', () => {
  const initial = createFlightState({ position: { x: 0, y: 2.19, z: 0 }, pitchRad: 1.4 });
  expect(stepFlight(initial, NEUTRAL_CONTROLS, flat).state.status).toBe('crashed');
});

test('systems thrust augmentation changes acceleration and retracted gear rejects touchdown', () => {
  const env = {
    sampleGround: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, kind: 'land' as const }),
  };
  const state = createFlightState({ position: { x: 0, y: 1000, z: 0 }, airspeed: 150 });
  const dry = stepFlight(state, { ...NEUTRAL_CONTROLS, throttle: 1 }, env);
  const burner = stepFlight(
    state,
    { ...NEUTRAL_CONTROLS, throttle: 1, thrustMultiplier: 1.5 },
    env,
  );
  expect(burner.state.velocity.z).toBeLessThan(dry.state.velocity.z);
  const contact = createFlightState({
    position: { x: 0, y: PLACEHOLDER_AIRCRAFT.gearHeightM, z: 0 },
  });
  expect(stepFlight(contact, NEUTRAL_CONTROLS, env).state.status).toBe('grounded');
  const gearUp = stepFlight(contact, { ...NEUTRAL_CONTROLS, gearDown: false }, env);
  expect(gearUp.state.status).toBe('crashed');
  expect(gearUp.telemetry.reason).toBe('Gear-up terrain impact');
});

test('speed brakes dissipate energy and deployed flaps add assisted lift and drag', () => {
  const state = createFlightState({ position: { x: 0, y: 2000, z: 0 }, airspeed: 150 });
  const clean = stepFlight(state, NEUTRAL_CONTROLS, flat);
  const brakes = stepFlight(state, { ...NEUTRAL_CONTROLS, airbrake: 1 }, flat);
  const flaps = stepFlight(state, { ...NEUTRAL_CONTROLS, flaps: 1 }, flat);
  expect(brakes.telemetry.specificEnergy).toBeLessThan(clean.telemetry.specificEnergy);
  expect(brakes.telemetry.airspeed).toBeLessThan(clean.telemetry.airspeed);
  expect(flaps.state.velocity.y).toBeGreaterThan(clean.state.velocity.y);
  expect(flaps.telemetry.loadFactor).toBeGreaterThan(clean.telemetry.loadFactor);
  expect(flaps.state.velocity.z).toBeGreaterThan(clean.state.velocity.z);
  expect(() => stepFlight(state, { ...NEUTRAL_CONTROLS, airbrake: NaN }, flat)).toThrow();
});

test('parked gear support rejects held pitch roll and yaw, including residual rotation', () => {
  for (const sign of [-1, 1]) {
    let state = createFlightState({ position: { x: 0, y: 2.2, z: 0 }, yawRad: 0.4 });
    state.status = 'grounded';
    state.angularVelocity = { x: sign, y: sign, z: sign };
    const initial = structuredClone(state);
    for (let i = 0; i < 1200; i++)
      state = stepFlight(
        state,
        { ...NEUTRAL_CONTROLS, pitch: sign, roll: sign, yaw: sign, brake: true },
        flat,
      ).state;
    expect(state.status).toBe('grounded');
    expect(state.position).toEqual(initial.position);
    expect(state.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(flightEuler(state.attitude).pitchRad).toBeCloseTo(0, 12);
    expect(flightEuler(state.attitude).rollRad).toBeCloseTo(0, 12);
    expect(flightEuler(state.attitude).yawRad).toBeCloseTo(0.4, 12);
    expect(state.angularVelocity).toEqual({ x: 0, y: 0, z: 0 });
  }
});

test('taxi controls keep main and nose gear supported, while speed permits takeoff rotation', () => {
  let taxi = createFlightState({ position: { x: 0, y: 2.2, z: 0 }, airspeed: 15 });
  taxi.status = 'grounded';
  for (let i = 0; i < 240; i++)
    taxi = stepFlight(taxi, { ...NEUTRAL_CONTROLS, pitch: 1, roll: 1 }, flat).state;
  expect(taxi.status).toBe('grounded');
  expect(flightEuler(taxi.attitude).pitchRad).toBeCloseTo(0, 12);
  expect(flightEuler(taxi.attitude).rollRad).toBeCloseTo(0, 12);
  let rotation = createFlightState({ position: { x: 0, y: 2.2, z: 0 }, airspeed: 80 });
  rotation.status = 'grounded';
  let supportedRoll = 0;
  for (let i = 0; i < 240; i++) {
    rotation = stepFlight(rotation, { ...NEUTRAL_CONTROLS, throttle: 1, pitch: 0.2 }, flat).state;
    if (rotation.status === 'grounded')
      supportedRoll = Math.max(supportedRoll, Math.abs(flightEuler(rotation.attitude).rollRad));
  }
  expect(supportedRoll).toBe(0);
  expect(rotation.status).toBe('airborne');
  expect(rotation.position.y).toBeGreaterThan(3);
});

test('control authority follows true air dynamic pressure, with no zero-airflow floor', () => {
  const controls = { ...NEUTRAL_CONTROLS, roll: 1 };
  const at = (altitude: number, speed: number, wind = { x: 0, y: 0, z: 0 }) =>
    stepFlight(
      createFlightState({ position: { x: 0, y: altitude, z: 0 }, airspeed: speed }),
      controls,
      { ...flat, wind },
    );
  expect(at(1000, 0).state.angularVelocity.z).toBe(0);
  const low = Math.abs(at(1000, 20).state.angularVelocity.z);
  expect(Math.abs(at(1000, 40).state.angularVelocity.z) / low).toBeCloseTo(4, 12);
  expect(Math.abs(at(9500, 20).state.angularVelocity.z) / low).toBeCloseTo(Math.exp(-1), 12);
  expect(at(1000, 20, { x: 0, y: 0, z: -20 }).state.angularVelocity.z).toBe(0);
  expect(at(1000, 0, { x: 0, y: 0, z: 20 }).state.angularVelocity.z).toBeCloseTo(-low, 12);
});

test('safe touchdown settles to the terrain plane as the aircraft stops', () => {
  const sx = 0.03,
    sz = 0.04;
  const slope: FlightEnvironment = {
    sampleGround: (x, z) => ({
      height: -sx * x - sz * z,
      normal: { x: sx, y: 1, z: sz },
      kind: 'land',
    }),
  };
  let state = createFlightState({ position: { x: 0, y: 2.19, z: 0 }, pitchRad: 0.2 });
  state = stepFlight(state, { ...NEUTRAL_CONTROLS, pitch: 1, roll: 1, brake: true }, slope).state;
  expect(state.status).toBe('grounded');
  const euler = flightEuler(state.attitude);
  expect(euler.pitchRad).toBeCloseTo(Math.atan(sz), 5);
  expect(euler.rollRad).toBeCloseTo(-Math.atan(sx / Math.hypot(1, sz)), 5);
  expect(state.angularVelocity.x).toBe(0);
  expect(state.angularVelocity.z).toBe(0);
});
