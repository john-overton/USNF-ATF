/** Real Electron keyboard, aircraft animation and camera acceptance. Retail output stays ignored. */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openDesktop } from './desktop';

const args = process.argv.slice(2);
function option(name: string, fallback?: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? fallback : args[index + 1];
  if (!value) throw new Error(`Required: ${name}`);
  return value;
}
const session = await openDesktop({
  binary: option('--binary'),
  ...(args.includes('--app') ? { app: option('--app') } : {}),
  aircraft: option('--aircraft', 'extracted/flight/f14.json'),
  terrain: option('--terrain', 'extracted/terrain/ukraine'),
  ...(args.includes('--audio') ? { audio: option('--audio') } : {}),
  out: option('--out', 'extracted/flight-systems-smoke'),
  query: { mode: 'flight', flightStart: 'airborne' },
  interactiveTest: true,
});
const checkpoints: Record<string, any> = {};
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function read(): Promise<any> {
  const value = await session.evaluate('window.__flightDiagnostics?.()');
  if (value?.state?.status === 'crashed' || value?.status === 'error')
    throw new Error(`Flight failed: ${value.reason}`);
  return value;
}
async function until(predicate: (value: any) => boolean, label: string): Promise<any> {
  return session.poll(
    async () => {
      const value = await read();
      return value && predicate(value) ? value : undefined;
    },
    label,
    15_000,
  );
}
async function key(code: string, down: boolean): Promise<void> {
  const key = code.startsWith('Digit')
    ? code.slice(5)
    : code.startsWith('Key')
      ? code.slice(3).toLowerCase()
      : code;
  const virtual = code.startsWith('Digit')
    ? 48 + Number(code.slice(5))
    : code.startsWith('Key')
      ? code.charCodeAt(3)
      : code === 'F2'
        ? 113
        : code === 'F3'
          ? 114
          : code === 'ArrowRight'
            ? 39
            : 0;
  await session.send('Input.dispatchKeyEvent', {
    type: down ? 'keyDown' : 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: virtual,
    nativeVirtualKeyCode: virtual,
  });
}
async function tap(code: string): Promise<void> {
  await key(code, true);
  await key(code, false);
}
async function save(label: string, value?: any): Promise<any> {
  checkpoints[label] = value ?? (await read());
  await session.capture(label);
  return checkpoints[label];
}
let failure: string | undefined;
try {
  const initial = await until(
    (d) => d.simSteps > 10 && d.status === 'airborne',
    'airborne initialization',
  );
  assert(
    initial.modelTriangles > 0 && initial.aircraftName.includes('14'),
    'Imported F-14 was not loaded',
  );
  await save('initial', initial);
  for (let i = 1; i <= 6; i++) {
    await tap(`Digit${i}`);
    checkpoints[`throttle-${i}`] = await until(
      (d) => Math.abs(d.throttle - Math.min(1, (i - 1) / 4)) < 1e-9 && d.afterburner === (i === 6),
      `throttle preset ${i}`,
    );
  }
  const ab = await until(
    (d) => d.systems.afterburnerFraction === 1 && d.animation.burnerVisible === 1,
    'afterburner ignition',
  );
  assert(
    ab.systems.thrustMultiplier > 1 && ab.systems.effectiveThrottle > 0.99,
    'Afterburner does not affect thrust',
  );
  await save('afterburner', ab);
  await tap('KeyT');
  const off = await until(
    (d) => !d.engineRunning && d.systems.effectiveThrottle === 0,
    'engine cutoff',
  );
  assert(off.systems.thrustMultiplier === 1, 'Engine cutoff retained afterburner thrust');
  await save(
    'engine-stopped',
    await until(
      (d) => d.systems.engineSpool === 0 && d.systems.afterburnerFraction === 0,
      'shutdown spool',
    ),
  );
  await tap('KeyT');
  checkpoints['engine-starting'] = await until(
    (d) => d.engineRunning && d.systems.engineSpool > 0.05 && d.systems.engineSpool < 0.95,
    'restart spool intermediate',
  );
  await until((d) => d.systems.engineSpool === 1, 'restart complete');
  await tap('Digit3');
  await tap('KeyG');
  await tap('KeyH');
  const middle = await until(
    (d) =>
      d.systems.gearFraction < 0.8 &&
      d.systems.gearFraction > 0.2 &&
      d.systems.hookFraction > 0.1 &&
      d.systems.hookFraction < 0.95,
    'gear and hook intermediate animation',
  );
  assert(
    Math.abs(middle.animation.gearRotation) > 0.1 && middle.animation.hookRotation > 0.05,
    'Animation fractions did not move scene transforms',
  );
  await save('gear-hook-moving', middle);
  const extended = await until(
    (d) =>
      d.systems.gearFraction === 0 &&
      d.systems.hookFraction === 1 &&
      d.animation.gearVisible === 0 &&
      Math.abs(d.animation.hookRotation - Math.PI / 4) < 1e-6,
    'gear and hook completed animation',
  );
  await save('gear-up-hook-down', extended);
  await tap('Digit6');
  const swept = await until(
    (d) =>
      d.airspeed > 180 &&
      d.animation.wingSweepRad > 0 &&
      d.animation.wingLeftRotation > 0 &&
      Math.abs(d.animation.wingLeftRotation - d.animation.wingSweepRad) < 1e-6,
    'airspeed-driven wing sweep reaches scene geometry',
  );
  await save('wings-swept', swept);
  await tap('Digit3');
  await tap('KeyG');
  await tap('KeyH');
  const restored = await until(
    (d) =>
      d.systems.gearFraction === 1 &&
      d.systems.hookFraction === 0 &&
      d.animation.gearVisible === 1 &&
      Math.abs(d.animation.gearRotation) < 1e-6 &&
      Math.abs(d.animation.hookRotation) < 1e-6,
    'reverse animation complete',
  );
  assert(
    Math.abs(restored.animation.wingSweepRad) < 1e-9 &&
      Math.abs(restored.animation.wingLeftRotation) < 1e-9,
    'Gear extension did not restore unswept wings',
  );
  await save('gear-down-hook-up', restored);
  await tap('F2');
  await key('ArrowRight', true);
  await until((d) => Math.abs(d.attitude.z) > 0.2, 'aircraft bank');
  await key('ArrowRight', false);
  const locked = await until(
    (d) => d.cameraMode === 'attitude' && Math.abs(d.cameraUp.x) > 0.2,
    'F2 attitude camera',
  );
  await session.poll(
    async () =>
      (await session.evaluate("document.body.innerText.includes('F2 · attitude locked')")) ||
      undefined,
    'F2 helper update',
  );
  await save('f2-attitude', locked);
  await tap('F3');
  const upright = await until((d) => d.cameraMode === 'world-up', 'F3 world-up camera');
  assert(
    Math.abs(upright.cameraUp.x) < 1e-9 &&
      Math.abs(upright.cameraUp.y - 1) < 1e-9 &&
      Math.abs(upright.cameraUp.z) < 1e-9,
    'F3 camera up follows aircraft bank',
  );
  await session.poll(
    async () =>
      (await session.evaluate("document.body.innerText.includes('F3 · horizon up')")) || undefined,
    'F3 helper update',
  );
  await save('f3-world-up', upright);
  assert(
    upright.audio.contextState === 'running' && !upright.audio.error,
    `Audio context not running: ${JSON.stringify(upright.audio)}`,
  );
  await tap('KeyM');
  checkpoints['audio-muted'] = await until(
    (d) => d.audio.muted === true && d.audio.contextState === 'running',
    'M mute',
  );
  await tap('KeyM');
  checkpoints['audio-unmuted'] = await until(
    (d) => d.audio.muted === false && d.audio.contextState === 'running',
    'M unmute',
  );
  assert(session.errors.length === 0, 'Renderer console error or exception');
} catch (error) {
  failure = String(error);
} finally {
  const report = {
    date: new Date().toISOString(),
    buildSourceCommit: option('--build-commit', 'unrecorded'),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workingTreeStatus: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(),
    machine: { platform: process.platform, architecture: process.arch, bun: Bun.version },
    scope:
      'Real packaged Electron; CDP trusted keyboard events exercise normal input handlers; screenshots and read-only state verify transitions. Audio context operation is not a human listening test.',
    checkpoints,
    runtimeErrors: session.errors,
    failure,
  };
  await Bun.write(path.join(session.out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
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
