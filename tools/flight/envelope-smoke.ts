/** Fresh unpackaged source required. Real input, isolated retail/terrain data. */
import assert from 'node:assert/strict';
import { openDesktop } from './desktop';

for (const [id, model] of [
  ['f14', 'retail-envelope'], ['f14', 'recovered-envelope'],
  ['a4e', 'retail-envelope'], ['x31', 'retail-envelope'],
]) {
  const session = await openDesktop({
    binary: 'shell/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron', app: 'shell',
    terrain: 'extracted/terrain/ukraine', aircraft: `extracted/flight/${id}.json`,
    flightProfile: `extracted/flight/${id}-flight.json`, interactiveTest: true,
    out: `extracted/flight-envelope-audit/desktop-${id}-${model}`,
    query: { mode: 'flight', aircraft: id!, flightStart: 'airborne', flightModel: model!, wind: 'calm' },
  });
  try {
    await session.poll(async () => {
      const d = await session.evaluate('window.__flightDiagnostics?.()');
      return d?.status === 'airborne' && d.simSteps > 10 ? d : undefined;
    }, 'airborne');
    const key = async (code: string, down: boolean) => session.send('Input.dispatchKeyEvent', {
      type: down ? 'keyDown' : 'keyUp', code, key: code === 'ArrowDown' ? code : code.slice(-1).toLowerCase(),
    });
    const tap = async (code: string) => { await key(code, true); await key(code, false); };
    await tap('KeyG');
    await tap('Digit5');
    await tap('KeyA');
    const sample = async () => session.evaluate(`new Promise(resolve => {
      const samples=[]; const start=window.__flightDiagnostics().simTime;
      function frame(){const d=window.__flightDiagnostics();samples.push(d);
        if(d.simTime-start<10)requestAnimationFrame(frame);else resolve(samples);}
      requestAnimationFrame(frame);
    })`);
    const held = await sample();
    await key('ArrowDown', true);
    const pulled = await sample();
    await key('ArrowDown', false);
    const samples = [...held, ...pulled];
    assert(samples.every(d => d.status === 'airborne' && d.flightModelId === model), 'Flight/model changed');
    const peakG = Math.max(...pulled.map(d => d.loadFactor));
    if (id === 'f14') assert(peakG > 1.5 && peakG < 9, `Unexpected F-14 G response: ${peakG}`);
    assert.equal(session.errors.length, 0, 'Renderer errors');
    await session.capture('full-pull');
    await Bun.write(`${session.out}/report.json`, JSON.stringify({ id, model, peakG, held, pulled }, null, 2));
    console.log(JSON.stringify({ id, model, peakG, status: samples.at(-1).status, errors: session.errors.length }));
  } finally { await session.close(); }
}
