/** Deterministic maneuver acceptance using public controls and real 120 Hz physics. */
import assert from 'node:assert/strict';
import { FixedStepClock } from '../../engine/src/sim/FixedStepClock';
import {
  createFlightState,
  stepFlight,
  sampleTelemetry,
  flightEuler,
  PLACEHOLDER_AIRCRAFT,
} from '../../engine/src/sim/flight';

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

function run(
  initial: State,
  seconds: number,
  pilot: Pilot,
  environment = land,
  stop?: (state: State, telemetry: Telemetry) => boolean,
) {
  let state = initial;
  const samples: { state: State; telemetry: Telemetry }[] = [];
  const totalSteps = Math.round(seconds / DT);
  for (let step = 0; step < totalSteps; step++) {
    const telemetry = sampleTelemetry(state, environment, PLACEHOLDER_AIRCRAFT);
    const next = stepFlight(
      state,
      pilot(state, telemetry, step * DT),
      environment,
      PLACEHOLDER_AIRCRAFT,
      DT,
    );
    state = next.state;
    finite(state, next.telemetry);
    const finished = stop?.(state, next.telemetry) ?? false;
    if (step % 12 === 0 || finished || step === totalSteps - 1) samples.push(next);
    if (finished) break;
  }
  return { state, samples, telemetry: sampleTelemetry(state, environment, PLACEHOLDER_AIRCRAFT) };
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

export {
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
export type { State, Controls, Environment, Telemetry, Pilot };
