import { Quaternion, Vector3 } from 'three';
import type { GunDefinition, GunMode } from '../data/retail-gun';
import type { FlightState } from '../sim/flight';
import { nativeLaunchSpeed, gunLaunch, GUN_LIFETIME } from '../sim/flight/gun';
import type { GunSightSolution, GunSightTarget } from './gun-sight';

/** Native HUD 0x4226e0 samples previous aiming angles, rather than target lead.
 * Both modes share this presentation; clock/quaternion interpolation and the
 * remake trajectory adapter are ours. Visual contacts provide range, not radar.
 */
export class LagGunSight {
  private history: { time: number; attitude: Quaternion; velocity: Vector3 }[] = [];
  reset(): void {
    this.history = [];
  }
  record(state: FlightState): void {
    if (this.history.length && state.timeSeconds <= this.history.at(-1)!.time) this.reset();
    this.history.push({
      time: state.timeSeconds,
      attitude: new Quaternion(
        state.attitude.x,
        state.attitude.y,
        state.attitude.z,
        state.attitude.w,
      ),
      velocity: new Vector3(state.velocity.x, state.velocity.y, state.velocity.z),
    });
    // Bounded history independent of render/UI frequency (recorded at120Hz).
    while (this.history.length > 1201) this.history.shift();
  }
  solution(
    state: FlightState,
    gun: GunDefinition | undefined,
    mode: GunMode,
    target?: GunSightTarget,
  ): GunSightSolution {
    const result: GunSightSolution = {
      mode: target ? 'target' : 'terrain',
      rangeSource: target ? 'target' : 'base',
      status: gun ? 'no-range' : 'unavailable',
      rangeM: null,
      timeSeconds: null,
      point: null,
    };
    if (!gun || !this.history.length) return result;
    const latest = this.history.at(-1)!;
    const forward = new Vector3(0, 0, -1).applyQuaternion(latest.attitude);
    const offset =
      target &&
      new Vector3(
        target.position.x - state.position.x,
        target.position.y - state.position.y,
        target.position.z - state.position.z,
      );
    if (offset && (!offset.toArray().every(Number.isFinite) || offset.dot(forward) <= 0))
      return result;
    const native = mode === 'retail' ? gun.native : undefined;
    const speed = native
      ? nativeLaunchSpeed(native, state)
      : gun.muzzleSpeedMps + latest.velocity.dot(forward);
    if (speed <= 0) return result;
    const range = offset ? Math.min(offset.length(), native?.maxRangeM ?? 1000) : speed * 0.25;
    let time = range / speed;
    // Match the programmed scalar deceleration when selecting the history delay.
    const decel = (native?.decelerationFps2 ?? 0) * 0.3048;
    if (native && decel > 0) {
      const floor = native.finalSpeedFps * 0.3048;
      const toFloor = Math.max(0, (speed - floor) / decel);
      const brakingRange = ((speed + floor) * toFloor) / 2;
      time =
        range <= brakingRange
          ? (2 * range) / (speed + Math.sqrt(Math.max(0, speed * speed - 2 * decel * range)))
          : toFloor + (range - brakingRange) / floor;
    }
    if (!offset) time = 0.25;
    if (time >= (native?.lifetimeSeconds ?? GUN_LIFETIME)) return result;
    const at = state.timeSeconds - time;
    let before = this.history[0]!,
      after = before;
    for (const sample of this.history) {
      after = sample;
      if (sample.time >= at) break;
      before = sample;
    }
    const alpha =
      after.time === before.time
        ? 0
        : Math.max(0, Math.min(1, (at - before.time) / (after.time - before.time)));
    const attitude = before.attitude.clone().slerp(after.attitude, alpha);
    const direction = new Vector3(0, 0, -1).applyQuaternion(attitude);
    if (!native) {
      // Inherited velocity changes the bullet's world-space direction in remake mode.
      direction
        .multiplyScalar(gun.muzzleSpeedMps)
        .add(before.velocity.clone().lerp(after.velocity, alpha))
        .normalize();
    }
    const mount = [0, 0, 0];
    for (const point of gun.mounts)
      for (let i = 0; i < 3; i++) mount[i]! += point[i]! / gun.mounts.length;
    const origin = gunLaunch(state, mount, 0).position;
    const point = direction.multiplyScalar(range).add(new Vector3(origin.x, origin.y, origin.z));
    // Shared drop correction on top of the recovered angle-history cue. This is
    // an explicit usability adaptation, not present in the traced native HUD.
    const gravity = native ? native.gravityFps2 * 0.3048 : 9.80665;
    const terminal = native ? native.terminalFallSpeedFps * 0.3048 : Infinity;
    const falling = gravity > 0 ? Math.min(time, terminal / gravity) : time;
    point.y -=
      0.5 * gravity * falling * falling + (time > falling ? terminal * (time - falling) : 0);
    return {
      ...result,
      status: 'solution',
      rangeM: offset ? range : null,
      timeSeconds: time,
      point: { x: point.x, y: point.y, z: point.z },
    };
  }
}
