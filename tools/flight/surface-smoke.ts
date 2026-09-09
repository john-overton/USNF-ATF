/** Actual Electron key-driven surface and hook checks, with optional model inspection views. */
import { openDesktop } from './desktop';
const preview = await Bun.build({ entrypoints: ['tools/flight/aircraft-preview.ts'], target: 'browser', format: 'iife', minify: true });
if (!preview.success) throw new Error(String(preview.logs));
const previewScript = await preview.outputs[0]!.text();

for (const id of ['a4e', 'x31'] as const) {
  const session = await openDesktop({
    binary: 'shell/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
    app: 'shell', terrain: 'extracted/terrain/ukraine',
    aircraft: `extracted/aircraft-surfaces/${id}.json`,
    out: `extracted/aircraft-surfaces/smoke-${id}`,
    query: { mode: 'flight', flightStart: 'airborne', aircraft: id },
  });
  const checkpoints: Record<string, any> = {};
  const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(`${id}: ${message}`); };
  const read = () => session.evaluate('window.__flightDiagnostics()');
  async function key(code: string, down: boolean) {
    await session.evaluate(`window.dispatchEvent(new KeyboardEvent(${JSON.stringify(down ? 'keydown' : 'keyup')},{code:${JSON.stringify(code)},key:${JSON.stringify(code)},bubbles:true}));`);
  }
  async function tap(code: string) { await key(code, true); await key(code, false); }
  async function save(name: string) { checkpoints[name] = await read(); await session.capture(name); }
  async function checkAngle(prefix: string, min: number) {
    const d = await read();
    const angles = Object.entries(d.animation).filter(([name]) => name.startsWith(prefix));
    assert(angles.length > 0 && angles.every(([, value]) => Number(value) > min), `${prefix} did not move`);
  }
  try {
    await session.poll(async () => {
      const d = await session.evaluate('window.__flightDiagnostics?.()');
      return d?.simSteps > 10 && d.status === 'airborne' ? d : undefined;
    }, 'flight ready');
    await save('neutral');
    await key('ArrowDown', true); await Bun.sleep(350);
    await checkAngle(id === 'a4e' ? 'elevator-' : 'canard-', 0.05);
    if (id === 'x31') await checkAngle('elevon-', 0.05);
    await save('pitch'); await key('ArrowDown', false);
    await key('ArrowRight', true); await Bun.sleep(350);
    await checkAngle(id === 'a4e' ? 'aileron-' : 'elevon-', 0.05);
    await save('roll'); await key('ArrowRight', false);
    await key('KeyE', true); await Bun.sleep(350);
    await checkAngle('rudder-', 0.05); await save('rudder'); await key('KeyE', false);
    await tap('KeyF'); await tap('KeyB');
    await session.poll(async () => (await read()).systems.flapFraction > 0.99, 'flaps extended');
    await checkAngle(id === 'a4e' ? 'flap-' : 'elevon-', 0.2);
    if (id === 'a4e') {
      await checkAngle('airbrake-', 0.6);
      await tap('KeyH');
      await session.poll(async () => (await read()).systems.hookFraction > 0.99, 'hook down');
      const d = await read();
      const a = d.animation;
      const tipY = a.hookPivotY - Math.sin(a.hookRotation) * a.hookArmLength;
      const tipZ = a.hookPivotZ + Math.cos(a.hookRotation) * a.hookArmLength;
      assert(tipY > -2.3 && tipY < -1.9, 'hook tip misses authored wheel-contact height');
      assert(tipZ < 6.11 && a.hookPivotZ < 3, 'hook hangs behind tail instead of under fuselage');
    }
    await save('devices');
    await tap('KeyF'); await tap('KeyB'); if (id === 'a4e') await tap('KeyH');
    await session.poll(async () => (await read()).systems.flapFraction < 0.01 && (await read()).systems.hookFraction < 0.01, 'devices retracted');
    await save('returned');
    const returned = checkpoints.returned;
    const prefixes = ['elevator-', 'aileron-', 'canard-', 'elevon-', 'rudder-', 'flap-', 'airbrake-'];
    assert(Object.entries(returned.animation).filter(([name]) => prefixes.some(p => name.startsWith(p))).every(([,angle]) => Number(angle) < 0.01), 'surfaces did not return to neutral');
    assert(session.errors.length === 0, 'renderer errors');
    await Bun.write(`${session.out}/report.json`, JSON.stringify(checkpoints, null, 2));
    await session.evaluate(previewScript);
    const data = await Bun.file(`extracted/aircraft-surfaces/${id}.json`).json();
    for (const [name, controls, hook, view] of [
      ['top-neutral', {pitch:0,roll:0,yaw:0,flap:0,airbrake:0}, 0, 'top'],
      ['side-stowed', {pitch:0,roll:0,yaw:0,flap:0,airbrake:0}, 0, 'side'],
      ['side-deployed', {pitch:0,roll:0,yaw:0,flap:1,airbrake:1}, 1, 'side'],
      ['oblique-controls', {pitch:1,roll:0.7,yaw:0.8,flap:0,airbrake:1}, 1, 'oblique'],
    ] as const) {
      await session.evaluate(`window.aircraftPreview(${JSON.stringify(data)},${JSON.stringify(id)},${JSON.stringify(controls)},${hook},${JSON.stringify(view)})`);
      await session.capture(name);
    }
    console.log(`${id}: pitch, roll, rudder, flaps, device return and hook placement pass`);
  } finally { await session.close(); }
}
