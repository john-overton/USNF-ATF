/** Packaged low coastal detail and independent seasonal-palette acceptance. */
import { openDesktop } from '../flight/desktop';
const out = process.argv[2] ?? 'extracted/terrain-shoreline-detail';
const desktop = await openDesktop({
  binary: 'build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF',
  terrain: 'extracted/terrain/ukraine-shorelines', out,
  query: { x: '214612.5', y: '350', z: '264700', yaw: '3.14159265', pitch: '-0.4' },
});
try {
  await desktop.poll(async () => {
    const d = await desktop.evaluate('window.__terrainDiagnostics?.()');
    return d?.status === 'ready' && d.frames > 300 && !d.waterBatchesPending && !d.shorelinePending ? d : undefined;
  }, 'terrain, shoreline and water ready', 90000);
  const reports=[];
  for(const mode of ['summer','winter']) {
    await desktop.evaluate(`(() => {const s=document.querySelector('#terrain-paint');s.value=${JSON.stringify(mode)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const start=await desktop.evaluate('window.__terrainDiagnostics().frames');
    await desktop.poll(async()=>{const d=await desktop.evaluate('window.__terrainDiagnostics()');return d.paint===mode && d.frames>start+300 ? d:undefined;},'seasonal settling',20000);
    const d=await desktop.evaluate('window.__terrainDiagnostics()');
    if(d.error || d.shorelineTriangles===0 || d.shorelinePending || d.shorelineOmitted || d.waterBatchesOmitted || 1000/d.frameMs<45)throw new Error(JSON.stringify(d));
    reports.push(d);await desktop.capture(mode);
  }
  if(desktop.errors.length)throw new Error(JSON.stringify(desktop.errors));
  if(reports[0].shorelineBytes!==reports[1].shorelineBytes || reports[0].shorelineTriangles!==reports[1].shorelineTriangles)throw new Error('Palette swap changed shoreline resources');
  await Bun.write(`${out}/report.json`,JSON.stringify({reports,errors:desktop.errors},null,2));
  console.log(reports.map(d=>({paint:d.paint,fps:1000/d.frameMs,shorelineTriangles:d.shorelineTriangles,shorelineMiB:d.shorelineBytes/1048576})));
} finally { await desktop.close(); }
