/** Real-key A/B device drag acceptance. No state writes or physics replacement. */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openDesktop } from './desktop';
const args = process.argv.slice(2);
function option(name: string, fallback?: string): string {
  const i = args.indexOf(name);
  const value = i < 0 ? fallback : args[i + 1];
  if (!value) throw new Error(`Required: ${name}`);
  return value;
}
const out = option('--out', 'extracted/flight-aero');
const cases: Record<string, any> = {};
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
let failure: string | undefined;
try {
  for (const variant of ['clean', 'flaps', 'airbrake', 'gear', 'fullAB', 'lightAB']) {
    const session = await openDesktop({
      binary: option('--binary'),
      terrain: option('--terrain', 'extracted/terrain/ukraine'),
      aircraft: option('--aircraft', 'extracted/flight/f14.json'),
      audio: option('--audio', 'extracted/flight/audio/f14.json'),
      flightProfile: option('--flight-profile', 'extracted/flight/f14-flight.json'),
      out: path.join(out, variant),
      query: {
        mode: 'flight',
        flightStart: 'airborne',
        flightModel: 'retail-envelope',
        flightFuel: variant === 'lightAB' ? '0.25' : '1',
      },
      interactiveTest: true,
    });
    try {
      async function tap(code: string) {
        for (const type of ['keyDown', 'keyUp']) {
          await session.send('Input.dispatchKeyEvent', {
            type,
            code,
            key: code.startsWith('Digit') ? code.slice(5) : code.slice(3).toLowerCase(),
          });
        }
      }
      await session.poll(async () => {
        const d = await session.evaluate('window.__flightDiagnostics?.()');
        return d?.status === 'airborne' && d.simSteps > 10 ? d : undefined;
      }, 'airborne start');
      // Match clean configuration before starting each A/B window.
      await tap('KeyG');
      await tap('Digit1');
      await session.poll(async () => {
        const d = await session.evaluate('window.__flightDiagnostics()');
        return d.systems.gearFraction === 0 && d.throttle === 0 ? d : undefined;
      }, 'clean idle configuration');
      const initial = await session.evaluate('window.__flightDiagnostics()');
      assert(initial.flightProfileSha256, 'Retail PT profile is not active');
      if (variant.endsWith('AB')) await tap('Digit6');
      else if (variant !== 'clean')
        await tap(variant === 'flaps' ? 'KeyF' : variant === 'airbrake' ? 'KeyB' : 'KeyG');
      const samples = await session.evaluate(`new Promise(resolve => {
        const samples=[]; const start=window.__flightDiagnostics().simTime;
        function frame() { const d=window.__flightDiagnostics(); samples.push(d);
          if(d.simTime-start<10) requestAnimationFrame(frame); else resolve(samples);
        } requestAnimationFrame(frame);
      })`);
      const final = samples.at(-1);
      const loss = initial.telemetry.specificEnergy - final.telemetry.specificEnergy;
      cases[variant] = { initial, final, energyLoss: loss, samples, runtimeErrors: session.errors };
      assert(
        samples.every((d: any) => d.status === 'airborne'),
        `${variant}: left airborne state`,
      );
      assert(final.throttle === (variant.endsWith('AB') ? 1 : 0), `${variant}: throttle changed`);
      assert(!session.errors.length, `${variant}: renderer errors`);
      assert(
        variant.endsWith('AB') ? loss < 0 : loss > 0,
        `${variant}: incorrect engine/drag energy direction`,
      );
      const fraction =
        variant === 'flaps'
          ? 'flapFraction'
          : variant === 'airbrake'
            ? 'airbrakeFraction'
            : 'gearFraction';
      assert(
        final.systems[fraction] === (variant === 'clean' || variant.endsWith('AB') ? 0 : 1),
        `${variant}: device did not deploy`,
      );
      await session.capture('final');
    } finally {
      await session.close();
    }
  }
  assert(cases.lightAB.final.massKg < cases.fullAB.final.massKg, 'Fuel load did not change mass');
  assert(
    -cases.lightAB.energyLoss > -cases.fullAB.energyLoss * 1.1,
    'Lighter load did not accelerate harder',
  );
  assert(
    Math.abs(
      cases.fullAB.final.systems.thrustMultiplier -
        cases.fullAB.final.afterburnerThrustN / cases.fullAB.final.militaryThrustN,
    ) < 1e-8,
    'Afterburner does not use PT thrust ratio',
  );
  for (const variant of ['flaps', 'airbrake', 'gear']) {
    assert(
      cases[variant].energyLoss > cases.clean.energyLoss * 1.1,
      `${variant}: less than 10% added energy loss versus clean`,
    );
  }
} catch (error) {
  failure = String(error);
} finally {
  await Bun.write(
    path.join(out, 'report.json'),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        buildSourceCommit: option('--build-commit', 'unrecorded'),
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        cases,
        failure,
      },
      null,
      2,
    ),
  );
}
if (failure) throw new Error(failure);
console.log(
  JSON.stringify({
    result: 'pass',
    out,
    energyLoss: Object.fromEntries(
      Object.entries(cases).map(([name, result]) => [name, result.energyLoss]),
    ),
  }),
);
