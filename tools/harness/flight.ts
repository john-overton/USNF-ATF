/** Deterministic maneuver acceptance using public controls and real 120 Hz physics. */
import assert from 'node:assert/strict';
import { FixedStepClock } from '../../engine/src/sim/FixedStepClock';
import {
  createFlightState,
  stepFlight,
  sampleTelemetry,
  flightEuler,
  PLACEHOLDER_AIRCRAFT,
  type Vec3,
} from '../../engine/src/sim/flight';
import {
  createWindField,
  windAt,
  WIND_PRESETS,
  type WindField,
} from '../../engine/src/sim/environment';

type State = ReturnType<typeof createFlightState>;
type Controls = Parameters<typeof stepFlight>[1];
type Environment = Parameters<typeof stepFlight>[2];
type Telemetry = ReturnType<typeof sampleTelemetry>;
type Pilot = (state: State, telemetry: Telemetry, seconds: number) => Controls;
const DT = 1 / 120;
const clamp = (n: number, limit = 1) => Math.max(-limit, Math.min(limit, n));
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (angle: number) => (angle * 180) / Math.PI;
const neutral: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: false };
const land: Environment = {
  sampleGround: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, kind: 'land' }),
};
const water: Environment = {
  sampleGround: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, kind: 'water' }),
};
const missing: Environment = { sampleGround: () => undefined };

function finite(state: State, telemetry: Telemetry) {
  for (const [name, vector] of Object.entries({
    position: state.position,
    velocity: state.velocity,
    attitude: state.attitude,
    angularVelocity: state.angularVelocity,
  }))
    for (const value of Object.values(vector)) assert(Number.isFinite(value), `Nonfinite ${name}`);
  assert(Number.isFinite(telemetry.specificEnergy), 'Nonfinite specific energy');
  assert(telemetry.airspeed < 1000, 'Unbounded airspeed');
  const q = state.attitude;
  assert(
    Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) < 1e-8,
    'Attitude quaternion lost normalization',
  );
}

/** Wind sampled at the flight clock's time, exactly as FlightLayer does per step. */
type Wind = (position: State['position'], seconds: number) => Vec3;

function run(
  initial: State,
  seconds: number,
  pilot: Pilot,
  environment = land,
  stop?: (state: State, telemetry: Telemetry) => boolean,
  wind?: Wind,
) {
  let state = initial;
  const samples: { state: State; telemetry: Telemetry }[] = [];
  const totalSteps = Math.round(seconds / DT);
  for (let step = 0; step < totalSteps; step++) {
    const stepped: Environment = wind
      ? { ...environment, wind: wind(state.position, step * DT) }
      : environment;
    const telemetry = sampleTelemetry(state, stepped, PLACEHOLDER_AIRCRAFT);
    const next = stepFlight(
      state,
      pilot(state, telemetry, step * DT),
      stepped,
      PLACEHOLDER_AIRCRAFT,
      DT,
    );
    state = next.state;
    finite(state, next.telemetry);
    const finished = stop?.(state, next.telemetry) ?? false;
    if (step % 12 === 0 || finished || step === totalSteps - 1) samples.push(next);
    if (finished) break;
  }
  const final: Environment = wind
    ? { ...environment, wind: wind(state.position, seconds) }
    : environment;
  return { state, samples, telemetry: sampleTelemetry(state, final, PLACEHOLDER_AIRCRAFT) };
}

/** Feedback uses observed aircraft attitude, altitude and speed, never modifies state. */
function hold(altitude: number, speed: number, bank = 0): Pilot {
  return (state, telemetry) => {
    const euler = flightEuler(state.attitude);
    const pitchTarget =
      0.04 + clamp((altitude - state.position.y) * 0.001 - state.velocity.y * 0.012, 0.15);
    return {
      pitch: clamp((pitchTarget - euler.pitchRad) * 3 - state.angularVelocity.x * 0.8),
      roll: clamp((bank + euler.rollRad) * 2),
      yaw: 0,
      throttle: Math.max(0, Math.min(1, 0.2 + (speed - telemetry.airspeed) * 0.03)),
      brake: false,
    };
  };
}

/** A steady wind blowing from a compass bearing, for the deterministic cases. */
function steadyWind(speed: number, fromBearingDeg: number): Wind {
  const theta = ((fromBearingDeg + 180) * Math.PI) / 180;
  const v = { x: -Math.sin(theta) * speed, y: 0, z: Math.cos(theta) * speed };
  return () => v;
}
/** The preset field, evaluated at the flight clock's time. */
function presetWind(field: WindField): Wind {
  return (position, seconds) => windAt(field, position, seconds);
}

export {
  createWindField,
  windAt,
  WIND_PRESETS,
  steadyWind,
  presetWind,
  createFlightState,
  stepFlight,
  sampleTelemetry,
  flightEuler,
  PLACEHOLDER_AIRCRAFT,
  run,
  hold,
  land,
  water,
  missing,
  neutral,
  finite,
  clamp,
  radians,
  degrees,
  DT,
  FixedStepClock,
};
export type { State, Controls, Environment, Telemetry, Pilot, Wind, Vec3, WindField };
