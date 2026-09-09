import rawAircraft from '../../data/placeholder-aircraft.json';
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
function aerodynamics(state: FlightState, env: FlightEnvironment, def: AircraftDefinition) {
  const wind = env.wind ?? { x: 0, y: 0, z: 0 },
    air = add(state.velocity, scale(wind, -1)),
    speed = length(air);
  const local = rotate(conjugate(state.attitude), air);
  const alpha = speed > 0.5 ? Math.atan2(-local.y, -local.z) : 0;
  const beta = speed > 0.5 ? Math.asin(clamp(local.x / speed, -1, 1)) : 0;
  const rho = 1.225 * Math.exp(-Math.max(0, state.position.y) / 8500),
    mach = speed / 340.3;
  const qArea = 0.5 * rho * speed * speed * def.wingAreaM2;
  const cl = lookupTable(def.aero.alphaRad, def.aero.mach, def.aero.lift, alpha, mach);
  const cd = lookupTable(def.aero.alphaRad, def.aero.mach, def.aero.drag, alpha, mach);
  const forward = rotate(state.attitude, { x: 0, y: 0, z: -1 }),
    up = rotate(state.attitude, { x: 0, y: 1, z: 0 }),
    right = rotate(state.attitude, { x: 1, y: 0, z: 0 });
  const direction = unit(air),
    liftDirection = unit(add(up, scale(direction, -dot(up, direction))));
  return { speed, alpha, beta, mach, qArea, cl, cd, forward, up, right, direction, liftDirection };
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
          clamp(controls.flaps ?? 0, 0, 1) *
            0.2 *
            Math.max(0, 1 - Math.abs(a.alpha) / def.stallAlphaRad))) /
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
  const onGround =
    state.position.y <= ground.height + def.gearHeightM + 0.02 && state.velocity.y <= 0.1;
  // Solve the unstalled positive lift branch for a neutral augmented 1g target.
  const wantedCL = clamp(
    (def.massKg * G) / (Math.max(1, a.qArea) * Math.max(0.4, Math.abs(a.up.y))),
    0,
    1.3,
  );
  let trimAlpha = 0;
  for (let i = 0; i <= 80; i++) {
    trimAlpha = (def.stallAlphaRad * i) / 80;
    if (lookupTable(def.aero.alphaRad, def.aero.mach, def.aero.lift, trimAlpha, a.mach) >= wantedCL)
      break;
  }
  const authority = clamp(a.speed / 65, 0.08, 1),
    bank = -flightEuler(state.attitude).rollRad;
  const desiredRates = {
    x:
      authority *
      (pitch * def.controls.pitchRateRadS +
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
  const rate = length(angularVelocity),
    angle = rate * dt;
  const attitude =
    rate > 1e-10
      ? normalized(
          multiply(state.attitude, {
            ...scale(angularVelocity, Math.sin(angle / 2) / rate),
            w: Math.cos(angle / 2),
          }),
        )
      : { ...state.attitude };
  if (
    controls.thrustMultiplier !== undefined &&
    (!Number.isFinite(controls.thrustMultiplier) ||
      controls.thrustMultiplier < 0 ||
      controls.thrustMultiplier > 2)
  )
    throw new Error('Invalid thrust multiplier');
  const thrust =
    (controls.thrustMultiplier ?? 1) *
    clamp(controls.throttle, 0, 1) *
    lookupTable(
      def.engine.altitudeM,
      def.engine.mach,
      def.engine.thrustN,
      state.position.y,
      a.mach,
    );
  const flap = clamp(controls.flaps ?? 0, 0, 1);
  const airbrake = clamp(controls.airbrake ?? 0, 0, 1);
  if (!Number.isFinite(flap) || !Number.isFinite(airbrake))
    throw new Error('Invalid aerodynamic device controls');
  // Original assisted-device coefficients; retail force law/scaling remains unported.
  const deviceDrag = flap * 0.035 + airbrake * 0.12;
  const flapLift = flap * 0.2 * Math.max(0, 1 - Math.abs(a.alpha) / def.stallAlphaRad);
  // Sideforce is damping perpendicular to airflow, so it cannot manufacture energy.
  const side = unit(add(a.right, scale(a.direction, -dot(a.right, a.direction))));
  const force = add(
    add(scale(a.forward, thrust), scale(a.direction, -a.qArea * (a.cd + deviceDrag))),
    add(scale(a.liftDirection, a.qArea * (a.cl + flapLift)), scale(side, -a.qArea * a.beta * 0.7)),
  );
  let acceleration = add(scale(force, 1 / def.massKg), { x: 0, y: -G, z: 0 });
  if (onGround) {
    const n = unit(ground.normal),
      normalAcceleration = dot(acceleration, n);
    if (normalAcceleration < 0) acceleration = add(acceleration, scale(n, -normalAcceleration));
    const tangent = add(state.velocity, scale(n, -dot(state.velocity, n))),
      speed = length(tangent);
    const friction =
      def.landing.rollingFriction * G + (controls.brake ? def.landing.brakeDecelerationMps2 : 0);
    if (speed > 0.001)
      acceleration = add(acceleration, scale(unit(tangent), -Math.min(friction, speed / dt)));
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
      velocity = add(velocity, scale(n, -Math.min(0, dot(velocity, n))));
    }
    position = { ...position, y: nextGround.height + def.gearHeightM };
  }
  return finish(
    { position, velocity, attitude, angularVelocity, status, timeSeconds: state.timeSeconds + dt },
    reason,
  );
}
