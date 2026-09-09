import { expect, test } from 'bun:test';
import { Vector3 } from 'three';
import { surfaceAngle } from './ControlSurfaces';

const neutral = { pitch: 0, roll: 0, yaw: 0, flap: 0, airbrake: 0 };

test('taileron pitch raises both trailing edges; right roll lowers left and raises right', () => {
  const trailingEdge = new Vector3(0, 0, 1);
  const axis = new Vector3(1, 0, 0);
  for (const side of ['left', 'right']) {
    const angle = surfaceAngle(`taileron-${side}-color`, { ...neutral, pitch: 1 });
    expect(trailingEdge.clone().applyAxisAngle(axis, angle).y).toBeGreaterThan(0);
  }
  const left = surfaceAngle('taileron-left-color', { ...neutral, roll: 1 });
  const right = surfaceAngle('taileron-right-color', { ...neutral, roll: 1 });
  expect(trailingEdge.clone().applyAxisAngle(axis, left).y).toBeLessThan(0);
  expect(trailingEdge.clone().applyAxisAngle(axis, right).y).toBeGreaterThan(0);
});

test('flaps drop, rudders deflect right, and speedbrake clamshell opens outward', () => {
  const aft = new Vector3(0, 0, 1);
  const x = new Vector3(1, 0, 0);
  expect(
    aft.clone().applyAxisAngle(x, surfaceAngle('flap-left-color', { ...neutral, flap: 1 })).y,
  ).toBeLessThan(0);
  expect(
    aft
      .clone()
      .applyAxisAngle(
        new Vector3(0, 1, 0),
        surfaceAngle('rudder-right-textured', { ...neutral, yaw: 1 }),
      ).x,
  ).toBeGreaterThan(0);
  expect(
    aft.clone().applyAxisAngle(x, surfaceAngle('airbrake-upper-color', { ...neutral, airbrake: 1 }))
      .y,
  ).toBeGreaterThan(0);
  expect(
    aft.clone().applyAxisAngle(x, surfaceAngle('airbrake-lower-color', { ...neutral, airbrake: 1 }))
      .y,
  ).toBeLessThan(0);
  expect(surfaceAngle('body-color', { ...neutral, airbrake: 1 })).toBe(0);
  expect(surfaceAngle('flap-right-color', { ...neutral, flap: 2 })).toBe(0.52);
});
