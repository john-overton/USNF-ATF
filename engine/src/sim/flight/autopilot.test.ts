import { expect, test } from 'bun:test';
import {
  createFlightState,
  flightEuler,
  headingDegreesFromYaw,
  PLACEHOLDER_AIRCRAFT,
  type FlightState,
} from './index';
import { stepFlight, sampleTelemetry } from './assisted-flight';
import { autopilotCommand, captureHold, headingError, type AutopilotMode } from './autopilot';

const env = {
  sampleGround: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, kind: 'land' as const }),
};
const heading = (state: FlightState): number =>
  headingDegreesFromYaw(flightEuler(state.attitude).yawRad);
const bankDegrees = (state: FlightState): number =>
  (-flightEuler(state.attitude).rollRad * 180) / Math.PI;

/** Closed loop against the preserved assisted model, which is the shipped default. */
function fly(
  mode: AutopilotMode,
  seconds: number,
  options: { rollRad?: number; targetBearing?: number; altitudeOffset?: number } = {},
): FlightState {
  let state = createFlightState({
    position: { x: 0, y: 4000, z: 0 },
    airspeed: 220,
    ...(options.rollRad === undefined ? {} : { rollRad: options.rollRad }),
  });
  const hold = captureHold(state);
  hold.altitudeM += options.altitudeOffset ?? 0;
  let telemetry = sampleTelemetry(state, env, PLACEHOLDER_AIRCRAFT);
  for (let i = 0; i < seconds * 120; i++) {
    const command = autopilotCommand(
      mode,
      hold,
      state,
      telemetry,
      PLACEHOLDER_AIRCRAFT,
      options.targetBearing,
    );
    const next = stepFlight(
      state,
      { ...command, throttle: 0.75, brake: false, gearDown: false },
      env,
      PLACEHOLDER_AIRCRAFT,
      1 / 120,
    );
    state = next.state;
    telemetry = next.telemetry;
  }
  return state;
}

test('level hold rolls out of a bank and returns to the captured heading and altitude', () => {
  const state = fly('level', 90, { rollRad: -0.4 });
  expect(state.status).toBe('airborne');
  expect(Math.abs(bankDegrees(state))).toBeLessThan(2);
  expect(Math.abs(headingError(180, heading(state)))).toBeLessThan(3);
  expect(Math.abs(state.position.y - 4000)).toBeLessThan(60);
});

test('level hold climbs back to a captured altitude it starts well below', () => {
  const state = fly('level', 120, { altitudeOffset: 600 });
  expect(state.status).toBe('airborne');
  expect(Math.abs(state.position.y - 4600)).toBeLessThan(60);
  // The climb is flown as a hold, not a zoom: it must not have stalled getting there.
  expect(sampleTelemetry(state, env, PLACEHOLDER_AIRCRAFT).stalled).toBe(false);
});

test('waypoint mode turns onto a supplied bearing and stops there', () => {
  const state = fly('waypoint', 120, { targetBearing: 90 });
  expect(Math.abs(headingError(90, heading(state)))).toBeLessThan(4);
  expect(Math.abs(bankDegrees(state))).toBeLessThan(4);
  expect(Math.abs(state.position.y - 4000)).toBeLessThan(80);
});

test('waypoint mode without a bearing falls back to the captured heading hold', () => {
  const state = fly('waypoint', 90, { rollRad: -0.4 });
  expect(Math.abs(headingError(180, heading(state)))).toBeLessThan(3);
});

test('the hold never commands anything while off, grounded or below control speed', () => {
  const airborne = createFlightState({ position: { x: 0, y: 4000, z: 0 }, airspeed: 220 });
  const hold = captureHold(airborne);
  const telemetry = sampleTelemetry(airborne, env, PLACEHOLDER_AIRCRAFT);
  const zero = { pitch: 0, roll: 0, yaw: 0 };
  expect(autopilotCommand('off', hold, airborne, telemetry, PLACEHOLDER_AIRCRAFT)).toEqual(zero);
  expect(
    autopilotCommand(
      'level',
      hold,
      { ...airborne, status: 'grounded' },
      telemetry,
      PLACEHOLDER_AIRCRAFT,
    ),
  ).toEqual(zero);
  const slow = createFlightState({ position: { x: 0, y: 4000, z: 0 }, airspeed: 20 });
  expect(
    autopilotCommand(
      'level',
      hold,
      slow,
      sampleTelemetry(slow, env, PLACEHOLDER_AIRCRAFT),
      PLACEHOLDER_AIRCRAFT,
    ),
  ).toEqual(zero);
});

test('signed heading error takes the short way round in both directions', () => {
  expect(headingError(10, 350)).toBe(20);
  expect(headingError(350, 10)).toBe(-20);
  // The range is half open, so an exact reversal resolves to a left turn.
  expect(headingError(180, 0)).toBe(-180);
});
