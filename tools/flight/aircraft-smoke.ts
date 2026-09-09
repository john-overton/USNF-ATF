/** Fresh Electron acceptance for aircraft selection and distinct local asset loading. */
import { openDesktop } from './desktop';
import { AIRCRAFT } from '../../engine/src/flight/aircraft-catalog';

for (const id of ['a4e', 'x31'] as const) {
  const session = await openDesktop({
    binary: 'shell/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
    app: 'shell',
    terrain: 'extracted/terrain/ukraine',
    aircraft: `extracted/flight/${id}.json`,
    audio: `extracted/flight/audio/${id}.json`,
    flightProfile: `extracted/flight/${id}-flight.json`,
    out: `extracted/aircraft-smoke/${id}`,
    query: { mode: 'flight', flightStart: 'airborne', aircraft: id, flightModel: 'recovered-envelope' },
  });
  const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(`${id}: ${message}`); };
  try {
    const ready = () => session.poll(async () => {
      const d = await session.evaluate('window.__flightDiagnostics?.()');
      return d?.simSteps > 10 && d.status !== 'waiting-terrain' ? d : undefined;
    }, 'aircraft ready');
    const d = await ready();
    assert(d.aircraftId === id && d.aircraftName === AIRCRAFT[id].name, 'wrong model identity');
    assert(d.modelTriangles > 300, 'model geometry missing');
    assert(d.flightModelId === 'assisted' && d.retailProfileAvailable && !d.nativeEnvelopeAvailable, 'F-14 profile leaked');
    assert(d.audio.source === 'retail-pt-samples', `audio missing: ${JSON.stringify(d.audio)}`);
    assert(await session.evaluate('document.querySelector("#aircraft-selector").options.length === 3'), 'selector missing');
    await session.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit6',key:'6',bubbles:true})); window.dispatchEvent(new KeyboardEvent('keyup',{code:'Digit6',key:'6',bubbles:true}));`);
    await Bun.sleep(1500);
    const powered = await session.evaluate('window.__flightDiagnostics()');
    assert(powered.afterburner === (id === 'x31'), 'incorrect afterburner capability');
    assert(powered.simSteps > d.simSteps, 'simulation stopped');
    await session.capture('airborne');
    await session.evaluate(`const select=document.querySelector('#flight-model-selector'); select.value='retail-envelope'; select.dispatchEvent(new Event('change',{bubbles:true}));`);
    await session.poll(async () => {
      try { return (await session.evaluate('window.__flightDiagnostics?.().flightModelId === "retail-envelope"')) || undefined; }
      catch { return undefined; }
    }, 'retail flight model');
    const fitted = await ready();
    const profile = await Bun.file(`extracted/flight/${id}-flight.json`).json();
    assert(fitted.flightProfileSha256 === profile.source.sha256, 'wrong PT profile');
    assert(Math.abs(fitted.massKg - profile.emptyMassKg - fitted.fuelMassKg) < 0.01, 'wrong PT mass');
    assert(fitted.militaryThrustN === profile.militaryThrustN && fitted.afterburnerThrustN === profile.afterburnerThrustN, 'wrong PT thrust');
    await session.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit6',key:'6',bubbles:true})); window.dispatchEvent(new KeyboardEvent('keyup',{code:'Digit6',key:'6',bubbles:true}));`);
    await Bun.sleep(2000);
    const flying = await session.evaluate('window.__flightDiagnostics()');
    assert(flying.simSteps > fitted.simSteps && Number.isFinite(flying.airspeed), 'PT flight stopped');
    assert(flying.fuelMassKg < fitted.fuelMassKg, 'PT fuel did not burn');
    assert(Math.abs(flying.systems.thrustMultiplier - profile.afterburnerThrustN / profile.militaryThrustN) < 0.01, 'wrong PT augmentation');
    await session.capture('retail-flight');
    // Exercise the actual React dropdown and its full navigation/reset path.
    await session.evaluate(`const select=document.querySelector('#aircraft-selector'); select.value='f14'; select.dispatchEvent(new Event('change',{bubbles:true}));`);
    await session.poll(async () => {
      try { return (await session.evaluate('window.__flightDiagnostics?.().aircraftId === "f14"')) || undefined; }
      catch { return undefined; }
    }, 'dropdown navigation');
    const fallback = await ready();
    assert(fallback.modelTriangles === 0 && fallback.aircraftName.includes('not installed'), 'missing import not identified');
    await session.evaluate(`const select=document.querySelector('#aircraft-selector'); select.value=${JSON.stringify(id)}; select.dispatchEvent(new Event('change',{bubbles:true}));`);
    await session.poll(async () => {
      try { return (await session.evaluate(`window.__flightDiagnostics?.().aircraftId === ${JSON.stringify(id)}`)) || undefined; }
      catch { return undefined; }
    }, 'dropdown return');
    const restored = await ready();
    assert(restored.modelTriangles === d.modelTriangles, 'selection did not reload geometry');
    assert(session.errors.length === 0, 'renderer errors');
    await Bun.write(`${session.out}/report.json`, JSON.stringify({ initial: d, powered, fitted, flying, restored, errors: session.errors }, null, 2));
    console.log(`${id}: ${d.modelTriangles} triangles; audio, capabilities, PT mass/thrust/fuel, dropdown roundtrip and fallback pass`);
  } finally { await session.close(); }
}
