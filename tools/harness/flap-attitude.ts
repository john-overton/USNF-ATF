/** Fixed-mass dynamics comparison, not a packaged runtime or native-parity test.
 * Full AB/flaps apply instantly: actuator travel, spool and fuel burn are excluded.
 * The preserved assisted model is recorded unchanged, including its augmentation.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseRetailFlightProfile } from '../../engine/src/data/retail-flight';
import {
  createFlightState,
  stepFlight,
  flightEuler,
  PLACEHOLDER_AIRCRAFT,
} from '../../engine/src/sim/flight';
import { stepFlight as stepAssisted } from '../../engine/src/sim/flight/assisted-flight';

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2)
  assert(
    ['--profile', '--output'].includes(args[i]!) && args[i + 1],
    'Use --profile PATH --output PATH',
  );
const option = (name: string, fallback: string) => {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1]!;
};
const profilePath = resolve(option('--profile', 'extracted/flight/f14-flight.json'));
const output = resolve(option('--output', 'extracted/flight-harness/flap-attitude.json'));
const profile = parseRetailFlightProfile(await Bun.file(profilePath).json());
assert(profile.native, 'Comparison requires the exported native envelope rows');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const workingTreeStatus = execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim();
const results = [];
for (const mode of ['assisted', 'retail-envelope', 'recovered-envelope'] as const)
  for (const scenario of ['neutral-flaps-takeoff', 'airborne-flap-deploy'] as const) {
    const def =
      mode === 'assisted'
        ? PLACEHOLDER_AIRCRAFT
        : {
            ...PLACEHOLDER_AIRCRAFT,
            massKg: profile.emptyMassKg + profile.fuelCapacityKg,
            wingAreaM2: 52.5,
            retail: profile,
            nativeEnvelope: mode === 'recovered-envelope',
          };
    const airborne = scenario === 'airborne-flap-deploy';
    let state = createFlightState({
      position: { x: 0, y: airborne ? 3000 : 110 + def.gearHeightM, z: 0 },
      airspeed: airborne ? 150 : 0,
    });
    const env = {
      sampleGround: () => ({ height: 110, normal: { x: 0, y: 1, z: 0 }, kind: 'land' as const }),
    };
    const samples = [];
    let recordedLiftoff = false;
    for (let i = 0; i < 7200; i++) {
      const next = (mode === 'assisted' ? stepAssisted : stepFlight)(
        state,
        {
          pitch: 0,
          roll: 0,
          yaw: 0,
          throttle: airborne ? 0.5 : 1,
          thrustMultiplier: airborne
            ? 1
            : mode === 'assisted'
              ? 1.5
              : profile.afterburnerThrustN / profile.militaryThrustN,
          flaps: airborne && i < 1200 ? 0 : 1,
          gearDown: !airborne,
          gearFraction: airborne ? 0 : 1,
          airbrake: 0,
        },
        env,
        def,
        1 / 120,
      );
      state = next.state;
      assert(Object.values(state.position).every(Number.isFinite), 'Nonfinite position');
      assert(Object.values(state.velocity).every(Number.isFinite), 'Nonfinite velocity');
      assert(
        Math.abs(Math.hypot(...Object.values(state.attitude)) - 1) < 1e-10,
        'Attitude lost normalization',
      );
      const firstLiftoff =
        !airborne && !recordedLiftoff && state.position.y > 110 + def.gearHeightM + 0.1;
      if (i % 600 === 599 || firstLiftoff) {
        samples.push({
          seconds: (i + 1) / 120,
          firstLiftoff,
          status: state.status,
          airspeedMps: next.telemetry.airspeed,
          altitudeM: state.position.y,
          bodyPitchDegrees: (flightEuler(state.attitude).pitchRad * 180) / Math.PI,
          flightPathDegrees:
            (Math.atan2(state.velocity.y, Math.hypot(state.velocity.x, state.velocity.z)) * 180) /
            Math.PI,
          alphaDegrees: (next.telemetry.alphaRad * 180) / Math.PI,
          loadFactor: next.telemetry.loadFactor,
        });
        if (firstLiftoff) recordedLiftoff = true;
      }
    }
    if (mode !== 'assisted') {
      assert(state.status === 'airborne', 'Experimental run did not finish airborne');
      if (airborne) {
        // Regression guards for this F-14 test condition, not universal AoA limits.
        // The former recovered mapping climbed at -7 to -9 degrees of AoA.
        for (const sample of samples.filter((s) => s.seconds >= 15)) {
          assert(sample.alphaDegrees > -2, 'Excessive negative-AoA flap trim returned');
          assert(Math.abs(sample.loadFactor - 1) < 0.15, 'Flap deployment did not settle near 1g');
        }
      } else {
        const liftoff = samples.find((s) => s.firstLiftoff);
        assert(liftoff, 'No liftoff within 60 seconds of full AB');
        assert(liftoff.bodyPitchDegrees > -1, 'Neutral takeoff pitched substantially nose-down');
      }
    }
    results.push({ mode, scenario, massKg: def.massKg, samples });
  }
await mkdir(dirname(output), { recursive: true });
await Bun.write(
  output,
  JSON.stringify(
    {
      sourceCommit,
      workingTreeStatus,
      generatedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      bun: Bun.version,
      profilePath,
      profileSource: profile.source,
      fixedStepHz: 120,
      scope:
        'Fixed mass; immediate actuator/power commands; no fuel burn, renderer or native trajectory parity. Neutral takeoff means zero pitch/roll/yaw input, not automatic rotation.',
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ output, scenarios: results.length, passed: true }));
