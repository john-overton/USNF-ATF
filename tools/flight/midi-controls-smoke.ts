/** Real WebAudio automation with an authored fixture, NOT a retail timbre test. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { openDesktop } from './desktop';
const out = 'extracted/midi-controls-smoke';
const track = {
  name: 'authored-controller-fixture', sourceSha256: 'a'.repeat(64), durationSeconds: 8,
  notes: [{timeSeconds:0,durationSeconds:0.8,note:60,velocity:100,channel:0,program:48}],
  channelEvents: [
    {timeSeconds:0,channel:0,kind:'controller',controller:64,value:127},
    {timeSeconds:0,channel:0,kind:'pitch-bend',value:0},
    {timeSeconds:0.5,channel:0,kind:'controller',controller:101,value:0},
    {timeSeconds:0.5,channel:0,kind:'controller',controller:100,value:0},
    {timeSeconds:0.5,channel:0,kind:'controller',controller:6,value:12},
    {timeSeconds:1.8,channel:0,kind:'controller',controller:64,value:0},
  ],
};
await Bun.write(path.join(out,'fixture.json'), JSON.stringify({version:1,source:'retail-xmi',
  tracks:Object.fromEntries(['cruise','combat','danger','victory','defeat'].map(s=>[s,track]))}));
const s=await openDesktop({binary:'shell/node_modules/electron/dist/electron',app:'shell',
  terrain:'extracted/terrain/ukraine',music:path.join(out,'fixture.json'),interactiveTest:true,out,
  query:{mode:'quick-fight',flightStart:'runway',opponents:'1',wind:'calm',clouds:'off'},
  initialization:`
    window.__midiAutomation=[];
    const Native=window.AudioContext;
    window.AudioContext=class extends Native {
      createOscillator(){
        const node=super.createOscillator(), log={frequency:[],start:null,stop:null};
        window.__midiAutomation.push(log);
        const set=node.frequency.setValueAtTime.bind(node.frequency), start=node.start.bind(node),stop=node.stop.bind(node);
        node.frequency.setValueAtTime=(value,at)=>{log.frequency.push({value,at});return set(value,at)};
        node.start=(at)=>{log.start=at;return start(at)};
        node.stop=(at)=>{log.stop=at;return stop(at)};
        return node;
      }
    };
  `});
try {
  await s.poll(async()=> (await s.evaluate('window.__flightDiagnostics?.()'))?.simSteps>20?true:undefined,'flight');
  await s.send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyT',key:'t'});
  await s.send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyT',key:'t'});
  const log=await s.poll(async()=>{
    const logs=await s.evaluate('window.__midiAutomation');
    return logs.find((v:any)=>v.frequency.some((f:any)=>Math.abs(f.value-130.81278265)<0.001));
  },'12-semitone live automation');
  assert.ok(log.frequency.some((f:any)=>Math.abs(f.value-233.08188076)<0.001),'default two-semitone bend');
  assert.ok(Math.abs(log.stop-log.start-1.805)<0.0001,'pedal extends .8s note to1.8s release');
  const d=await s.evaluate('window.__flightDiagnostics()');
  assert.equal(d.music.error,undefined);
  assert.equal(s.errors.length,0);
  await Bun.write(path.join(out,'report.json'),JSON.stringify({scope:'authored fixture, real WebAudio scheduling, not instrument fidelity',log,music:d.music},null,2));
  console.log('Live RPN bend/default range and sustain release scheduling pass.');
} finally {await s.close();}
