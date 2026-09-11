import type { FlightEnvironment, FlightState } from './index';

/** Authored taxi assistance: ramp applied wind from 5% to full at 150 kt groundspeed. */
export function groundWindFraction(state: FlightState): number {
  if (state.status !== 'grounded') return 1;
  const fullWindSpeedMps = (150 * 1852) / 3600;
  return (
    0.05 + 0.95 * Math.min(1, Math.hypot(state.velocity.x, state.velocity.z) / fullWindSpeedMps)
  );
}

/** Keep the weather field and true-air telemetry intact; attenuate only physics input. */
export function groundWindEnvironment(
  state: FlightState,
  env: FlightEnvironment,
): FlightEnvironment {
  const fraction = groundWindFraction(state);
  if (!env.wind || fraction === 1) return env;
  return {
    ...env,
    wind: {
      x: env.wind.x * fraction,
      y: env.wind.y * fraction,
      z: env.wind.z * fraction,
    },
  };
}
