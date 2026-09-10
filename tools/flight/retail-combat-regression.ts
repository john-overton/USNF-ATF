/** Local imported-aircraft regression. No retail data is embedded in source. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { openDesktop } from './desktop';
import { parseRetailFlightProfile } from '../../engine/src/data/retail-flight';
import { createFlightState, stepFlight, NEUTRAL_CONTROLS, PLACEHOLDER_AIRCRAFT } from '../../engine/src/sim/flight';
import { applyDamage, createDamageState, damageEffects } from '../../engine/src/sim/combat/damage';

const data = process.argv[2];
if (!data) throw new Error('Usage: bun tools/flight/retail-combat-regression.ts <local app data directory>');
const ground = () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, kind: 'land' as const });
for (const id of ['f14', 'a4e', 'x31']) {
  const profile = parseRetailFlightProfile(await Bun.file(path.join(data, 'aircraft', `${id}-flight.json`)).json());
  const def = { ...PLACEHOLDER_AIRCRAFT, retail: profile, massKg: profile.emptyMassKg + profile.fuelCapacityKg, wingAreaM2: 52.5 };
  for (const wind of [{ x: 15, y: 0, z: 0 }, { x: 0, y: 0, z: 15 }, { x: 0, y: 0, z: -15 }]) {
    for (const brake of [false, true]) {
      let state = createFlightState({ position: { x: 0, y: def.gearHeightM, z: 0 }, airspeed: 0 });
      state.status = 'grounded';
      for (let tick = 0; tick < 7200; tick++)
        state = stepFlight(state, { ...NEUTRAL_CONTROLS, throttle: 0, brake, gearDown: true }, { sampleGround: ground, wind }, def).state;
      const drift = Math.hypot(state.position.x, state.position.z);
      // Unbraked wheels may roll along their heading; lateral grip must hold.
      if (brake || wind.x !== 0) assert.ok(drift < 0.001, `${id}: parked drift ${drift}`);
      assert.equal(state.status, 'grounded');
      console.log(JSON.stringify({ id, brake, wind, drift }));
    }
  }
  // Default PT model on every type; opt-in recovered envelope also checked on F14.
  for (const nativeEnvelope of id === 'f14' ? [false, true] : [false]) {
    const damage = damageEffects(applyDamage(createDamageState(140), 25));
    let state = createFlightState({ position: { x: 0, y: 3000, z: 0 }, airspeed: 230 });
    for (let tick = 0; tick < 120; tick++) {
      state = stepFlight(state, { ...NEUTRAL_CONTROLS, throttle: 0.7 }, { sampleGround: ground, damage }, { ...def, nativeEnvelope }).state;
      assert.ok(Number.isFinite(state.position.z));
    }
  }
}
const session = await openDesktop({
  binary: 'shell/node_modules/electron/dist/electron', app: 'shell',
  terrain: 'extracted/terrain/ukraine', aircraftDirectory: path.join(data, 'aircraft'),
  audio: path.join(data, 'audio/f14.json'), cockpit: path.join(data, 'cockpits/f14.json'),
  out: 'extracted/retail-combat-regression',
  query: { mode: 'quick-fight', flightStart: 'airborne', aircraft: 'f14', opponentAircraft: 'a4e', opponents: '1', skill: '3', seed: '7', wind: 'calm', clouds: 'off', time: '12' },
});
const evidence: Record<string, unknown> = {};
const tap = (code: string) => session.evaluate(`for (const type of ['keydown','keyup']) window.dispatchEvent(new KeyboardEvent(type,{code:${JSON.stringify(code)},key:${JSON.stringify(code)},bubbles:true}));`);
try {
  await session.poll(async () => (await session.evaluate('window.__flightDiagnostics?.()'))?.simSteps > 10 ? true : undefined, 'airborne');
  await tap('KeyA'); await tap('Digit3');
  const hit = await session.poll(async () => {
    const d = await session.evaluate('window.__flightDiagnostics()');
    return d.combat.damagePercent > 0 ? d : undefined;
  }, 'imported A4 hits imported F14', 120000);
  evidence.hit = hit;
  const continued = await session.poll(async () => {
    const d = await session.evaluate('window.__flightDiagnostics()');
    return d.simSteps > hit.simSteps + 600 ? d : undefined;
  }, 'five seconds of simulation after damage');
  evidence.continued = continued;
  assert.equal(session.errors.length, 0);
  await tap('Escape');
  await session.poll(async () => await session.evaluate('!!document.querySelector("[data-menu-screen=paused]")') ? true : undefined, 'responsive pause');
  await session.capture('after-damage');
  console.log('Imported F14/A4 damage continues without freeze; pause remains responsive.');
} finally {
  await Bun.write(path.join(session.out, 'report.json'), JSON.stringify(evidence, null, 2));
  await session.close();
}
