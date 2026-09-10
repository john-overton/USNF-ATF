import assert from 'node:assert/strict';
import { nativeSoundSpeedFps, nativeDragPercent, nativeDragForceF8, nativeLoadedParameters } from '../../engine/src/sim/flight/native-drag';
const report = await Bun.file(process.argv[2]!).json();
for (const c of report.cases) {
  const result = c.routine === 'sound' ? nativeSoundSpeedFps(c.input)
    : c.routine === 'dragPercent' ? nativeDragPercent(c.input) : nativeDragForceF8(c.input);
  assert.equal(result, c.output, JSON.stringify(c));
}
for (const c of report.loadCases) assert.deepEqual(nativeLoadedParameters(c.input), c.output);
console.log(`${report.cases.length} native sound/drag and ${report.loadCases.length} loading comparisons pass`);
