/** Locally imported PT facts. The force law fitted to these is original code. */
export interface RetailFlightProfile {
  schemaVersion: 1;
  source: { game: 'usnf97'; file: string; sha256: string };
  name: string;
  emptyMassKg: number;
  fuelCapacityKg: number;
  maxTakeoffMassKg: number;
  militaryThrustN: number;
  afterburnerThrustN: number;
  envelopes: { g: number; points: { speedMps: number; altitudeM: number }[] }[];
  rawFields: Record<string, unknown>;
}

export function parseRetailFlightProfile(value: unknown): RetailFlightProfile {
  const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid PT object');
    return v as Record<string, unknown>;
  };
  const number = (v: unknown, min: number, max: number): number => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
      throw new Error('Invalid PT number');
    return v;
  };
  const p = object(value),
    source = object(p.source);
  if (
    p.schemaVersion !== 1 ||
    source.game !== 'usnf97' ||
    typeof source.file !== 'string' ||
    !source.file.trim() ||
    [...source.file].some((character) => character.charCodeAt(0) < 32) ||
    source.file.length > 256 ||
    typeof source.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(source.sha256) ||
    typeof p.name !== 'string' ||
    !p.name.trim() ||
    p.name.length > 128
  )
    throw new Error('Invalid PT provenance');
  if (!Array.isArray(p.envelopes) || p.envelopes.length < 1 || p.envelopes.length > 32)
    throw new Error('Invalid PT envelopes');
  const envelopes = p.envelopes.map((value: unknown) => {
    const e = object(value);
    if (!Array.isArray(e.points) || e.points.length < 3 || e.points.length > 64)
      throw new Error('Invalid PT polygon');
    return {
      g: number(e.g, -20, 30),
      points: e.points.map((value: unknown) => {
        const point = object(value);
        return {
          speedMps: number(point.speedMps, 0, 3000),
          altitudeM: number(point.altitudeM, -1000, 100000),
        };
      }),
    };
  });
  if (
    !envelopes.some((e) => e.g === 1) ||
    new Set(envelopes.map((e) => e.g)).size !== envelopes.length
  )
    throw new Error('PT requires unique G envelopes including 1G');
  if (envelopes.some((e) => !Number.isInteger(e.g))) throw new Error('PT G rows must be integers');
  validateLevelPolygon(envelopes.find((e) => e.g === 1)!.points);
  const emptyMassKg = number(p.emptyMassKg, 100, 1000000);
  const fuelCapacityKg = number(p.fuelCapacityKg, 0, 1000000);
  const maxTakeoffMassKg = number(p.maxTakeoffMassKg, emptyMassKg, 2000000);
  if (emptyMassKg + fuelCapacityKg > maxTakeoffMassKg)
    throw new Error('PT fuel exceeds takeoff mass');
  const militaryThrustN = number(p.militaryThrustN, 1, 10000000);
  return {
    schemaVersion: 1,
    source: { game: 'usnf97', file: source.file, sha256: source.sha256 },
    name: p.name,
    emptyMassKg,
    fuelCapacityKg,
    maxTakeoffMassKg,
    militaryThrustN,
    afterburnerThrustN: number(p.afterburnerThrustN, militaryThrustN, 10000000),
    envelopes,
    rawFields: copyRawFields(object(p.rawFields)),
  };
}

/** Preserve unknown metadata for research, with a bounded JSON-only copy. */
function copyRawFields(fields: Record<string, unknown>): Record<string, unknown> {
  let nodes = 0;
  const copy = (value: unknown, depth: number): unknown => {
    if (++nodes > 4096 || depth > 5) throw new Error('PT metadata exceeds structural bounds');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.length <= 512) return value;
    if (Array.isArray(value)) {
      if (value.length > 128) throw new Error('PT metadata array too large');
      return value.map((item: unknown) => copy(item, depth + 1));
    }
    if (
      value &&
      typeof value === 'object' &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    ) {
      const entries = Object.entries(value);
      if (entries.length > 256) throw new Error('PT metadata object too large');
      return Object.fromEntries(
        entries.map(([key, item]) => {
          if (key.length > 128 || ['__proto__', 'prototype', 'constructor'].includes(key))
            throw new Error('Invalid PT metadata key');
          return [key, copy(item, depth + 1)];
        }),
      );
    }
    throw new Error('PT metadata must contain bounded JSON values');
  };
  return copy(fields, 0) as Record<string, unknown>;
}

function validateLevelPolygon(points: { speedMps: number; altitudeM: number }[]): void {
  // Other native G rows may be collapsed/repeated; only 1G is required to
  // supply a usable force-law domain. A zero-area 1G row otherwise fails only
  // after the simulator is running, on every aero evaluation.
  if (points.some((p) => p.speedMps <= 0)) throw new Error('PT 1G speeds must be positive');
  const same = (a: (typeof points)[number], b: (typeof points)[number]) =>
    a.speedMps === b.speedMps && a.altitudeM === b.altitudeM;
  const polygon = points.filter(
    (p, i) => !same(p, points[(i + points.length - 1) % points.length]!),
  );
  if (polygon.length < 3) throw new Error('PT 1G polygon is degenerate');
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!,
      b = polygon[(i + 1) % polygon.length]!;
    area += a.speedMps * b.altitudeM - b.speedMps * a.altitudeM;
  }
  if (Math.abs(area) <= 1e-6) throw new Error('PT 1G polygon has no area');
  const turn = (
    a: (typeof points)[number],
    b: (typeof points)[number],
    c: (typeof points)[number],
  ) =>
    (b.speedMps - a.speedMps) * (c.altitudeM - a.altitudeM) -
    (b.altitudeM - a.altitudeM) * (c.speedMps - a.speedMps);
  const between = (a: number, b: number, c: number) => c >= Math.min(a, b) && c <= Math.max(a, b);
  const on = (a: (typeof points)[number], b: (typeof points)[number], c: (typeof points)[number]) =>
    turn(a, b, c) === 0 &&
    between(a.speedMps, b.speedMps, c.speedMps) &&
    between(a.altitudeM, b.altitudeM, c.altitudeM);
  for (let i = 0; i < polygon.length; i++)
    for (let j = i + 2; j < polygon.length; j++) {
      if (i === 0 && j === polygon.length - 1) continue;
      const a = polygon[i]!,
        b = polygon[(i + 1) % polygon.length]!;
      const c = polygon[j]!,
        d = polygon[(j + 1) % polygon.length]!;
      if (
        (turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0) ||
        on(a, b, c) ||
        on(a, b, d) ||
        on(c, d, a) ||
        on(c, d, b)
      )
        throw new Error('PT 1G polygon intersects itself');
    }
  const heights = [...new Set(polygon.map((p) => p.altitudeM))].sort((a, b) => a - b);
  for (let h = 1; h < heights.length; h++) {
    const altitude = (heights[h - 1]! + heights[h]!) / 2;
    let crossings = 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!,
        b = polygon[(i + 1) % polygon.length]!;
      if (
        altitude > Math.min(a.altitudeM, b.altitudeM) &&
        altitude < Math.max(a.altitudeM, b.altitudeM)
      )
        crossings++;
    }
    if (crossings !== 2) throw new Error('PT 1G polygon must have one speed interval per altitude');
  }
}
