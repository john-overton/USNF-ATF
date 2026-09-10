import { bearingDegrees } from '../sim/flight';

export interface Waypoint {
  id: number;
  name: string;
  x: number;
  z: number;
}

/** Three practice destinations; selection wraps and key repeat never skips a stop. */
export function applyWaypointAction(
  state: { waypointIndex: number },
  event: Pick<KeyboardEvent, 'type' | 'code' | 'repeat'>,
): void {
  if (event.type !== 'keydown' || event.repeat) return;
  if (event.code === 'BracketLeft') state.waypointIndex = (state.waypointIndex + 2) % 3;
  if (event.code === 'BracketRight') state.waypointIndex = (state.waypointIndex + 1) % 3;
}

/** Planar theater grid: north +Z, east -X. Range is horizontal, not slant range. */
export function waypointGuidance(
  position: { x: number; z: number },
  headingDegrees: number,
  waypoint: Waypoint,
) {
  const dx = waypoint.x - position.x;
  const dz = waypoint.z - position.z;
  const distanceMeters = Math.hypot(dx, dz);
  // A bearing at the destination is undefined; hide the steering cue within 100m.
  const arrived = distanceMeters < 100;
  const bearing = bearingDegrees(dx, dz);
  const relativeDegrees = ((bearing - headingDegrees + 540) % 360) - 180;
  return {
    waypoint,
    distanceNm: distanceMeters / 1852,
    bearingDegrees: bearing,
    relativeDegrees,
    arrived,
  };
}

export type WaypointGuidance = ReturnType<typeof waypointGuidance>;
