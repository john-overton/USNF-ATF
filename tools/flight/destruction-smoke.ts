/** Real desktop quick-mission, imported breakup and ground-impact acceptance. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { openDesktop } from './desktop';
const data = process.argv[2];
if (!data) throw new Error('Pass local app data directory');
const base = { interactiveTest: true, binary: 'shell/node_modules/electron/dist/electron', app: 'shell', terrain: 'extracted/terrain/ukraine',
  combatAudio: path.join(data, 'audio/combat.json'),
  environmentAudio: path.join(data, 'audio/environment.json'),
  aircraftDirectory: path.join(data, 'aircraft'), music:path.join(data,'audio/flight-music.json'), audio: path.join(data,'audio/f14.json'), cockpit:path.join(data,'cockpits/f14.json'), menu:path.join(data,'menu') };
for (const scenario of ['menu','combat','ground'] as const) {
  const s = await openDesktop({ ...base, out:`extracted/destruction-${scenario}`,
    ...(scenario==='menu' ? { bareLaunch:true } : { query:{mode:'quick-fight',flightStart:scenario==='ground'?'runway':'airborne',aircraft:'f14',opponentAircraft:'a4e',opponents:'1',skill:'3',seed:'7',wind:'calm',clouds:'off',time:'12'} }) });
  const tap = async(code:string) => { await s.send('Input.dispatchKeyEvent',{type:'keyDown',code,key:code==='Escape'?'Escape':code.slice(3)});await s.send('Input.dispatchKeyEvent',{type:'keyUp',code,key:code==='Escape'?'Escape':code.slice(3)}); };
  try {
    if (scenario==='menu') {
      await s.poll(async()=>await s.evaluate('!!document.querySelector("[data-menu-command=quick-mission]")')?true:undefined,'main menu');
      await s.evaluate('document.querySelector("[data-menu-command=quick-mission]").click()');
      await s.poll(async()=>await s.evaluate('!!document.querySelector("[data-quick-fight=ready]")')?true:undefined,'quick setup');
      await s.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await Bun.sleep(500);
      await s.capture('setup');
      continue;
    }
    await s.poll(async()=> (await s.evaluate('window.__flightDiagnostics?.()'))?.simSteps>20 ? true:undefined,'flight');
    // A real CDP key event unlocks original synthesized sound, unlike synthetic DOM events.
    if (scenario==='combat') { await tap('KeyA'); await tap('Digit3'); }
    else {
      const before = await s.evaluate('window.__flightDiagnostics()');
      assert.equal(before.combat.departureProtected,true);
      assert.ok(before.entities.every((e:any)=>e.roundsFired===0));
      await tap('KeyG'); // Retract gear at rest to exercise the actual unsafe ground-impact path.
    }
    const destroyed = await s.poll(async()=>{
      const d=await s.evaluate('window.__flightDiagnostics()');
      return d.combat.destroyed && d.destruction.fragments>0 ? d:undefined;
    },'destruction and aircraft fragments',120000);
    assert.equal(destroyed.combat.events.find((e:any)=>e.type==='destroyed').cause,scenario==='ground'?'ground':'gun');
    assert.ok(destroyed.combatAudio.played>0);
    assert.equal(destroyed.combatAudio.source, 'retail-pcm');
    if (scenario === 'combat') assert.ok(destroyed.combatAudio.cueCounts.playerHit > 0);
    assert.equal(destroyed.combatAudio.error, undefined);
    assert.equal(destroyed.music.error, undefined);
    assert.equal(destroyed.cameraMode,'world-up');
    assert.equal(destroyed.music.situation,'defeat');
    assert.equal(destroyed.music.source,'retail-xmi');
    await s.capture('explosion');
    await s.poll(async()=>{const d=await s.evaluate('window.__flightDiagnostics()');return d.simSteps>destroyed.simSteps+90?true:undefined},'debris motion');
    await s.capture('breakup');
    await tap('Escape');
    await s.poll(async()=>await s.evaluate('!!document.querySelector("[data-menu-screen=paused]")')?true:undefined,'pause');
    const frozen=await s.evaluate('window.__flightDiagnostics()');await Bun.sleep(200);
    assert.equal((await s.evaluate('window.__flightDiagnostics()')).simSteps,frozen.simSteps);
    await tap('Escape');await tap('KeyR');
    await s.poll(async()=>{const d=await s.evaluate('window.__flightDiagnostics()');return !d.combat.destroyed&&d.destruction.fragments===0?true:undefined},'reset clears debris');
    await Bun.write(path.join(s.out,'report.json'),JSON.stringify(destroyed,null,2));
    assert.equal(s.errors.length,0);
    console.log(`${scenario}: breakup, sound, camera, pause and reset pass`);
  } finally {await s.close();}
}
