/** Compare real x86 routine results against the isolated TypeScript helpers. */
import assert from 'node:assert/strict';
import { nativeFuelConsumption, nativeMatchF24, nativeSelectThrust, nativeThrustScalar } from '../../engine/src/sim/flight/native-power';
const report = await Bun.file(process.argv[2]!).json();
const counts: Record<string, number> = {};
for (const entry of report.cases) {
  let actual: number;
  if (entry.routine === 'fuel') actual = nativeFuelConsumption(entry.input[0], entry.input[1], entry.input[2]);
  else if (entry.routine === 'slew') actual = nativeMatchF24(entry.input[0], entry.input[1], entry.input[2], entry.input[3]);
  else if (entry.routine === 'selection') actual = nativeSelectThrust(entry.input);
  else if (entry.routine === 'scalar') actual = nativeThrustScalar(entry.input).forceF8;
  else throw new Error(`Unknown native routine ${entry.routine}`);
  assert.equal(actual, entry.output, JSON.stringify(entry));
  counts[entry.routine] = (counts[entry.routine] ?? 0) + 1;
}
console.log(JSON.stringify({ executableSha256: report.executableSha256, passed: counts }));
