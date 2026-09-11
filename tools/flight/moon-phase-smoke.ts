import assert from 'node:assert/strict';
import { openDesktop } from './desktop';
import { Environment } from '../../engine/src/sim/environment';

for (const phase of ['waxing', 'waning', 'full']) {
  let chosen: {env: Environment; day: number; time: number} | undefined;
  for (let day = 1; day <= 366 && !chosen; day++) for (let time = 0; time < 24; time++) {
    const env = new Environment({year:2026,dayOfYear:day,timeOfDayHours:time,latitudeDeg:40.7,longitudeDeg:-109.5});
    const moon = env.moon;
    const matches = phase === 'full' ? moon.phase > .98 : moon.phase > .18 && moon.phase < .3 && moon.waxing === (phase === 'waxing');
    if (matches && moon.elevationRad > .2 && env.sun.elevationRad < -.15) {chosen={env,day,time};break;}
  }
  assert(chosen);
  const {env,day,time} = chosen;
  const dir=env.moon.direction;
  const out=`extracted/moon-phase-review/${phase}`;
  const s=await openDesktop({binary:'shell/node_modules/electron/dist/electron',app:'shell',terrain:'extracted/terrain/salt-lake',out,
    query:{mode:'explorer',theater:'salt-lake',clouds:'off',time:String(time),date:String(day),
      x:'221030',z:'179304',y:'6000',yaw:String(Math.atan2(-dir.x,-dir.z)),pitch:String(Math.asin(dir.y))}});
  try {
    const d=await s.poll(async()=>{const d=await s.evaluate('window.__terrainDiagnostics?.()');if(d?.error)throw Error(d.error);return d?.frames>120 && d.status==='ready'?d:undefined;},phase);
    await s.capture(phase);
    assert.equal(s.errors.length,0);
    await Bun.write(`${out}/report.json`,JSON.stringify(d,null,2));
  } finally {await s.close();}
  console.log(phase+' moon rendered');
}
