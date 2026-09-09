/** Real Electron acceptance for waypoint controls, live map and HUD. */
import path from 'node:path';
import { openDesktop } from './desktop';
const args = process.argv.slice(2);
function option(name: string, fallback?: string): string {
  const i = args.indexOf(name), value = i < 0 ? fallback : args[i + 1];
  if (!value) throw new Error(`Required: ${name}`);
  return value;
}
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const out = option('--out', 'extracted/flight-navigation');
const session = await openDesktop({
  binary: option('--binary'),
  terrain: 'extracted/terrain/ukraine',
  aircraft: 'extracted/flight/f14.json',
  audio: 'extracted/flight/audio/f14.json',
  flightProfile: 'extracted/flight/f14-flight.json',
  out,
  interactiveTest: true,
  query: { mode: 'flight', flightStart: 'airborne' },
});
const evidence: Record<string, any> = {};
let failure: string | undefined;
try {
  const read = () => session.evaluate('window.__flightDiagnostics?.()');
  async function tap(code: string, repeat = false) {
    for (const type of ['keyDown', 'keyUp'])
      await session.send('Input.dispatchKeyEvent', {
        type, code, key: code === 'BracketLeft' ? '[' : code === 'BracketRight' ? ']' : code,
        autoRepeat: repeat,
      });
  }
  async function selected(index: number) {
    return session.poll(async () => {
      const d = await read();
      const hud = await session.evaluate(`document.querySelector('[data-hud="waypoint"]')?.textContent`);
      return d?.waypointIndex === index && hud?.includes(`WP ${index + 1} `) ? { d, hud } : undefined;
    }, 'waypoint selection', 10000);
  }
  evidence.initial = await session.poll(async () => {
    const d = await read();
    const ready = await session.evaluate(`document.querySelector('[data-terrain-map]')?.getAttribute('data-terrain-map') === 'ready'`);
    return d?.simSteps > 10 && ready ? d : undefined;
  }, 'flight and regional map ready');
  // Move only the test label away from the product's top-right map.
  await session.evaluate(`Array.from(document.body.children).find(e=>e.textContent?.startsWith('AUTOMATED TEST —'))?.style.setProperty('top','auto');
    Array.from(document.body.children).find(e=>e.textContent?.startsWith('AUTOMATED TEST —'))?.style.setProperty('bottom','12px');
    document.getElementById('terrain-canvas').focus();`);
  evidence.waypoints = [await selected(0)];
  for (const i of [1, 2, 0]) {
    await tap('BracketRight');
    evidence.waypoints.push(await selected(i));
  }
  await tap('BracketLeft');
  await selected(2);
  await tap('BracketRight', true);
  assert((await read()).waypointIndex === 2, 'Key repeat skipped destination');
  await session.evaluate(`document.getElementById('terrain-manifest').focus()`);
  await tap('BracketRight');
  assert((await read()).waypointIndex === 2, 'Form input changed destination');
  await session.evaluate(`document.querySelector('button[aria-label="Minimize practice flight panel"]').click()`);
  assert(await session.evaluate(`document.activeElement?.id === 'terrain-canvas'`), 'Minimize did not restore flight focus');
  await tap('BracketRight');
  await selected(0);
  evidence.map = await session.evaluate(`(() => {
    const map = document.querySelector('[data-terrain-map]');
    const canvas = map.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const rgba = ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const colors = new Map();
    for(let i=0;i<rgba.length;i+=4) { const color=Array.from(rgba.slice(i,i+4)).join(','); colors.set(color,(colors.get(color)||0)+1); }
    return {attributes:Object.fromEntries(Array.from(map.attributes,a=>[a.name,a.value])), colors:Array.from(colors).sort((a,b)=>b[1]-a[1]).slice(0,12), markers: Array.from(map.querySelectorAll('[data-waypoint-id]'),e=>({id:e.getAttribute('data-waypoint-id'),selected:e.getAttribute('data-selected')})), bounds:map.getBoundingClientRect().toJSON()};
  })()`);
  assert(evidence.map.markers.length === 3, 'Missing map destinations');
  assert(evidence.map.markers.some((m: any) => m.id === '1' && m.selected === 'true'), 'Map selection disagrees with HUD');
  assert(evidence.map.colors.length > 5, 'Elevation map lacks terrain colors');
  evidence.softkeys = await session.evaluate(`(() => {
    const image=document.querySelector('.terrain-map-image').getBoundingClientRect();
    const scale=document.querySelector('.terrain-map-distance').getBoundingClientRect();
    return Array.from(document.querySelectorAll('.mfd-waypoint-control > span'),e=>{
      const r=e.getBoundingClientRect();return {text:e.textContent,inside:r.top>=image.top&&r.bottom<=image.bottom,aboveScale:r.bottom<=scale.top};
    });
  })()`);
  assert(evidence.softkeys.length===3 && evidence.softkeys.every((s:any)=>s.inside&&s.aboveScale),'MFD softkey legends obscure distance scale');
  await session.poll(async () => {
    const d = await session.evaluate('window.__terrainDiagnostics?.()');
    return d?.loadedChunks > 0 && d.pendingChunks === 0 && !d.transitionActive ? true : undefined;
  }, 'terrain settled before visual capture');
  async function bezelGeometry() {
    return session.evaluate(`(() => {
      const map=document.querySelector('[data-terrain-map]');
      const r=map.getBoundingClientRect();
      const keys=Array.from(map.querySelectorAll('.mfd-button'),e=>e.getBoundingClientRect());
      const screen=map.querySelector('.mfd-screen').getBoundingClientRect();
      return {width:r.width,height:r.height,count:keys.length,dials:map.querySelectorAll('.mfd-dial').length,
        sides:{top:keys.filter(k=>k.bottom<=screen.top).length,bottom:keys.filter(k=>k.top>=screen.bottom).length,
          left:keys.filter(k=>k.right<=screen.left).length,right:keys.filter(k=>k.left>=screen.right).length},
        contained:keys.every(k=>k.left>=r.left&&k.right<=r.right&&k.top>=r.top&&k.bottom<=r.bottom)};
    })()`);
  }
  function checkBezel(b:any) {
    assert(Math.abs(b.width-b.height)<1,'MFD is not square');
    assert(b.count===20 && b.dials===2 && Object.values(b.sides).every(n=>n===5),'MFD needs five buttons per edge and two dials');
    assert(b.contained,'MFD bezel buttons extend outside frame');
  }
  evidence.bezel = await bezelGeometry();
  checkBezel(evidence.bezel);
  await session.capture('navigation-1440p');
  async function zoomSnapshot() {
    return session.evaluate(`(() => {
      const svg=document.querySelector('[data-map-zoom]');
      const scale=document.querySelector('[data-map-scale-nm]');
      return { zoom:Number(svg.dataset.mapZoom), worldWidth:Number(svg.dataset.worldWidth),
        mapPixels:svg.getBoundingClientRect().width, scalePixels:scale.getBoundingClientRect().width,
        scaleNm:Number(scale.dataset.mapScaleNm), focus:document.activeElement?.id };
    })()`);
  }
  evidence.zoom = [await zoomSnapshot()];
  for (const zoom of [2,4,8,16]) {
    await session.evaluate(`document.querySelector('button[aria-label="Zoom map in"]').click()`);
    const snapshot = await session.poll(async () => {
      const d=await zoomSnapshot(); return d.zoom === zoom ? d : undefined;
    }, 'map zoom');
    assert(snapshot.focus === 'terrain-canvas', 'Map zoom left flight controls unfocused');
    assert(Math.abs(snapshot.scalePixels / snapshot.mapPixels - snapshot.scaleNm * 1852 / (snapshot.worldWidth / snapshot.zoom)) < 0.015, 'Distance scale disagrees with zoom');
    evidence.zoom.push(snapshot);
  }
  assert(await session.evaluate(`document.querySelector('button[aria-label="Zoom map in"]').disabled`), 'Zoom exceeds limit');
  await tap('BracketRight');
  await selected(1);
  await session.capture('navigation-zoom16');
  for (const zoom of [8,4,2,1]) {
    await session.evaluate(`document.querySelector('button[aria-label="Zoom map out"]').click()`);
    await session.poll(async () => (await zoomSnapshot()).zoom === zoom ? true : undefined, 'zoom out');
  }
  await tap('BracketLeft');
  await selected(0);
  const marker = () => session.evaluate(`document.querySelector('[data-aircraft-marker]')?.getAttribute('transform')`);
  const before = await marker();
  const initial = await read();
  evidence.moving = await session.poll(async () => {
    const d = await read();
    return d?.simTime > initial.simTime + 3 && await marker() !== before ? d : undefined;
  }, 'map tracks aircraft movement');
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await session.capture('navigation-720p');
  evidence.small = await session.evaluate(`(() => {
    const m=document.querySelector('[data-terrain-map]').getBoundingClientRect();
    const h=document.querySelector('[data-flight-hud]').getBoundingClientRect();
    return {map:m.toJSON(),hud:h.toJSON(),overlap: m.left < h.right && m.right > h.left && m.top < h.bottom && m.bottom > h.top};
  })()`);
  evidence.small.bezel = await bezelGeometry();
  checkBezel(evidence.small.bezel);
  assert(!evidence.small.overlap, 'Map covers essential HUD at 720p');
  assert(!session.errors.length, 'Renderer errors');
} catch (error) {
  failure = String(error);
} finally {
  await Bun.write(path.join(out, 'report.json'), JSON.stringify({
    date: new Date().toISOString(), buildSourceCommit: option('--build-commit'),
    result: failure ? 'fail' : 'pass', failure, evidence, runtimeErrors: session.errors,
  }, null, 2));
  await session.close();
}
if (failure) throw new Error(failure);
console.log(JSON.stringify({ result: 'pass', out }));
