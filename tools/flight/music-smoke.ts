/** Live WebAudio music output, isolated from engine sound; no audio is uploaded. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { openDesktop } from './desktop';
const data = process.argv[2];
if (!data) throw new Error('Pass local app data directory');
const s=await openDesktop({binary:'shell/node_modules/electron/dist/electron',app:'shell',terrain:'extracted/terrain/ukraine',
  aircraftDirectory:path.join(data,'aircraft'), music:path.join(data,'audio/flight-music.json'),
  interactiveTest:true,out:'extracted/music-smoke',
  query:{mode:'quick-fight',flightStart:'runway',opponents:'1',wind:'calm',clouds:'off',time:'12'},
  initialization:`
    window.__audioProbes=[];
    const NativeAudioContext=window.AudioContext;
    window.AudioContext=class extends NativeAudioContext {
      constructor(...args){super(...args);this.probe=this.createAnalyser();this.probe.connect(this.destination);window.__audioProbes.push(this.probe);}
      createGain(){const gain=super.createGain(), connect=gain.connect.bind(gain);gain.connect=(target,...args)=>connect(target===this.destination?this.probe:target,...args);return gain;}
    };
  `});
const tap=async(code:string)=>{await s.send('Input.dispatchKeyEvent',{type:'keyDown',code,key:code==='Escape'?'Escape':code.slice(3)});await s.send('Input.dispatchKeyEvent',{type:'keyUp',code,key:code==='Escape'?'Escape':code.slice(3)});};
const read=()=>s.evaluate('window.__flightDiagnostics()');
const rms=()=>s.evaluate('Math.max(0,...window.__audioProbes.map(a=>{const v=new Float32Array(a.fftSize);a.getFloatTimeDomainData(v);return Math.sqrt(v.reduce((n,x)=>n+x*x,0)/v.length)}))');
const evidence:Record<string,unknown>={};
try {
  await s.poll(async()=> (await s.evaluate('window.__flightDiagnostics?.()'))?.simSteps>20?true:undefined,'flight');
  await tap('KeyT'); // Engine off, no guns or combat events during protected departure.
  await s.poll(async()=>{const d=await read();return d.music.played>0&&d.systems.engineSpool<0.01?true:undefined},'music alone');
  assert.equal((await read()).music.source,'retail-xmi');
  evidence.playing=await read();
  evidence.rms=await s.poll(async()=>{const r=await rms();return r>0.00001?r:undefined},'audible music signal');
  await tap('KeyN');
  await s.poll(async()=>!(await read()).music.enabled?true:undefined,'music off');
  await Bun.sleep(300);
  evidence.disabled=await read();
  await tap('KeyN');
  await s.poll(async()=>(await read()).music.enabled?true:undefined,'music on');
  await tap('Escape');
  await s.poll(async()=>await s.evaluate('!!document.querySelector("[data-menu-screen=paused]")')?true:undefined,'pause');
  const frozen=(await read()).music.playheadSeconds;await Bun.sleep(300);
  assert.equal((await read()).music.playheadSeconds,frozen);
  await tap('Escape');
  await s.poll(async()=>(await read()).music.playheadSeconds>frozen?true:undefined,'resume playhead');
  await tap('KeyM');
  await s.poll(async()=>(await read()).music.muted?true:undefined,'global mute');
  await tap('KeyM');await tap('KeyG');
  const defeat=await s.poll(async()=>{const d=await read();return d.music.situation==='defeat'?d:undefined},'ground crash music transition');
  evidence.defeat=defeat;
  assert.ok(['AIR10.XMI','AIR19.XMI'].includes(defeat.music.track));
  assert.equal(defeat.music.selection, 'recovered MUS VM; authored situation adapter/RNG');
  assert.equal(defeat.music.error, undefined);
  assert.equal(s.errors.length,0);
  await tap('KeyR');
  await s.poll(async()=>(await read()).music.situation==='cruise'?true:undefined,'reset to cruise');
  console.log('Retail music emits audio; N/M, pause/resume, defeat transition and reset pass.');
} finally {await Bun.write(path.join(s.out,'report.json'),JSON.stringify(evidence,null,2));await s.close();}
