/** Repeated product waypoint jumps, with warm/cold frame recovery and CPU profiles. */
import { openDesktop } from '../flight/desktop';
import path from 'node:path';
const args = process.argv.slice(2);
const option = (key: string, fallback: string) => args.includes(key) ? args[args.indexOf(key) + 1]! : fallback;
const out = option('--out', 'extracted/terrain-waypoint-performance');
const session = await openDesktop({
  binary: option('--binary', 'build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF'),
  terrain: option('--terrain', 'extracted/terrain/ukraine-polished'), out,
  ...(args.includes('--retail') ? {aircraft:'extracted/flight/f14.json',audio:'extracted/flight/audio/f14.json',flightProfile:'extracted/flight/f14-flight.json'} : {}),
  ...(args.includes('--texture-4x') ? {initialization: await Bun.file('tools/terrain/texture-allocation-probe.js').text()} : {}),
  query: args.includes('--flight') ? { mode: 'flight' } : {},
});
const stages: unknown[] = [];
try {
  await session.poll(async () => (await session.evaluate(`window.__terrainDiagnostics?.().status==='ready' && document.querySelectorAll('[data-teleport-id]').length===3`)) ? true : undefined, 'initial map');
  async function measure(label: string, seconds: number) {
    const profiling = args.includes('--profile-jump') && label === 'jump-1-2';
    if(profiling){await session.send('Profiler.enable'); await session.send('Profiler.start');}
    const result = await session.evaluate(`new Promise(resolve=>{
      const frames=[], start=performance.now(); let last=start;
      function frame(now){const d=window.__terrainDiagnostics();frames.push({ms:now-last,...d});last=now;
        if(now-start<${seconds * 1000})requestAnimationFrame(frame);else resolve(frames);}
      requestAnimationFrame(frame);
    })`);
    if(profiling)await Bun.write(path.join(out,'jump-cpu-profile.json'),JSON.stringify(await session.send('Profiler.stop')));
    await Bun.write(path.join(out, `${label}.json`), JSON.stringify(result));
    const times = result.map((d: any) => d.ms).sort((a: number,b: number)=>a-b);
    let tailMs=0,tailFrames=0;
    for(let i=result.length-1;i>=0 && tailMs<2000;i--){tailMs+=result[i].ms;tailFrames++;}
    const tailFps=1000*tailFrames/tailMs;
    const summary = {label, tailFps, fps:1000/(times.reduce((a: number,b: number)=>a+b,0)/times.length), p95:times[Math.floor(times.length*.95)],max:times.at(-1),last:result.at(-1)};
    stages.push(summary); console.log(JSON.stringify(summary));
    if(args.includes('--assert-recovery') && tailFps<50)throw new Error(`${label} did not recover: ${tailFps} fps`);
  }
  if (args.includes('--texture-4x')) {
    const allocation = await session.evaluate('window.__textureAllocationProbe');
    await Bun.write(path.join(out, 'texture-allocation.json'), JSON.stringify(allocation, null, 2));
    if (allocation?.allocations !== 1 || allocation?.uploads !== 1) throw new Error('Atlas experiment did not intercept exactly one allocation/upload');
  }
  await measure('initial', 5);
  for (const id of option('--ids', '2,3,1,2,3,1').split(',').map(Number)) {
    const label = `jump-${stages.length}-${id}`;
    await session.evaluate(`document.querySelector('[data-teleport-id="${id}"]').click()`);
    await measure(label, 10);
  }
  await session.send('Profiler.enable'); await session.send('Profiler.start');
  await measure('settled-profile', 5);
  const profile = await session.send('Profiler.stop');
  await Bun.write(path.join(out,'cpu-profile.json'),JSON.stringify(profile));
  if(args.includes('--720p')){await session.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});await measure('settled-720p',5);}
  await session.capture('final');
  if(session.errors.length)throw new Error(JSON.stringify(session.errors));
} finally {
  await Bun.write(path.join(out,'summary.json'), JSON.stringify(stages,null,2));
  await session.close();
}
