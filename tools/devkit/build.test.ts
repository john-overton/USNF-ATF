import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, defaultDataRoot, selectDataset, selectStages, type Options } from './build';

function options(overrides: Partial<Options> = {}): Options {
  return {
    source: 'gameassets',
    extracted: 'extracted',
    install: null,
    games: ['usnf97'],
    aircraft: ['f14'],
    menuGame: 'usnf97',
    theater: 'ukraine',
    dataset: null,
    rebuildTerrain: false,
    soundfont: null,
    stages: [],
    python: 'python3',
    overwrite: false,
    dryRun: true,
    ...overrides,
  };
}

test('stage selection keeps canonical order and rejects unknown names', () => {
  expect(selectStages('', '')).toEqual([
    'extract',
    'aircraft',
    'audio',
    'music',
    'menu',
    'terrain',
    'install',
  ]);
  // Listed out of order, but the kit still extracts before it installs.
  expect(selectStages('install,extract', '')).toEqual(['extract', 'install']);
  expect(selectStages('', 'music,terrain')).not.toContain('music');
  expect(selectStages('', 'music,terrain')).not.toContain('terrain');
  expect(() => selectStages('aircraft,sound', '')).toThrow(/Unknown stage 'sound'/);
  expect(() => selectStages('', 'nonsense')).toThrow(/Unknown stage/);
});

test('app data root follows each platform convention', () => {
  expect(defaultDataRoot('darwin', '/Users/pilot')).toBe(
    '/Users/pilot/Library/Application Support/USNF-ATF/data',
  );
  expect(defaultDataRoot('linux', '/home/pilot')).toBe('/home/pilot/.config/USNF-ATF/data');
  expect(defaultDataRoot('win32', 'C:/Users/pilot', 'C:/Users/pilot/AppData/Roaming')).toBe(
    path.join('C:/Users/pilot/AppData/Roaming', 'USNF-ATF/data'),
  );
});

test('missing retail media fails before any conversion runs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'devkit-'));
  await expect(
    build(options({ source: root, extracted: root, stages: ['extract'] })),
  ).rejects.toThrow(/No retail media for usnf97/);
});

test('already extracted media is reused, and --overwrite re-extracts it', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'devkit-'));
  await mkdir(path.join(root, 'source/usnf97'), { recursive: true });
  await mkdir(path.join(root, 'out/usnf97/USNF_2.LIB'), { recursive: true });
  const base = { source: path.join(root, 'source'), extracted: path.join(root, 'out') };

  const reused = await build(options({ ...base, stages: ['extract'] }));
  const first = (reused.stages as { status: string; commands: string[][] }[])[0]!;
  expect(first.status).toBe('reused');
  expect(first.commands).toHaveLength(0);

  const redone = await build(options({ ...base, stages: ['extract'], overwrite: true }));
  const second = (redone.stages as { status: string; commands: string[][] }[])[0]!;
  expect(second.status).toBe('built');
  expect(second.commands[0]).toContain('extract');
});

test('a partial aircraft bundle is rebuilt rather than trusted', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'devkit-'));
  const bundle = path.join(root, 'out/aircraft-ports/f14/2026-01-01T00-00-00-000Z-abc');
  await mkdir(path.join(bundle, 'audio'), { recursive: true });
  // Geometry and flight data present, but the cockpit and loadout install needs are not.
  for (const name of ['f14.json', 'f14-flight.json', 'f14-gun.json'])
    await writeFile(path.join(bundle, name), '{}');
  const report = await build(
    options({ extracted: path.join(root, 'out'), stages: ['aircraft'] }),
  );
  const stage = (report.stages as { status: string; commands: string[][] }[])[0]!;
  expect(stage.status).toBe('built');
  expect(stage.commands[0]).toContain('--aircraft');
});

