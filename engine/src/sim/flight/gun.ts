import type { GunDefinition, GunMode, NativeGun } from '../../data/retail-gun';
import type { FlightState, Vec3, Quaternion } from './index';
export interface GunRound {
  previousPosition: Vec3;
  /** Fraction of this step before emission; used for moving-target sweeps. */
  emittedAt: number;
  position: Vec3;
  velocity: Vec3;
  age: number;
  tracer: boolean;
  nativeMotion?: { direction: Vec3; speed: number; fallSpeed: number };
}
export interface GunState {
  rounds: GunRound[];
  remaining: number;
  fired: number;
  cooldown: number;
  mode: GunMode;
}
export const GUN_LIFETIME = 5;
export const MAX_GUN_ROUNDS = 1000;
export function createGunState(gun?: GunDefinition, mode: GunMode = 'remake'): GunState {
  return { rounds: [], remaining: gun?.capacity ?? 0, fired: 0, cooldown: 0, mode };
}
/** No ammunition refill, damage reset, or mixed trajectories when changing modes. */
export function setGunMode(state: GunState, mode: GunMode): void {
  if (state.mode === mode) return;
  state.mode = mode;
  state.rounds = [];
  state.cooldown = 0;
}
export function nativeLaunchSpeed(gun: NativeGun, aircraft: FlightState): number {
  const fps = Math.trunc(
    Math.hypot(aircraft.velocity.x, aircraft.velocity.y, aircraft.velocity.z) / 0.3048,
  );
  return (
    Math.min(
      gun.maxSpeedFps,
      Math.max(
        gun.minSpeedFps,
        gun.initialSpeedFps,
        Math.trunc((fps * gun.launchRetardPercent) / 100),
      ),
    ) * 0.3048
  );
}
/** Recovered scalar speed selection and separate vertical gravity accumulator.
 * SI/120Hz integration is an adapter, not native fixed-point/tick parity.
 */
