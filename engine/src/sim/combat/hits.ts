/**
 * Hit detection for gun rounds against aircraft.
 *
 * Rounds leave the muzzle at roughly 1,030 m/s and the simulation steps at
 * 120 Hz, so a round advances about 8.6 m per step and a point-in-volume test
 * would miss most of the time. Every test here is therefore swept: the round's
 * path across the step is a segment, and the target is a capsule along its own
 * nose axis. Both bodies move, so the round's path is expressed relative to the
 * target's displacement before testing.
 *
 * Pure, allocation-light and deterministic — no wall-clock, no RNG.
 */
import type { Quaternion, Vec3 } from '../flight';
import { forwardAxis } from './sensors';

export interface Capsule {
  /** Centre of the capsule's axis, world metres. */
  center: Vec3;
  /** Unit axis direction; the aircraft nose. */
  axis: Vec3;
  /** Half the axis length, so the capsule spans `center ± axis * halfLengthM`. */
  halfLengthM: number;
  radiusM: number;
}

/**
 * A hull for an aircraft of the given overall length. The radius is an original
 * approximation: retail exposes `maxVisDist` and `hitPoints` but no hull
 * geometry, so a fraction of length is used rather than an invented table.
 */
export const HULL_RADIUS_FRACTION = 0.14;

export function aircraftCapsule(
  state: { position: Vec3; attitude: Quaternion },
  lengthM: number,
  radiusM = lengthM * HULL_RADIUS_FRACTION,
): Capsule {
  const axis = forwardAxis(state.attitude);
  // The capsule already extends by `radiusM` past each cap, so the cylinder is
  // shortened to keep the total hull close to the real airframe length.
  return {
    center: state.position,
    axis,
    halfLengthM: Math.max(0, lengthM / 2 - radiusM),
    radiusM,
  };
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

export interface ClosestApproach {
  /** Parameter along the first segment, clamped to [0, 1]. */
  t: number;
  /** Parameter along the second segment, clamped to [-1, 1] of its half-axis. */
  s: number;
  distance: number;
}

/**
 * Closest approach between the segment `from`→`to` and the capsule's axis
 * segment. Solves the two-parameter quadratic and clamps, which is exact for the
 * distance and therefore exact for whether a hit occurred.
 */
export function closestApproach(from: Vec3, to: Vec3, capsule: Capsule): ClosestApproach {
  const d = sub(to, from);
  const a = capsule.axis;
  const h = capsule.halfLengthM;
  const r = sub(from, capsule.center);
  const dd = dot(d, d),
    da = dot(d, a),
    dr = dot(d, r),
    ar = dot(a, r),
    aa = dot(a, a);
  // Check the interior minimum and all four edges of the parameter rectangle.
  // Clamping both unconstrained parameters once can miss the true endpoint minimum.
  const candidates: { t: number; s: number }[] = [];
  const clampT = (t: number) => Math.min(1, Math.max(0, t));
  const clampS = (s: number) => Math.min(h, Math.max(-h, s));
  for (const t of [0, 1]) candidates.push({ t, s: clampS(aa > 1e-12 ? (ar + da * t) / aa : 0) });
  for (const s of [-h, h]) candidates.push({ t: clampT(dd > 1e-12 ? (da * s - dr) / dd : 0), s });
  const denominator = dd * aa - da * da;
  if (denominator > 1e-9) {
    const t = (da * ar - dr * aa) / denominator;
    const s = (da * t + ar) / aa;
    if (t >= 0 && t <= 1 && s >= -h && s <= h) candidates.push({ t, s });
  }
  let best: ClosestApproach = { t: 0, s: 0, distance: Infinity };
  for (const { t, s } of candidates) {
    const distance = Math.hypot(
      r.x + d.x * t - a.x * s,
      r.y + d.y * t - a.y * s,
      r.z + d.z * t - a.z * s,
    );
    if (distance < best.distance) best = { t, s, distance };
  }
  return best;
}

/** First hull entry, for ordering multiple targets along a shot. */
export function capsuleEntry(from: Vec3, to: Vec3, capsule: Capsule): Hit | undefined {
  const hit = capsuleHit(from, to, capsule);
  if (!hit) return undefined;
  const pointAt = (t: number) => ({
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  });
  let lo = 0,
    hi = hit.t;
  if (capsuleHit(from, from, capsule)) hi = 0;
  else
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const p = pointAt(mid);
      if (capsuleHit(p, p, capsule)) hi = mid;
      else lo = mid;
    }
  return { ...hit, t: hi, point: pointAt(hi) };
}

export interface Hit {
  /** Fraction of the step at which the hit occurred, 0..1. */
  t: number;
  /** World point of closest approach on the round's path. */
  point: Vec3;
  /** Closest-approach distance to the hull axis, metres. */
  distance: number;
}

/**
 * Test one round's swept path against a capsule. `t` is the closest-approach
 * fraction rather than the exact entry fraction; at 120 Hz the difference is a
 * few metres along the path and it never changes whether a hit is reported.
 */
export function capsuleHit(from: Vec3, to: Vec3, capsule: Capsule): Hit | undefined {
  const approach = closestApproach(from, to, capsule);
  if (approach.distance > capsule.radiusM) return undefined;
  const d = sub(to, from);
  return {
    t: approach.t,
    point: {
      x: from.x + d.x * approach.t,
      y: from.y + d.y * approach.t,
      z: from.z + d.z * approach.t,
    },
    distance: approach.distance,
  };
}

/**
 * Test a round against a target that also moved this step. The target's
 * displacement is folded into the round's path, so the capsule can be treated as
 * stationary at its end-of-step pose.
 */
export function movingCapsuleHit(
  round: { from: Vec3; to: Vec3 },
  target: { previousPosition: Vec3; capsule: Capsule },
  firstEntry = false,
): Hit | undefined {
  // The target sweeps `previousPosition` -> `capsule.center` while the round
  // sweeps `from` -> `to`. Measured against the end-of-step capsule, the round's
  // relative position is `round(t) + drift * (1 - t)`, so the relative path runs
  // from `from + drift` to `to`.
  const drift = sub(target.capsule.center, target.previousPosition);
  const from = { x: round.from.x + drift.x, y: round.from.y + drift.y, z: round.from.z + drift.z };
  const hit = (firstEntry ? capsuleEntry : capsuleHit)(from, round.to, target.capsule);
  if (!hit) return undefined;
  // Undo the shift so the reported point lies on the round's real world path.
  return {
    t: hit.t,
    point: {
      x: hit.point.x - drift.x * (1 - hit.t),
      y: hit.point.y - drift.y * (1 - hit.t),
      z: hit.point.z - drift.z * (1 - hit.t),
    },
    distance: hit.distance,
  };
}
