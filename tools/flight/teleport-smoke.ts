/** Product map/teleport acceptance across explorer and all three flight backends. */
import path from 'node:path';
import { openDesktop } from './desktop';
const args = process.argv.slice(2);
function option(name: string, fallback?: string): string {
  const index = args.indexOf(name), value = index < 0 ? fallback : args[index + 1];
  if (!value) throw new Error(`Required ${name}`);
  return value;
}
function assert(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
const out = option('--out', 'extracted/waypoint-teleport');
const results: Record<string, any> = {};
for (const mode of ['explorer', 'assisted', 'retail-envelope', 'recovered-envelope']) {
  const flight = mode !== 'explorer';
  const session = await openDesktop({
    binary: option('--binary'), terrain: 'extracted/terrain/ukraine',
    aircraft: 'extracted/flight/f14.json', audio: 'extracted/flight/audio/f14.json',
    flightProfile: 'extracted/flight/f14-flight.json', out: path.join(out, mode),
    query: flight ? { mode: 'flight', flightModel: mode, flightFuel: '0.4' } : {},
    interactiveTest: true,
  });
  const evidence: Record<string, any> = {};
  let failure: string | undefined;
  try {
    const read = () => session.evaluate(flight ? 'window.__flightDiagnostics?.()' : 'window.__terrainDiagnostics?.()');
    async function tap(code: string) {
      for (const type of ['keyDown','keyUp']) await session.send('Input.dispatchKeyEvent',{type,code,key:code});
    }
    evidence.initial = await session.poll(async () => {
      const d=await read();
      const ready=await session.evaluate(`document.querySelector('[data-terrain-map]')?.getAttribute('data-terrain-map')==='ready' && document.querySelectorAll('[data-teleport-id]').length===3`);
      return d && ready ? d : undefined;
    }, 'map available in '+mode);
    await session.evaluate(`document.getElementById('terrain-canvas').focus();
      const label=Array.from(document.body.children).find(e=>e.textContent?.startsWith('AUTOMATED TEST —'));
      if(label){label.style.top='auto'; label.style.bottom='12px';}`);
    if (flight) { await tap('KeyT'); await tap('F2'); }
    evidence.before = await read();
    const points = await session.evaluate(`Array.from(document.querySelectorAll('[data-waypoint-id]'),e=>({id:Number(e.dataset.waypointId),x:Number(e.dataset.worldX),z:Number(e.dataset.worldZ)}))`);
    evidence.destinations=[];
    for (const point of points) {
      await session.evaluate(`document.querySelector('[data-teleport-id="${point.id}"]').click()`);
      const arrived = await session.poll(async () => {
        const d=await read(); const p=flight?d?.position:d?.camera;
        const ui=await session.evaluate(`({busy:document.querySelector('[data-teleport-id]')?.disabled,selected:document.querySelector('[data-waypoint-id="${point.id}"]')?.dataset.selected,focus:document.activeElement?.id,error:document.querySelector('[role="alert"]')?.textContent})`);
        if(ui.error)throw new Error(ui.error);
        return p && Math.hypot(p.x-point.x,p.z-point.z)<200 && !ui.busy && ui.selected==='true' ? {d,ui} : undefined;
      }, 'teleport '+mode+' waypoint '+point.id);
      const p=flight?arrived.d.position:arrived.d.camera;
      assert(p.y>=990, 'Teleport below safe terrain clearance');
      assert(arrived.ui.focus==='terrain-canvas','Teleport did not restore controls focus');
      if(flight) {
        assert(arrived.d.flightModelId===mode,'Teleport changed flight model');
        assert(arrived.d.cameraMode==='attitude','Teleport changed chase view');
        assert(!arrived.d.engineRunning,'Teleport restarted stopped engine');
        assert(Math.abs(arrived.d.fuelMassKg-evidence.before.fuelMassKg)<1e-6,'Teleport reset fuel');
        assert(arrived.d.status==='airborne','Teleport did not establish flight');
      }
      evidence.destinations.push({point,...arrived});
      if(point.id===2) {
        await session.poll(async()=>{
          const d=await session.evaluate('window.__terrainDiagnostics?.()');
          return d?.loadedChunks>0 && d.pendingChunks===0 && !d.transitionActive ? true : undefined;
        },'destination terrain streamed');
        await session.capture('mountains');
      }
    }
    await session.evaluate(`document.querySelector('[aria-label="Zoom map in"]').click()`);
    assert(await session.evaluate(`document.activeElement?.id==='terrain-canvas'`),'Zoom lost control focus');
    await session.evaluate(`document.querySelector('[aria-label="Heading-up map"]').click()`);
    evidence.headingUp = await session.poll(async () => {
      const d=await session.evaluate(`(() => {
        const m=document.querySelector('[data-map-orientation]');
        const a=document.querySelector('[data-aircraft-marker]');
        return {mode:m?.dataset.mapOrientation, rotation:Number(m?.dataset.mapRotation),
          heading:Number(a?.dataset.heading),compass:!!document.querySelector('[data-map-compass]'),
          focus:document.activeElement?.id};
      })()`);
      return d.mode==='heading-up'?d:undefined;
    },'heading-up mode');
    assert(evidence.headingUp.compass,'Compass missing');
    assert(Math.abs(((evidence.headingUp.rotation+evidence.headingUp.heading+540)%360)-180)<0.01,'Heading-up rotation incorrect');
    assert(evidence.headingUp.focus==='terrain-canvas','Orientation control lost focus');
    await session.capture('coastline-heading-up');
    await session.evaluate(`document.querySelector('[aria-label="North-up map"]').click()`);
    await session.poll(async()=>await session.evaluate(`document.querySelector('[data-map-orientation]')?.dataset.mapOrientation==='north-up'`) ? true:undefined,'north-up mode');
    await session.capture('coastline');
    if(!flight) {
      const before=await read();
      await session.send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w'});
      evidence.moved=await session.poll(async()=>{
        const d=await read();return Math.hypot(d.camera.x-before.camera.x,d.camera.z-before.camera.z)>20?d:undefined;
      },'explorer movement after teleport');
      await session.send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w'});
    }
    assert(!session.errors.length,'Renderer errors');
  } catch(error) { failure=String(error); }
  finally {
    results[mode]={evidence,failure,runtimeErrors:session.errors};
    await Bun.write(path.join(out,'report.json'),JSON.stringify({date:new Date().toISOString(),buildSourceCommit:option('--build-commit'),results},null,2));
    await session.close();
  }
  if(failure)throw new Error(failure);
}
console.log(JSON.stringify({result:'pass',out,modes:Object.keys(results)}));
