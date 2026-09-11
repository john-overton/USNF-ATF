import assert from 'node:assert/strict';
import { openDesktop } from './desktop';
const build = await Bun.build({ entrypoints: ['tools/flight/cloud-gpu-probe.ts'], target: 'browser', format: 'iife', minify: true, plugins: [{ name: 'engine-dependencies', setup(builder) { builder.onResolve({filter: /^three(\/|$)/}, args => ({path: Bun.resolveSync(args.path, process.cwd() + '/engine')})); } }] });
assert(build.success, String(build.logs));
const code = await build.outputs[0]!.text();
const s = await openDesktop({ binary:'shell/node_modules/electron/dist/electron', app:'shell', terrain:'extracted/terrain/synthetic', out:'extracted/cloud-review/gpu', query:{mode:'explorer',clouds:'off'} });
try {
  await s.poll(async () => (await s.evaluate('window.__terrainDiagnostics?.()?.frames > 10')) ? true : undefined, 'renderer');
  await s.evaluate(code);
  const report = await s.evaluate('(window.cloudGpuProbe)()');
  await Bun.write(`${s.out}/report.json`, JSON.stringify(report, null, 2));
  assert.equal(s.errors.length, 0);
  assert.equal(report.error, 0);
  assert.equal(report.repeated.max, 0, 'same state must render identically');
  assert(report.rebased.max <= 2/255, 'floating origin must not move cloud density');
  assert(report.evolved.mean > 0.0001, 'rolling must evolve visible density');
  assert(report.wrapped.max <= 2/255, 'rolling must remain continuous at phase wrap');
  assert(report.convergence.mean < 0.04, '40/96 steps must converge without brightness shift');
  for (const sample of report.optical) {
    assert(Math.abs(sample.actual[0] - sample.expectedTau) < 0.0001);
    assert(Math.abs(sample.actual[1] - Math.exp(-sample.expectedTau)) < 0.0001);
    assert(Math.abs(sample.actual[2] - 1.875) < 0.0001);
  }
  console.log(report);
} finally { await s.close(); }
