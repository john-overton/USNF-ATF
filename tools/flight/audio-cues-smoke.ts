/** Real gameplay inputs and fuel consumption, no injected simulation events. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { openDesktop } from './desktop';
const data = process.argv[2];
if (!data) throw new Error('Pass local app data directory');
const session = await openDesktop({ binary: 'shell/node_modules/electron/dist/electron', app: 'shell',
  terrain: 'extracted/terrain/ukraine', aircraftDirectory: path.join(data, 'aircraft'),
  audio: path.join(data,'audio/f14.json'), combatAudio: path.join(data,'audio/combat.json'),
  environmentAudio: path.join(data,'audio/environment.json'), music: path.join(data,'audio/flight-music.json'),
  interactiveTest: true, out: 'extracted/audio-cues-smoke',
  query: { mode: 'flight', flightStart: 'airborne', aircraft: 'f14', flightFuel: '0.01', wind: 'calm', clouds: 'off' },
  initialization: `window.__audioProbes=[]; const Native=window.AudioContext; window.AudioContext=class extends Native {
    constructor(...args){super(...args);this.probe=this.createAnalyser();this.probe.connect(this.destination);window.__audioProbes.push(this.probe);}
    createGain(){const gain=super.createGain(),connect=gain.connect.bind(gain);gain.connect=(target,...args)=>connect(target===this.destination?this.probe:target,...args);return gain;}
  };`,
});
const read = () => session.evaluate('window.__flightDiagnostics()');
const tap = async (code: string) => {
  for (const type of ['keyDown', 'keyUp']) await session.send('Input.dispatchKeyEvent', { type, code, key: code === 'Escape' ? 'Escape' : code.slice(3) });
};
const evidence: Record<string, unknown> = {};
try {
  await session.poll(async () => (await session.evaluate('window.__flightDiagnostics?.()'))?.simSteps > 20 ? true : undefined, 'flight');
  await tap('KeyN');
  for (const code of ['KeyG', 'KeyF', 'KeyH']) { await tap(code); await Bun.sleep(150); }
  await session.poll(async () => { const d = await read(); return (d.combatAudio.cueCounts.gearDown || d.combatAudio.cueCounts.gearUp) && d.combatAudio.cueCounts.flapsDown ? true : undefined; }, 'retail actuator cues');
  assert.equal((await read()).audio.environmentSource, 'retail-pcm');
  evidence.controls = await read();
  evidence.rms = await session.poll(async () => {
    const rms = await session.evaluate('Math.max(0,...window.__audioProbes.map(a=>{const v=new Float32Array(a.fftSize);a.getFloatTimeDomainData(v);return Math.sqrt(v.reduce((s,n)=>s+n*n,0)/v.length)}))');
    return rms > 0.00001 ? rms : undefined;
  }, 'real audio graph output');
  await tap('Digit6');
  evidence.fuelEmpty = await session.poll(async () => { const d = await read(); return d.combatAudio.cueCounts.outOfFuel === 1 ? d : undefined; }, 'fuel exhaustion speech', 60000);
  await tap('Escape');
  await session.poll(async () => (await read()).combatAudio.paused ? true : undefined, 'pause');
  const paused = await read(); await Bun.sleep(200);
  assert.equal((await read()).simSteps, paused.simSteps);
  assert.equal((await read()).combatAudio.voices, 0);
  await tap('Escape'); await tap('KeyM');
  await tap('KeyF'); await Bun.sleep(150);
  const mutedCount = (await read()).combatAudio.played;
  await tap('KeyM'); await Bun.sleep(150);
  assert.equal((await read()).combatAudio.played, mutedCount);
  await tap('KeyR');
  await session.poll(async () => Object.keys((await read()).combatAudio.cueCounts).length === 0 ? true : undefined, 'reset clears cue state');
  assert.equal(session.errors.length, 0);
  assert.equal((evidence.fuelEmpty as any).combatAudio.error, undefined);
  console.log('Retail actuator/environment/fuel speech, PCM output, pause/mute/reset pass.');
} finally {
  await Bun.write(path.join(session.out, 'report.json'), JSON.stringify(evidence, null, 2));
  await session.close();
}
