import assert from 'node:assert/strict';
import { nativeGLimits, nativeLowSpeedGLimits, nativeGToTurn } from '../../engine/src/sim/flight/native-g-limits';
const report = await Bun.file(process.argv[2]!).json();
for (const c of report.cases) {
  assert.deepEqual(nativeGLimits(report.native.envelopes, { ...c.context,
    seaLevelLimitFps: report.native.structuralSpeedFps.seaLevel,
    highAltitudeLimitFps: report.native.structuralSpeedFps.at36000Ft }), c.expected);
}
for (const c of report.lowSpeedCases) assert.deepEqual(nativeLowSpeedGLimits(c), c.expected);
for (const c of report.turnCases) assert.equal(nativeGToTurn(c.gFixed, c.speedFps), c.expectedTurnRateFixed);
console.log(`${report.cases.length} native G ranges, ${report.lowSpeedCases.length} low-speed reductions, ${report.turnCases.length} turn rates pass`);
