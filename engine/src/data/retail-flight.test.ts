import { expect, test } from 'bun:test';
import { parseRetailFlightProfile } from './retail-flight';

function fixture() {
  return {
    schemaVersion: 1,
    source: { game: 'usnf97', file: 'synthetic.PT', sha256: 'a'.repeat(64) },
    name: 'Synthetic envelope aircraft',
    emptyMassKg: 20000,
    fuelCapacityKg: 5000,
    maxTakeoffMassKg: 30000,
    militaryThrustN: 100000,
    afterburnerThrustN: 150000,
    envelopes: [
      {
        g: 1,
        points: [
          { speedMps: 100, altitudeM: 0 },
          { speedMps: 150, altitudeM: 10000 },
          { speedMps: 350, altitudeM: 10000 },
          { speedMps: 400, altitudeM: 0 },
        ],
      },
    ],
    rawFields: { drag: { value: 123, unit: 'unknown' } },
  };
}
test('retail profile parser copies validated facts and bounded research metadata', () => {
  const original = fixture(),
    parsed = parseRetailFlightProfile(original);
  expect(parsed.emptyMassKg + parsed.fuelCapacityKg).toBe(25000);
  expect(parsed.rawFields).toEqual(original.rawFields);
  original.rawFields.drag.value = 999;
  original.envelopes[0]!.points[0]!.speedMps = 999;
  expect((parsed.rawFields.drag as { value: number }).value).toBe(123);
  expect(parsed.envelopes[0]!.points[0]!.speedMps).toBe(100);
  const degenerateOther = fixture();
  degenerateOther.envelopes.push({
    g: 9,
    points: [
      { speedMps: 300, altitudeM: 0 },
      { speedMps: 300, altitudeM: 0 },
      { speedMps: 300, altitudeM: 0 },
    ],
  });
  expect(parseRetailFlightProfile(degenerateOther).envelopes).toHaveLength(2);
});
test('retail profile rejects malformed provenance, masses, thrust and ambiguous G rows', () => {
  for (const patch of [
    { emptyMassKg: NaN },
    { fuelCapacityKg: -1 },
    { fuelCapacityKg: 20000 },
    { maxTakeoffMassKg: 1000 },
    { militaryThrustN: 0 },
    { afterburnerThrustN: 999 },
    { source: { ...fixture().source, file: '' } },
    { source: { ...fixture().source, sha256: 'invalid' } },
    { schemaVersion: 2 },
    { envelopes: [] },
  ])
    expect(() => parseRetailFlightProfile({ ...fixture(), ...patch })).toThrow();
  const duplicate = fixture();
  duplicate.envelopes.push(duplicate.envelopes[0]!);
  expect(() => parseRetailFlightProfile(duplicate)).toThrow();
  const fractional = fixture();
  fractional.envelopes.push({ ...fractional.envelopes[0]!, g: 1.2 });
  expect(() => parseRetailFlightProfile(fractional)).toThrow();
});
test('retail profile rejects unusable or self-crossing 1G polygons before simulation starts', () => {
  for (const points of [
    [
      { speedMps: 100, altitudeM: 0 },
      { speedMps: 200, altitudeM: 0 },
      { speedMps: 300, altitudeM: 0 },
    ],
    [
      { speedMps: 100, altitudeM: 0 },
      { speedMps: 100, altitudeM: 100 },
      { speedMps: 100, altitudeM: 200 },
    ],
    [
      { speedMps: 0, altitudeM: 0 },
      { speedMps: 200, altitudeM: 100 },
      { speedMps: 300, altitudeM: 0 },
    ],
    [
      { speedMps: 100, altitudeM: 0 },
      { speedMps: 400, altitudeM: 1000 },
      { speedMps: 100, altitudeM: 1000 },
      { speedMps: 300, altitudeM: 0 },
    ],
  ])
    expect(() =>
      parseRetailFlightProfile({ ...fixture(), envelopes: [{ g: 1, points }] }),
    ).toThrow();
  const withClosingPoint = fixture();
  withClosingPoint.envelopes[0]!.points.push(withClosingPoint.envelopes[0]!.points[0]!);
  expect(parseRetailFlightProfile(withClosingPoint).envelopes).toHaveLength(1);
});
test('retail profile metadata rejects excessive depth, size, non-JSON values and dangerous keys', () => {
  for (const rawFields of [
    { value: NaN },
    { value: undefined },
    { value: new Date() },
    { value: 'x'.repeat(513) },
    { value: Array(129).fill(0) },
    { value: { a: { b: { c: { d: { e: { f: 1 } } } } } } },
    JSON.parse('{"__proto__":{"polluted":true}}') as unknown,
  ])
    expect(() => parseRetailFlightProfile({ ...fixture(), rawFields })).toThrow();
});
