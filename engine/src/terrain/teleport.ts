import type { TheaterManifest } from '../data';
import { containsWater } from '../flight/GroundSampler';

export interface TeleportWaypoint {
  id: number;
  x: number;
  z: number;
  elevationM: number;
}

/** Use the finest containing chunk's bounds, never a coarse map pixel's height. */
export function waypointDestination(manifest: TheaterManifest, point: TeleportWaypoint) {
  if (
    ![point.id, point.x, point.z, point.elevationM].every(Number.isFinite) ||
    !Number.isInteger(point.id) ||
    point.id < 1 ||
    point.x < 0 ||
    point.z < 0 ||
    point.x > manifest.extents.width ||
    point.z > manifest.extents.height
  )
    throw new Error('Waypoint must be a finite position inside this theater');
  const x = Math.min(point.x, manifest.extents.width - 0.001),
    z = Math.min(point.z, manifest.extents.height - 0.001);
  const chunk = manifest.chunks
    .filter(
      (c) =>
        x >= c.originX &&
        z >= c.originZ &&
        x < c.originX + 255 * c.spacing &&
        z < c.originZ + 255 * c.spacing,
    )
    .sort((a, b) => a.spacing - b.spacing)[0];
  if (!chunk) throw new Error('Waypoint has no terrain source coverage');
  let height = chunk.maxElevation;
  for (const body of manifest.waterBodies)
    if (containsWater(body, point.x, point.z)) height = Math.max(height, body.elevation);
  return {
    position: { x: point.x, y: Math.max(0, height) + 1000, z: point.z },
    // Face back into coverage so edge destinations allow continued flight.
    yaw: Math.atan2(point.x - manifest.extents.width / 2, point.z - manifest.extents.height / 2),
    chunk,
  };
}
