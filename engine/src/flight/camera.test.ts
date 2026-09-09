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
