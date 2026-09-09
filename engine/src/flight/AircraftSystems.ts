import type { AircraftCommands } from './FlightInput';

export interface AircraftSystemsState {
  /** Visual/audio spool fraction; starting an engine takes two seconds. */
  engineSpool: number;
  /** 0 retracted, 1 extended. Original animation timings, not retail data. */
  gearFraction: number;
  hookFraction: number;
  flapFraction: number;
  airbrakeFraction: number;
  afterburnerFraction: number;
  effectiveThrottle: number;
  thrustMultiplier: number;
}
export function createAircraftSystems(throttle = 0): AircraftSystemsState {
  return {
    engineSpool: 1,
    gearFraction: 1,
    hookFraction: 0,
    flapFraction: 0,
    airbrakeFraction: 0,
    afterburnerFraction: 0,
    effectiveThrottle: Math.max(0, Math.min(1, throttle)),
    thrustMultiplier: 1,
  };
}
function approach(value: number, target: number, change: number): number {
  return value < target ? Math.min(target, value + change) : Math.max(target, value - change);
}
/** Called only by the fixed simulation tick. Engine cutoff removes thrust immediately. */
export function stepAircraftSystems(
  state: AircraftSystemsState,
  commands: AircraftCommands,
  dt: number,
): AircraftSystemsState {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1)
    throw new Error('Aircraft systems dt must be finite and in (0, 0.1]');
  const engineSpool = approach(state.engineSpool, Number(commands.engineRunning), dt / 2);
  const throttle = Math.max(0, Math.min(1, commands.throttle));
  const burning = commands.engineRunning && commands.afterburner && throttle >= 0.99;
  const afterburnerFraction = approach(state.afterburnerFraction, Number(burning), dt / 0.4);
  return {
    engineSpool,
    gearFraction: approach(state.gearFraction, Number(commands.gearDown), dt / 3),
    hookFraction: approach(state.hookFraction, Number(commands.hookDown), dt / 1.5),
    flapFraction: approach(state.flapFraction, Number(commands.flapsDown), dt / 2),
    airbrakeFraction: approach(state.airbrakeFraction, Number(commands.airbrakeDown), dt),
    afterburnerFraction,
    effectiveThrottle: commands.engineRunning ? throttle * engineSpool : 0,
    // Original assisted approximation; retail thrust curves remain separate importer work.
    thrustMultiplier: burning ? 1 + 0.5 * afterburnerFraction : 1,
  };
}
