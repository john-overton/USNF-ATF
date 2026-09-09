import { expect, test } from 'bun:test';
import { applyWaypointAction, waypointGuidance } from './navigation';
import { updateHeldPilotKeys } from './FlightInput';

test('navigation bearings use east/north coordinates and shortest signed heading error', () => {
  const position = { x: 200000, z: 300000 };
  for (const [dx, dz, bearing] of [
    [0, 1852, 0],
    [1852, 0, 90],
    [0, -1852, 180],
    [-1852, 0, 270],
  ]) {
    const result = waypointGuidance(position, 350, {
      id: 1,
      name: 'Test',
      x: position.x + dx!,
      z: position.z + dz!,
    });
    expect(result.bearingDegrees).toBeCloseTo(bearing!, 9);
    expect(result.distanceNm).toBeCloseTo(1, 9);
    expect(result.arrived).toBe(false);
    expect(result.relativeDegrees).toBeGreaterThanOrEqual(-180);
    expect(result.relativeDegrees).toBeLessThan(180);
    if (bearing === 0) expect(result.relativeDegrees).toBe(10);
  }
  expect(waypointGuidance(position, 10, { id: 1, name: 'Here', ...position }).arrived).toBe(true);
});

test('brackets wrap all destinations, ignore repeats and respect form focus', () => {
  const state = { waypointIndex: 0 };
  const keys = new Set<string>();
  function dispatch(code: string, editing = false, repeat = false, type = 'keydown') {
    const event = { type, code, repeat };
    if (updateHeldPilotKeys(keys, event, editing) && !editing) applyWaypointAction(state, event);
  }
  dispatch('BracketLeft');
  expect(state.waypointIndex).toBe(2);
  dispatch('BracketRight');
  expect(state.waypointIndex).toBe(0);
  dispatch('BracketRight');
  expect(state.waypointIndex).toBe(1);
  dispatch('BracketRight', false, true);
  dispatch('BracketRight', false, false, 'keyup');
  dispatch('BracketRight', true);
  expect(state.waypointIndex).toBe(1);
  expect(keys.size).toBe(0);
  dispatch('BracketRight');
  expect(state.waypointIndex).toBe(2);
  dispatch('BracketRight');
  expect(state.waypointIndex).toBe(0);
});
