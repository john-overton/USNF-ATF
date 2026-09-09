/** Packaged retail-sample, HUD and movable-surface acceptance. */
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
const session = await openDesktop({
  binary: option('--binary'),
  aircraft: option('--aircraft', 'extracted/flight/f14.json'),
  audio: option('--audio', 'extracted/flight/audio/f14.json'),
  terrain: option('--terrain', 'extracted/terrain/ukraine'),
  out: option('--out', 'extracted/f14-retail-smoke'),
  query: { mode: 'flight', flightStart: 'airborne' },
  interactiveTest: true,
  initialization: `
    const originalConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function(destination, ...rest) {
      if (destination === this.context.destination && !window.__audioProof) {
        const stream = this.context.createMediaStreamDestination();
        const analyser = this.context.createAnalyser(); analyser.fftSize = 2048;
        originalConnect.call(this, stream); originalConnect.call(this, analyser);
        const chunks = []; const recorder = new MediaRecorder(stream.stream);
        recorder.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
        recorder.start(100);
        window.__audioProof = {analyser,recorder,chunks};
        window.__stopAudioProof = () => new Promise(resolve => {
          recorder.onstop = async () => resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));
          recorder.stop();
        });
      }
      return originalConnect.call(this, destination, ...rest);
    };
  `,
});
const checkpoints: Record<string, any> = {};
function assert(v: unknown, reason: string): asserts v {
  if (!v) throw new Error(reason);
}
async function read(): Promise<any> {
  const state = await session.evaluate('window.__flightDiagnostics?.()');
  if (state?.status === 'error' || state?.status === 'crashed') throw new Error(state.reason);
  return state;
}
async function until(predicate: (d: any) => boolean, label: string) {
  return session.poll(
    async () => {
      const d = await read();
      return d && predicate(d) ? d : undefined;
    },
    label,
    15000,
  );
}
async function key(code: string, down: boolean) {
  await session.send('Input.dispatchKeyEvent', {
    type: down ? 'keyDown' : 'keyUp',
    code,
    key: code.startsWith('Key')
      ? code.slice(3).toLowerCase()
      : code.startsWith('Digit')
        ? code.slice(5)
        : code,
  });
}
async function tap(code: string) {
  await key(code, true);
  await key(code, false);
}
async function save(name: string) {
  checkpoints[name] = await read();
  checkpoints[name].audioSignal = await session.evaluate(
    `(() => { const a=window.__audioProof?.analyser; if(!a)return null; const p=new Float32Array(a.fftSize);a.getFloatTimeDomainData(p);return {rms:Math.sqrt(p.reduce((s,v)=>s+v*v,0)/p.length),peak:Math.max(...p.map(Math.abs))}; })()`,
  );
  await session.capture(name);
}
let failure: string | undefined;
try {
  const initial = await until(
    (d) => d.simSteps > 10 && d.status === 'airborne',
    'flight initialized',
  );
  assert(initial.audio.source === 'retail-pt-samples', 'Retail sound samples not loaded');
  assert(initial.modelTriangles >= 364, 'Movable retail model not loaded');
  await session.poll(
    async () =>
      (await session.evaluate("!!document.querySelector('[data-flight-hud]')")) || undefined,
    'HUD visible',
  );
  await tap('Digit3');
  await until((d) => d.audio.contextState === 'running', 'retail audio unlocked');
  await save('hud-clean');
  await tap('KeyT');
  await until(
    (d) => d.audio.transitionEvents.stop === 1 && d.systems.engineSpool === 0,
    'recorded engine shutdown',
  );
  await save('engine-off');
  await new Promise((r) => setTimeout(r, 2300)); // Finish the 4.064s recorded shutdown before restart.
  await tap('KeyT');
  await until(
    (d) => d.audio.transitionEvents.start === 1 && d.systems.engineSpool > 0.2,
    'recorded engine start',
  );
  await save('engine-start');
  await new Promise((r) => setTimeout(r, 5400));
  await tap('KeyF');
  await tap('KeyB');
  await until(
    (d) =>
      d.systems.flapFraction > 0.1 &&
      d.systems.flapFraction < 0.8 &&
      d.systems.airbrakeFraction > 0.2,
    'devices moving',
  );
  await save('flaps-airbrake-moving');
  await until(
    (d) => d.systems.flapFraction === 1 && d.systems.airbrakeFraction === 1,
    'devices extended',
  );
  const deployed = await read();
  for (const prefix of ['flap-left', 'flap-right', 'airbrake-upper', 'airbrake-lower'])
    assert(
      Object.entries(deployed.animation).some(
        ([name, angle]) => name.startsWith(prefix) && Number(angle) > 0.3,
      ),
      `${prefix} mesh did not move`,
    );
  await save('flaps-airbrake-down');
  for (const [code, name, prefix] of [
    ['ArrowDown', 'elevator', 'taileron-'],
    ['ArrowRight', 'roll-control', 'taileron-'],
    ['KeyE', 'rudder', 'rudder-'],
  ]) {
    await key(code!, true);
    await until(
      (d) =>
        Object.entries(d.animation).some(([n, a]) => n.startsWith(prefix!) && Number(a) > 0.15),
      `${name} deflection`,
    );
    await save(name!);
    await key(code!, false);
  }
  await tap('KeyF');
  await tap('KeyB');
  await until(
    (d) => d.systems.flapFraction === 0 && d.systems.airbrakeFraction === 0,
    'devices retract',
  );
  const clean = await read();
  for (const [name, angle] of Object.entries(clean.animation))
    if (/^(flap-|airbrake-|taileron-|rudder-)/.test(name))
      assert(Number(angle) < 1e-6, `${name} failed to return neutral`);
  await save('surfaces-neutral');
  assert(
    clean.audio.transitionEvents.start === 1 && clean.audio.transitionEvents.stop === 1,
    'Repeated transition sound',
  );
  assert(!clean.audio.error && !session.errors.length, 'Audio/renderer errors');
  assert(
    Object.values(checkpoints).some((d) => d.audioSignal?.rms > 0.00001),
    'Mixed audio graph was silent',
  );
  assert(
    Object.values(checkpoints).every((d) => !d.audioSignal || d.audioSignal.peak < 1),
    'Mixed audio graph clipped',
  );
  const recording = await session.evaluate('window.__stopAudioProof()');
  await Bun.write(path.join(session.out, 'engine-cycle.webm'), new Uint8Array(recording));
} catch (error) {
  failure = String(error);
} finally {
  await Bun.write(
    path.join(session.out, 'report.json'),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        buildSourceCommit: option('--build-commit', 'unrecorded'),
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        checkpoints,
        failure,
        scope:
          'Actual app audio graph captured through a parallel MediaStream destination; this is not a physical speaker or human listening test.',
        runtimeErrors: session.errors,
      },
      null,
      2,
    ),
  );
  await session.close();
}
if (failure) throw new Error(failure);
console.log(
  JSON.stringify({
    result: 'pass',
    checkpoints: Object.keys(checkpoints).length,
    out: session.out,
  }),
);
