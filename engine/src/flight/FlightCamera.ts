import { Euler, Quaternion, Vector3 } from 'three';
import type { ChaseCameraMode } from './FlightInput';

export interface CameraLook {
  /** Radians: positive yaw looks right; positive pitch looks up. */
  yaw: number;
  pitch: number;
  /** Authored eye in aircraft-local metres, not a recovered native cockpit position. */
  cockpitEye?: Vector3;
}
/** F1 looks from the pilot; F2 follows aircraft attitude; F3 keeps a world-up horizon. */
export function flightCamera(
  position: Vector3,
  attitude: Quaternion,
  mode: ChaseCameraMode,
  view: CameraLook = { yaw: 0, pitch: 0 },
) {
  if (mode === 'cockpit') {
    const camera = (view.cockpitEye ?? new Vector3(0, 1.5, -3))
      .clone()
      .applyQuaternion(attitude)
      .add(position);
    const lookRotation = new Quaternion().setFromEuler(new Euler(view.pitch, -view.yaw, 0, 'YXZ'));
    const basis = attitude.clone().multiply(lookRotation);
    const look = new Vector3(0, 0, -100).applyQuaternion(basis).add(camera);
    const up = new Vector3(0, 1, 0).applyQuaternion(basis);
    return { camera, look, up };
  }
  // Include the chase's initial elevation in the pitch clamp; rotating its already
  // raised offset past vertical would make lookAt flip the external view upside down.
  const elevation = Math.max(
    -Math.PI * 0.49,
    Math.min(Math.PI * 0.49, Math.atan2(10, 38) + view.pitch),
  );
  const distance = Math.hypot(10, 38);
  const camera = new Vector3(
    Math.sin(view.yaw) * Math.cos(elevation) * distance,
    Math.sin(elevation) * distance,
    Math.cos(view.yaw) * Math.cos(elevation) * distance,
  )
    .applyQuaternion(attitude)
    .add(position);
  const look = new Vector3(0, 2, 0).applyQuaternion(attitude).add(position);
  const up = new Vector3(0, 1, 0);
  if (mode === 'attitude') up.applyQuaternion(attitude);
  return { camera, look, up };
}
