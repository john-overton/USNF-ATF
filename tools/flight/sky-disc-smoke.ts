import assert from 'node:assert/strict';
import { openDesktop } from './desktop';
import { Environment } from '../../engine/src/sim/environment';

for (const body of ['sun', 'moon'] as const) {
  const time = body === 'sun' ? 10 : 22;
  let day = 170;
  if (body === 'moon') {
    for (day = 1; day <= 366; day++) {
      const env = new Environment({year:2026,dayOfYear:day,timeOfDayHours:time,latitudeDeg:40.7,longitudeDeg:-109.5});
      if (env.moon.phase > .95 && env.moon.elevationRad > .4) break;
    }
    assert(day <= 366);
  }
  const env = new Environment({year:2026,dayOfYear:day,timeOfDayHours:time,latitudeDeg:40.7,longitudeDeg:-109.5});
  const dir = env[body].direction;
  const out = `extracted/sky-disc-review/${body}`;
  const s = await openDesktop({binary:'shell/node_modules/electron/dist/electron',app:'shell',
    terrain:'extracted/terrain/salt-lake',out,
    query:{mode:'explorer',theater:'salt-lake',clouds:'off',time:String(time),date:String(day),
      x:'221030',z:'179304',y:'6000',yaw:String(Math.atan2(-dir.x,-dir.z)),pitch:String(Math.asin(dir.y))},
  });
  try {
    const d = await s.poll(async () => {
      const d = await s.evaluate('window.__terrainDiagnostics?.()');
      if (d?.error) throw Error(d.error);
      return d?.frames > 90 && d.status === 'ready' ? d : undefined;
    }, body + ' rendered');
    await s.capture(body);
    assert.equal(s.errors.length,0);
    await Bun.write(`${out}/report.json`,JSON.stringify(d,null,2));
  } finally { await s.close(); }
  console.log(body + ' disc rendered without errors');
}
