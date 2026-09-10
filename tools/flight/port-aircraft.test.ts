import { expect, test } from 'bun:test';
import { portCommands, summarizeModel, main } from './port-aircraft';

test('recipes use independent model/PT origins and explicit scale without a shell', () => {
  const a4 = portCommands('a4e', '/tmp/media & sources', '/tmp/out folder', '/tmp/python tool');
  expect(a4[0]![0]).toBe('/tmp/python tool');
  expect(a4[0]).toContain('/tmp/media & sources/atf-gold/ATF_2.LIB/A4.SH');
  expect(a4[1]).toContain('/tmp/media & sources/usnf97/USNF_2.LIB/A4E.PT');
  expect(a4[2]).toContain('/tmp/out folder/audio/a4e.json');
  expect(a4[3]).toContain('/tmp/out folder/cockpits/a4e.json');
  expect(a4[3]).toContain('/tmp/media & sources');
  expect(a4[4]).toContain('/tmp/out folder/a4e-gun.json');
  expect(a4[5]).toContain('retail.loadout');
  expect(a4[5]).toContain('/tmp/out folder/a4e-loadout.json');
  expect(a4[5]).toContain('/tmp/media & sources/usnf97/USNF_2.LIB/A4E.PT');
  const x31 = portCommands('x31', '/tmp/media', '/tmp/out', 'python3');
  expect(x31[0]).toContain('--wingspan-metres');
  expect(x31[0]).toContain('7.26');
  expect(x31[0]).not.toContain('--length-metres');
});

test('summary measures actual geometry and distinguishes static and rigged pieces', () => {
  const triangle = {name: 'body', positions: [-2, -1, -3, 2, -1, -3, 0, 2, 4], colors: Array(9).fill(1)};
  const model = {version: 1, name: 'Synthetic', positions: [], colors: [], limitations: ['original test'], parts: [triangle]};
  const summary = summarizeModel(model);
  expect(summary.dimensionsMetres).toEqual({span:4, height:3, length:7});
  expect(summary.triangles).toBe(1);
  expect(summary.movingParts).toEqual([]);
  expect(() => summarizeModel({...model, parts:[{...triangle, positions:[NaN, ...triangle.positions.slice(1)]}]})).toThrow();
});

test('invalid CLI options fail before launching conversion or writing output', async () => {
  for (const args of [[], ['--aircraft', '../a4e'], ['--aircraft'], ['--aircraft', 'x31', '--unknown'], ['--aircraft', 'a4e', '--aircraft', 'x31']])
    await expect(main(args)).rejects.toThrow();
});
