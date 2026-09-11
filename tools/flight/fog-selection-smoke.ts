import assert from 'node:assert/strict';
import {openDesktop} from './desktop';
const s=await openDesktop({binary:'shell/node_modules/electron/dist/electron',app:'shell',terrain:'extracted/terrain/synthetic',out:'extracted/cloud-review/fog-selection',query:{mode:'explorer',weather:'broken',fog:'ground',clouds:'off',x:'4000',z:'4000',y:'100'}});
try{
 await s.poll(async()=>await s.evaluate('window.__terrainDiagnostics?.()?.frames > 90')?true:undefined,'ready');
 assert.equal(await s.evaluate('window.__terrainDiagnostics().environment.groundFog'),false,'legacy fog flag must not enable fog outside Fog weather');
 for(const weather of ['fog','clear','scattered','broken','overcast','storm','fog']){
  await s.evaluate('(()=>{const el=document.querySelector("#environment-weather") || document.querySelector("[aria-label=Weather]");el.value='+JSON.stringify(weather)+';el.dispatchEvent(new Event("change",{bubbles:true}));})()');
  const d=await s.poll(async()=>{const d=await s.evaluate('window.__terrainDiagnostics()');return d.environment.weather===weather?d:undefined;},'weather '+weather);
  assert.equal(d.environment.groundFog,weather==='fog');
 }
 await s.capture('fog-selected');
 await Bun.write(s.out+'/report.json',JSON.stringify({errors:s.errors,diagnostic:await s.evaluate('window.__terrainDiagnostics()')},null,2));
 assert.equal(s.errors.length,0);console.log('Fog activates only for Fog weather; all other weather selections clear it.');
}finally{await s.close();}
