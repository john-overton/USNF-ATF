import { expect, test } from 'bun:test';
import {
  nativeFuelConsumption,
  nativeMatchF24,
  nativeSelectThrust,
  nativeThrustScalar,
} from './native-power';

test('native fuel preserves signed fixed-point arithmetic and the separate AB command', () => {
  expect(nativeFuelConsumption(0, 3, 11)).toBe(0);
  expect(nativeFuelConsumption(25, 3, 11)).toBe(192);
  expect(nativeFuelConsumption(100, 3, 11)).toBe(768);
  expect(nativeFuelConsumption(101, 3, 11)).toBe(2816);
  expect(nativeFuelConsumption(-1, 3, 11)).toBe(-7);
  expect(nativeFuelConsumption(-2147483648, 3, 11)).toBe(0);
  expect(() => nativeFuelConsumption(25.5, 3, 11)).toThrow();
});

test('native slew uses native delta, clips overshoot and retains x86 overflow behavior', () => {
  expect(nativeMatchF24(0, 1000, 256, 128)).toBe(128);
  expect(nativeMatchF24(950, 1000, 256, 128)).toBe(1000);
  expect(nativeMatchF24(1000, 0, 256, 128)).toBe(872);
  expect(nativeMatchF24(0, 1000, 0, 128)).toBe(0);
  expect(nativeMatchF24(7, 7, 256, 128)).toBe(7);
  expect(nativeMatchF24(2147483640, 2147483647, 256, 20)).toBe(-2147483636);
  expect(() => nativeMatchF24(0, 1, 1, 32768)).toThrow();
});

test('native thrust selection falls back from missing AB and preserves conditional halving', () => {
  const input = {
    militaryThrust: 30001,
    afterburnerThrust: 50001,
    afterburner: false,
    modeValue: 0,
    modeFlags: 0,
    objectFlags: 0,
  };
  expect(nativeSelectThrust(input)).toBe(30001);
  expect(nativeSelectThrust({ ...input, afterburner: true })).toBe(50001);
  expect(nativeSelectThrust({ ...input, afterburner: true, afterburnerThrust: 0 })).toBe(30001);
  expect(nativeSelectThrust({ ...input, modeValue: 2, modeFlags: 0x10, objectFlags: 0x80 })).toBe(
    15000,
  );
  expect(nativeSelectThrust({ ...input, modeValue: 1, modeFlags: 0x10, objectFlags: 0x80 })).toBe(
    30001,
  );
});

test('native scalar thrust loses force with speed and discards fractional throttle before scaling', () => {
  const input = {
    throttleF8: 25600,
    thrustScaleF8: 256,
    speedF8: 200 * 256,
    forwardSpeedBound: 400,
    selectedThrust: 30000,
  };
  expect(nativeThrustScalar(input)).toEqual({ throttleFactorF8: 192, forceF8: 5760000 });
  expect(nativeThrustScalar({ ...input, speedF8: 0 }).forceF8).toBe(7680000);
  expect(nativeThrustScalar({ ...input, speedF8: 400 * 256 }).forceF8).toBe(3840000);
  expect(nativeThrustScalar({ ...input, speedF8: 800 * 256 }).forceF8).toBe(0);
  expect(nativeThrustScalar({ ...input, throttleF8: 25599 })).toEqual(
    nativeThrustScalar({ ...input, throttleF8: 25344 }),
  );
  expect(() => nativeThrustScalar({ ...input, forwardSpeedBound: 0 })).toThrow('division fault');
});
