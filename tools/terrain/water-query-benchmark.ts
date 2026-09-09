/** Local public-theater parity/performance probe; no generated fixtures are committed. */
import { parseManifest } from '../../engine/src/terrain/manifest';
import { WaterBodyIndex } from '../../engine/src/flight/WaterIndex';
import { containsWater } from '../../engine/src/flight/GroundSampler';
const m = parseManifest(await Bun.file('extracted/terrain/ukraine-polished/manifest.json').text());
const started = performance.now();
const index = m.waterBodies.map((body) => new WaterBodyIndex(body));
const buildMs = performance.now() - started;
const points = [[500483,72926],[275732,309799],[289000,392000]];
const report = [];
for(const [x,z] of points){
 const candidates=index.filter(({exterior:b})=>Math.floor(b.minX/16384)<=Math.floor(x!/16384)&&Math.floor(b.maxX/16384)>=Math.floor(x!/16384)&&Math.floor(b.minZ/16384)<=Math.floor(z!/16384)&&Math.floor(b.maxZ/16384)>=Math.floor(z!/16384));
 const queries=Array.from({length:200},(_,i)=>[x!+(i%20)*10,z!+Math.floor(i/20)*10]);
 let begin=performance.now();
 const reference=queries.map(([px,pz])=>candidates.find((c)=>containsWater(c.body,px!,pz!))?.body.id);
 const referenceMs=performance.now()-begin;
 begin=performance.now();
 const indexed=queries.map(([px,pz])=>candidates.find((c)=>c.contains(px!,pz!))?.body.id);
 const indexedMs=performance.now()-begin;
 if(JSON.stringify(reference)!==JSON.stringify(indexed))throw new Error('Water classification changed');
 report.push({x,z,candidates:candidates.length,queries:queries.length,referenceMs,indexedMs});
}
console.log(JSON.stringify({buildMs,report},null,2));
