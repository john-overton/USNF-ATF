import { expect, test } from 'bun:test';
import { parseAircraftDefinition } from '../../data/aircraft';
import {
  PLACEHOLDER_AIRCRAFT,
  NEUTRAL_CONTROLS,
  createFlightState,
  attitudeFromEuler,
  flightEuler,
  stepFlight,
  sampleTelemetry,
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

test('flaps increase maximum lift instead of disappearing at the clean stall angle', () => {
  const state = createFlightState({
    position: { x: 0, y: 1000, z: 0 },
    airspeed: 100,
    pitchRad: PLACEHOLDER_AIRCRAFT.stallAlphaRad,
  });
  state.velocity = { x: 0, y: 0, z: -100 };
  const clean = sampleTelemetry(state, flat);
  const flapped = sampleTelemetry(state, flat, PLACEHOLDER_AIRCRAFT, { flaps: 1 });
  const cleanLevelStallSpeed = 100 / Math.sqrt(clean.loadFactor);
  const flappedLevelStallSpeed = 100 / Math.sqrt(flapped.loadFactor);
  expect(flapped.loadFactor).toBeGreaterThan(clean.loadFactor * 1.1);
  expect(flappedLevelStallSpeed).toBeLessThan(cleanLevelStallSpeed * 0.96);
  const cleanStep = stepFlight(state, NEUTRAL_CONTROLS, flat);
  const flapStep = stepFlight(state, { ...NEUTRAL_CONTROLS, flaps: 1 }, flat);
  expect(flapStep.state.velocity.y).toBeGreaterThan(cleanStep.state.velocity.y);
  expect(flapStep.state.velocity.z).toBeGreaterThan(cleanStep.state.velocity.z);
});

test('device drag uses airflow squared and continuous gear extension without changing contact latch', () => {
  const deceleration = (speed: number, gearFraction: number) => {
    const state = createFlightState({ position: { x: 0, y: 1000, z: 0 }, airspeed: speed });
    const clean = stepFlight(state, NEUTRAL_CONTROLS, flat);
    const gear = stepFlight(state, { ...NEUTRAL_CONTROLS, gearFraction }, flat);
    return (gear.state.velocity.z - clean.state.velocity.z) * 120;
  };
  expect(deceleration(0, 1)).toBe(0);
  expect(deceleration(100, 1)).toBeGreaterThan(0.3);
  expect(deceleration(100, 0.5) / deceleration(100, 1)).toBeCloseTo(0.5, 10);
  expect(deceleration(100, 1) / deceleration(50, 1)).toBeCloseTo(4, 10);
  const contact = createFlightState({ position: { x: 0, y: 2.2, z: 0 } });
  expect(
    stepFlight(contact, { ...NEUTRAL_CONTROLS, gearDown: false, gearFraction: 1 }, flat).state
      .status,
  ).toBe('crashed');
  expect(() => stepFlight(contact, { ...NEUTRAL_CONTROLS, gearFraction: NaN }, flat)).toThrow();
});

test('deployed devices produce sustained speed and energy differences at fixed throttle', () => {
  const run = (devices: { flaps?: number; airbrake?: number; gearFraction?: number }) => {
    let state = createFlightState({
      position: { x: 0, y: 1000, z: 0 },
      airspeed: 100,
      pitchRad: 0.15,
    });
    state.velocity = { x: 0, y: 0, z: -100 };
    const controls = { ...NEUTRAL_CONTROLS, throttle: 0.2, ...devices };
    for (let i = 0; i < 1200; i++) state = stepFlight(state, controls, flat).state;
    expect(state.status).toBe('airborne');
    return sampleTelemetry(state, flat, PLACEHOLDER_AIRCRAFT, controls);
  };
  const clean = run({}),
    flapped = run({ flaps: 1 }),
    brakes = run({ airbrake: 1 }),
    gear = run({ gearFraction: 1 });
  expect(flapped.airspeed).toBeLessThan(clean.airspeed - 5);
  expect(flapped.specificEnergy).toBeLessThan(clean.specificEnergy - 400);
  // The augmented trim must account for the extra camber lift, lowering alpha.
  expect(flapped.alphaRad).toBeLessThan(clean.alphaRad - 0.01);
  expect(brakes.airspeed).toBeLessThan(flapped.airspeed - 5);
  expect(brakes.specificEnergy).toBeLessThan(flapped.specificEnergy - 500);
  expect(gear.airspeed).toBeLessThan(clean.airspeed - 2);
  expect(gear.specificEnergy).toBeLessThan(clean.specificEnergy);
});

// Entirely synthetic import profile, with rectangular speed/altitude polygons.
function retailAircraft() {
  const rectangle = (min: number, max: number) => [
    { speedMps: min, altitudeM: 0 },
    { speedMps: max, altitudeM: 0 },
    { speedMps: max, altitudeM: 12000 },
    { speedMps: min, altitudeM: 12000 },
  ];
  return parseAircraftDefinition({
    ...structuredClone(PLACEHOLDER_AIRCRAFT),
    massKg: 10000,
    retail: {
      schemaVersion: 1,
      source: { game: 'usnf97', file: 'SYNTHETIC.PT', sha256: '0'.repeat(64) },
      name: 'Synthetic envelope fixture',
      emptyMassKg: 8000,
      fuelCapacityKg: 2000,
      maxTakeoffMassKg: 20000,
      militaryThrustN: 60000,
      afterburnerThrustN: 100000,
      envelopes: [
        { g: 1, points: rectangle(60, 400) },
        { g: 3, points: rectangle(110, 350) },
      ],
      rawFields: {},
    },
  });
}

test('imported mass changes acceleration without recalibrating drag to hide the weight change', () => {
  const heavy = retailAircraft(),
    light = { ...heavy, massKg: 5000 };
  const state = createFlightState({ position: { x: 0, y: 1000, z: 0 }, airspeed: 150 });
  const controls = { ...NEUTRAL_CONTROLS, throttle: 1 };
  const full = stepFlight(state, controls, flat, heavy),
    half = stepFlight(state, controls, flat, light);
  const fullAcceleration = state.velocity.z - full.state.velocity.z;
  const halfAcceleration = state.velocity.z - half.state.velocity.z;
  expect(fullAcceleration).toBeGreaterThan(0);
  expect(halfAcceleration / fullAcceleration).toBeCloseTo(2, 10);
  // Imported forces must not read the placeholder polar or engine table.
  const poisoned = structuredClone(heavy);
  poisoned.aero.lift = poisoned.aero.lift.map((row) => row.map(() => 0));
  poisoned.aero.drag = poisoned.aero.drag.map((row) => row.map(() => 9));
  poisoned.engine.thrustN = poisoned.engine.thrustN.map((row) => row.map(() => 0));
  expect(stepFlight(state, controls, flat, poisoned)).toEqual(full);
});

test('retail-envelope fit balances maximum AB near its upper speed while military power cannot', () => {
  const def = retailAircraft();
  const env: FlightEnvironment = {
    sampleGround: () => ({ height: -100, normal: { x: 0, y: 1, z: 0 }, kind: 'land' }),
  };
  const acceleration = (speed: number, multiplier: number) => {
    // Synthetic 1G min speed is60m/s: CL/CLmax=(60/speed)^2.
    const state = createFlightState({
      position: { x: 0, y: 0, z: 0 },
      pitchRad: def.stallAlphaRad * (60 / speed) ** 2,
    });
    state.velocity = { x: 0, y: 0, z: -speed };
    const next = stepFlight(
      state,
      { ...NEUTRAL_CONTROLS, throttle: 1, thrustMultiplier: multiplier },
      env,
      def,
    );
    return (state.velocity.z - next.state.velocity.z) * 120;
  };
  const burnerRatio = def.retail!.afterburnerThrustN / def.retail!.militaryThrustN;
  expect(Math.abs(acceleration(400, burnerRatio))).toBeLessThan(0.01);
  expect(acceleration(400, 1)).toBeLessThan(-3.9);
  expect(acceleration(350, burnerRatio)).toBeGreaterThan(1);
  expect(acceleration(450, burnerRatio)).toBeLessThan(-1);
  expect(acceleration(200, 1)).toBeGreaterThan(0);
  expect(acceleration(350, 1)).toBeLessThan(0);
});

test('native lower speed bounds set reference-weight lift and preserve continuous post-stall behavior', () => {
  const def = retailAircraft();
  const at = (speed: number, alpha: number) => {
    const state = createFlightState({ position: { x: 0, y: 1000, z: 0 }, pitchRad: alpha });
    state.velocity = { x: 0, y: 0, z: -speed };
    return sampleTelemetry(state, flat, def);
  };
  expect(at(60, def.stallAlphaRad).loadFactor).toBeCloseTo(1, 10);
  expect(at(30, def.stallAlphaRad).loadFactor).toBeCloseTo(0.25, 10);
  expect(at(0, def.stallAlphaRad).loadFactor).toBe(0);
  const before = at(60, def.stallAlphaRad - 1e-7),
    after = at(60, def.stallAlphaRad + 1e-7);
  expect(before.stalled).toBe(false);
  expect(after.stalled).toBe(true);
  expect(Math.abs(before.loadFactor - after.loadFactor)).toBeLessThan(1e-5);
  expect(at(60, 1).loadFactor).toBeLessThan(at(60, def.stallAlphaRad).loadFactor);
});

test('imported device fields modify the fitted polar rather than trainer coefficients', () => {
  const def = retailAircraft();
  def.retail!.rawFields = {
    flapsLift: { value: 64 },
    flapsDrag: { value: 128 },
    gearDrag: { value: 64 },
    airBrakesDrag: { value: 512 },
  };
  const state = createFlightState({
    position: { x: 0, y: 1000, z: 0 },
    pitchRad: def.stallAlphaRad,
  });
  state.velocity = { x: 0, y: 0, z: -60 };
  const clean = sampleTelemetry(state, flat, def),
    flapped = sampleTelemetry(state, flat, def, { flaps: 1 });
  expect(flapped.loadFactor / clean.loadFactor).toBeCloseTo(1.25, 10);
  state.attitude = attitudeFromEuler(0, 0, 0);
  const baseline = stepFlight(state, NEUTRAL_CONTROLS, flat, def).state.velocity.z;
  const gear =
    stepFlight(state, { ...NEUTRAL_CONTROLS, gearFraction: 1 }, flat, def).state.velocity.z -
    baseline;
  const brakes =
    stepFlight(state, { ...NEUTRAL_CONTROLS, airbrake: 1 }, flat, def).state.velocity.z - baseline;
  expect(gear).toBeGreaterThan(0);
  expect(brakes / gear).toBeCloseTo(8, 9);
});

test('imported envelope ceiling extrapolation stays finite and never switches to trainer aero', () => {
  const def = retailAircraft();
  const sample = (height: number) => {
    const state = createFlightState({ position: { x: 0, y: height, z: 0 }, pitchRad: 0.1 });
    state.velocity = { x: 0, y: 0, z: -150 };
    return sampleTelemetry(state, flat, def);
  };
  expect(Math.abs(sample(12000.01).loadFactor - sample(11999.99).loadFactor)).toBeLessThan(0.0001);
  expect(Number.isFinite(sample(30000).loadFactor)).toBe(true);
  expect(sample(30000).loadFactor).toBeLessThan(sample(12000).loadFactor);
});

function recoveredAircraft() {
  const def = retailAircraft();
  const nativeRows = [
    { g: 1, min: 200, max: 1300 },
    { g: 3, min: 360, max: 1150 },
  ].map(({ g, min, max }) => ({
    g,
    count: 4,
    maxSpeedIndex: 2,
    stallLiftIndex: 0,
    points: [
      { speedFps: min, altitudeFt: 0 },
      { speedFps: min, altitudeFt: 40000 },
      { speedFps: max, altitudeFt: 40000 },
      { speedFps: max, altitudeFt: 0 },
    ],
  }));
  def.retail!.native = {
    structuralSpeedFps: { seaLevel: 1300, at36000Ft: 2000 },
    envelopes: nativeRows,
  };
  def.retail!.envelopes = nativeRows.map((row) => ({
    g: row.g,
    points: row.points.map((p) => ({
      speedMps: p.speedFps * 0.3048,
      altitudeM: p.altitudeFt * 0.3048,
    })),
  }));
  def.retail!.rawFields.flapsLift = { value: 51 };
  return def;
}

test('damage keeps native speed bounds integer in both PT backends', () => {
  for (const nativeEnvelope of [false, true]) {
    const def = recoveredAircraft();
    def.nativeEnvelope = nativeEnvelope;
    def.retail!.rawFields.coefDrag = { value: 256 };
    def.retail!.rawFields._gpullDrag = { value: 20 };
    let state = createFlightState({ position: { x: 0, y: 1000, z: 0 }, airspeed: 230 });
    for (let tick = 0; tick < 120; tick++) {
      state = stepFlight(
        state,
        NEUTRAL_CONTROLS,
        {
          ...flat,
          damage: { speedScale: 0.982142857, gScale: 0.95, dragScale: 1.1, gPullDragScale: 1.1 },
        },
        def,
      ).state;
      expect(Number.isFinite(state.velocity.z)).toBe(true);
      expect(state.status).toBe('airborne');
    }
  }
});

test('both PT backends turn full stick into bounded G instead of an unrestricted pitch rate', () => {
  for (const nativeEnvelope of [false, true]) {
    const def = recoveredAircraft();
    def.nativeEnvelope = nativeEnvelope;
    def.retail!.rawFields.coefDrag = { value: 256 };
    def.retail!.rawFields._gpullDrag = { value: 20 };
    let state = createFlightState({ position: { x: 0, y: 1000, z: 0 }, airspeed: 230 });
    let peakG = 0;
    for (let tick = 0; tick < 6 * 120; tick++) {
      const next = stepFlight(state, { ...NEUTRAL_CONTROLS, throttle: 1, pitch: 1 }, flat, def);
      state = next.state;
      expect(state.status).toBe('airborne');
      peakG = Math.max(peakG, next.telemetry.loadFactor);
    }
    // Synthetic maximum row is 3G. Allow small actuator transients, not 9–12G.
    expect(peakG).toBeGreaterThan(2.5);
    expect(peakG).toBeLessThan(3.2);
  }
});

test('recovered envelope mode applies native flap minimum-speed rule without changing the fitted mode', () => {
  const def = recoveredAircraft();
  const state = createFlightState({
    position: { x: 0, y: 1000, z: 0 },
    pitchRad: def.stallAlphaRad,
  });
  state.velocity = { x: 0, y: 0, z: -65 };
  const fitted = sampleTelemetry(state, flat, def, { flaps: 1 });
  def.nativeEnvelope = true;
  const clean = sampleTelemetry(state, flat, def),
    flapped = sampleTelemetry(state, flat, def, { flaps: 1 });
  expect(flapped.loadFactor / clean.loadFactor).toBeCloseTo(1 / 0.75 ** 2, 10);
  expect(flapped.loadFactor).toBeGreaterThan(fitted.loadFactor);
  def.nativeEnvelope = false;
  expect(sampleTelemetry(state, flat, def, { flaps: 1 })).toEqual(fitted);
});

test('experimental flap maximum lift does not become excessive zero-alpha camber', () => {
  const def = recoveredAircraft();
  const state = createFlightState({ position: { x: 0, y: 1000, z: 0 }, airspeed: 150 });
  const qArea = 0.5 * 1.225 * Math.exp(-1000 / 8500) * 150 ** 2 * def.wingAreaM2;
  for (const native of [false, true]) {
    def.nativeEnvelope = native;
    for (const flaps of [0, 0.5, 1]) {
      const load = sampleTelemetry(state, flat, def, { flaps }).loadFactor;
      expect((load * def.massKg * 9.80665) / qArea).toBeCloseTo(flaps * (51 / 256), 10);
      for (const join of [-def.stallAlphaRad, 0, def.stallAlphaRad]) {
        const at = (alpha: number) => {
          const posed = { ...state, attitude: attitudeFromEuler(alpha, 0, 0) };
          return sampleTelemetry(posed, flat, def, { flaps }).loadFactor;
        };
        expect(Math.abs(at(join + 1e-8) - at(join - 1e-8))).toBeLessThan(1e-5);
      }
    }
  }
});

test('experimental flap neutral trim balances the force polar on either side of zero alpha', () => {
  const def = recoveredAircraft();
  let positiveCases = 0,
    negativeCases = 0;
  for (const native of [false, true]) {
    def.nativeEnvelope = native;
    for (const speed of [90, 150, 300])
      for (const flaps of [0, 0.5, 1]) {
        const state = createFlightState({ position: { x: 0, y: 1000, z: 0 }, airspeed: speed });
        // Independently find the neutral augmentation's 1g lift condition from
        // telemetry, without repeating the implementation's piecewise solution.
        let low = -def.stallAlphaRad,
          high = def.stallAlphaRad;
        for (let i = 0; i < 60; i++) {
          const alpha = (low + high) / 2;
          state.attitude = attitudeFromEuler(alpha, 0, 0);
          const load = sampleTelemetry(state, flat, def, { flaps }).loadFactor;
          // Horizontal airflow makes lift vertical; the recovered G controller
          // targets 1G without the old body-up cosine correction.
          if (load < 1) low = alpha;
          else high = alpha;
        }
        const alpha = (low + high) / 2;
        state.attitude = attitudeFromEuler(alpha, 0, 0);
        if (alpha >= 0) positiveCases++;
        else negativeCases++;
        const next = stepFlight(state, { ...NEUTRAL_CONTROLS, flaps }, flat, def);
        expect(Math.abs(next.state.angularVelocity.x)).toBeLessThan(1e-10);
      }
  }
  expect(positiveCases).toBeGreaterThan(0);
  expect(negativeCases).toBeGreaterThan(0);
});

test('experimental flaps permit rotated takeoff without a low-speed neutral nose-down launch', () => {
  for (const native of [false, true]) {
    const def = recoveredAircraft();
    def.nativeEnvelope = native;
    for (const rotate of [false, true]) {
      let state = createFlightState({
        position: { x: 0, y: def.gearHeightM, z: 0 },
        airspeed: 70,
      });
      let lifted = false;
      for (let i = 0; i < 360; i++) {
        const next = stepFlight(
          state,
          { ...NEUTRAL_CONTROLS, pitch: rotate ? 0.3 : 0, flaps: 1, gearDown: true },
          flat,
          def,
        );
        state = next.state;
        if (state.position.y > def.gearHeightM + 0.1) {
          lifted = true;
          expect(flightEuler(state.attitude).pitchRad).toBeGreaterThan(0);
          expect(next.telemetry.alphaRad).toBeGreaterThan(0);
          break;
        }
      }
      expect(lifted).toBe(rotate);
    }
  }
});
