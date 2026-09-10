import { expect, test } from 'bun:test';
import { Euler, Quaternion, Vector3 } from 'three';
import { flightCamera } from './FlightCamera';

test('F2 camera basis stays attached through bank and inverted flight; F3 up stays world vertical', () => {
  for (const roll of [0, 0.7, Math.PI / 2, Math.PI]) {
    const attitude = new Quaternion().setFromEuler(new Euler(0.3, 1.2, roll, 'YXZ'));
    const position = new Vector3(300000, 4000, 200000);
    const locked = flightCamera(position, attitude, 'attitude');
    expect(
      locked.up
        .clone()
        .applyQuaternion(attitude.clone().invert())
        .distanceTo(new Vector3(0, 1, 0)),
    ).toBeLessThan(1e-10);
    expect(
      locked.camera
        .clone()
        .sub(position)
        .applyQuaternion(attitude.clone().invert())
        .distanceTo(new Vector3(0, 10, 38)),
    ).toBeLessThan(1e-9);
    expect(flightCamera(position, attitude, 'world-up').up.toArray()).toEqual([0, 1, 0]);
  }
});

test('cockpit eye and look rotate in the full aircraft basis without moving the eye', () => {
  const position = new Vector3(400000, 2300, -300000);
  const attitude = new Quaternion().setFromEuler(new Euler(0.2, 1, Math.PI));
  const cockpitEye = new Vector3(0, 2, -5);
  const centered = flightCamera(position, attitude, 'cockpit', { yaw: 0, pitch: 0, cockpitEye });
  const right = flightCamera(position, attitude, 'cockpit', {
    yaw: Math.PI / 2,
    pitch: 0,
    cockpitEye,
  });
  const above = flightCamera(position, attitude, 'cockpit', {
    yaw: 0,
    pitch: Math.PI / 4,
    cockpitEye,
  });
  expect(right.camera.distanceTo(centered.camera)).toBe(0);
  expect(
    right.look
      .clone()
      .sub(right.camera)
      .applyQuaternion(attitude.clone().invert())
      .normalize()
      .distanceTo(new Vector3(1, 0, 0)),
  ).toBeLessThan(1e-10);
  const aboveLocal = above.look
    .clone()
    .sub(above.camera)
    .applyQuaternion(attitude.clone().invert())
    .normalize();
  expect(aboveLocal.y).toBeCloseTo(Math.SQRT1_2, 10);
  expect(aboveLocal.z).toBeCloseTo(-Math.SQRT1_2, 10);
  expect(cockpitEye.toArray()).toEqual([0, 2, -5]);
});

test('external look orbits retain aircraft target and distance', () => {
  const position = new Vector3(100, 200, 300);
  const attitude = new Quaternion();
  const center = flightCamera(position, attitude, 'attitude');
  const side = flightCamera(position, attitude, 'attitude', { yaw: Math.PI / 2, pitch: 0 });
  expect(side.look.toArray()).toEqual(center.look.toArray());
  expect(side.camera.distanceTo(position)).toBeCloseTo(center.camera.distanceTo(position), 10);
  expect(side.camera.x).toBeCloseTo(138, 10);
});

test('external pitch remains short of the up-vector pole even with the raised chase offset', () => {
  const position = new Vector3();
  const attitude = new Quaternion();
  const raised = flightCamera(position, attitude, 'attitude', { yaw: 0, pitch: Math.PI * 0.49 });
  expect(raised.camera.z).toBeGreaterThan(0);
  expect(raised.look.clone().sub(raised.camera).cross(raised.up).length()).toBeGreaterThan(1);
});