function moveNative(round: GunRound, gun: NativeGun, dt: number): void {
  const motion = round.nativeMotion!;
  const target = gun.finalSpeedFps * 0.3048;
  const change = (gun.decelerationFps2 ?? 0) * 0.3048 * dt;
  motion.speed += Math.max(-change, Math.min(change, target - motion.speed));
  motion.fallSpeed = Math.min(
    gun.terminalFallSpeedFps * 0.3048,
    motion.fallSpeed + gun.gravityFps2 * 0.3048 * dt,
  );
  round.velocity = {
    x: motion.direction.x * motion.speed,
    y: motion.direction.y * motion.speed - motion.fallSpeed,
    z: motion.direction.z * motion.speed,
  };
  round.position.x += round.velocity.x * dt;
  round.position.y += round.velocity.y * dt;
  round.position.z += round.velocity.z * dt;
  round.age += dt;
}
function stepNativeGun(
  state: GunState,
  gun: GunDefinition & { native: NativeGun },
  aircraft: FlightState,
  trigger: boolean,
  safe: boolean,
  dt: number,
): void {
  const native = gun.native;
  for (const round of state.rounds) {
    round.previousPosition = { ...round.position };
    round.emittedAt = 0;
    moveNative(round, native, dt);
  }
  state.rounds = state.rounds.filter((r) => r.age < native.lifetimeSeconds);
  if (safe || !trigger || aircraft.status === 'crashed') {
    state.cooldown = Math.max(0, state.cooldown - dt);
    return;
  }
  let at = state.cooldown;
  while (at < dt - 1e-10 && state.remaining > 0) {
    const mount =
      gun.mounts[Math.floor(state.fired / native.actualRoundsPerProjectile) % gun.mounts.length]!;
    const launch = gunLaunch(aircraft, mount, 0);
    const position = {
      x: launch.position.x + aircraft.velocity.x * at,
      y: launch.position.y + aircraft.velocity.y * at,
      z: launch.position.z + aircraft.velocity.z * at,
    };
    const debit = Math.min(state.remaining, native.actualRoundsPerProjectile);
    state.remaining -= debit;
    state.fired += debit;
    if (state.rounds.length < MAX_GUN_ROUNDS) {
      const round: GunRound = {
        position: { ...position },
        previousPosition: position,
        emittedAt: at / dt,
        age: 0,
        tracer: true,
        velocity: { x: 0, y: 0, z: 0 },
        nativeMotion: {
          direction: rotate(aircraft.attitude, { x: 0, y: 0, z: -1 }),
          speed: nativeLaunchSpeed(native, aircraft),
          fallSpeed: 0,
        },
      };
      moveNative(round, native, dt - at);
      state.rounds.push(round);
    }
    at += native.intervalSeconds;
  }
  state.cooldown = Math.max(0, at - dt);
}
function rotate(q: Quaternion, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y),
    ty = 2 * (q.z * v.x - q.x * v.z),
    tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + q.y * tz - q.z * ty,
    y: v.y + q.w * ty + q.z * tx - q.x * tz,
    z: v.z + q.w * tz + q.x * ty - q.y * tx,
  };
}
/** Shared muzzle transform for emitted rounds and the sight's predicted world point. */
export function gunLaunch(aircraft: FlightState, mount: readonly number[], muzzleSpeedMps: number) {
  const offset = rotate(aircraft.attitude, { x: mount[0]!, y: mount[1]!, z: mount[2]! });
  const muzzle = rotate(aircraft.attitude, { x: 0, y: 0, z: -muzzleSpeedMps });
  return {
    position: {
      x: aircraft.position.x + offset.x,
      y: aircraft.position.y + offset.y,
      z: aircraft.position.z + offset.z,
    },
    velocity: {
      x: aircraft.velocity.x + muzzle.x,
      y: aircraft.velocity.y + muzzle.y,
      z: aircraft.velocity.z + muzzle.z,
    },
  };
}
/** Fixed-step actual rounds. Aircraft world velocity is added once at the muzzle. */
export function stepGun(
  state: GunState,
  gun: GunDefinition | undefined,
  aircraft: FlightState,
  trigger: boolean,
  safe: boolean,
  dt: number,
): void {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) return;
  if (state.mode === 'retail' && gun?.native) {
    stepNativeGun(state, gun as GunDefinition & { native: NativeGun }, aircraft, trigger, safe, dt);
    return;
  }
  for (const round of state.rounds) {
    round.previousPosition = { ...round.position };
    round.emittedAt = 0;
    round.position.x += round.velocity.x * dt;
    round.position.y += round.velocity.y * dt - 0.5 * 9.80665 * dt * dt;
    round.position.z += round.velocity.z * dt;
    round.velocity.y -= 9.80665 * dt;
    round.age += dt;
  }
  state.rounds = state.rounds.filter((r) => r.age < GUN_LIFETIME);
  if (!gun || safe || !trigger || aircraft.status === 'crashed') {
    state.cooldown = Math.max(0, state.cooldown - dt);
    return;
  }
  // Integrate emissions over [0, dt), preserving cadence across short trigger taps.
  let at = state.cooldown;
  while (at < dt - 1e-10 && state.remaining > 0) {
    const mount = gun.mounts[state.fired % gun.mounts.length]!;
    const launch = gunLaunch(aircraft, mount, gun.muzzleSpeedMps);
    const velocity = launch.velocity;
    const age = dt - at;
    state.fired++;
    state.remaining--;
    if (state.rounds.length < MAX_GUN_ROUNDS)
      state.rounds.push({
        previousPosition: {
          x: launch.position.x + aircraft.velocity.x * at,
          y: launch.position.y + aircraft.velocity.y * at,
          z: launch.position.z + aircraft.velocity.z * at,
        },
        emittedAt: at / dt,
        position: {
          x: launch.position.x + aircraft.velocity.x * at + velocity.x * age,
          y:
            launch.position.y +
            aircraft.velocity.y * at +
            velocity.y * age -
            0.5 * 9.80665 * age * age,
          z: launch.position.z + aircraft.velocity.z * at + velocity.z * age,
        },
        velocity: { ...velocity, y: velocity.y - 9.80665 * age },
        age,
        tracer: state.fired % gun.tracerEvery === 0,
      });
    at += 1 / gun.roundsPerSecond;
  }
  state.cooldown = Math.max(0, at - dt);
}
