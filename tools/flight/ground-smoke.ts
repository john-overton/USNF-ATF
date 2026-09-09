/** Stationary-airframe support, HUD geometry and helper-panel acceptance. */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openDesktop } from './desktop';
const args = process.argv.slice(2);
function option(name: string, fallback?: string) {
  const i = args.indexOf(name);
  const v = i < 0 ? fallback : args[i + 1];
  if (!v) throw new Error(`Required: ${name}`);
  return v;
}
const session = await openDesktop({
  binary: option('--binary'),
  terrain: option('--terrain', 'extracted/terrain/ukraine'),
  aircraft: option('--aircraft', 'extracted/flight/f14.json'),
  audio: option('--audio', 'extracted/flight/audio/f14.json'),
  out: option('--out', 'extracted/ground-support'),
  query: { mode: 'flight', flightStart: 'runway' },
  interactiveTest: true,
});
const evidence: Record<string, any> = {};
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function key(code: string, down: boolean) {
  await session.send('Input.dispatchKeyEvent', {
    type: down ? 'keyDown' : 'keyUp',
    code,
    key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code,
  });
}
let failure: string | undefined;
try {
  const initial = await session.poll(async () => {
    const d = await session.evaluate('window.__flightDiagnostics?.()');
    return d?.status === 'grounded' && d.simSteps > 10 ? d : undefined;
  }, 'grounded aircraft');
  evidence.initial = initial;
  for (const [label, codes] of [
    ['positive', ['ArrowDown', 'ArrowRight', 'KeyE']],
    ['negative', ['ArrowUp', 'ArrowLeft', 'KeyQ']],
  ] as const) {
    for (const code of codes) await key(code, true);
    const samples = await session.evaluate(
      `new Promise(resolve=>{const samples=[];const start=performance.now();function frame(now){samples.push(window.__flightDiagnostics());if(now-start<3000)requestAnimationFrame(frame);else resolve(samples);}requestAnimationFrame(frame);})`,
    );
    for (const code of codes) await key(code, false);
    for (const d of samples) {
      assert(d.status === 'grounded', `${label}: stationary aircraft changed contact state`);
      assert(
        Math.hypot(
          d.position.x - initial.position.x,
          d.position.y - initial.position.y,
          d.position.z - initial.position.z,
        ) < 1e-6,
        `${label}: stationary aircraft moved`,
      );
      assert(
        Math.hypot(
          d.attitude.x - initial.attitude.x,
          d.attitude.y - initial.attitude.y,
          d.attitude.z - initial.attitude.z,
          d.attitude.w - initial.attitude.w,
        ) < 1e-6,
        `${label}: stationary aircraft rotated`,
      );
      assert(
        Math.hypot(
          d.state.angularVelocity.x,
          d.state.angularVelocity.y,
          d.state.angularVelocity.z,
        ) < 1e-8,
        `${label}: angular velocity accumulated`,
      );
    }
    evidence[label] = { samples: samples.length, final: samples.at(-1) };
  }
  evidence.hud = await session.evaluate(
    `(() => {const hud=document.querySelector('[data-flight-hud]');const a=hud.querySelector('[data-hud-pitch="0"]').getScreenCTM();const b=hud.querySelector('[data-hud-pitch="5"]').getScreenCTM();const rect=hud.getBoundingClientRect();return {width:rect.width,height:rect.height,pitchGap:Math.hypot(a.e-b.e,a.f-b.f),filter:getComputedStyle(hud).filter,strokeWidth:hud.getAttribute('stroke-width'),font:getComputedStyle(hud.querySelector('text')).fontFamily};})()`,
  );
  assert(Math.abs(evidence.hud.width - 570) < 1, 'HUD is not 25% narrower');
  assert(Math.abs(evidence.hud.height - 465) < 1, 'HUD is not 25% shorter');
  assert(
    Math.abs(evidence.hud.pitchGap - 50) < 0.1,
    'Pitch ticks are not double the original screen spacing',
  );
  assert(evidence.hud.filter === 'none', 'HUD still has blurred glow');
  await session.capture('stationary-hud');
  await session.evaluate(
    `document.querySelector('[aria-label="Minimize practice flight panel"]').click()`,
  );
  await session.poll(
    async () =>
      (await session.evaluate('document.getElementById("flight-helper-content").hidden')) ||
      undefined,
    'helper minimized',
  );
  evidence.minimized = await session.evaluate(
    `({hudVisible:document.querySelector('[data-flight-hud]').getBoundingClientRect().width>0,focused:document.activeElement?.id,simulation:window.__flightDiagnostics().simTime})`,
  );
  assert(
    evidence.minimized.hudVisible && evidence.minimized.focused === 'terrain-canvas',
    'Minimize hid HUD or retained button focus',
  );
  await session.capture('helper-minimized');
  await session.evaluate(
    `document.querySelector('[aria-label="Restore practice flight panel"]').click()`,
  );
  await session.poll(
    async () =>
      (await session.evaluate('!document.getElementById("flight-helper-content").hidden')) ||
      undefined,
    'helper restored',
  );
  evidence.restored = await session.evaluate('window.__flightDiagnostics()');
  assert(
    evidence.restored.simTime > evidence.minimized.simulation,
    'Panel toggle paused simulation',
  );
  await session.capture('helper-restored');
  assert(!session.errors.length, 'Renderer errors');
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
        evidence,
        failure,
        runtimeErrors: session.errors,
      },
      null,
      2,
    ),
  );
  await session.close();
}
if (failure) throw new Error(failure);
console.log(JSON.stringify({ result: 'pass', out: session.out, hud: evidence.hud }));