test('terrain reuse is explicit about needing a built dataset', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'devkit-'));
  await expect(
    build(options({ extracted: root, stages: ['terrain'] })),
  ).rejects.toThrow(/No built terrain/);

  await mkdir(path.join(root, 'terrain/ukraine'), { recursive: true });
  await writeFile(path.join(root, 'terrain/ukraine/manifest.json'), '{}');
  const report = await build(options({ extracted: root, stages: ['terrain'] }));
  const stage = (report.stages as { status: string; notes?: string[] }[])[0]!;
  expect(stage.status).toBe('reused');
  // The kit must never imply the discs supplied the terrain.
  expect(stage.notes?.join(' ')).toMatch(/not from the discs/);
});

test('an unknown theater fails instead of silently installing another', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'devkit-'));
  await expect(
    build(options({ extracted: root, stages: ['terrain'], theater: 'atlantis' })),
  ).rejects.toThrow(/No theater config/);
});

test('music without a selected bank is skipped, and says why', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'devkit-'));
  const report = await build(
    options({ extracted: root, stages: ['music'], soundfont: null }),
  );
  const stage = (report.stages as { status: string; detail: string; notes?: string[] }[])[0]!;
  expect(stage.status).toBe('skipped');
  expect(stage.detail).toMatch(/synthesized/);
  expect(stage.notes?.join(' ')).toMatch(/--soundfont/);
});

test('a render made with a different bank is not reused', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'devkit-'));
  const bank = path.join(root, 'bank.sf2');
  await writeFile(bank, 'RIFF----sfbk pretend bank');
  const baked = path.join(root, 'music-baked/usnf97');
  await mkdir(baked, { recursive: true });
  await writeFile(
    path.join(baked, 'flight-music-baked.json'),
    JSON.stringify({ tracks: { abc: { bankSha256: 'a-different-bank' } } }),
  );
  const report = await build(
    options({ extracted: root, stages: ['music'], soundfont: bank }),
  );
  const stage = (report.stages as { status: string; commands: string[][] }[])[0]!;
  expect(stage.status).toBe('built');
  expect(stage.commands[0]).toContain('retail.music_bake');
});

test('the report records provenance and never claims acceptance', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'devkit-'));
  await mkdir(path.join(root, 'terrain/ukraine'), { recursive: true });
  await writeFile(path.join(root, 'terrain/ukraine/manifest.json'), '{}');
  const report = await build(options({ extracted: root, stages: ['terrain'] }));
  expect(report.sourceCommit).toBeString();
  expect(report.acceptance).toMatch(/separate check/);
  expect((report.machine as { platform: string }).platform).toBe(process.platform);
});

test('the most complete dataset wins, so a bare rebuild never downgrades an installed one', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'devkit-'));
  const terrain = path.join(root, 'terrain');
  const write = async (name: string, manifest: Record<string, unknown>) => {
    await mkdir(path.join(terrain, name), { recursive: true });
    await writeFile(path.join(terrain, name, 'manifest.json'), JSON.stringify(manifest));
  };
  await write('ukraine', { name: 'ukraine' });
  await write('ukraine-shorelines', {
    name: 'ukraine',
    imagery: {},
    coastPaint: {},
    colorMaps: {},
    shorelines: {},
  });
  await write('salt-lake', { name: 'salt-lake', imagery: {}, shorelines: {} });

  const best = await selectDataset(terrain, 'ukraine');
  expect(best?.folder).toBe(path.join(terrain, 'ukraine-shorelines'));
  expect(best?.passes).toEqual(['imagery', 'coastPaint', 'colorMaps', 'shorelines']);
  // A different theater's richer dataset must never be chosen.
  expect(await selectDataset(terrain, 'salt-lake')).toMatchObject({
    folder: path.join(terrain, 'salt-lake'),
  });
  expect(await selectDataset(terrain, 'atlantis')).toBeNull();
});

test('equally complete datasets prefer the exactly named theater', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'devkit-'));
  const terrain = path.join(root, 'terrain');
  for (const name of ['ukraine', 'ukraine-experiment']) {
    await mkdir(path.join(terrain, name), { recursive: true });
    await writeFile(path.join(terrain, name, 'manifest.json'), JSON.stringify({ imagery: {} }));
  }
  expect((await selectDataset(terrain, 'ukraine'))?.folder).toBe(path.join(terrain, 'ukraine'));
});
