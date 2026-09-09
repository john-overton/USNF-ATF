import { nativeFuelConsumption } from '../sim/flight/native-power';

export interface FuelState {
  capacityKg: number;
  fuelKg: number;
  /** Actual consumption over the last step, including a partially exhausted tank. */
  burnRateKgS: number;
}
export interface FuelControls {
  engineRunning: boolean;
  /** Requested throttle, zero through one. */
  throttle: number;
  afterburner: boolean;
  militaryRateKgS: number;
  afterburnerRateKgS: number;
  /** Optional exact native throttle arithmetic. Recovered clock/caller confirms
   * native F8 pounds/second: use kilogramsPerUnitSecond = 0.45359237. */
  nativeConsumption?: {
    military: number;
    afterburner: number;
    kilogramsPerUnitSecond: number;
  };
}
const nonnegative = (value: number, field: string): number => {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${field} must be finite and nonnegative`);
  return value;
};
const fraction = (value: number): number => {
  if (!Number.isFinite(value)) throw new Error('Fuel/throttle fraction must be finite');
  return Math.max(0, Math.min(1, value));
};
function validate(state: FuelState): void {
  nonnegative(state.capacityKg, 'Fuel capacity');
  nonnegative(state.fuelKg, 'Fuel mass');
  nonnegative(state.burnRateKgS, 'Fuel burn');
  if (state.fuelKg > state.capacityKg) throw new Error('Fuel mass exceeds capacity');
}
export function createFuelState(capacityKg: number, initialFraction = 1): FuelState {
  nonnegative(capacityKg, 'Fuel capacity');
  return { capacityKg, fuelKg: capacityKg * fraction(initialFraction), burnRateKgS: 0 };
}
/** Debug/practice slider changes fuel immediately; it does not start the engine. */
export function setFuelFraction(state: FuelState, value: number): FuelState {
  validate(state);
  return createFuelState(state.capacityKg, value);
}
/** Pure bookkeeping called from the fixed simulation clock, never React/render.
 * Native fuel updates batch five seconds; this remake integrates that rate
 * continuously. Empty tanks produce no burn; caller owns engine cutoff and mass. */
export function stepFuel(state: FuelState, controls: FuelControls, dt: number): FuelState {
  validate(state);
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw new Error('Fuel dt must be in (0, 0.1]');
  const throttle = fraction(controls.throttle);
  const military = nonnegative(controls.militaryRateKgS, 'Military fuel rate');
  const afterburner = nonnegative(controls.afterburnerRateKgS, 'Afterburner fuel rate');
  const burning = controls.afterburner && throttle >= 0.99;
  let rate = burning ? afterburner : military * throttle;
  if (controls.nativeConsumption) {
    const native = controls.nativeConsumption;
    const scale = nonnegative(native.kilogramsPerUnitSecond, 'Native fuel time/mass conversion');
    nonnegative(native.military, 'Native military fuel');
    nonnegative(native.afterburner, 'Native afterburner fuel');
    rate =
      (nativeFuelConsumption(
        burning ? 101 : Math.trunc(throttle * 100),
        native.military,
        native.afterburner,
      ) /
        256) *
      scale;
  }
  if (!controls.engineRunning || state.fuelKg === 0) return { ...state, burnRateKgS: 0 };
  const consumed = Math.min(state.fuelKg, rate * dt);
  return { ...state, fuelKg: Math.max(0, state.fuelKg - consumed), burnRateKgS: consumed / dt };
}
