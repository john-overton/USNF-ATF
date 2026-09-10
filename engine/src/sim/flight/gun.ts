import type { RetailGun } from '../../data/retail-gun';
import type { FlightState, Vec3, Quaternion } from './index';
export interface GunRound {
  position: Vec3;
  velocity: Vec3;
  age: number;
  tracer: boolean;
}
export interface GunState {
  rounds: GunRound[];
  remaining: number;
  fired: number;
  cooldown: number;
}
export const GUN_LIFETIME = 5;
export const MAX_GUN_ROUNDS = 1000;
export function createGunState(gun?: RetailGun): GunState {
  return { rounds: [], remaining: gun?.capacity ?? 0, fired: 0, cooldown: 0 };
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
  gun: RetailGun | undefined,
  aircraft: FlightState,
  trigger: boolean,
  safe: boolean,
  dt: number,
): void {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) return;
  for (const round of state.rounds) {
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
