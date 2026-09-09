/** Observational full-flaps/afterburner runs with no stick input in all three backends. */
import path from 'node:path';
import { openDesktop } from './desktop';
const args=process.argv.slice(2);
function option(name:string,fallback?:string):string {
  const i=args.indexOf(name),v=i<0?fallback:args[i+1];
  if(!v)throw new Error(`Required ${name}`);return v;
}
const out=option('--out','extracted/flaps-neutral');
const results:Record<string,any>={};
for(const mode of ['assisted','retail-envelope','recovered-envelope']) {
  const session=await openDesktop({binary:option('--binary'),terrain:'extracted/terrain/ukraine',
    aircraft:'extracted/flight/f14.json',audio:'extracted/flight/audio/f14.json',
    flightProfile:'extracted/flight/f14-flight.json',out:path.join(out,mode),
    query:{mode:'flight',flightModel:mode},interactiveTest:true});
  let failure:string|undefined;
  const evidence:Record<string,any>={};
  try {
    await session.poll(async()=>{const d=await session.evaluate('window.__flightDiagnostics?.()');return d?.status==='grounded'&&d.simSteps>10?d:undefined;},'parked aircraft');
    await session.evaluate(`document.getElementById('terrain-canvas').focus();
      const label=Array.from(document.body.children).find(e=>e.textContent?.startsWith('AUTOMATED TEST —'));
      if(label){label.style.top='auto';label.style.bottom='12px';}`);
    for(const code of ['KeyF','Digit6']) for(const type of ['keyDown','keyUp'])
      await session.send('Input.dispatchKeyEvent',{type,code,key:code==='KeyF'?'f':'6'});
    evidence.initial=await session.poll(async()=>{const d=await session.evaluate('window.__flightDiagnostics()');return d.systems.flapFraction===1&&d.throttle===1&&d.afterburner?d:undefined;},'full flaps and afterburner');
    evidence.samples=await session.evaluate(`new Promise(resolve=>{
      const samples=[];const start=performance.now();let next=0;
      function frame(now){
        const d=window.__flightDiagnostics();const q=d.attitude,v=d.velocity;
        if(now-start>=next || d.status==='crashed'){
          next=now-start+100;
          samples.push({elapsed:(now-start)/1000,simTime:d.simTime,status:d.status,model:d.flightModelId,
            position:d.position,speed:d.airspeed,agl:d.altitudeAGL,
            pitchDegrees:Math.asin(Math.max(-1,Math.min(1,2*(q.w*q.x-q.y*q.z))))*180/Math.PI,
            gammaDegrees:Math.atan2(v.y,Math.hypot(v.x,v.z))*180/Math.PI,
            alphaDegrees:d.alphaRad*180/Math.PI,load:d.loadFactor,
            throttle:d.throttle,afterburner:d.afterburner,flaps:d.systems.flapFraction,controls:d.controls});
        }
        if(now-start>=60000 || d.status==='crashed')resolve(samples);else requestAnimationFrame(frame);
      }requestAnimationFrame(frame);
    })`);
    evidence.final=await session.evaluate('window.__flightDiagnostics()');
    evidence.firstLiftoff=evidence.samples.find((s:any)=>s.agl>0.1&&s.status==='airborne')??null;
    evidence.noseDownClimb=evidence.samples.filter((s:any)=>s.agl>2&&s.gammaDegrees>0.2&&s.pitchDegrees< -1);
    for(const s of evidence.samples) {
      if(s.controls.pitch!==0||s.controls.roll!==0||s.controls.yaw!==0||s.throttle!==1||!s.afterburner||s.flaps!==1)
        throw new Error('Full-flaps afterburner neutral-input condition changed');
      if(![s.pitchDegrees,s.gammaDegrees,s.alphaDegrees,s.speed].every(Number.isFinite))throw new Error('Nonfinite dynamics');
    }
    if(session.errors.length)throw new Error('Renderer errors');
    await session.capture('final');
  }catch(error){failure=String(error);}
  finally {
    results[mode]={evidence,failure,runtimeErrors:session.errors};
    await Bun.write(path.join(out,'report.json'),JSON.stringify({date:new Date().toISOString(),buildSourceCommit:option('--build-commit'),
      scope:'Observation: full flaps and afterburner, no pitch/roll/yaw; 60 wall seconds or first crash. Liftoff is recorded, not required without pilot rotation.',results},null,2));
    await session.close();
  }
  if(failure)throw new Error(failure);
  console.log(JSON.stringify({mode,condition:'verified',finalStatus:results[mode].evidence.final.status,firstLiftoff:results[mode].evidence.firstLiftoff}));
}
