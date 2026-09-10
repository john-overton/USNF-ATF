/** Recovered USNF97 longitudinal helpers. Integer force outputs are lbf * 256.
 * Isolated x86 parity does not establish complete native integration parity. */
const div = (n: number, d: number) => {
  if (!d) throw new Error('Native drag division by zero');
  return Math.trunc((n | 0) / d) | 0;
};
/** FMGetWeight and loaded drag setup. Component weights are whole pounds. */
export function nativeLoadedParameters(input: {
  emptyWeightLb: number;
  maxWeightLb: number;
  loadAWeightLb: number;
  loadBWeightLb: number;
  coefDrag: number;
  gPullDrag: number;
  loadedDrag: number;
  loadedGpullDrag: number;
}) {
  const total = (input.emptyWeightLb + input.loadAWeightLb + input.loadBWeightLb) | 0;
  const capacity = input.maxWeightLb - input.emptyWeightLb;
  const over = total > input.maxWeightLb;
  const loadA = over ? 50 : div(Math.imul(input.loadAWeightLb, 100), capacity);
  const loadB = over ? 50 : div(Math.imul(input.loadBWeightLb, 100), capacity);
  const adjust = (base: number, coefficient: number) =>
    div(Math.imul(base, 100 + div(Math.imul(loadA + loadB, coefficient), 100)), 100);
  return {
    weightLb: over ? input.maxWeightLb : total,
    loadA,
    loadB,
    adjustedCoefDrag: adjust(input.coefDrag, input.loadedDrag),
    adjustedGPullDrag: adjust(input.gPullDrag, input.loadedGpullDrag),
  };
}
export function nativeSoundSpeedFps(altitudeF8: number): number {
  return 1115 + div(Math.imul(-148, Math.min(altitudeF8 >> 8, 36000)), 36000);
}
export interface NativeDragContext {
  speedF8: number;
  altitudeF8: number;
  forwardSpeedBound: number;
}
export function nativeDragPercent(input: NativeDragContext): number {
  const bound = input.forwardSpeedBound;
  if (!Number.isInteger(bound) || bound <= 0 || bound > 32767)
    throw new Error('Native drag needs a positive signed-word speed bound');
  const base = div(Math.imul(Math.abs(input.speedF8) >> 8, 100), bound);
  const sound = Math.min(nativeSoundSpeedFps(input.altitudeF8), bound);
  const start = Math.min(366, sound);
  const wave =
    sound === start
      ? 0
      : Math.max(
          -30,
          Math.min(45, div(Math.imul((input.speedF8 >> 8) - start, 75), sound - start) - 30),
        );
  return wave <= 0
    ? div(Math.imul(base, 100 + wave), 100)
    : (base + div(Math.imul(100 - base, wave), 100)) | 0;
}
export interface NativeDragForceInput extends NativeDragContext {
  adjustedCoefDrag: number;
  throttleF8: number;
  onGround: boolean;
  pitchAngle: number;
  militaryThrust: number;
  afterburnerThrust: number;
  loadFactorF8: number;
  gPullDrag: number;
  weightLb: number;
  rudderF8: number;
  rudderDrag: number;
  flags: number;
  gearDrag: number;
  flapsDrag: number;
  airBrakesDrag: number;
  bayDrag: number;
  wheelBrakesDrag: number;
}
export function nativeDragForceF8(input: NativeDragForceInput): number {
  const pct = nativeDragPercent(input);
  let base = Math.max(16, div(Math.imul(pct, input.adjustedCoefDrag), 200));
  if ((input.throttleF8 & 0xffffff00) === 0 && !input.onGround) {
    const pitch = input.pitchAngle;
    const pitchFactor = pitch >= 0 ? 256 : pitch < -8190 ? 0 : div((pitch + 8190) << 8, 8190);
    base = Math.max(base, div(pitchFactor << 6, 256));
  }
  let drag = Math.imul(base, input.afterburnerThrust || input.militaryThrust);
  let extra = div(Math.imul(Math.max(0, Math.abs(input.loadFactorF8) - 256), input.gPullDrag), 256);
  if (!input.onGround)
    extra = (extra + div(Math.imul(Math.abs(input.rudderF8), input.rudderDrag), 256)) | 0;
  if ((input.flags & 0x40) !== 0 && !input.onGround) extra = (extra + input.gearDrag) | 0;
  if ((input.flags & 0x100) !== 0) extra = (extra + input.flapsDrag) | 0;
  if ((input.flags & 0x80) !== 0) extra = (extra + input.airBrakesDrag) | 0;
  if ((input.flags & 0x200) !== 0) extra = (extra + input.bayDrag) | 0;
  if (extra) drag = (drag + Math.imul(div(Math.imul(input.weightLb, pct), 100), extra)) | 0;
  if (input.onGround) {
    if ((input.flags & 0x40) === 0) drag = (drag + Math.imul(input.weightLb, 384)) | 0;
    else if ((input.flags & 0x80) !== 0)
      drag = (drag + Math.imul(input.weightLb, input.wheelBrakesDrag)) | 0;
  }
  return drag;
}
