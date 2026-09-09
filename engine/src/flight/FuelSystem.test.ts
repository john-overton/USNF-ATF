import { expect, test } from 'bun:test';
import { createFuelState, setFuelFraction, stepFuel, type FuelControls } from './FuelSystem';
const controls: FuelControls = {
  engineRunning: true,
  throttle: 1,
  afterburner: false,
  militaryRateKgS: 2,
  afterburnerRateKgS: 10,
};

test('burn follows throttle, AB requires the high throttle detent, engine cutoff is immediate', () => {
  const full = createFuelState(100);
  expect(stepFuel(full, controls, 0.1).fuelKg).toBeCloseTo(99.8, 10);
  expect(stepFuel(full, { ...controls, throttle: 0.25 }, 0.1).burnRateKgS).toBe(0.5);
  expect(stepFuel(full, { ...controls, afterburner: true }, 0.1).burnRateKgS).toBe(10);
  expect(stepFuel(full, { ...controls, afterburner: true, throttle: 0.5 }, 0.1).burnRateKgS).toBe(
    1,
  );
  expect(stepFuel(full, { ...controls, engineRunning: false, afterburner: true }, 0.1)).toEqual(
    full,
  );
  expect(stepFuel(full, { ...controls, throttle: 0 }, 0.1)).toEqual(full);
});

test('tank exhaustion consumes only remaining fuel and stays empty; slider refills without mutation', () => {
  const initial = createFuelState(100, 0.0001);
  const empty = stepFuel(initial, controls, 0.1);
  expect(empty.fuelKg).toBe(0);
  expect(empty.burnRateKgS).toBeCloseTo(0.1, 12);
  expect(stepFuel(empty, controls, 0.1).burnRateKgS).toBe(0);
  expect(setFuelFraction(empty, 0.5)).toEqual({ capacityKg: 100, fuelKg: 50, burnRateKgS: 0 });
  expect(initial.fuelKg).toBe(0.01);
  expect(empty.fuelKg).toBe(0);
  expect(setFuelFraction(empty, 3).fuelKg).toBe(100);
  expect(setFuelFraction(empty, -2).fuelKg).toBe(0);
});

test('equal elapsed time consumes equal mass across supported step partitions', () => {
  const run = (hz: number) => {
    let state = createFuelState(1000);
    for (let i = 0; i < hz * 60; i++)
      state = stepFuel(state, { ...controls, throttle: 0.75 }, 1 / hz);
    return state;
  };
  const fixed = run(120);
  expect(fixed.fuelKg).toBeCloseTo(910, 7);
  for (const hz of [30, 60, 144]) expect(run(hz).fuelKg).toBeCloseTo(fixed.fuelKg, 7);
});

test('native branch retains F8 truncation and the AB selector with explicit time calibration', () => {
  const native = {
    ...controls,
    nativeConsumption: { military: 3, afterburner: 11, kilogramsPerUnitSecond: 0.45359237 },
  };
  const tank = createFuelState(100);
  expect(stepFuel(tank, { ...native, throttle: 0.339 }, 0.1).burnRateKgS).toBeCloseTo(
    (253 / 256) * 0.45359237,
    12,
  );
  expect(stepFuel(tank, { ...native, afterburner: true }, 0.1).burnRateKgS).toBeCloseTo(
    11 * 0.45359237,
    12,
  );
  expect(() =>
    stepFuel(
      tank,
      { ...native, nativeConsumption: { ...native.nativeConsumption, military: 1.5 } },
      0.1,
    ),
  ).toThrow();
});

test('invalid rates, state, fractions and clock values fail before changing fuel', () => {
  expect(() => createFuelState(-1)).toThrow();
  expect(() => createFuelState(100, NaN)).toThrow();
  expect(() => setFuelFraction(createFuelState(100), Infinity)).toThrow();
  for (const dt of [0, -1, 0.11, NaN, Infinity])
    expect(() => stepFuel(createFuelState(100), controls, dt)).toThrow();
  for (const patch of [
    { militaryRateKgS: -1 },
    { afterburnerRateKgS: NaN },
    { throttle: Infinity },
  ]) {
    expect(() => stepFuel(createFuelState(100), { ...controls, ...patch }, 0.1)).toThrow();
  }
  expect(() => stepFuel({ capacityKg: 1, fuelKg: 2, burnRateKgS: 0 }, controls, 0.1)).toThrow();
  expect(stepFuel(createFuelState(0), controls, 0.1).fuelKg).toBe(0);
});
