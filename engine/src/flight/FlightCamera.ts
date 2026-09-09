import { type Quaternion, Vector3 } from 'three';

/** F2 follows aircraft attitude; F3 retains the existing horizon-up chase. */
export function flightCamera(
  position: Vector3,
  attitude: Quaternion,
  mode: 'attitude' | 'world-up',
) {
  const camera = new Vector3(0, 10, 38).applyQuaternion(attitude).add(position);
  const look = new Vector3(0, 2, -30).applyQuaternion(attitude).add(position);
  const up = new Vector3(0, 1, 0);
  if (mode === 'attitude') up.applyQuaternion(attitude);
  return { camera, look, up };
}
