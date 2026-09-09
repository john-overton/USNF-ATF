import { expect, test } from 'bun:test';
import {
  createFlightState,
  stepFlight,
  sampleTelemetry,
  PLACEHOLDER_AIRCRAFT,
  type FlightControls,
  type FlightEnvironment,
} from './index';
import { stepFlight as stepAssisted, sampleTelemetry as sampleAssisted } from './assisted-flight';
import { createWindField, windAt } from '../environment';

const land: FlightEnvironment = {
  sampleGround: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, kind: 'land' }),
};
const controls: FlightControls = { pitch: 0.05, roll: 0.1, yaw: 0, throttle: 0.7, brake: false };
const DT = 1 / 120;

function fly(step: typeof stepFlight, environment: (seconds: number) => FlightEnvironment) {
  let state = createFlightState({ position: { x: 0, y: 1500, z: 0 }, airspeed: 150 });
  for (let i = 0; i < 1200; i++)
    state = step(state, controls, environment(i * DT), PLACEHOLDER_AIRCRAFT, DT).state;
  return state;
}

// The preserved assisted model must be byte-for-byte unchanged at zero wind.
test.each([
  ['native', stepFlight],
  ['assisted', stepAssisted],
])('%s flight is identical with omitted, zero and calm-preset wind', (_name, step) => {
  const calm = createWindField('calm');
  const omitted = fly(step, () => land);
  const zero = fly(step, () => ({ ...land, wind: { x: 0, y: 0, z: 0 } }));
  const preset = fly(step, (seconds) => ({
    ...land,
    wind: windAt(calm, { x: 0, y: 1500, z: 0 }, seconds),
  }));
  expect(zero).toEqual(omitted);
  expect(preset).toEqual(omitted);
});

test.each([
  ['native', stepFlight, sampleTelemetry],
  ['assisted', stepAssisted, sampleAssisted],
])('%s airspeed follows the air mass, not the ground', (_name, step, sample) => {
  // East is -X, so a wind from 090 moves the air toward +X at 20 m/s.
  const wind = { x: 20, y: 0, z: 0 };
  const state = createFlightState({ position: { x: 0, y: 1500, z: 0 }, airspeed: 150 });
  const still = sample(state, land, PLACEHOLDER_AIRCRAFT);
  const blown = sample(state, { ...land, wind }, PLACEHOLDER_AIRCRAFT);
  expect(still.airspeed).toBeCloseTo(150, 6);
  expect(blown.airspeed).toBeCloseTo(Math.hypot(150, 20), 6);
  // One step of a tailwind component cannot change the ground speed instantly.
  const next = step(state, controls, { ...land, wind }, PLACEHOLDER_AIRCRAFT, DT).state;
  expect(Math.hypot(next.velocity.x, next.velocity.y, next.velocity.z)).toBeGreaterThan(100);
});
