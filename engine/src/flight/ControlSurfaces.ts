/** Authored control mixing for the partitioned retail exterior, not SH animation. */
export interface SurfaceControls {
  pitch: number;
  roll: number;
  yaw: number;
  flap: number;
  airbrake: number;
}

export function surfaceAngle(name: string, controls: SurfaceControls): number {
  const signed = (value: number) => Math.max(-1, Math.min(1, value));
  const fraction = (value: number) => Math.max(0, Math.min(1, value));
  if (name.startsWith('taileron-')) {
    const side = name.startsWith('taileron-left') ? 1 : -1;
    return -signed(controls.pitch) * 0.3 + side * signed(controls.roll) * 0.22;
  }
  if (name.startsWith('rudder-')) return signed(controls.yaw) * 0.35;
  if (name.startsWith('flap-')) return fraction(controls.flap) * 0.52;
  if (name.startsWith('airbrake-upper')) return -fraction(controls.airbrake) * 0.9;
  if (name.startsWith('airbrake-lower')) return fraction(controls.airbrake) * 0.9;
  return 0;
}
