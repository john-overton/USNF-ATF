import { Quaternion, Vector3 } from 'three';
import type { GunDefinition } from '../data/retail-gun';
import type { FlightState, Vec3 } from '../sim/flight';
import { GUN_LIFETIME, gunLaunch } from '../sim/flight/gun';

/** Sensor plumbing only: absolute world metres, world velocity in metres/second. */
export interface GunSightTarget {
  position: Vec3;
  velocity: Vec3;
}
export interface GunSightSolution {
  mode: 'terrain' | 'target';
  rangeSource: 'base' | 'terrain' | 'target';
  status: 'solution' | 'no-range' | 'unavailable';
  rangeM: number | null;
  timeSeconds: number | null;
  point: Vec3 | null;
}
export const GUN_BASE_RANGE_M = 1000;
const G = 9.80665;
const vector = (v: Vec3) => new Vector3(v.x, v.y, v.z);
/** Original radar-style sight, sharing the rounds' vacuum ballistics and lifetime.
 * Terrain: projectile displacement at boresight surface range (put pipper on ground).
 * Target: required muzzle direction for intercept (steer boresight onto lead cue).
 * World points must be projected through the actual renderer camera.
 */
export function gunSight(
  aircraft: FlightState,
  gun: GunDefinition | undefined,
  sample: (x: number, z: number) => { height: number } | undefined,
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
  if (!gun) return result;
  const q = new Quaternion(
    aircraft.attitude.x,
    aircraft.attitude.y,
    aircraft.attitude.z,
    aircraft.attitude.w,
  );
  const forward = new Vector3(0, 0, -1).applyQuaternion(q);
  // Average muzzle gives one cue for aircraft with multiple guns.
  const mount = new Vector3();
  for (const m of gun.mounts) mount.add(new Vector3(...m));
  mount.divideScalar(gun.mounts.length);
  const launch = gunLaunch(aircraft, mount.toArray(), gun.muzzleSpeedMps);
  const origin = vector(launch.position);
  const velocity = vector(aircraft.velocity);
  let cue: Vector3;
  let time: number;
  let range: number;
  if (target) {
    const relative = vector(target.position).sub(origin);
    const relativeVelocity = vector(target.velocity).sub(velocity);
    if (
      ![...relative.toArray(), ...relativeVelocity.toArray()].every(Number.isFinite) ||
      relative.dot(forward) <= 0
    )
      return result;
    const required = (t: number) =>
      relative
        .clone()
        .addScaledVector(relativeVelocity, t)
        .add(new Vector3(0, 0.5 * G * t * t, 0));
    const error = (t: number) => required(t).length() - gun.muzzleSpeedMps * t;
    let lo = 0,
      hi = 0;
    // Find the first intercept, bounded by the actual round lifetime.
    for (let i = 1; i <= 250; i++) {
      hi = (i * GUN_LIFETIME) / 250;
      if (error(hi) <= 0) break;
      lo = hi;
    }
    if (lo === hi) return result;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (error(mid) > 0) lo = mid;
      else hi = mid;
    }
    time = (lo + hi) / 2;
    range = relative.length();
    cue = required(time);
  } else {
    const speed = gun.muzzleSpeedMps + velocity.dot(forward);
    if (speed <= 0) return result;
    const limit = GUN_BASE_RANGE_M;
    if (speed * GUN_LIFETIME < limit) return result;
    let previous = 0;
    let hit: number | undefined;
    // Never bridge missing contact data or substitute sea level. 25 m steps are
    // finer than the finest contact grid; bisection refines the first crossing.
    for (let distance = 0; distance <= limit; distance += 25) {
      const p = origin.clone().addScaledVector(forward, distance);
      const surface = sample(p.x, p.z);
      if (!surface) break;
      if (p.y <= surface.height) {
        if (distance === 0) return result;
        let lo = previous,
          hi = distance;
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          const p = origin.clone().addScaledVector(forward, mid);
          const s = sample(p.x, p.z);
          if (!s) return result;
          if (p.y > s.height) lo = mid;
          else hi = mid;
        }
        hit = (lo + hi) / 2;
        break;
      }
      previous = distance;
    }
    result.rangeSource = hit === undefined ? 'base' : 'terrain';
    range = hit ?? GUN_BASE_RANGE_M;
    // Time at the plane normal to the barrel at the selected range, including
    // gravity's component along the barrel when pitched up/down.
    const acceleration = -0.5 * G * forward.y;
    const discriminant = speed * speed + 4 * acceleration * range;
    if (discriminant < 0) return result;
    time = (2 * range) / (speed + Math.sqrt(discriminant));
    if (time >= GUN_LIFETIME) return result;
    cue = vector(launch.velocity).multiplyScalar(time);
    cue.y -= 0.5 * G * time * time;
  }
  const point = origin.add(cue);
  return {
    ...result,
    status: 'solution',
    rangeM: range,
    timeSeconds: time,
    point: { x: point.x, y: point.y, z: point.z },
  };
}
