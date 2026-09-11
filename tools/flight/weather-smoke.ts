/** Terrain-relative cloud/fog acceptance on locally supplied Salt Lake data. */
import assert from 'node:assert/strict';
import { openDesktop } from './desktop';
const s = await openDesktop({
  binary: 'shell/node_modules/electron/dist/electron', app: 'shell',
  terrain: 'extracted/terrain/salt-lake', out: 'extracted/cloud-agl/terrain',
  query: { mode: 'explorer', weather: 'broken', clouds: 'half', fog: 'ground',
    wind: 'calm', time: '12', date: '170', x: '642227', z: '178817', y: '2500' },
});
try {
  const base = await s.evaluate('location.href');
  const reports = [];
  const navigate = async (values: Record<string, string>) => {
    const url = new URL(base);
    for (const [k,v] of Object.entries(values)) url.searchParams.set(k,v);
    await s.send('Page.navigate', {url:url.href});
    return s.poll(async () => {
      const d = await s.evaluate('window.__terrainDiagnostics?.()');
      if(d?.error || d?.environment?.weatherTerrainError) throw Error(d.error || d.environment.weatherTerrainError);
      return d?.frames > 120 && d.status === 'ready' && d.environment.weatherTerrainReady && d.environment.fogTerrainReady ? d : undefined;
    }, 'weather terrain ready');
  };
  for(const site of [{name:'valley',x:'642227',z:'178817'},{name:'mountain',x:'620000',z:'179000'}]){
    const d = await navigate({x:site.x,z:site.z,y:'5000'});
    const ground = d.environment.fogGroundM;
    assert(Number.isFinite(ground));
    assert(Number.isFinite(d.environment.weatherGroundM));
    for(const aglFeet of [100,600]){
      const values = {x:site.x,z:site.z,y:String(ground + aglFeet*.3048),pitch:'0.02',yaw:'0',clouds:'off'};
      const diagnostic = await navigate(values);
      await s.capture(`${site.name}-fog-${aglFeet}ft`);
      reports.push({site:site.name,aglFeet,ground,diagnostic});
    }
    const cloud = await navigate({x:site.x,z:site.z,y:String(d.environment.weatherGroundM + 1900),pitch:'0.02',yaw:'0'});
    await s.capture(`${site.name}-cloud-1900m-agl`);
    reports.push({site:site.name,aglM:1900,diagnostic:cloud});
  }
  assert.equal(s.errors.length,0);
  await Bun.write(`${s.out}/report.json`,JSON.stringify({reports,errors:s.errors},null,2));
  console.log(reports.map(r=>({site:r.site,ground:r.ground,aglFeet:r.aglFeet,aglM:r.aglM})));
} finally { await s.close(); }
