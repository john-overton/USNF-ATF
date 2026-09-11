/** Real paused-menu navigation, persisted mixer and live post-mix gain acceptance. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {openDesktop} from './desktop';
const data=process.argv[2];if(!data)throw Error('Pass appData path');
const s=await openDesktop({binary:'shell/node_modules/electron/dist/electron',app:'shell',terrain:'extracted/terrain/ukraine',
  aircraftDirectory:path.join(data,'aircraft'),music:path.join(data,'audio/flight-music.json'),bakedMusic:path.join(data,'audio'),
  audio:path.join(data,'audio/f14.json'),combatAudio:path.join(data,'audio/combat.json'),environmentAudio:path.join(data,'audio/environment.json'),
  interactiveTest:true,out:'extracted/escape-mixer-smoke',query:{mode:'quick-fight',flightStart:'runway',opponents:'1',wind:'calm',clouds:'off',time:'12'},
  initialization:`window.__mixerGains=[];const Native=window.AudioContext;window.AudioContext=class extends Native{createGain(){const n=super.createGain();window.__mixerGains.push(n);return n;}};`});
const tap=async()=>{for(const type of ['keyDown','keyUp'])await s.send('Input.dispatchKeyEvent',{type,code:'Escape',key:'Escape'});};
const click=async(text:string)=>{await s.evaluate(`Array.from(document.querySelectorAll('.escape-overlay button')).find(b=>b.textContent===${JSON.stringify(text)}).click()`);};
const read=()=>s.evaluate('window.__flightDiagnostics()');
const evidence:Record<string,unknown>={};
try {
  await s.poll(async()=> (await s.evaluate('window.__flightDiagnostics?.()'))?.simSteps>20?true:undefined,'flight');
  await s.send('Input.dispatchMouseEvent',{type:'mousePressed',x:800,y:700,button:'left',clickCount:1});
  await s.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:800,y:700,button:'left',clickCount:1});
  await s.poll(async()=>(await read()).music.rendering==='FluidSynth user-bank baked audio'?true:undefined,'baked music');
  await s.evaluate('document.querySelector("#terrain-canvas").dataset.retained="yes"');
  await tap();await s.poll(async()=>await s.evaluate('!!document.querySelector(".escape-bar")')?true:undefined,'escape bar');
  const before=await read();await Bun.sleep(250);assert.equal((await read()).simSteps,before.simSteps);
  await click('Settings');
  await s.poll(async()=>await s.evaluate('!!document.querySelector(".escape-settings")')?true:undefined,'settings portal');
  await s.evaluate(`(()=>{const e=document.querySelector('.escape-settings select[aria-label="Bullet mechanics"]');e.value='retail';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await s.poll(async()=>(await read()).gun.mode==='retail'?true:undefined,'live gun setting');
  assert.equal(await s.evaluate('document.querySelector("#terrain-canvas").dataset.retained'),'yes');
  assert.equal((await read()).simSteps,before.simSteps);
  await s.evaluate('document.querySelector(".escape-settings input[type=checkbox]").click()');
  await s.poll(async()=>await s.evaluate('!document.querySelector(".escape-settings input[type=checkbox]").checked')?true:undefined,'music off while paused');
  await s.evaluate('document.querySelector(".escape-settings input[type=checkbox]").click()');
  await s.poll(async()=>await s.evaluate('document.querySelector(".escape-settings input[type=checkbox]").checked')?true:undefined,'music on while paused');
  assert.equal((await read()).simSteps,before.simSteps);
  await s.capture('settings');
  await click('Volume mixer');
  await s.evaluate('window.__beforeMixer=window.__mixerGains.map(n=>n.gain.value)');
  await s.evaluate(`(()=>{const e=document.querySelector('[data-mixer-bus="music"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'0');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await s.poll(async()=>await s.evaluate('document.querySelector("[data-mixer-bus=music]").value==="0"')?true:undefined,'slider');
  await click('Mute all');await s.poll(async()=> (await read()).music.muted?true:undefined,'mute');await click('Unmute all');
  await s.capture('volume-mixer');
  await tap();await s.poll(async()=>(await read()).simSteps>before.simSteps?true:undefined,'resume');
  await Bun.sleep(300);
  // At least one actual post-mix AudioParam has reached silence after resuming.
  assert.ok(await s.evaluate('window.__mixerGains.some((n,i)=>window.__beforeMixer[i]===1 && n.gain.value<0.00001)'));
  await tap();await click('Mission brief');
  assert.ok(await s.evaluate('document.querySelector(".brief-paper").textContent.includes("Mission orders")'));
  await click('Quit game');await click('Cancel');assert.ok(await s.evaluate('!!document.querySelector("#terrain-canvas")'));
  await click('Main menu');await click('End flight and return to menu');
  await s.poll(async()=>await s.evaluate('!!document.querySelector("[data-menu-screen=main-menu]")')?true:undefined,'main menu');
  // Reload the same isolated profile, proving settings survived process UI lifetime.
  await s.send('Page.reload');await s.poll(async()=> (await s.evaluate('window.__flightDiagnostics?.()'))?.simSteps>20?true:undefined,'reload flight');
  await tap();await click('Volume mixer');
  await s.poll(async()=>await s.evaluate('document.querySelector("[data-mixer-bus=music]").value==="0"')?true:undefined,'persisted mixer');
  evidence.final=await read();assert.equal(s.errors.length,0);
  console.log('Escape settings retain flight; mixer controls, persistence, briefing, cancel, menu and resume pass.');
}finally{await Bun.write(path.join(s.out,'report.json'),JSON.stringify(evidence,null,2));await s.close();}
