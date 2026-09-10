import { expect, test } from 'bun:test';
import {
  nativeDragForceF8,
  nativeDragPercent,
  nativeSoundSpeedFps,
  nativeLoadedParameters,
} from './native-drag';
import { nativeThrustScalar } from './native-power';

test('native fuel/store loading uses percentage corrections and clamps overweight state', () => {
  const input = {
    emptyWeightLb: 10000,
    maxWeightLb: 20000,
    loadAWeightLb: 5000,
    loadBWeightLb: 0,
    coefDrag: 256,
    gPullDrag: 20,
    loadedDrag: 60,
    loadedGpullDrag: 20,
  };
  expect(nativeLoadedParameters(input)).toEqual({
    weightLb: 15000,
    loadA: 50,
    loadB: 0,
    adjustedCoefDrag: 332,
    adjustedGPullDrag: 22,
  });
  expect(nativeLoadedParameters({ ...input, loadBWeightLb: 6000 })).toEqual({
    weightLb: 20000,
    loadA: 50,
    loadB: 50,
    adjustedCoefDrag: 409,
    adjustedGPullDrag: 24,
  });
});

test('native sound speed decreases to the tropopause and then stays constant', () => {
  expect(nativeSoundSpeedFps(0)).toBe(1115);
  expect(nativeSoundSpeedFps(18000 * 256)).toBe(1041);
  expect(nativeSoundSpeedFps(36000 * 256)).toBe(967);
  expect(nativeSoundSpeedFps(60000 * 256)).toBe(967);
});
test('native dry partial throttle cannot balance transonic drag; AB balances its upper bound', () => {
  const force = (speed: number, throttle: number, burner: boolean) => {
    const common = { speedF8: speed * 256, altitudeF8: 36000 * 256, forwardSpeedBound: 2200 };
    const drag = nativeDragForceF8({
      ...common,
      adjustedCoefDrag: 256,
      throttleF8: throttle * 256,
      militaryThrust: 30000,
      afterburnerThrust: 45000,
      onGround: false,
      pitchAngle: 0,
      loadFactorF8: 256,
      gPullDrag: 20,
      weightLb: 50000,
      rudderF8: 0,
      rudderDrag: 0,
      flags: 0,
      gearDrag: 0,
      flapsDrag: 0,
      airBrakesDrag: 0,
      bayDrag: 0,
      wheelBrakesDrag: 0,
    });
    const thrust = nativeThrustScalar({
      ...common,
      throttleF8: throttle * 256,
      thrustScaleF8: 256,
      selectedThrust: burner ? 45000 : 30000,
    }).forceF8;
    return thrust - drag;
  };
  expect(force(600, 45, false)).toBeGreaterThan(0);
  expect(force(1300, 45, false)).toBeLessThan(0);
  expect(force(2200, 100, true)).toBe(0);
  expect(force(2200, 100, false)).toBeLessThan(0);
  expect(
    nativeDragPercent({ speedF8: 2200 * 256, altitudeF8: 36000 * 256, forwardSpeedBound: 2200 }),
  ).toBe(100);
});
