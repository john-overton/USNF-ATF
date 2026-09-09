/** Compare translated helpers against synthetic observations from real x86 code. */
import assert from 'node:assert/strict';
import { nativeEnvelopeSpeedLimits, nativeCheckFlightEnvelope } from '../../engine/src/sim/flight/native-envelope';
const path = process.argv[2];
if (!path) throw new Error('Usage: bun tools/native/compare-envelope.ts <oracle.json>');
const report = await Bun.file(path).json();
assert(Array.isArray(report.cases) && report.cases.length > 0, 'No native oracle cases');
for (const row of report.cases) {
  assert.deepEqual(nativeEnvelopeSpeedLimits(row.envelope, row.context), row.expected);
  assert.deepEqual(nativeCheckFlightEnvelope(row.envelope, row.context), row.check);
}
console.log(`${report.cases.length} native x86 envelope cases match both translated functions exactly`);
