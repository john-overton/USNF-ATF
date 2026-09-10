/** Diagnostic trajectories, not acceptance of the current performance model.
 * Supply local retail data; generated profiles/trajectories stay in extracted/. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseRetailFlightProfile } from '../../engine/src/data/retail-flight';
import {
  createFlightState, flightEuler, sampleTelemetry, stepFlight, PLACEHOLDER_AIRCRAFT,
  type FlightControls, type FlightState,
} from '../../engine/src/sim/flight';

const [profileArg, outputArg] = process.argv.slice(2);
assert(profileArg && outputArg, 'Usage: bun tools/harness/envelope-audit.ts PROFILE OUTPUT');
const profilePath = resolve(profileArg);
const profile = parseRetailFlightProfile(JSON.parse(await readFile(profilePath, 'utf8')));
const dt = 1 / 120, knot = 1852 / 3600;
const environment = { sampleGround: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, kind: 'land' as const }) };
const neutral: FlightControls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: false, gearDown: false, gearFraction: 0 };
const clamp = (v: number) => Math.max(-1, Math.min(1, v));
const results = [];
for (const nativeEnvelope of [false, true]) {
  if (nativeEnvelope && !profile.native) continue;
  const def = { ...structuredClone(PLACEHOLDER_AIRCRAFT), retail: profile, nativeEnvelope,
    massKg: profile.emptyMassKg + profile.fuelCapacityKg, wingAreaM2: 52.5 };
  const run = (name: string, altitude: number, speedKnots: number, seconds: number,
    controls: (state: FlightState) => FlightControls) => {
    let state = createFlightState({ position: { x: 0, y: altitude, z: 0 }, airspeed: speedKnots * knot });
    let peakG = -Infinity, maxAltitudeError = 0;
    const samples = [];
    for (let i = 0; i < seconds * 120; i++) {
      const next = stepFlight(state, controls(state), environment, def, dt);
      state = next.state;
      assert.equal(state.status, 'airborne', `${name}: ${state.status}`);
      assert(Number.isFinite(next.telemetry.specificEnergy), `${name}: nonfinite energy`);
      peakG = Math.max(peakG, next.telemetry.loadFactor);
      maxAltitudeError = Math.max(maxAltitudeError, Math.abs(state.position.y - altitude));
      if (i % 120 === 0 || i === seconds * 120 - 1)
        samples.push({ time: state.timeSeconds, speedKnots: next.telemetry.airspeed / knot,
          altitudeM: state.position.y, g: next.telemetry.loadFactor });
    }
    const telemetry = sampleTelemetry(state, environment, def, controls(state));
    const result = { model: nativeEnvelope ? 'recovered-envelope' : 'retail-envelope', name,
      initialAltitudeM: altitude, initialSpeedKnots: speedKnots, seconds,
      finalSpeedKnots: telemetry.airspeed / knot, finalG: telemetry.loadFactor,
      peakG, maxAltitudeError,
      last30SecondsSpeedChangeKnots: seconds >= 30 ? telemetry.airspeed / knot - samples[samples.length - 31]!.speedKnots : null,
      samples };
    results.push(result);
    const { samples: _, ...summary } = result;
    console.log(JSON.stringify(summary));
  };
  for (const throttle of [0.45, 1]) {
    for (const initialKnots of [450, 770]) {
      run(`level-${throttle * 100}percent-from-${initialKnots}kt`, 10972.8, initialKnots, 3600,
        (state) => ({ ...neutral, throttle,
          pitch: clamp((10972.8 - state.position.y) * 0.002 - state.velocity.y * 0.03 - state.angularVelocity.x * 0.5),
          roll: clamp(flightEuler(state.attitude).rollRad * 2) }));
    }
  }
  for (const speed of [250, 350, 450, 550])
    run(`full-pull-${speed}kt`, 1000, speed, 10, () => ({ ...neutral, throttle: 1, pitch: 1 }));
}
const output = resolve(outputArg);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ date: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  workingTreeStatus: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(),
  profilePath, profileSource: profile.source,
  scope: 'No wind; clean; full internal fuel mass held fixed; no fuel burn. Original 120 Hz solver. Diagnostic only, not native or real-aircraft parity.',
  results }, null, 2) + '\n');
