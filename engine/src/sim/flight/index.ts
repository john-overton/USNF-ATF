import rawAircraft from '../../data/placeholder-aircraft.json';
import type { DamageEffects } from '../combat/damage';
import { fitEnvelopeAero } from './retail-envelope';
import { recoveredEnvelopeBounds } from './native-envelope-adapter';
import { recoveredFlightPoint, recoveredLongitudinalForces } from './retail-dynamics';
import { nativeSoundSpeedFps } from './native-drag';
import { parseAircraftDefinition, type AircraftDefinition } from '../../data/aircraft';
export type { AircraftDefinition } from '../../data/aircraft';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Quaternion extends Vec3 {
  w: number;
}
export interface GroundSample {
  height: number;
  normal: Vec3;
  kind: 'land' | 'water';
}
export interface FlightEnvironment {
  sampleGround(x: number, z: number): GroundSample | undefined;
  wind?: Vec3;
  damage?: DamageEffects;
}
export interface FlightControls {
  pitch: number;
  roll: number;
  yaw: number;
  throttle: number;
  brake: boolean;
  /** Original systems adapter; omitted preserves the baseline aircraft. */
  thrustMultiplier?: number;
  gearDown?: boolean;
  /** Physical extension for drag; gearDown remains the safe-contact latch. */
  gearFraction?: number;
  flaps?: number;
  airbrake?: number;
}
export type FlightStatus = 'airborne' | 'grounded' | 'crashed' | 'waiting-terrain';
export interface FlightState {
  position: Vec3;
  velocity: Vec3;
  attitude: Quaternion;
  /** Body XYZ right-hand angular rates, radians/second. */
  angularVelocity: Vec3;
  status: FlightStatus;
  timeSeconds: number;
}
export interface FlightTelemetry {
  airspeed: number;
  alphaRad: number;
  mach: number;
  loadFactor: number;
  /** Mechanical energy per unit mass, J/kg. */
  specificEnergy: number;
  stalled: boolean;
  groundClearance: number | undefined;
  reason: string;
}
export const PLACEHOLDER_AIRCRAFT = parseAircraftDefinition(rawAircraft);
export const NEUTRAL_CONTROLS: Readonly<FlightControls> = Object.freeze({
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttle: 0,
  brake: false,
});
const G = 9.80665,
  FIXED_DT = 1 / 120;
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, n: number): Vec3 => ({ x: a.x * n, y: a.y * n, z: a.z * n });
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const unit = (a: Vec3): Vec3 => scale(a, 1 / Math.max(1e-12, length(a)));
const conjugate = (q: Quaternion): Quaternion => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
function multiply(a: Quaternion, b: Quaternion): Quaternion {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
function normalized(q: Quaternion): Quaternion {
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}
function rotate(q: Quaternion, v: Vec3): Vec3 {
  const r = multiply(multiply(q, { ...v, w: 0 }), conjugate(q));
  return { x: r.x, y: r.y, z: r.z };
}
/**
 * Compass bearing of a yaw angle, degrees clockwise from north.
 *
 * The world is right-handed with +Y up and +Z north, so east is -X (see
 * Docs/environment-plan.md, and the sky and solar models, which already assume
 * it). A yaw of theta puts the nose along (-sin theta, 0, -cos theta): the north
 * component is -cos theta and the east component is +sin theta, so the bearing is
 * 180 - theta, and a right turn increases it.
 */
export function headingDegreesFromYaw(yawRad: number): number {
  const degrees = 180 - (yawRad * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}
/** Compass bearing from one theater position to another, using east = -X. */
export function bearingDegrees(deltaX: number, deltaZ: number): number {
  const degrees = (Math.atan2(-deltaX, deltaZ) * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}
/** Three YXZ convention: identity forward -Z, up +Y, right +X; positive yaw turns left. */
export function attitudeFromEuler(pitchRad: number, yawRad: number, rollRad: number): Quaternion {
  const p = { x: Math.sin(pitchRad / 2), y: 0, z: 0, w: Math.cos(pitchRad / 2) };
  const y = { x: 0, y: Math.sin(yawRad / 2), z: 0, w: Math.cos(yawRad / 2) };
  const r = { x: 0, y: 0, z: Math.sin(rollRad / 2), w: Math.cos(rollRad / 2) };
  return normalized(multiply(multiply(y, p), r));
}
export function flightEuler(q: Quaternion): { pitchRad: number; yawRad: number; rollRad: number } {
  const right = rotate(q, { x: 1, y: 0, z: 0 }),
    up = rotate(q, { x: 0, y: 1, z: 0 }),
    back = rotate(q, { x: 0, y: 0, z: 1 });
  const pitchRad = Math.asin(-clamp(back.y, -1, 1));
  return Math.abs(back.y) < 0.9999999
    ? { pitchRad, yawRad: Math.atan2(back.x, back.z), rollRad: Math.atan2(right.y, up.y) }
    : { pitchRad, yawRad: Math.atan2(-right.z, right.x), rollRad: 0 };
}
export function createFlightState(initial: {
  position: Vec3;
  airspeed?: number;
  yawRad?: number;
  pitchRad?: number;
  rollRad?: number;
}): FlightState {
  if (
    ![
      initial.position.x,
      initial.position.y,
      initial.position.z,
      initial.airspeed ?? 0,
      initial.yawRad ?? 0,
      initial.pitchRad ?? 0,
      initial.rollRad ?? 0,
    ].every(Number.isFinite) ||
    (initial.airspeed ?? 0) < 0
  )
    throw new Error('Finite flight initial pose and nonnegative airspeed required');
  const attitude = attitudeFromEuler(
    initial.pitchRad ?? 0,
    initial.yawRad ?? 0,
    initial.rollRad ?? 0,
  );
  return {
    position: { ...initial.position },
    velocity: rotate(attitude, { x: 0, y: 0, z: -(initial.airspeed ?? 0) }),
    attitude,
    angularVelocity: { x: 0, y: 0, z: 0 },
    status: 'airborne',
    timeSeconds: 0,
  };
}

/** Bilinear table lookup, clamped to authored operating envelopes. */
export function lookupTable(
  rows: readonly number[],
  columns: readonly number[],
  values: readonly (readonly number[])[],
  row: number,
  column: number,
): number {
  const bracket = (axis: readonly number[], value: number): [number, number] => {
    let i = 0;
    while (i < axis.length - 2 && value > axis[i + 1]!) i++;
    return [i, clamp((value - axis[i]!) / (axis[i + 1]! - axis[i]!), 0, 1)];
  };
  const [i, a] = bracket(rows, row),
    [j, b] = bracket(columns, column);
  return (
    (values[i]![j]! * (1 - b) + values[i]![j + 1]! * b) * (1 - a) +
    (values[i + 1]![j]! * (1 - b) + values[i + 1]![j + 1]! * b) * a
  );
}
/** PT names and 8.8 scaling are research evidence; treating these as relative
 * polar modifiers is an inference, not the recovered native device force law. */
function retailDeviceFactor(def: AircraftDefinition, name: string): number | undefined {
  const raw = def.retail?.rawFields[name];
  if (!raw || typeof raw !== 'object' || !('value' in raw)) return undefined;
  const value = raw.value;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 4096
    ? value / 256
    : undefined;
}
/** Original altitude lapse; PT thrust gives sea-level static force, not a
 * recovered native thrust-vs-altitude/Mach integration law. */
function retailThrustLapse(altitudeM: number): number {
  return Math.exp((-Math.max(0, altitudeM) / 8500) * 0.7);
}
function retailAeroFit(def: AircraftDefinition, altitudeM: number) {
  if (!def.retail) return undefined;
  const profile = def.retail;
  const altitudes = profile.envelopes
    .find((envelope) => envelope.g === 1)!
    .points.map((point) => point.altitudeM);
  const minimum = Math.min(...altitudes),
    maximum = Math.max(...altitudes);
  // Beyond native coverage, continue the nearest fitted coefficients. This is
  // an explicit extrapolation; never silently substitute the trainer polar.
  const epsilon = Math.min(1, (maximum - minimum) / 4);
  const fitAltitude = clamp(altitudeM, minimum, maximum - epsilon);
  const fitAt = (height: number) =>
    fitEnvelopeAero(profile, {
      massKg: profile.emptyMassKg + profile.fuelCapacityKg,
      wingAreaM2: def.wingAreaM2,
      altitudeM: height,
      thrustAtSpeed: () => profile.afterburnerThrustN * retailThrustLapse(height),
      ...(def.nativeEnvelope
        ? {
            boundsAt: (g: number, altitude: number) =>
              recoveredEnvelopeBounds(profile, g, altitude),
          }
        : {}),
    });
  // A valid triangular envelope can have a zero-width lower tip as well.
  const fit = fitAt(fitAltitude) ?? fitAt(clamp(fitAltitude, minimum + epsilon, maximum - epsilon));
  const flapped = def.nativeEnvelope
    ? recoveredEnvelopeBounds(profile, 1, fitAltitude, true)
    : undefined;
  return fit
    ? {
        ...fit,
        nativeFlapLiftMax: flapped
          ? fit.clMax * ((fit.minSpeedMps / flapped.minSpeedMps) ** 2 - 1)
          : undefined,
      }
    : undefined;
}
function liftCoefficient(
  alpha: number,
  mach: number,
  def: AircraftDefinition,
  clMax?: number,
): number {
  if (clMax === undefined)
    return lookupTable(def.aero.alphaRad, def.aero.mach, def.aero.lift, alpha, mach);
  const magnitude = Math.abs(alpha);
  const lift =
    magnitude <= def.stallAlphaRad
      ? (clMax * magnitude) / def.stallAlphaRad
      : clMax *
        Math.cos(
          Math.min(
            Math.PI / 2,
            (((magnitude - def.stallAlphaRad) / (Math.PI / 2 - def.stallAlphaRad)) * Math.PI) / 2,
          ),
        );
  return Math.sign(alpha) * lift;
}
function aerodynamics(state: FlightState, env: FlightEnvironment, def: AircraftDefinition) {
  const wind = env.wind ?? { x: 0, y: 0, z: 0 },
    air = add(state.velocity, scale(wind, -1)),
    speed = length(air);
  const local = rotate(conjugate(state.attitude), air);
  const alpha = speed > 0.5 ? Math.atan2(-local.y, -local.z) : 0;
  const beta = speed > 0.5 ? Math.asin(clamp(local.x / speed, -1, 1)) : 0;
  const rho = 1.225 * Math.exp(-Math.max(0, state.position.y) / 8500),
    mach =
      speed /
      (def.retail?.native
        ? nativeSoundSpeedFps(Math.trunc((state.position.y / 0.3048) * 256)) * 0.3048
        : 340.3);
  const qArea = 0.5 * rho * speed * speed * def.wingAreaM2;
  const fit = retailAeroFit(def, state.position.y);
  if (def.retail && !fit)
    throw new Error('Imported flight envelope cannot be fitted at this altitude');
  const cl = liftCoefficient(alpha, mach, def, fit?.clMax);
  const separated = clamp(
    (Math.abs(alpha) - def.stallAlphaRad) / (Math.PI / 2 - def.stallAlphaRad),
    0,
    1,
  );
  const cd = fit
    ? fit.cd0 + fit.inducedDragK * cl ** 2 + 1.8 * separated ** 2 * Math.sin(alpha) ** 2
    : lookupTable(def.aero.alphaRad, def.aero.mach, def.aero.drag, alpha, mach);
  const forward = rotate(state.attitude, { x: 0, y: 0, z: -1 }),
    up = rotate(state.attitude, { x: 0, y: 1, z: 0 }),
    right = rotate(state.attitude, { x: 1, y: 0, z: 0 });
  const direction = unit(air),
    liftDirection = unit(add(up, scale(direction, -dot(up, direction))));
  const flapLiftMax =
    fit?.nativeFlapLiftMax ??
    (fit ? (retailDeviceFactor(def, 'flapsLift') ?? 0.2 / fit.clMax) * fit.clMax : 0.2);
  return {
    speed,
    alpha,
    beta,
    mach,
    qArea,
    cl,
    cd,
    forward,
    up,
    right,
    direction,
    liftDirection,
    fit,
    flapLiftMax,
    // Authored mapping: the PT 8.8 value supplies modest zero-alpha camber;
    // the envelope's maximum-lift increase is reached at positive stall alpha.
    // A recovered stall-speed bound does not establish native zero-alpha lift.
    flapCamber: Math.min(flapLiftMax, retailDeviceFactor(def, 'flapsLift') ?? 0.2),
  };
}
/** Original flap polar: separate zero-alpha camber from maximum-lift gain,
 * then fade in separated flow. The native force law remains unported. */
function flapLiftCoefficient(
  alpha: number,
  flap: number,
  stallAlpha: number,
  maximum = 0.2,
  camber = maximum,
): number {
  const attached = camber + (maximum - camber) * clamp(alpha / stallAlpha, 0, 1);
  return flap * attached * clamp((stallAlpha + 0.32 - Math.abs(alpha)) / 0.32, 0, 1);
}
export function sampleTelemetry(
  state: FlightState,
  env: FlightEnvironment,
  def: AircraftDefinition = PLACEHOLDER_AIRCRAFT,
  controls: Pick<FlightControls, 'flaps'> = {},
): FlightTelemetry {
  const a = aerodynamics(state, env, def),
    ground = env.sampleGround(state.position.x, state.position.z);
  return {
    airspeed: a.speed,
    alphaRad: a.alpha,
    mach: a.mach,
    loadFactor:
      (a.qArea *
        (a.cl +
          flapLiftCoefficient(
            a.alpha,
            clamp(controls.flaps ?? 0, 0, 1),
            def.stallAlphaRad,
            a.flapLiftMax,
            a.flapCamber,
          ))) /
      (def.massKg * G),
    specificEnergy: 0.5 * dot(state.velocity, state.velocity) + G * state.position.y,
    stalled: a.speed > 5 && Math.abs(a.alpha) > def.stallAlphaRad,
    groundClearance: ground ? state.position.y - ground.height - def.gearHeightM : undefined,
    reason:
      state.status === 'waiting-terrain'
        ? 'Waiting for collision terrain'
        : state.status === 'crashed'
          ? 'Aircraft impacted terrain or water'
          : '',
  };
}

/** Original assisted 6DOF placeholder. Controls positive: pitch up, bank right, yaw right. */
export function stepFlight(
  state: FlightState,
  controls: FlightControls,
  env: FlightEnvironment,
  def: AircraftDefinition = PLACEHOLDER_AIRCRAFT,
  dt = FIXED_DT,
): { state: FlightState; telemetry: FlightTelemetry } {
  if (dt !== FIXED_DT) throw new Error('Flight simulation requires a 1/120 second step');
  if (![controls.pitch, controls.roll, controls.yaw, controls.throttle].every(Number.isFinite))
    throw new Error('Finite flight controls required');
  const finish = (s: FlightState, reason?: string) => ({
    state: s,
    telemetry: { ...sampleTelemetry(s, env, def, controls), ...(reason ? { reason } : {}) },
  });
  if (state.status === 'crashed') return finish(state);
  const ground = env.sampleGround(state.position.x, state.position.z);
  if (!ground) return finish({ ...state, status: 'waiting-terrain' });
  const a = aerodynamics(state, env, def),
    pitch = clamp(controls.pitch, -1, 1),
    roll = clamp(controls.roll, -1, 1),
    yaw = clamp(controls.yaw, -1, 1);
  const flap = clamp(controls.flaps ?? 0, 0, 1);
  const airbrake = clamp(controls.airbrake ?? 0, 0, 1);
  const gear = clamp(controls.gearFraction ?? (controls.gearDown === true ? 1 : 0), 0, 1);
  if (![flap, airbrake, gear].every(Number.isFinite))
    throw new Error('Invalid aerodynamic device controls');
  const onGround =
    state.position.y <= ground.height + def.gearHeightM + 0.02 && state.velocity.y <= 0.1;
  // Solve the unstalled lift branch for a neutral augmented 1g target.
  const nativePoint = def.retail
    ? recoveredFlightPoint(def.retail, state.position.y, a.speed, flap > 0.5, def.massKg)
    : undefined;
  if (nativePoint && env.damage) {
    nativePoint.minimumG *= env.damage.gScale;
    nativePoint.maximumG *= env.damage.gScale;
    nativePoint.forwardSpeedBound = Math.max(
      1,
      Math.trunc(nativePoint.forwardSpeedBound * env.damage.speedScale),
    );
  }
  const neutralG = 1 / Math.max(0.4, Math.abs(nativePoint ? a.liftDirection.y : a.up.y));
  const targetG =
    nativePoint && !onGround
      ? clamp(
          pitch >= 0
            ? neutralG + pitch * (nativePoint.maximumG - neutralG)
            : neutralG - pitch * (nativePoint.minimumG - neutralG),
          nativePoint.minimumG,
          nativePoint.maximumG,
        )
      : neutralG;
  const wantedCL = clamp(
    (def.massKg * G * targetG) / Math.max(1, a.qArea),
    nativePoint && !onGround ? -(a.fit?.clMax ?? 1.3) : 0,
    a.fit ? a.fit.clMax + flap * a.flapLiftMax : 1.3,
  );
  let trimAlpha = 0;
  if (a.fit) {
    // Solve the same piecewise linear polar used by forces: camber offsets
    // both branches; the extra maximum lift changes only the positive slope.
    const requiredCleanLift = wantedCL - flap * a.flapCamber;
    const liftAtStall =
      a.fit.clMax + (requiredCleanLift > 0 ? flap * (a.flapLiftMax - a.flapCamber) : 0);
    trimAlpha = clamp(
      (requiredCleanLift * def.stallAlphaRad) / liftAtStall,
      -def.stallAlphaRad,
      def.stallAlphaRad,
    );
  } else {
    for (let i = 0; i <= 80; i++) {
      const minimumAlpha = -0.08 * flap;
      trimAlpha = minimumAlpha + ((def.stallAlphaRad - minimumAlpha) * i) / 80;
      if (
        liftCoefficient(trimAlpha, a.mach, def) +
          flapLiftCoefficient(trimAlpha, flap, def.stallAlphaRad, a.flapLiftMax, a.flapCamber) >=
        wantedCL
      )
        break;
    }
  }
  // Preserve the existing high-speed rate limits, but remove invented control
  // authority at rest. q uses true air velocity (including wind) and density.
  const dynamicPressure = a.qArea / def.wingAreaM2;
  const authority =
      clamp(dynamicPressure / (0.5 * 1.225 * 65 ** 2), 0, 1) * (env.damage?.gScale ?? 1),
    bank = -flightEuler(state.attitude).rollRad;
  const currentLift =
    a.qArea *
    (a.cl + flapLiftCoefficient(a.alpha, flap, def.stallAlphaRad, a.flapLiftMax, a.flapCamber));
  // Recovered stick targets are G, not a fixed pitch rate. Follow the airflow
  // rotation and approach the alpha required for that G with the original
  // attitude actuator. This adapter is not native GToTurn/MovePlane execution.
  const envelopePitchRate = clamp(
    (currentLift / def.massKg - G * a.liftDirection.y) / Math.max(a.speed, 30) +
      (trimAlpha - a.alpha) * 1.7,
    -def.controls.pitchRateRadS,
    def.controls.pitchRateRadS,
  );
  const desiredRates = {
    x:
      authority *
      (nativePoint && !onGround
        ? envelopePitchRate
        : pitch * def.controls.pitchRateRadS +
          (onGround ? 0 : clamp((trimAlpha - a.alpha) * 1.7, -0.65, 0.65))),
    y:
      authority *
      (-yaw * def.controls.yawRateRadS -
        a.beta * 1.2 -
        (onGround ? 0 : (G * Math.sin(bank)) / Math.max(a.speed, 30))),
    z: -roll * def.controls.rollRateRadS * authority,
  };
  const blend = 1 - Math.exp(-dt / def.controls.responseSeconds);
  const angularVelocity = add(
    state.angularVelocity,
    scale(add(desiredRates, scale(state.angularVelocity, -1)), blend),
  );
  if (onGround) {
    // Main gear supports roll; rudder/steering cannot spin a parked aircraft.
    const tangent = add(
      state.velocity,
      scale(unit(ground.normal), -dot(state.velocity, unit(ground.normal))),
    );
    angularVelocity.z = 0;
    angularVelocity.y *= clamp(length(tangent) / 20, 0, 1);
  }
  const rate = length(angularVelocity),
    angle = rate * dt;
  let attitude =
    rate > 1e-10
      ? normalized(
          multiply(state.attitude, {
            ...scale(angularVelocity, Math.sin(angle / 2) / rate),
            w: Math.cos(angle / 2),
          }),
        )
      : { ...state.attitude };
  // Approximate three-point gear support, not a rigid-body wheel solver. A
  // pressure-dependent nose-up envelope permits rotation above taxi speed;
  // it closes as the aircraft slows, settling the nose gear after landing.
  const supportAttitude = (candidate: Quaternion, normal: Vec3) => {
    const n = unit(normal);
    const euler = flightEuler(candidate);
    const heading = { x: -Math.sin(euler.yawRad), y: 0, z: -Math.cos(euler.yawRad) };
    const right = { x: Math.cos(euler.yawRad), y: 0, z: -Math.sin(euler.yawRad) };
    const slopePitch = Math.atan2(-dot(n, heading), n.y);
    const slopeUp = rotate(attitudeFromEuler(slopePitch, euler.yawRad, 0), { x: 0, y: 1, z: 0 });
    const slopeRoll = Math.atan2(-dot(n, right), dot(n, slopeUp));
    const rotationFraction = clamp(
      (dynamicPressure - 0.5 * 1.225 * 45 ** 2) / (0.5 * 1.225 * (65 ** 2 - 45 ** 2)),
      0,
      1,
    );
    const supportedPitch = clamp(
      euler.pitchRad,
      slopePitch,
      slopePitch + def.landing.maxPitchRad * 0.8 * rotationFraction,
    );
    if (supportedPitch !== euler.pitchRad) angularVelocity.x = 0;
    angularVelocity.z = 0;
    return attitudeFromEuler(supportedPitch, euler.yawRad, slopeRoll);
  };
  if (onGround && state.status === 'grounded') attitude = supportAttitude(attitude, ground.normal);
  if (
    controls.thrustMultiplier !== undefined &&
    (!Number.isFinite(controls.thrustMultiplier) ||
      controls.thrustMultiplier < 0 ||
      controls.thrustMultiplier > 2)
  )
    throw new Error('Invalid thrust multiplier');
  let thrust =
    (controls.thrustMultiplier ?? 1) *
    clamp(controls.throttle, 0, 1) *
    (def.retail
      ? def.retail.militaryThrustN * retailThrustLapse(state.position.y)
      : lookupTable(
          def.engine.altitudeM,
          def.engine.mach,
          def.engine.thrustN,
          state.position.y,
          a.mach,
        ));
  const flapLift = flapLiftCoefficient(
    a.alpha,
    flap,
    def.stallAlphaRad,
    a.flapLiftMax,
    a.flapCamber,
  );
  // Original increments, not direct conversions of the native PT drag fields.
  // The clean drag table already includes induced drag. Add only the extra
  // lift-squared contribution from flap camber, never a negative drag credit.
  const extraInducedDrag =
    (a.fit?.inducedDragK ?? 0.06) * Math.max(0, (a.cl + flapLift) ** 2 - a.cl ** 2);
  const deviceDragCoefficient = (field: string, original: number) => {
    const factor = retailDeviceFactor(def, field);
    return factor === undefined ? original : factor * a.cd;
  };
  const deviceDrag =
    flap * deviceDragCoefficient('flapsDrag', 0.035) +
    extraInducedDrag +
    airbrake * deviceDragCoefficient('airBrakesDrag', 0.12) +
    gear * deviceDragCoefficient('gearDrag', 0.02);
  let drag =
    a.qArea *
    ((a.cd + deviceDrag) * (env.damage?.dragScale ?? 1) +
      (a.fit?.inducedDragK ?? 0.06) * a.cl ** 2 * ((env.damage?.gPullDragScale ?? 1) - 1));
  if (nativePoint && def.retail) {
    const recovered = recoveredLongitudinalForces(def.retail, nativePoint, {
      throttle: clamp(controls.throttle, 0, 1),
      thrustMultiplier: controls.thrustMultiplier ?? 1,
      massKg: def.massKg,
      loadFactor: currentLift / (def.massKg * G),
      pitchRad: flightEuler(state.attitude).pitchRad,
      onGround,
      gear,
      flap,
      airbrake,
      ...(env.damage ? { damage: env.damage } : {}),
    });
    if (recovered) {
      thrust = recovered.thrustN;
      const separated = clamp(
        (Math.abs(a.alpha) - def.stallAlphaRad) / (Math.PI / 2 - def.stallAlphaRad),
        0,
        1,
      );
      // Preserve continuous separated-flow dissipation beyond the recovered
      // command envelope. Native stall/departure integration remains unported.
      drag = recovered.dragN + a.qArea * 1.8 * separated ** 2 * Math.sin(a.alpha) ** 2;
    }
  }
  // Sideforce is damping perpendicular to airflow, so it cannot manufacture energy.
  const side = unit(add(a.right, scale(a.direction, -dot(a.right, a.direction))));
  const force = add(
    add(scale(a.forward, thrust), scale(a.direction, -drag)),
    add(scale(a.liftDirection, a.qArea * (a.cl + flapLift)), scale(side, -a.qArea * a.beta * 0.7)),
  );
  let acceleration = add(scale(force, 1 / def.massKg), { x: 0, y: -G, z: 0 });
  if (onGround) {
    const n = unit(ground.normal),
      normalAcceleration = dot(acceleration, n);
    if (normalAcceleration < 0) acceleration = add(acceleration, scale(n, -normalAcceleration));
    // Resolve tire impulses against the predicted velocity, including this tick's
    // wind force. Friction against only the previous velocity cannot hold at rest.
    // Wheels roll along the fuselage but resist sideways slipping much more.
    const forward = unit(add(a.forward, scale(n, -dot(a.forward, n))));
    const lateral = unit({
      x: forward.y * n.z - forward.z * n.y,
      y: forward.z * n.x - forward.x * n.z,
      z: forward.x * n.y - forward.y * n.x,
    });
    const supportedG = Math.max(0, -normalAcceleration);
    const rolling =
      def.landing.rollingFriction * supportedG +
      (controls.brake ? (def.landing.brakeDecelerationMps2 * supportedG) / G : 0);
    // Authored dry-tire lateral grip; not a recovered native coefficient.
    for (const [axis, limit] of [
      [forward, rolling],
      [lateral, 0.7 * supportedG],
    ] as const) {
      const predicted = dot(add(state.velocity, scale(acceleration, dt)), axis);
      acceleration = add(acceleration, scale(axis, -clamp(predicted / dt, -limit, limit)));
    }
  }
  let velocity = add(state.velocity, scale(acceleration, dt)),
    position = add(state.position, scale(velocity, dt));
  const nextGround = env.sampleGround(position.x, position.z);
  if (!nextGround) return finish({ ...state, status: 'waiting-terrain' });
  let status: FlightStatus = 'airborne',
    reason = '';
  if (position.y <= nextGround.height + def.gearHeightM) {
    const n = unit(nextGround.normal),
      sink = -dot(velocity, n),
      up = rotate(attitude, { x: 0, y: 1, z: 0 });
    const slope = Math.acos(clamp(n.y, -1, 1));
    // Authored attitude limits allow a normal flare but reject a nose/tail-first impact.
    const bankAngle = Math.abs(flightEuler(attitude).rollRad);
    const pitchAngle = Math.abs(
      Math.asin(clamp(dot(rotate(attitude, { x: 0, y: 0, z: -1 }), n), -1, 1)),
    );
    if (
      controls.gearDown === false ||
      nextGround.kind === 'water' ||
      sink > def.landing.maxSinkMps ||
      bankAngle > def.landing.maxBankRad ||
      pitchAngle > def.landing.maxPitchRad ||
      slope > def.landing.maxSlopeRad ||
      up.y < 0
    ) {
      status = 'crashed';
      velocity = { x: 0, y: 0, z: 0 };
      reason =
        controls.gearDown === false
          ? 'Gear-up terrain impact'
          : nextGround.kind === 'water'
            ? 'Water impact'
            : 'Hard or unsafe terrain impact';
    } else {
      status = 'grounded';
      // Evaluate impact limits first: support must never turn an unsafe arrival
      // into a safe landing by flattening its attitude before classification.
      attitude = supportAttitude(attitude, n);
      if (length(velocity) < 0.01) angularVelocity.y = 0;
      velocity = add(velocity, scale(n, -Math.min(0, dot(velocity, n))));
    }
    position = { ...position, y: nextGround.height + def.gearHeightM };
  }
  return finish(
    { position, velocity, attitude, angularVelocity, status, timeSeconds: state.timeSeconds + dt },
    reason,
  );
}
