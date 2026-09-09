import type { TheaterManifest } from '../data';

/** x,z, inland x,z, cumulative meters, material index, confidence. */
export type ShorePoint = readonly [number, number, number, number, number, number, number];
export interface ShoreRing {
  readonly id: string;
  readonly points: readonly ShorePoint[];
}
export function parseShorelines(text: string, extents: TheaterManifest['extents']): ShoreRing[] {
  if (text.length > 64 * 1024 * 1024) throw new Error('Shoreline data exceeds budget');
  const doc = JSON.parse(text) as { version?: unknown; rings?: unknown; kinds?: unknown };
  if (
    doc.version !== 1 ||
    JSON.stringify(doc.kinds) !== JSON.stringify(['unknown', 'beach', 'rock', 'cliff', 'marsh']) ||
    !Array.isArray(doc.rings) ||
    doc.rings.length > 50000
  )
    throw new Error('Invalid shoreline document');
  let count = 0;
  const ids = new Set<string>();
  return doc.rings.map((value: unknown) => {
    const ring = value as { id?: unknown; points?: unknown };
    if (
      !ring ||
      typeof ring.id !== 'string' ||
      ring.id.length > 4096 ||
      ids.has(ring.id) ||
      !Array.isArray(ring.points) ||
      ring.points.length < 4
    )
      throw new Error('Invalid shoreline ring');
    ids.add(ring.id);
    count += ring.points.length;
    if (count > 300000) throw new Error('Shoreline vertex budget exceeded');
    let distance = -1;
    const points = ring.points.map((p: unknown): ShorePoint => {
      if (
        !Array.isArray(p) ||
        p.length !== 7 ||
        !p.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))
      )
        throw new Error('Invalid shoreline point');
      const a = p as unknown as ShorePoint;
      if (
        a[0] < 0 ||
        a[0] > extents.width ||
        a[1] < 0 ||
        a[1] > extents.height ||
        a[2] < 0 ||
        a[2] > extents.width ||
        a[3] < 0 ||
        a[3] > extents.height ||
        Math.hypot(a[2] - a[0], a[3] - a[1]) > 200.001 ||
        a[4] < distance ||
        a[4] > 100000000 ||
        !Number.isInteger(a[5]) ||
        a[5] < 0 ||
        a[5] > 4 ||
        a[6] < 0 ||
        a[6] > 1
      )
        throw new Error('Shoreline point outside supported bounds');
      distance = a[4];
      return a;
    });
    const first = points[0]!,
      last = points[points.length - 1]!;
    if (first[4] !== 0 || [0, 1, 2, 3, 5, 6].some((i) => first[i] !== last[i]))
      throw new Error('Shoreline ring must close continuously');
    return { id: ring.id, points };
  });
}
