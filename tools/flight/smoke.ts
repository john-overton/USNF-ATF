/** Real packaged flight smoke. Controls enter through a virtual standard gamepad. */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openDesktop } from './desktop';

const args = process.argv.slice(2);
function option(name: string, fallback?: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? fallback : args[index + 1];
  if (!value) throw new Error(`Required: ${name}`);
  return value;
}
const scenario = option('--scenario', 'ground');
if (!['ground', 'takeoff', 'approach'].includes(scenario)) throw new Error('Unknown scenario');
const seconds = Number(
  option('--seconds', scenario === 'ground' ? '15' : scenario === 'approach' ? '60' : '40'),
);
if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60)
  throw new Error('seconds must be1..60');
const initialization = `
  window.__flightTestPad = {id:'Acceptance standard gamepad',index:0,connected:true,mapping:'standard',timestamp:0,
    axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
  Object.defineProperty(navigator,'getGamepads',{value:()=>[window.__flightTestPad]});
`;
const session = await openDesktop({
  binary: option('--binary'),
  ...(args.includes('--app') ? { app: option('--app') } : {}),
  terrain: option('--terrain', 'extracted/terrain/ukraine'),
  ...(args.includes('--aircraft') ? { aircraft: option('--aircraft') } : {}),
  out: option('--out', `extracted/flight-smoke-${scenario}`),
  query: { mode: 'flight', flightStart: scenario === 'approach' ? 'approach' : 'runway' },
  initialization,
});
try {
  const initial = await session.poll(async () => {
    const state = await session.evaluate(
      'window.__terrainDiagnostics?.().status === "ready" ? window.__flightDiagnostics?.() : undefined',
    );
    if (state?.error || state?.status === 'error') throw new Error(state.error || state.reason);
    return state?.state && state.status !== 'waiting-terrain' && state.simSteps > 10
      ? state
      : undefined;
  }, 'flight initialization');
  await session.capture('initial');
  await Bun.sleep(1000);
  const samples = (await session.evaluate(`new Promise((resolve,reject)=>{
    const samples=[]; const start=performance.now();let previous=start;
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const stick=v=>Math.abs(v)<1e-6?0:Math.sign(v)*(.12+.88*Math.min(1,Math.abs(v)));
    function frame(now) { try {
      const d=window.__flightDiagnostics();
      const terrain=window.__terrainDiagnostics();
      if(!d)throw new Error('Flight diagnostics disappeared');
      const state=d.state,q=state.attitude;
      const pitch=Math.asin(clamp(2*(q.w*q.x-q.y*q.z),-1,1));
      const roll=Math.atan2(2*(q.x*q.y+q.w*q.z),1-2*(q.x*q.x+q.z*q.z));
      let desiredThrottle=0,pitchControl=0,rollControl=0,brake=true;
      if('${scenario}'!=='ground') {
        brake=false;
        if('${scenario}'==='takeoff' && d.takeoffs===0 && (d.altitudeAGL??0)<2) {
          desiredThrottle=1;pitchControl=d.airspeed>70?.12:0;
        } else if('${scenario}'==='approach' && state.status==='grounded') {
          brake=true;
        } else {
          const targetAltitude=d.runway.elevation+('${scenario}'==='approach'?-20:300);
          const targetSpeed='${scenario}'==='approach'?100:150;
          const targetPitch=.04+clamp((targetAltitude-state.position.y)*.001-state.velocity.y*.012,-.15,.15);
          pitchControl=clamp((targetPitch-pitch)*3-state.angularVelocity.x*.8,-1,1);
          rollControl=clamp(2*roll,-1,1);
          desiredThrottle=clamp(.2+(targetSpeed-d.airspeed)*.03,0,1);
        }
      }
      const pad=window.__flightTestPad;
      pad.timestamp=now;pad.axes[0]=stick(rollControl);pad.axes[1]=stick(pitchControl);
      const throttleDelta=clamp((desiredThrottle-d.throttle)/Math.max(.001,.4*(now-previous)/1000),-1,1);
      for(const i of [6,7]){const value=i===7?Math.max(0,throttleDelta):Math.max(0,-throttleDelta);pad.buttons[i]={value,pressed:value>.5,touched:value>0};}
      pad.buttons[1]={value:brake?1:0,pressed:brake,touched:brake};
      samples.push({elapsedMs:now-start,rafFrameMs:now-previous,flight:d,terrain});previous=now;
      if(now-start<${seconds * 1000}) requestAnimationFrame(frame); else resolve(samples);
    } catch(error){reject(error);} } requestAnimationFrame(frame);
  })`)) as any[];
  const final = await session.evaluate('window.__flightDiagnostics()');
  await session.capture('final');
  const intervals = samples.map((sample) => sample.rafFrameMs).sort((a, b) => a - b);
  const meanFrameMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const report = {
    date: new Date().toISOString(),
    binary: path.resolve(option('--binary')),
    buildSourceCommit: option('--build-commit', 'unrecorded'),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workingTreeStatus: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(),
    machine: { platform: process.platform, architecture: process.arch, bun: Bun.version },
    scenario,
    seconds,
    initial,
    final,
    meanFrameMs,
    meanFps: 1000 / meanFrameMs,
    p95FrameMs: intervals[Math.floor(intervals.length * 0.95)],
    runtimeErrors: session.errors,
    samples,
    note: 'Virtual gamepad exercises the product input adapter; this does not verify physical gamepad hardware.',
  };
  await Bun.write(path.join(session.out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  if (
    session.errors.length ||
    samples.some(
      (sample) =>
        sample.flight?.error ||
        sample.flight?.status === 'error' ||
        sample.flight?.state?.status === 'crashed' ||
        sample.terrain?.error ||
        sample.terrain?.width !== 2560 ||
        sample.terrain?.height !== 1440,
    )
  )
    throw new Error(
      'Flight renderer acceptance failed; inspect report.json and runtime-errors.json',
    );
  if (!(final.state.timeSeconds > initial.state.timeSeconds))
    throw new Error('Flight simulation did not advance');
  if (
    scenario === 'takeoff' &&
    !(final.takeoffs > 0 && final.altitudeAGL > 20 && final.airspeed > 70)
  )
    throw new Error('Aircraft did not take off and remain airborne');
  if (
    scenario === 'approach' &&
    !(final.landings > 0 && final.state.status === 'grounded' && final.airspeed < 5)
  )
    throw new Error('Aircraft did not land and brake to a stop');
  console.log(
    JSON.stringify({
      scenario,
      meanFps: 1000 / meanFrameMs,
      p95FrameMs: report.p95FrameMs,
      status: final.state.status,
      report: path.join(session.out, 'report.json'),
    }),
  );
} finally {
  await session.close();
}
