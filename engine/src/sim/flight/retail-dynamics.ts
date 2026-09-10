/** SI adapter around recovered clean-player helpers. Motion, fractional devices,
 * fuel/payload weight handling and separated flow remain remake integration. */
import type { RetailFlightProfile } from '../../data/retail-flight';
import { nativeEnvelopeSpeedLimits } from './native-envelope';
import { nativeGLimits, nativeLowSpeedGLimits } from './native-g-limits';
import { nativeDragForceF8, nativeDragPercent } from './native-drag';
import { nativeThrustScalar } from './native-power';

const LBF_N = 4.4482216152605;
function loadingPercent(profile: RetailFlightProfile, massKg: number): number {
  const emptyLb = Math.round(profile.emptyMassKg / 0.45359237);
  const capacityLb = Math.round(profile.maxTakeoffMassKg / 0.45359237) - emptyLb;
  if (capacityLb <= 0) return 0;
  // No hardpoint partition exists in the remake. This is exact for internal
  // fuel alone; aggregated payload can differ by one percentage point from
  // native separate-component truncation.
  return Math.max(
    0,
    Math.min(100, Math.trunc((100 * (Math.trunc(massKg / 0.45359237) - emptyLb)) / capacityLb)),
  );
}
function loadedCoefficient(
  profile: RetailFlightProfile,
  base: number,
  name: string,
  loading: number,
) {
  return Math.trunc(
    (base * (100 + Math.trunc((loading * (retailRawNumber(profile, name) ?? 0)) / 100))) / 100,
  );
}
export function retailRawNumber(profile: RetailFlightProfile, name: string): number | undefined {
  const field = profile.rawFields[name];
  if (!field || typeof field !== 'object' || !('value' in field)) return undefined;
  return typeof field.value === 'number' && Number.isFinite(field.value) ? field.value : undefined;
}
export function recoveredFlightPoint(
  profile: RetailFlightProfile,
  altitudeM: number,
  speedMps: number,
  flaps: boolean,
  massKg: number,
) {
  const native = profile.native;
  if (!native) return undefined;
  const context = {
    altitudeFixed: Math.trunc((altitudeM / 0.3048) * 256),
    speedFixed: Math.trunc((speedMps / 0.3048) * 256),
    flaps,
    seaLevelLimitFps: native.structuralSpeedFps.seaLevel,
    highAltitudeLimitFps: native.structuralSpeedFps.at36000Ft,
  };
  const row = native.envelopes.find((row) => row.g === 1)!;
  const bounds = nativeEnvelopeSpeedLimits(row, context);
  if (!bounds.maximumFps || !bounds.minimumFps) return undefined;
  const limits = nativeGLimits(native.envelopes, {
    ...context,
    player: true,
    easier: false,
    skill: 3,
    loadA: loadingPercent(profile, massKg),
    loadB: 0,
    loadedElevator: retailRawNumber(profile, 'loadedElevator') ?? 0,
  });
  const reduced = nativeLowSpeedGLimits({
    ...limits,
    speedFixed: context.speedFixed,
    minimumSpeedFps: Math.max(1, bounds.minimumFps),
  });
  return {
    context,
    forwardSpeedBound: bounds.maximumFps,
    minimumG: reduced.minimumGFixed / 256,
    maximumG: reduced.maximumGFixed / 256,
  };
}
export function recoveredLongitudinalForces(
  profile: RetailFlightProfile,
  point: NonNullable<ReturnType<typeof recoveredFlightPoint>>,
  input: {
    throttle: number;
    thrustMultiplier: number;
    massKg: number;
    loadFactor: number;
    pitchRad: number;
    onGround: boolean;
    gear: number;
    flap: number;
    airbrake: number;
  },
) {
  const coef = retailRawNumber(profile, 'coefDrag');
  const gPull = retailRawNumber(profile, '_gpullDrag');
  // Older/synthetic profiles with only polygons retain their fitted polar.
  if (coef === undefined || gPull === undefined) return undefined;
  const common = {
    speedF8: point.context.speedFixed,
    altitudeF8: point.context.altitudeFixed,
    forwardSpeedBound: point.forwardSpeedBound,
  };
  const throttleF8 = Math.trunc(input.throttle * 100 * 256);
  const military = Math.round(profile.militaryThrustN / LBF_N);
  const burner = Math.round(profile.afterburnerThrustN / LBF_N);
  const thrust =
    (nativeThrustScalar({ ...common, throttleF8, thrustScaleF8: 256, selectedThrust: military })
      .forceF8 /
      256) *
    LBF_N *
    input.thrustMultiplier;
  const drag =
    (nativeDragForceF8({
      ...common,
      adjustedCoefDrag: loadedCoefficient(
        profile,
        coef,
        'loadedDrag',
        loadingPercent(profile, input.massKg),
      ),
      throttleF8,
      onGround: input.onGround,
      pitchAngle: Math.trunc((input.pitchRad / Math.PI) * 32768),
      militaryThrust: military,
      afterburnerThrust: burner,
      loadFactorF8: Math.trunc(input.loadFactor * 256),
      gPullDrag: loadedCoefficient(
        profile,
        gPull,
        'loadedGpullDrag',
        loadingPercent(profile, input.massKg),
      ),
      weightLb: Math.trunc(input.massKg / 0.45359237),
      // Keep the existing separate lateral damping and wheel-contact model.
      rudderF8: 0,
      rudderDrag: 0,
      flags: 0x40,
      gearDrag: 0,
      flapsDrag: 0,
      airBrakesDrag: 0,
      bayDrag: 0,
      wheelBrakesDrag: 0,
    }) /
      256) *
    LBF_N;
  const devices =
    (!input.onGround ? input.gear * (retailRawNumber(profile, 'gearDrag') ?? 0) : 0) +
    input.flap * (retailRawNumber(profile, 'flapsDrag') ?? 0) +
    input.airbrake * (retailRawNumber(profile, 'airBrakesDrag') ?? 0);
  // Continuous actuator fractions over the native endpoint coefficients.
  const deviceDrag =
    ((((input.massKg / 0.45359237) * LBF_N * nativeDragPercent(common)) / 100) * devices) / 256;
  return { thrustN: thrust, dragN: Math.max(0, drag + deviceDrag) };
}
