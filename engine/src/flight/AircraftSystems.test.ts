import { describe, expect, test } from 'bun:test';
import { createAircraftSystems, stepAircraftSystems } from './AircraftSystems';
import { applyPilotAction, updateHeldPilotKeys, type AircraftCommands } from './FlightInput';

function commands(): AircraftCommands & { resetRequested: boolean } {
  return {
    throttle: 0,
    engineRunning: true,
    afterburner: false,
    gearDown: true,
    hookDown: false,
    flapsDown: false,
    airbrakeDown: false,
    cameraMode: 'world-up',
    autopilot: 'off',
    resetRequested: false,
  };
}
function press(state: ReturnType<typeof commands>, code: string, repeat = false): void {
  applyPilotAction(state, { type: 'keydown', code, repeat });
}
describe('USNF-style pilot commands', () => {
  test('six throttle presets select idle through afterburner without starting a stopped engine', () => {
    const state = commands();
    state.engineRunning = false;
    for (const [index, throttle] of [0, 0.25, 0.5, 0.75, 1, 1].entries()) {
      press(state, `Digit${index + 1}`);
      expect(state.throttle).toBe(throttle);
      expect(state.afterburner).toBe(index === 5);
      expect(state.engineRunning).toBe(false);
    }
    press(state, 'Digit5');
    expect(state.afterburner).toBe(false);
  });
  test('toggles ignore key repeat and releases; all camera modes are directly selectable', () => {
    const state = commands();
    for (const code of ['KeyT', 'KeyG', 'KeyH']) {
      press(state, code);
      press(state, code, true);
      applyPilotAction(state, { code, type: 'keyup', repeat: false });
    }
    expect(state.engineRunning).toBe(false);
    expect(state.gearDown).toBe(false);
    expect(state.hookDown).toBe(true);
    press(state, 'F1');
    expect(state.cameraMode).toBe('cockpit');
    press(state, 'F2');
    expect(state.cameraMode).toBe('attitude');
    press(state, 'F3');
    expect(state.cameraMode).toBe('world-up');
  });
  test('new bindings obey form focus and release guards', () => {
    const keys = new Set(['ArrowDown']);
    expect(updateHeldPilotKeys(keys, { type: 'keydown', code: 'Digit6' }, true)).toBe(false);
    expect(keys.size).toBe(0);
    expect(updateHeldPilotKeys(keys, { type: 'keydown', code: 'KeyG' }, false)).toBe(true);
    expect(updateHeldPilotKeys(keys, { type: 'keyup', code: 'KeyG' }, true)).toBe(true);
    expect(keys.size).toBe(0);
  });
});
describe('fixed-step aircraft systems', () => {
  test('gear and hook animate, reverse without jumping and finish exactly at endpoints', () => {
    const input = commands();
    input.gearDown = false;
    input.hookDown = true;
    let state = createAircraftSystems();
    for (let i = 0; i < 120; i++) state = stepAircraftSystems(state, input, 1 / 120);
    expect(state.gearFraction).toBeCloseTo(2 / 3, 10);
    expect(state.hookFraction).toBeCloseTo(2 / 3, 10);
    input.gearDown = true;
    input.hookDown = false;
    const next = stepAircraftSystems(state, input, 1 / 120);
    expect(next.gearFraction - state.gearFraction).toBeCloseTo(1 / 360, 10);
    expect(state.hookFraction - next.hookFraction).toBeCloseTo(1 / 180, 10);
    for (let i = 0; i < 361; i++) state = stepAircraftSystems(state, input, 1 / 120);
    expect(state.gearFraction).toBe(1);
    expect(state.hookFraction).toBe(0);
    input.gearDown = false;
    input.hookDown = true;
    for (let i = 0; i < 361; i++) state = stepAircraftSystems(state, input, 1 / 120);
    expect(state.gearFraction).toBe(0);
    expect(state.hookFraction).toBe(1);
  });
  test('afterburner produces extra thrust, cutoff removes all thrust and restart spools', () => {
    const input = commands();
    press(input, 'Digit6');
    let state = createAircraftSystems();
    for (let i = 0; i < 60; i++) state = stepAircraftSystems(state, input, 1 / 120);
    expect(state.thrustMultiplier).toBe(1.5);
    expect(state.effectiveThrottle).toBe(1);
    press(input, 'KeyT');
    state = stepAircraftSystems(state, input, 1 / 120);
    expect(state.effectiveThrottle).toBe(0);
    expect(state.thrustMultiplier).toBe(1);
    expect(state.engineSpool).toBeLessThan(1);
    for (let i = 0; i < 240; i++) state = stepAircraftSystems(state, input, 1 / 120);
    expect(state.engineSpool).toBe(0);
    expect(state.afterburnerFraction).toBe(0);
    press(input, 'KeyT');
    state = stepAircraftSystems(state, input, 1 / 120);
    expect(state.effectiveThrottle).toBeCloseTo(1 / 240, 10);
    for (let i = 0; i < 240; i++) state = stepAircraftSystems(state, input, 1 / 120);
    expect(state.engineSpool).toBe(1);
    press(input, 'Digit3');
    state = stepAircraftSystems(state, input, 1 / 120);
    expect(state.effectiveThrottle).toBe(0.5);
    expect(state.thrustMultiplier).toBe(1);
  });
  test('transitions are independent of render grouping and do not mutate previous state', () => {
    const input = commands();
    input.gearDown = false;
    input.hookDown = true;
    const initial = createAircraftSystems();
    let thirty = initial;
    let sixty = initial;
    for (let frame = 0; frame < 30; frame++)
      for (let tick = 0; tick < 4; tick++) thirty = stepAircraftSystems(thirty, input, 1 / 120);
    for (let frame = 0; frame < 60; frame++)
      for (let tick = 0; tick < 2; tick++) sixty = stepAircraftSystems(sixty, input, 1 / 120);
    expect(thirty).toEqual(sixty);
    expect(initial).toEqual(createAircraftSystems());
    expect(() => stepAircraftSystems(initial, input, Number.NaN)).toThrow();
    expect(() => stepAircraftSystems(initial, input, 1)).toThrow();
  });
});

test('F and B latch flaps and speed brakes; actuator travel is continuous and reversible', () => {
  const input = commands();
  press(input, 'KeyF');
  press(input, 'KeyB');
  press(input, 'KeyB', true);
  expect(input.flapsDown).toBe(true);
  expect(input.airbrakeDown).toBe(true);
  let state = createAircraftSystems();
  for (let i = 0; i < 60; i++) state = stepAircraftSystems(state, input, 1 / 120);
  expect(state.flapFraction).toBeCloseTo(0.25, 10);
  expect(state.airbrakeFraction).toBeCloseTo(0.5, 10);
  press(input, 'KeyF');
  press(input, 'KeyB');
  for (let i = 0; i < 60; i++) state = stepAircraftSystems(state, input, 1 / 120);
  expect(state.flapFraction).toBeCloseTo(0, 10);
  expect(state.airbrakeFraction).toBeCloseTo(0, 10);
});
