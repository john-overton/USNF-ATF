import { GroundSampler } from '../../engine/src/flight/GroundSampler';
import { validatePractice } from '../../engine/src/flight/practice';
import { parseManifest } from '../../engine/src/terrain/manifest';
import type { Platform } from '../../engine/src/platform/Platform';
const folder = '/home/john/.config/USNF-ATF/data/terrains/salt-lake/';
const m = parseManifest(await Bun.file(folder+'manifest.json').text());
const platform = {fs: {readBytes: (_: string, path: string) => Bun.file(folder+path).bytes()}} as unknown as Platform;
const ground = new GroundSampler(m, platform, 'appData', '');
for (const dx of [0, -500, -1000, -1500, -2000, 500, 1000]) {
  let min=Infinity, max=-Infinity, water=0;
  for (let dz=-1825; dz<=1825; dz+=50) for (let x=-50; x<=50; x+=25) {
    await ground.ensure(222530+dx+x,179304+dz);
    const s=ground.sample(222530+dx+x,179304+dz)!;
    min=Math.min(min,s.height);max=Math.max(max,s.height);water+=Number(s.kind==='water');
  }
  const strip = {x:222530+dx,z:179304,width:100,length:3650,elevation:Math.ceil(max)};
  let valid=false;
  try {await validatePractice(ground,strip);valid=true;} catch {}
  console.log({dx,min,max,water,valid,strip});
}
