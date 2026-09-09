/** Real desktop comparison of palette swaps, including resource recovery. */
import { openDesktop } from '../flight/desktop';
const out = process.argv[2] ?? 'extracted/terrain-palette-acceptance';
const desktop = await openDesktop({
  binary: 'build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF',
  terrain: 'extracted/terrain/ukraine-palettes', out,
  query: { x: '304726', y: '22476', z: '272303', yaw: '0.80285', pitch: '-0.45' },
});
try {
  await desktop.poll(async () => {
    const d = await desktop.evaluate('window.__terrainDiagnostics?.()');
    return d?.status === 'ready' && d.frames > 180 && !d.waterBatchesPending ? d : undefined;
  }, 'terrain and water ready', 60000);
  const reports = [];
  for (const mode of ['summer', 'satellite', 'spring', 'autumn', 'winter', 'summer']) {
    await desktop.evaluate(`(() => { const s=document.querySelector('#terrain-paint'); s.value=${JSON.stringify(mode)}; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await desktop.poll(async () => {
      const d = await desktop.evaluate('window.__terrainDiagnostics()');
      return d.paint === mode ? d : undefined;
    }, 'palette swap or settling', 20000);
    const start = await desktop.evaluate('window.__terrainDiagnostics().frames');
    await desktop.poll(async () => {
      const d = await desktop.evaluate('window.__terrainDiagnostics()');
      return d.frames > start + 300 ? d : undefined;
    }, 'palette swap or settling', 20000);
    const d = await desktop.evaluate('window.__terrainDiagnostics()');
    if (d.error || d.waterBatchesOmitted || d.waterBatchesPending || 1000/d.frameMs < 45)
      throw new Error(`Palette acceptance failed: ${JSON.stringify(d)}`);
    reports.push(d);
    await desktop.capture(mode);
  }
  if (desktop.errors.length) throw new Error(JSON.stringify(desktop.errors));
  if (Math.abs(reports[0].cacheBytes - reports[5].cacheBytes) > 1024*1024)
    throw new Error('Palette switching did not recover memory');
  await Bun.write(`${out}/report.json`, JSON.stringify({ reports, errors: desktop.errors }, null, 2));
  console.log(reports.map(d => ({paint:d.paint,fps:1000/d.frameMs,cacheMiB:d.cacheBytes/1048576})));
} finally { await desktop.close(); }
