import { expect, test } from 'bun:test';
import {
  applyViewAction,
  gunTriggerHeld,
  stepCameraLook,
  updateHeldPilotKeys,
} from './FlightInput';

function key(keys: Set<string>, code: string, type = 'keydown', shiftKey = false, editing = false) {
  return updateHeldPilotKeys(keys, { code, type, shiftKey }, editing);
}

test('Shift claims existing and newly held arrows through either release order', () => {
  const keys = new Set<string>();
  key(keys, 'ArrowRight');
  key(keys, 'ShiftLeft', 'keydown', true);
  expect(keys.has('ArrowRight')).toBe(false);
  const state = { cameraYaw: 0, cameraPitch: 0, gunSafe: true };
  stepCameraLook(state, keys, 0.5);
  expect(state.cameraYaw).toBeCloseTo(Math.PI / 4);
  key(keys, 'ShiftLeft', 'keyup');
  key(keys, 'ArrowRight'); // browser repeats after Shift release must not move the aircraft
  expect(keys.has('ArrowRight')).toBe(false);
  stepCameraLook(state, keys, 0.5);
  expect(state.cameraYaw).toBeCloseTo(Math.PI / 4);
  key(keys, 'ArrowRight', 'keyup', false, true);
  expect(keys.size).toBe(0);
  key(keys, 'ShiftRight', 'keydown', true);
  key(keys, 'ArrowUp', 'keydown', true);
  expect(keys.has('ArrowUp')).toBe(false);
  stepCameraLook(state, keys, 4);
  expect(state.cameraPitch).toBeLessThan(Math.PI / 2);
  key(keys, 'ArrowUp', 'keyup', true);
  key(keys, 'ShiftRight', 'keyup');
  expect(keys.size).toBe(0);
});

test('Shift slash centers once and safety toggles once per press', () => {
  const state = { cameraYaw: 1, cameraPitch: 0.4, gunSafe: true };
  const event = { type: 'keydown', code: 'Slash', shiftKey: true, repeat: false };
  applyViewAction(state, event);
  expect(state).toEqual({ cameraYaw: 0, cameraPitch: 0, gunSafe: true });
  applyViewAction(state, { ...event, code: 'Tab' });
  expect(state.gunSafe).toBe(false);
  applyViewAction(state, { ...event, code: 'Tab', repeat: true });
  expect(state.gunSafe).toBe(false);
  applyViewAction(state, { ...event, code: 'Tab', type: 'keyup' });
  expect(state.gunSafe).toBe(false);
});

test('safety gesture never fires until Tab is released, including Shift pressed after Tab', () => {
  for (const tabFirst of [false, true]) {
    const keys = new Set<string>();
    if (tabFirst) key(keys, 'Tab');
    key(keys, 'ShiftLeft', 'keydown', true);
    key(keys, 'Tab', 'keydown', true);
    expect(gunTriggerHeld(keys)).toBe(false);
    key(keys, 'ShiftLeft', 'keyup');
    key(keys, 'Tab');
    expect(gunTriggerHeld(keys)).toBe(false);
    key(keys, 'Tab', 'keyup');
    key(keys, 'Tab');
    expect(gunTriggerHeld(keys)).toBe(true);
    key(keys, 'Tab', 'keyup', false, true);
    expect(gunTriggerHeld(keys)).toBe(false);
    expect(keys.size).toBe(0);
  }
});

test('form focus clears camera and trigger held states', () => {
  const keys = new Set(['Tab', 'ShiftLeft', 'LookArrowDown', 'GunBlocked']);
  expect(key(keys, 'Tab', 'keydown', false, true)).toBe(false);
  expect(keys.size).toBe(0);
});

test('a repeating Tab cannot resume firing after focus or reset cleared held keys', () => {
  const keys = new Set<string>();
  updateHeldPilotKeys(keys, { type: 'keydown', code: 'Tab', repeat: true }, false);
  expect(gunTriggerHeld(keys)).toBe(false);
  key(keys, 'Tab', 'keyup');
  key(keys, 'Tab');
  expect(gunTriggerHeld(keys)).toBe(true);
});
