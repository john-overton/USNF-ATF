import { parseRetailFlightProfile, type RetailFlightProfile } from './retail-flight';
/** SI units; optional local PT profile replaces the original clean force tables. */
export interface AircraftDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  massKg: number;
  retail?: RetailFlightProfile;
  wingAreaM2: number;
  gearHeightM: number;
  stallAlphaRad: number;
  aero: { alphaRad: number[]; mach: number[]; lift: number[][]; drag: number[][] };
  engine: { altitudeM: number[]; mach: number[]; thrustN: number[][] };
  controls: {
    pitchRateRadS: number;
    rollRateRadS: number;
    yawRateRadS: number;
    responseSeconds: number;
  };
  landing: {
    maxSinkMps: number;
    maxBankRad: number;
    maxPitchRad: number;
    maxSlopeRad: number;
    rollingFriction: number;
    brakeDecelerationMps2: number;
  };
}

/** Runtime validation is independent of the optional editor JSON schema. */
export function parseAircraftDefinition(value: unknown): AircraftDefinition {
  const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v))
      throw new Error('Aircraft object required');
    return v as Record<string, unknown>;
  };
  const number = (v: unknown, min: number, max: number): number => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
      throw new Error('Aircraft number out of range');
    return v;
  };
  const axis = (v: unknown, min: number, max: number): number[] => {
    if (!Array.isArray(v) || v.length < 2 || v.length > 256) throw new Error('Aircraft table axis');
    const result = v.map((n) => number(n, min, max));
    if (result.some((n, i) => i > 0 && n <= result[i - 1]!))
      throw new Error('Aircraft axis must increase');
    return result;
  };
  const grid = (v: unknown, rows: number, cols: number, min: number, max: number): number[][] => {
    if (!Array.isArray(v) || v.length !== rows) throw new Error('Aircraft table rows');
    return v.map((row: unknown) => {
      if (!Array.isArray(row) || row.length !== cols) throw new Error('Aircraft table columns');
      return row.map((n: unknown) => number(n, min, max));
    });
  };
  const a = object(value),
    aero = object(a.aero),
    engine = object(a.engine);
  const controls = object(a.controls),
    landing = object(a.landing);
  if (
    a.schemaVersion !== 1 ||
    typeof a.id !== 'string' ||
    !/^[a-z0-9-]{1,64}$/.test(a.id) ||
    typeof a.name !== 'string' ||
    !a.name.trim() ||
    a.name.length > 128
  )
    throw new Error('Aircraft identity/schema version');
  const alphaRad = axis(aero.alphaRad, -Math.PI, Math.PI),
    mach = axis(aero.mach, 0, 10);
  const altitudeM = axis(engine.altitudeM, -1000, 100000),
    engineMach = axis(engine.mach, 0, 10);
  const stallAlphaRad = number(a.stallAlphaRad, 0.05, 0.8);
  if (alphaRad[0]! > -stallAlphaRad || alphaRad.at(-1)! < stallAlphaRad)
    throw new Error('Aircraft table must cover positive and negative stall');
  return {
    schemaVersion: 1,
    id: a.id,
    name: a.name,
    massKg: number(a.massKg, 100, 1000000),
    ...(a.retail === undefined ? {} : { retail: parseRetailFlightProfile(a.retail) }),
    wingAreaM2: number(a.wingAreaM2, 1, 2000),
    gearHeightM: number(a.gearHeightM, 0.1, 20),
    stallAlphaRad,
    aero: {
      alphaRad,
      mach,
      lift: grid(aero.lift, alphaRad.length, mach.length, -5, 5),
      drag: grid(aero.drag, alphaRad.length, mach.length, 0, 10),
    },
    engine: {
      altitudeM,
      mach: engineMach,
      thrustN: grid(engine.thrustN, altitudeM.length, engineMach.length, 0, 10000000),
    },
    controls: {
      pitchRateRadS: number(controls.pitchRateRadS, 0.05, 5),
      rollRateRadS: number(controls.rollRateRadS, 0.05, 10),
      yawRateRadS: number(controls.yawRateRadS, 0.01, 3),
      responseSeconds: number(controls.responseSeconds, 0.02, 3),
    },
    landing: {
      maxSinkMps: number(landing.maxSinkMps, 0.1, 20),
      maxBankRad: number(landing.maxBankRad, 0.01, 1),
      maxPitchRad: number(landing.maxPitchRad, 0.01, 1),
      maxSlopeRad: number(landing.maxSlopeRad, 0.01, 0.5),
      rollingFriction: number(landing.rollingFriction, 0, 1),
      brakeDecelerationMps2: number(landing.brakeDecelerationMps2, 0, 30),
    },
  };
}
