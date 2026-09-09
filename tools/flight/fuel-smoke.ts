/** Real live-slider, burn, mass and fuel-exhaustion acceptance. */
import path from 'node:path';
import { openDesktop } from './desktop';
const args = process.argv.slice(2);
function option(name: string, fallback?: string): string {
  const i = args.indexOf(name),
    value = i < 0 ? fallback : args[i + 1];
  if (!value) throw new Error(`Required: ${name}`);
  return value;
}
const out = option('--out', 'extracted/flight-fuel');
const results: Record<string, any> = {};
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
for (const model of ['assisted', 'recovered-envelope']) {
  const session = await openDesktop({
    binary: option('--binary'),
    terrain: 'extracted/terrain/ukraine',
    aircraft: 'extracted/flight/f14.json',
    audio: 'extracted/flight/audio/f14.json',
    flightProfile: 'extracted/flight/f14-flight.json',
    out: path.join(out, model),
    query: { mode: 'flight', flightStart: 'airborne', flightModel: model },
    interactiveTest: true,
  });
  const evidence: Record<string, any> = {};
  let failure: string | undefined;
  try {
    const read = () => session.evaluate('window.__flightDiagnostics?.()');
    const until = (predicate: (d: any) => boolean, label: string) =>
      session.poll(
        async () => {
          const d = await read();
          return d && predicate(d) ? d : undefined;
        },
        label,
        20000,
      );
    async function tap(code: string) {
      for (const type of ['keyDown', 'keyUp'])
        await session.send('Input.dispatchKeyEvent', {
          type,
          code,
          key: code.startsWith('Digit') ? code.slice(5) : code.slice(3).toLowerCase(),
        });
    }
    async function slider(percent: number) {
      await session.evaluate(`(() => { const slider=document.getElementById('flight-fuel');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(slider,${percent});
        slider.dispatchEvent(new Event('input',{bubbles:true})); })()`);
      return until((d) => Math.abs(d.fuelFraction * 100 - percent) < 0.08, 'live fuel slider');
    }
    async function measure(seconds: number) {
      const initial = await read();
      const final = await until(
        (d) => d.simTime >= initial.simTime + seconds,
        'fuel consumption window',
      );
      return {
        initial,
        final,
        consumed: initial.fuelMassKg - final.fuelMassKg,
        seconds: final.simTime - initial.simTime,
      };
    }
    evidence.initial = await until(
      (d) => d.flightModelId === model && d.simSteps > 10,
      'flight initialized',
    );
    await tap('Digit1');
    evidence.half = await slider(50);
    assert(evidence.half.simTime >= evidence.initial.simTime, 'Slider restarted flight');
    assert(
      model === 'assisted'
        ? evidence.half.massKg === 9000
        : evidence.half.massKg < evidence.initial.massKg - 3000,
      'Fuel mass policy wrong',
    );
    await tap('Digit5');
    await until((d) => d.throttle === 1 && d.fuelBurnKgS > 0.9, 'military burn');
    evidence.military = await measure(3);
    await tap('Digit6');
    await until(
      (d) => d.systems.afterburnerFraction === 1 && d.fuelBurnKgS > 4.5,
      'afterburner burn',
    );
    evidence.afterburner = await measure(3);
    for (const [label, rate] of [
      ['military', 0.90718474],
      ['afterburner', 4.5359237],
    ] as const) {
      const m = evidence[label];
      assert(
        Math.abs(m.consumed / m.seconds - rate) < 0.001,
        `${model}: ${label} fuel rate mismatch`,
      );
      if (model !== 'assisted')
        assert(
          Math.abs(m.initial.massKg - m.final.massKg - m.consumed) < 1e-6,
          'Burn did not reduce actual mass',
        );
      else assert(m.final.massKg === 9000, 'Preserved handling mass changed');
    }
    await tap('KeyT');
    await until((d) => !d.engineRunning && d.fuelBurnKgS === 0, 'engine stopped');
    evidence.off = await measure(1);
    assert(evidence.off.consumed === 0, 'Stopped engine consumed fuel');
    await slider(0.1);
    await tap('KeyT');
    evidence.empty = await until((d) => d.fuelMassKg === 0 && !d.engineRunning, 'fuel exhaustion');
    assert(evidence.empty.systems.effectiveThrottle === 0, 'Empty aircraft still produces thrust');
    await session.capture('empty');
    evidence.refilled = await slider(40);
    assert(!evidence.refilled.engineRunning, 'Refill silently started engine');
    await tap('KeyT');
    evidence.restarted = await until(
      (d) => d.engineRunning && d.fuelBurnKgS > 0,
      'restart after refill',
    );
    await session.capture('refilled');
    assert(!session.errors.length, 'Renderer errors');
  } catch (error) {
    failure = String(error);
  } finally {
    results[model] = { evidence, failure, runtimeErrors: session.errors };
    await Bun.write(
      path.join(out, 'report.json'),
      JSON.stringify(
        {
          date: new Date().toISOString(),
          buildSourceCommit: option('--build-commit'),
          results,
        },
        null,
        2,
      ),
    );
    await session.close();
  }
  if (failure) throw new Error(failure);
}
console.log(JSON.stringify({ result: 'pass', out, models: Object.keys(results) }));
