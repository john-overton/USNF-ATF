import { expect, test } from 'bun:test';
import {
  nativeCheckFlightEnvelope,
  nativeEnvelopeInterpolate,
  nativeEnvelopeSpeedLimits,
  type NativeEnvelope,
  type NativeEnvelopeContext,
} from './native-envelope';

// Original synthetic polygon, also passed to the native x86 oracle. No retail points.
const envelope: NativeEnvelope = {
  g: 1,
  count: 7,
  maxSpeedIndex: 5,
  points: [
    [173, 0],
    [239, 13000],
    [427, 39000],
    [631, 55000],
    [1247, 55000],
    [1823, 36000],
    [1321, 0],
  ].map(([speedFps, altitudeFt]) => ({ speedFps: speedFps!, altitudeFt: altitudeFt! })),
};
const context: NativeEnvelopeContext = {
  altitudeFixed: 0,
  speedFixed: 500 * 256,
  flaps: false,
  seaLevelLimitFps: 1341,
  highAltitudeLimitFps: 2217,
};

test('recovered interpolation retains signed x86 truncation and faults', () => {
  expect(nativeEnvelopeInterpolate(0, 10, 3, 0, 1)).toBe(7);
  expect(nativeEnvelopeInterpolate(3, 0, 0, 10, 1)).toBe(6);
  expect(nativeEnvelopeInterpolate(0, 2147483647, 1, 2147483647, 0)).toBe(2147483647);
  expect(() => nativeEnvelopeInterpolate(0, 0, 0, 1, 2)).toThrow('division by zero');
  expect(() => nativeEnvelopeInterpolate(0, 0, 1, 2147483647, 2)).toThrow('overflow');
  expect(() => nativeEnvelopeInterpolate(0, 0, 1.5, 1, 2)).toThrow();
});
test('synthetic x86 oracle cases retain integer boundary, flap and ceiling behavior', () => {
  for (const [altitudeFixed, flaps, g, min, max, limit] of [
    [0, false, -1, 173, 1321, 1341],
    [3328000, true, 0, 180, 1503, 1657],
    [14080000, false, 1, 631, 1247, 2217],
    [14080256, true, 4, 1247, 1247, 2217],
    [9366144, true, 4, 409, 1805, 2217],
    [7623922, true, 0, 270, 1737, 2065],
  ] as const) {
    expect(
      nativeEnvelopeSpeedLimits({ ...envelope, g }, { ...context, altitudeFixed, flaps }),
    ).toEqual({ minimumFps: min, maximumFps: max, limitFps: limit });
  }
  expect(
    nativeEnvelopeSpeedLimits(envelope, { ...context, altitudeFixed: 13000 * 256 + 255 }),
  ).toEqual(nativeEnvelopeSpeedLimits(envelope, { ...context, altitudeFixed: 13000 * 256 }));
});
test('native classification distinguishes stall, envelope and structural overspeed', () => {
  const check = (speed: number) =>
    nativeCheckFlightEnvelope(envelope, { ...context, speedFixed: speed * 256 }).code;
  expect(check(172)).toBe(1);
  expect(check(173)).toBe(0);
  expect(check(1320)).toBe(0);
  expect(check(1321)).toBe(2);
  expect(check(1341)).toBe(3);
  expect(nativeCheckFlightEnvelope(undefined, context)).toEqual({
    code: 1,
    aboveMaxSpeedPoint: undefined,
  });
  expect(
    nativeCheckFlightEnvelope(envelope, { ...context, altitudeFixed: 36001 * 256 })
      .aboveMaxSpeedPoint,
  ).toBe(true);
});
test('invalid native input fails explicitly rather than silently fitting placeholder values', () => {
  expect(() => nativeEnvelopeSpeedLimits({ ...envelope, count: 21 }, context)).toThrow();
  expect(() => nativeEnvelopeSpeedLimits({ ...envelope, maxSpeedIndex: 7 }, context)).toThrow();
  expect(() =>
    nativeEnvelopeSpeedLimits(envelope, { ...context, altitudeFixed: Infinity }),
  ).toThrow();
  expect(() => nativeCheckFlightEnvelope(envelope, { ...context, altitudeFixed: -256 })).toThrow(
    'no defined',
  );
});
