/** Isolated USNF97 integer routines recovered from the local executable.
 * Native units throughout. FuelSystem adapts the recovered fuel rate to SI;
 * thrust and slew helpers remain isolated pending full state integration. */
function int32(value: number): number {
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)
    throw new Error('Native signed 32-bit integer required');
  return value;
}
function int16(value: number): number {
  if (!Number.isInteger(value) || value < -32768 || value > 32767)
    throw new Error('Native signed 16-bit integer required');
  return value;
}
function divide(numerator: number, denominator: number): number {
  if (!denominator || (numerator === -2147483648 && denominator === -1))
    throw new Error('Native signed division fault');
  return Math.trunc(numerator / denominator) | 0;
}

/** @FMFuelConsumption@4, VA430620. Result has eight fractional bits.
 * AB is selected by a command above100; negative/out-of-range commands retain
 * native signed arithmetic rather than introducing an undocumented clamp. */
export function nativeFuelConsumption(
  throttleCommand: number,
  militaryFuel: number,
  afterburnerFuel: number,
): number {
  int32(throttleCommand);
  int16(militaryFuel);
  int16(afterburnerFuel);
  return throttleCommand > 100
    ? afterburnerFuel << 8
    : divide(Math.imul(militaryFuel, throttleCommand) << 8, 100);
}

/** _MatchF24@12, VA497260. Shared throttle/vector slew with signed16 native dt.
 * Multiplication wraps BEFORE arithmetic shift, exactly as IMUL/SAR do. */
export function nativeMatchF24(
  current: number,
  target: number,
  rate: number,
  delta: number,
): number {
  int32(current);
  int32(target);
  int32(rate);
  int16(delta);
  if (current === target || rate === 0) return current;
  const step = Math.imul(delta, rate) >> 8;
  if (target > current) return Math.min(target, (current + step) | 0);
  return Math.max(target, (current - step) | 0);
}

export interface NativeThrustSelection {
  militaryThrust: number;
  afterburnerThrust: number;
  afterburner: boolean;
  /** Raw globals; their full gameplay meanings remain unverified. */
  modeValue: number;
  modeFlags: number;
  objectFlags: number;
}
/** @COThrust@4, VA453630. A missing AB value falls back to military thrust. */
export function nativeSelectThrust(input: NativeThrustSelection): number {
  for (const value of [
    input.militaryThrust,
    input.afterburnerThrust,
    input.modeValue,
    input.modeFlags,
    input.objectFlags,
  ])
    int32(value);
  const selected =
    input.afterburner && input.afterburnerThrust !== 0
      ? input.afterburnerThrust
      : input.militaryThrust;
  return input.modeValue > 1 && (input.modeFlags & 0x10) !== 0 && (input.objectFlags & 0x80) !== 0
    ? selected >> 1
    : selected;
}

export interface NativeThrustScalarInput {
  /** Slewed throttle percentage with eight fractional bits, normally0..25600. */
  throttleF8: number;
  /** Native setup normally initializes this to256; not an altitude lapse. */
  thrustScaleF8: number;
  speedF8: number;
  /** Adjusted forward bound from _COBv, signed16, NOT the raw PT zero field. */
  forwardSpeedBound: number;
  selectedThrust: number;
}
/** Scalar stage of unnamed VA46a360; exact zero-vector-angle force result.
 * Other vector angles need the native integer trig interpolation separately. */
export function nativeThrustScalar(input: NativeThrustScalarInput): {
  throttleFactorF8: number;
  forceF8: number;
} {
  int32(input.throttleF8);
  int32(input.thrustScaleF8);
  int32(input.speedF8);
  int16(input.forwardSpeedBound);
  int32(input.selectedThrust);
  const commanded = divide(Math.imul(input.throttleF8 >> 8, input.thrustScaleF8), 100);
  // The executable mask retains bit0 while clearing bits1..7; don't replace
  // it with a conventional round-to-integer operation.
  const speedPenalty = divide((input.speedF8 & 0xffffff01) >> 1, input.forwardSpeedBound);
  const throttleFactorF8 = Math.max(0, (commanded - speedPenalty) | 0);
  return {
    throttleFactorF8,
    forceF8: Math.imul(divide(Math.imul(32767, throttleFactorF8), 32767), input.selectedThrust),
  };
}
