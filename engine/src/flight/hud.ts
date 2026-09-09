import { flightEuler, type FlightState, type FlightTelemetry } from '../sim/flight';

const DEG = 180 / Math.PI;
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
export const wrapHeading = (degrees: number): number => ((degrees % 360) + 360) % 360;

/** Aircraft-relative instruments, not a projection through either chase camera. */
export function flightHudReadout(state: FlightState, telemetry: FlightTelemetry) {
  const { pitchRad, yawRad, rollRad } = flightEuler(state.attitude);
  // World +Z is north. The aircraft points south at identity, and positive yaw turns left.
  const heading = wrapHeading(180 + yawRad * DEG);
  const q = state.attitude;
  const v = state.velocity;
  // Rotate ground velocity by the inverse aircraft quaternion into body coordinates.
  const tx = 2 * (-q.y * v.z + q.z * v.y);
  const ty = 2 * (-q.z * v.x + q.x * v.z);
  const tz = 2 * (-q.x * v.y + q.y * v.x);
  const body = {
    x: v.x + q.w * tx - q.y * tz + q.z * ty,
    y: v.y + q.w * ty - q.z * tx + q.x * tz,
    z: v.z + q.w * tz - q.x * ty + q.y * tx,
  };
  const horizontal = Math.hypot(body.x, body.z);
  const drift = Math.atan2(body.x, -body.z) * DEG;
  const pathPitch = Math.atan2(body.y, horizontal) * DEG;
  const pathVisible = Math.hypot(v.x, v.y, v.z) >= 5 && -body.z > 0;
  return {
    heading,
    headingText: String(Math.round(heading) % 360).padStart(3, '0'),
    pitchDegrees: pitchRad * DEG,
    rollDegrees: rollRad * DEG,
    speedKnots: telemetry.airspeed * 1.9438444924406,
    altitudeFeet: state.position.y / 0.3048,
    clearanceFeet:
      telemetry.groundClearance === undefined ? null : telemetry.groundClearance / 0.3048,
    verticalFeetPerMinute: (v.y / 0.3048) * 60,
    path: {
      visible: pathVisible,
      x: clamp(drift * 5, -145, 145),
      y: clamp(-pathPitch * 5, -145, 145),
      limited: Math.abs(drift) > 29 || Math.abs(pathPitch) > 29,
    },
  };
}
