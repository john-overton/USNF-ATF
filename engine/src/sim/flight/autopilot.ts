/**
 * Autopilot, in the spirit of the two originals: a hands-off hold that flies the
 * aeroplane through the same stick the pilot uses, not a separate integrator that
 * teleports the state. Every output here is an ordinary control deflection in
 * [-1, 1], so the flight model, the wind field and the ground remain in charge and
 * either flight backend behaves the same way.
 *
 * `level` holds the wings level on the heading and altitude captured when it was
 * engaged. `waypoint` keeps the altitude hold and steers the heading to a bearing
 * the caller supplies, which is the selected waypoint's.
 *
 * Both models take a rate command on each axis and lag it by `responseSeconds`, so
 * the loops here ask for a rate directly and normalise by the aircraft's own limit.
 * That keeps the gains physical -- degrees per second, metres per second -- instead
 * of tuned to one airframe's authority, and the model's lag supplies the damping.
 */
import type { AircraftDefinition } from '../../data/aircraft';
import {
  flightEuler,
  headingDegreesFromYaw,
  type FlightState,
  type FlightTelemetry,
} from './index';

export type AutopilotMode = 'off' | 'level' | 'waypoint';

export interface AutopilotHold {
  /** Bearing to fly in `level`, degrees clockwise from north. */
  headingDegrees: number;
  /** Barometric altitude to hold, metres MSL. */
  altitudeM: number;
}

export interface AutopilotCommand {
  pitch: number;
  roll: number;
  yaw: number;
}

/** A standard-rate-ish turn; the originals never rolled past this hands-off. */
const MAX_BANK_RAD = (30 * Math.PI) / 180;
/** Bank asked for per radian of heading error, then capped at MAX_BANK_RAD. */
const HEADING_TO_BANK = 1.6;
/** Roll rate asked for per radian of bank error, and its own ceiling. */
const BANK_GAIN = 1.1;
const MAX_BANK_RATE = 0.35;
/** Climb rate asked for per metre of altitude error, and its ceiling in m/s. */
const ALTITUDE_GAIN = 0.06;
const MAX_CLIMB_MPS = 20;
/** Pitch rate asked for per radian of pitch error, and its ceiling. */
const PITCH_GAIN = 1.2;
const MAX_PITCH_RATE = 0.2;
/** Below this the flight path angle is meaningless and the hold would demand nonsense. */
const MIN_CONTROL_SPEED = 40;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Signed difference between two bearings, degrees in [-180, 180). */
export function headingError(targetDegrees: number, currentDegrees: number): number {
  return ((targetDegrees - currentDegrees + 540) % 360) - 180;
}

/** The hold an engagement captures: wings-level on today's heading and altitude. */
export function captureHold(state: FlightState): AutopilotHold {
  return {
    headingDegrees: headingDegreesFromYaw(flightEuler(state.attitude).yawRad),
    altitudeM: state.position.y,
  };
}

/**
 * `targetBearingDegrees` is only read in `waypoint` mode. When it is absent -- no
 * waypoint selected, or the aircraft is on top of it -- the hold reverts to its
 * captured heading rather than steering toward an undefined bearing.
 */
export function autopilotCommand(
  mode: AutopilotMode,
  hold: AutopilotHold,
  state: FlightState,
  telemetry: FlightTelemetry,
  definition: AircraftDefinition,
  targetBearingDegrees?: number,
): AutopilotCommand {
  const level = { pitch: 0, roll: 0, yaw: 0 };
  if (mode === 'off' || state.status !== 'airborne') return level;
  if (!Number.isFinite(hold.altitudeM) || !Number.isFinite(hold.headingDegrees)) return level;
  const speed = telemetry.airspeed;
  if (!Number.isFinite(speed) || speed < MIN_CONTROL_SPEED) return level;

  const { pitchRad, yawRad, rollRad } = flightEuler(state.attitude);
  const bank = -rollRad;
  const target =
    mode === 'waypoint' &&
    targetBearingDegrees !== undefined &&
    Number.isFinite(targetBearingDegrees)
      ? targetBearingDegrees
      : hold.headingDegrees;
  const error = (headingError(target, headingDegreesFromYaw(yawRad)) * Math.PI) / 180;
  const wantedBank = clamp(HEADING_TO_BANK * error, -MAX_BANK_RAD, MAX_BANK_RAD);
  const bankRate = clamp(BANK_GAIN * (wantedBank - bank), -MAX_BANK_RATE, MAX_BANK_RATE);

  const climb = clamp(
    ALTITUDE_GAIN * (hold.altitudeM - state.position.y),
    -MAX_CLIMB_MPS,
    MAX_CLIMB_MPS,
  );
  // Flight path angle that produces that climb rate, then the body attitude that
  // produces that path: the aircraft flies at alpha above its own path, and a banked
  // turn needs more of it again to carry the extra load.
  const path = Math.asin(clamp(climb / speed, -0.5, 0.5));
  const turn = telemetry.alphaRad * (1 / Math.max(0.5, Math.cos(bank)) - 1);
  const wantedPitch = clamp(path + telemetry.alphaRad + turn, -0.5, 0.5);
  const pitchRate = clamp(PITCH_GAIN * (wantedPitch - pitchRad), -MAX_PITCH_RATE, MAX_PITCH_RATE);

  return {
    pitch: clamp(pitchRate / definition.controls.pitchRateRadS, -1, 1),
    roll: clamp(bankRate / definition.controls.rollRateRadS, -1, 1),
    yaw: 0,
  };
}
