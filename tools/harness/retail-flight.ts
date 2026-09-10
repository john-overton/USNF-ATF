/** Actual imported-data acceptance of the original envelope-calibrated solver.
 * No trajectory/velocity mutation, runtime force mocking or native parity claim. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseRetailFlightProfile } from '../../engine/src/data/retail-flight';
import { envelopeBounds } from '../../engine/src/sim/flight/retail-envelope';
import {
  createFlightState,
  flightEuler,
  sampleTelemetry,
  stepFlight,
  PLACEHOLDER_AIRCRAFT,
  type AircraftDefinition,
  type FlightControls,
  type FlightState,
} from '../../engine/src/sim/flight';

const args = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const at = args.indexOf(name);
  if (at < 0) return fallback;
  assert(args[at + 1] && !args[at + 1]!.startsWith('--'), `Missing ${name}`);
  return args[at + 1]!;
};
for (let i = 0; i < args.length; i += 2)
  assert(['--profile', '--output', '--model'].includes(args[i]!), `Unknown ${args[i]}`);
const profilePath = resolve(option('--profile', 'extracted/flight/f14-flight.json'));
const output = resolve(option('--output', 'extracted/flight-harness/retail-flight.json'));
const profile = parseRetailFlightProfile(JSON.parse(await readFile(profilePath, 'utf8')));
const model = option('--model', 'retail-envelope');
assert(['retail-envelope', 'recovered-envelope'].includes(model), 'Unknown model');
const fullMass = profile.emptyMassKg + profile.fuelCapacityKg;
const definition = (massKg = fullMass): AircraftDefinition => ({
  ...structuredClone(PLACEHOLDER_AIRCRAFT),
  id: 'local-usnf97-f14',
  wingAreaM2: 52.5,
  name: profile.name,
  retail: profile,
  nativeEnvelope: model === 'recovered-envelope',
  massKg,
});
const environment = {
  sampleGround: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, kind: 'land' as const }),
};
const dt = 1 / 120;
const clamp = (n: number, limit = 1) => Math.max(-limit, Math.min(limit, n));
const neutral: FlightControls = {
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttle: 0,
  brake: false,
  gearDown: false,
  gearFraction: 0,
};
const abRatio = profile.afterburnerThrustN / profile.militaryThrustN;
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const workingTreeStatus = execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim();
const results: Record<string, unknown>[] = [];
function run(
  name: string,
  altitudeM: number,
  initialSpeed: number,
  seconds: number,
  controls: (state: FlightState) => FlightControls,
  def = definition(),
) {
  let state = createFlightState({ position: { x: 0, y: altitudeM, z: 0 }, airspeed: initialSpeed });
  const samples: Record<string, number | boolean>[] = [];
  let maxAltitudeError = 0;
  for (let tick = 0; tick < Math.round(seconds / dt); tick++) {
    const next = stepFlight(state, controls(state), environment, def, dt);
    state = next.state;
    assert.equal(state.status, 'airborne', `${name}: ${state.status} ${next.telemetry.reason}`);
    assert(Object.values(state.position).every(Number.isFinite), `${name}: nonfinite position`);
    assert(
      Number.isFinite(next.telemetry.specificEnergy) && next.telemetry.airspeed < 2000,
      `${name}: unbounded energy`,
    );
    maxAltitudeError = Math.max(maxAltitudeError, Math.abs(state.position.y - altitudeM));
    if (tick % 120 === 0 || tick === Math.round(seconds / dt) - 1)
      samples.push({
        time: state.timeSeconds,
        altitudeM: state.position.y,
        speedMps: next.telemetry.airspeed,
        alphaRad: next.telemetry.alphaRad,
        loadFactor: next.telemetry.loadFactor,
        energy: next.telemetry.specificEnergy,
        stalled: next.telemetry.stalled,
      });
  }
  const telemetry = sampleTelemetry(state, environment, def, controls(state));
  const result = {
    name,
    massKg: def.massKg,
    altitudeM,
    initialSpeedMps: initialSpeed,
    seconds,
    finalSpeedMps: telemetry.airspeed,
    finalAltitudeM: state.position.y,
    maxAltitudeError,
    finalEnergy: telemetry.specificEnergy,
    finalLoadFactor: telemetry.loadFactor,
    samples,
  };
  results.push(result);
  return result;
}
function level(altitude: number, power: number, devices: Partial<FlightControls> = {}) {
  return (state: FlightState): FlightControls => ({
    ...neutral,
    throttle: power > 0 ? 1 : 0,
    thrustMultiplier: power,
    pitch: clamp(
      (altitude - state.position.y) * 0.002 -
        state.velocity.y * 0.03 -
        state.angularVelocity.x * 0.5,
    ),
    roll: clamp(flightEuler(state.attitude).rollRad * 2),
    ...devices,
  });
}

for (const altitude of [100, 3000, 10972.8]) {
  const target = envelopeBounds(profile, 1, altitude)!;
  assert(target, 'Missing imported 1G reference');
  const initial = target.maxSpeedMps * 0.6;
  const ab = run(`level-AB-${altitude}m`, altitude, initial, 600, level(altitude, abRatio));
  const mil = run(`level-military-${altitude}m`, altitude, initial, 600, level(altitude, 1));
  assert(
    profile.native ? ab.finalSpeedMps <= target.maxSpeedMps * 1.05
      : Math.abs(ab.finalSpeedMps / target.maxSpeedMps - 1) < 0.05,
    `AB does not approach imported boundary at ${altitude}: ${ab.finalSpeedMps} vs ${target.maxSpeedMps}`,
  );
  assert(ab.maxAltitudeError < 30 && mil.maxAltitudeError < 30, 'Level altitude excursion');
  assert(ab.finalSpeedMps > mil.finalSpeedMps * 1.1, 'Afterburner must improve equilibrium speed');
  assert(ab.finalSpeedMps > initial * 1.3, 'Aircraft must accelerate from initial state');
  for (const result of [ab, mil]) {
    const speed30SecondsEarlier = Number(result.samples[result.samples.length - 31]!.speedMps);
    assert(
      Math.abs(result.finalSpeedMps - speed30SecondsEarlier) < 1.5,
      'Last 30 seconds must approach steady speed',
    );
    assert(
      Math.abs(result.finalLoadFactor - 1) < 0.03,
      'Level flight must sustain approximately 1G',
    );
  }
}
if (profile.native) {
  // Native load corrections make full-fuel speed lower than the unladen PT
  // boundary. Verify that boundary at empty weight, without fuel burn logic.
  const height = 10972.8;
  const target = envelopeBounds(profile, 1, height)!;
  const light = run('unladen-upper-boundary', height, target.maxSpeedMps * 0.6, 600,
    level(height, abRatio), definition(profile.emptyMassKg));
  assert(Math.abs(light.finalSpeedMps / target.maxSpeedMps - 1) < 0.05, 'Unladen AB upper boundary');
}
const altitude = 3000;
const full = run('full-fuel-acceleration', altitude, 180, 60, level(altitude, abRatio));
const empty = run(
  'empty-fuel-acceleration',
  altitude,
  180,
  60,
  level(altitude, abRatio),
  definition(profile.emptyMassKg),
);
assert(
  empty.finalSpeedMps > full.finalSpeedMps + 5,
  'Mass must affect acceleration with a fixed calibration',
);
const clean = run('engine-off-clean', altitude, 180, 15, level(altitude, 0));
for (const [name, devices] of Object.entries({
  flaps: { flaps: 1 },
  gear: { gearFraction: 1 },
  airbrake: { airbrake: 1 },
})) {
  const result = run(`engine-off-${name}`, altitude, 180, 15, level(altitude, 0, devices));
  assert(
    result.finalEnergy < clean.finalEnergy - 50,
    `${name} must dissipate additional mechanical energy`,
  );
}
const low = envelopeBounds(profile, 1, altitude)!.minSpeedMps;
const stalled = run('below-native-low-boundary', altitude, low * 0.65, 4, () => ({
  ...neutral,
  pitch: 1,
}));
assert(
  stalled.samples.some((s) => s.stalled),
  'Below-boundary pitch demand should stall',
);
assert(stalled.finalAltitudeM < altitude, 'Stalled aircraft must lose altitude');
const stalledFlaps = run('below-native-low-boundary-flaps', altitude, low * 0.65, 4, () => ({
  ...neutral,
  pitch: 1,
  flaps: 1,
}));
assert(
  stalledFlaps.finalAltitudeM > stalled.finalAltitudeM,
  'Flaps must produce observable low-speed lift benefit',
);
assert(
  stalledFlaps.samples.some((s) => s.stalled),
  'Flaps must not remove deep stall',
);

await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  JSON.stringify(
    {
      date: new Date().toISOString(),
      sourceCommit,
      workingTreeStatus,
      endingSourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      profilePath,
      model,
      profileSource: profile.source,
      referenceMassKg: fullMass,
      timestepSeconds: dt,
      scope:
        'Original force solver calibrated to imported clean full-fuel afterburning envelope. No native runtime or handling parity claim. Controls only; no state reset within maneuvers.',
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify(
    {
      output,
      scenarios: results.length,
      results: results.map(({ samples, ...summary }) => summary),
    },
    null,
    2,
  ),
);
