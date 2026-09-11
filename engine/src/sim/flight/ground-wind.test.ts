import { expect, test } from 'bun:test';
import { groundWindEnvironment, groundWindFraction } from './ground-wind';
import {
  createFlightState,
  NEUTRAL_CONTROLS,
  PLACEHOLDER_AIRCRAFT,
  sampleTelemetry,
  stepFlight,
  type FlightEnvironment,
} from './index';

const env: FlightEnvironment = {
  sampleGround: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, kind: 'land' }),
  wind: { x: 15, y: 2, z: 10 },
};
function taxi(knots: number) {
  const state = createFlightState({
    position: { x: 0, y: PLACEHOLDER_AIRCRAFT.gearHeightM, z: 0 },
    airspeed: (knots * 1852) / 3600,
  });
  state.status = 'grounded';
  return state;
}

test('ground wind ramps by horizontal ground speed, with full airborne wind', () => {
  for (const [knots, expected] of [
    [0, 0.05],
    [2, 0.0626666667],
    [75, 0.525],
    [150, 1],
    [200, 1],
  ]) {
    const state = taxi(knots!);
    expect(groundWindFraction(state)).toBeCloseTo(expected!, 8);
    state.velocity.y = 40;
    expect(groundWindFraction(state)).toBeCloseTo(expected!, 8);
    state.velocity.x = -state.velocity.z;
    state.velocity.z = 0;
    expect(groundWindFraction(state)).toBeCloseTo(expected!, 8);
    state.status = 'airborne';
    expect(groundWindEnvironment(state, env)).toBe(env);
  }
  expect(groundWindEnvironment(taxi(0), env).wind).toEqual({ x: 0.75, y: 0.1, z: 0.5 });
  expect(env.wind).toEqual({ x: 15, y: 2, z: 10 });
});

test('taxi physics uses attenuated wind while telemetry still reports actual air mass', () => {
  const state = taxi(2);
  const controls = { ...NEUTRAL_CONTROLS, gearDown: true };
  const reduced = groundWindEnvironment(state, env);
  // An airborne-labelled state at contact skips assistance, letting this verify
  // that the full integrator actually receives the expected reduced wind once.
  const reference = stepFlight({ ...state, status: 'airborne' }, controls, reduced);
  const assisted = stepFlight(state, controls, env);
  expect(assisted.state.velocity).toEqual(reference.state.velocity);
  expect(sampleTelemetry(state, env).airspeed).toBeGreaterThan(
    sampleTelemetry(state, reduced).airspeed,
  );
  const noWind = { sampleGround: (x: number, z: number) => env.sampleGround(x, z) };
  expect(groundWindEnvironment(state, noWind)).toBe(noWind);
});
