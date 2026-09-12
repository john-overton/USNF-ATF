/**
 * One command that turns locally owned retail media into a complete, installed
 * development kit: extraction, aircraft, audio, music, menus and terrain.
 *
 * It orchestrates the existing validated helpers rather than reimplementing them,
 * so every stage keeps its own parsers, guards and provenance. Nothing retail is
 * committed or bundled: conversions land in ignored `extracted/`, and installation
 * only ever writes to an app data root you name.
 *
 * Terrain is the exception to "from the game files". The shipping datasets are
 * built from public Copernicus elevation and Sentinel-2 imagery, not from the
 * discs, so the kit reuses an already-built dataset unless `--rebuild-terrain`
 * asks for the full network chain.
 *
 * Usage:
 *   bun tools/devkit/build.ts --list
 *   bun tools/devkit/build.ts --dry-run
 *   bun tools/devkit/build.ts
 *   bun tools/devkit/build.ts --source /Volumes/USNF97 --only extract,aircraft
 *   bun tools/devkit/build.ts --rebuild-terrain --theater ukraine
 */
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));

const GAMES = ['usnf97', 'atf-gold'] as const;
type Game = (typeof GAMES)[number];

const STAGES = ['extract', 'aircraft', 'audio', 'music', 'menu', 'terrain', 'install'] as const;
type Stage = (typeof STAGES)[number];

const STAGE_SUMMARY: Record<Stage, string> = {
  extract: 'Unpack the discs into extracted/<game>/<archive>/',
  aircraft: 'Convert and validate each aircraft bundle',
  audio: 'Export music scores/notes, combat and ambient sound, and the sound catalogs',
  music: 'Render music with a real instrument bank (needs FluidSynth and an SF2)',
  menu: 'Convert menu artwork, ordnance icons, sounds and the title theme',
  terrain: 'Select a built terrain dataset, or rebuild it from public sources',
  install: 'Install every validated bundle into an app data root',
};

/** The second LIB of each game carries the aircraft, music and menu tables. */
const CONTENT_LIB: Record<Game, string> = { usnf97: 'USNF_2.LIB', 'atf-gold': 'ATF_2.LIB' };

const DEFAULT_AIRCRAFT = ['f14', 'a4e', 'x31'];

export function defaultDataRoot(platform: NodeJS.Platform, home: string, appData?: string): string {
  if (platform === 'darwin') return path.join(home, 'Library/Application Support/USNF-ATF/data');
  if (platform === 'win32') return path.join(appData ?? path.join(home, 'AppData/Roaming'), 'USNF-ATF/data');
  return path.join(home, '.config/USNF-ATF/data');
}

export interface Options {
  source: string;
  extracted: string;
  install: string | null;
  games: Game[];
  aircraft: string[];
  menuGame: Game;
  theater: string;
  dataset: string | null;
  rebuildTerrain: boolean;
  soundfont: string | null;
  stages: Stage[];
  python: string;
  overwrite: boolean;
  dryRun: boolean;
}

export function selectStages(only: string, skip: string): Stage[] {
  const parse = (value: string): Stage[] =>
    value
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        if (!(STAGES as readonly string[]).includes(part))
          throw new Error(`Unknown stage '${part}'; expected ${STAGES.join(', ')}`);
        return part as Stage;
      });
  const wanted = only ? parse(only) : [...STAGES];
  const removed = new Set(parse(skip));
  // Keep canonical order regardless of how the caller listed the stages.
  return STAGES.filter(stage => wanted.includes(stage) && !removed.has(stage));
}

function flag(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

function game(value: string): Game {
  if (!(GAMES as readonly string[]).includes(value))
    throw new Error(`Unknown game '${value}'; expected ${GAMES.join(' or ')}`);
  return value as Game;
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

async function sha256(file: string): Promise<string> {
  return createHash('sha256')
    .update(new Uint8Array(await Bun.file(file).arrayBuffer()))
    .digest('hex');
}

/**
 * Argument arrays keep paths, ampersands and quotes out of shell interpretation:
 * the retail sound entries are literally named `&CLICK.11K`.
 */
async function run(command: string[], label: string): Promise<void> {
  const child = Bun.spawn(command, {
    cwd: REPO,
    env: { ...process.env, PYTHONPATH: path.join(REPO, 'tools/retail') },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if ((await child.exited) !== 0)
    throw new Error(`${label} failed: ${JSON.stringify(command)}`);
}

async function capture(command: string[]): Promise<string> {
  const child = Bun.spawn(command, { cwd: REPO, stdout: 'pipe', stderr: 'pipe' });
  const [out, , code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return code === 0 ? out.trim() : '';
}

/**
 * Newest timestamped bundle written by port-aircraft.ts / port-menu.ts, or null
 * when nothing has been converted yet. Timestamps sort lexically, so the last
 * name is the most recent run.
 */
async function newestBundle(folder: string): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return null;
  }
  const newest = entries
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(entry.name))
    .map(entry => entry.name)
    .sort()
    .at(-1);
  return newest ? path.join(folder, newest) : null;
}

/** A converted bundle counts as present only when every file install needs is there. */
async function complete(bundle: string | null, files: string[]): Promise<boolean> {
  if (!bundle) return false;
  for (const file of files) if (!(await Bun.file(path.join(bundle, file)).exists())) return false;
  return true;
}

/**
 * True when this folder already holds a complete render made with this exact bank.
 * Selecting a different SoundFont changes every timbre, so that must re-render.
 */
async function bakedWith(folder: string, soundfont: string): Promise<boolean> {
  const manifest = Bun.file(path.join(folder, 'flight-music-baked.json'));
  if (!(await manifest.exists())) return false;
  const bank = await sha256(soundfont);
  try {
    const tracks = (await manifest.json())?.tracks as Record<string, { bankSha256?: string }>;
    const entries = Object.values(tracks ?? {});
    if (entries.length === 0) return false;
    return entries.every(track => track.bankSha256 === bank);
  } catch {
    return false;
  }
}

/**
 * Optional passes a terrain dataset can carry beyond the base elevation build.
 * A bare build is a valid dataset, so the kit must not silently install it over
 * one that already has imagery, coast repair, seasonal colors and shorelines.
 */
const TERRAIN_PASSES = ['imagery', 'coastPaint', 'colorMaps', 'shorelines'] as const;

export interface DatasetChoice {
  folder: string;
  passes: string[];
}

/**
 * Pick the most complete built dataset for a theater: the folder named for it and
 * any `<theater>-<variant>` beside it. Ties prefer the exact name, so a plain
 * rebuild still wins over an equally-featured experiment.
 */
export async function selectDataset(
  terrainRoot: string,
  theater: string,
): Promise<DatasetChoice | null> {
  let entries: string[];
  try {
    entries = (await readdir(terrainRoot, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => name === theater || name.startsWith(`${theater}-`));
  } catch {
    return null;
  }
  const scored: (DatasetChoice & { rank: number })[] = [];
  for (const name of entries.sort()) {
    const folder = path.join(terrainRoot, name);
    const manifest = Bun.file(path.join(folder, 'manifest.json'));
    if (!(await manifest.exists())) continue;
    let document: Record<string, unknown>;
    try {
      document = await manifest.json();
    } catch {
      continue;
    }
    const passes = TERRAIN_PASSES.filter(pass => document[pass] !== undefined);
    scored.push({ folder, passes, rank: passes.length * 2 + (name === theater ? 1 : 0) });
  }
  scored.sort((a, b) => b.rank - a.rank);
  const best = scored[0];
  return best ? { folder: best.folder, passes: best.passes } : null;
}

/** Short repo-relative path when it is inside the checkout, absolute when it is not. */
function inRepo(target: string): string {
  const relative = path.relative(REPO, target);
  return relative.startsWith('..') ? target : relative;
}

/** "f14, a4e (x31 already converted)" — say what ran and what was left alone. */
function describe(built: string[], reused: string[], why: string): string {
  const parts = [built.join(', '), reused.length ? `${reused.join(', ')} ${why}` : ''].filter(Boolean);
  if (built.length && reused.length) return `${built.join(', ')} (${reused.join(', ')} ${why})`;
  return parts.join('') || 'nothing to do';
}

interface StageResult {
  stage: Stage;
  status: 'built' | 'reused' | 'skipped';
  detail: string;
  commands: string[][];
  notes?: string[];
}

const MARK: Record<StageResult['status'], string> = { built: '✓', reused: '=', skipped: '·' };

export async function build(options: Options): Promise<Record<string, unknown>> {
  const started = Date.now();
  const results: StageResult[] = [];
  const python = options.python;
  const source = path.resolve(REPO, options.source);
  const extracted = path.resolve(REPO, options.extracted);
  const commands: string[][] = [];
  const plan = (command: string[]) => {
    commands.push(command);
    return command;
  };

  const record = (
    stage: Stage,
    status: StageResult['status'],
    detail: string,
    notes?: string[],
  ): void => {
    results.push({ stage, status, detail, commands: [...commands], notes });
    console.log(`${MARK[status]} ${stage}: ${detail}`);
    commands.length = 0;
  };

  const active = (stage: Stage): boolean => options.stages.includes(stage);
  const installRoot = options.install;

  // ---- extract ----------------------------------------------------------
  if (active('extract')) {
    const built: string[] = [];
    const reused: string[] = [];
    for (const name of options.games) {
      const discs = path.join(source, name);
      const out = path.join(extracted, name);
      if (!(await isDirectory(discs)))
        throw new Error(`No retail media for ${name} at ${discs}; pass --source <dir>`);
      if ((await isDirectory(path.join(out, CONTENT_LIB[name]))) && !options.overwrite) {
        reused.push(name);
        continue;
      }
      const command = plan([python, '-m', 'retail', 'extract', discs, out]);
      if (!options.dryRun) await run(command, `extract ${name}`);
      built.push(name);
    }
    record(
      'extract',
      built.length ? 'built' : 'reused',
      describe(built, reused, 'already extracted'),
    );
  }

  // ---- aircraft ---------------------------------------------------------
  const aircraftBundles = new Map<string, string>();
  if (active('aircraft')) {
    const built: string[] = [];
    const reused: string[] = [];
    for (const id of options.aircraft) {
      const folder = path.join(extracted, 'aircraft-ports', id);
      const existing = await newestBundle(folder);
      const parts = [
        `${id}.json`,
        `${id}-flight.json`,
        `${id}-gun.json`,
        `${id}-loadout.json`,
        `audio/${id}.json`,
        `cockpits/${id}.json`,
      ];
      if (!options.overwrite && (await complete(existing, parts))) {
        aircraftBundles.set(id, existing as string);
        reused.push(id);
        continue;
      }
      const command = plan([
        'bun',
        'tools/flight/port-aircraft.ts',
        '--aircraft',
        id,
        '--source-root',
        extracted,
        '--python',
        python,
      ]);
      built.push(id);
      if (options.dryRun) continue;
      await run(command, `port ${id}`);
      const bundle = await newestBundle(folder);
      if (!bundle) throw new Error(`No converted bundle under ${folder}`);
      aircraftBundles.set(id, bundle);
    }
    record(
      'aircraft',
      built.length ? 'built' : 'reused',
      describe(built, reused, 'already converted'),
    );
  }

  // ---- audio ------------------------------------------------------------
  if (active('audio')) {
    const built: string[] = [];
    const reused: string[] = [];
    for (const name of options.games) {
      const lib = path.join(extracted, name, CONTENT_LIB[name]);
      const out = path.join(extracted, 'audio-library', name);
      // ATF Gold names its tracks with three digits; USNF uses two.
      const digits = name === 'atf-gold' ? ['--digits', '3'] : [];
      const steps: [string, string[]][] = [
        ['music-scores.json', [python, '-m', 'retail.music_scores', '--source', lib, ...digits, '--out', path.join(out, 'music-scores.json')]],
        ['combat.json', [python, '-m', 'retail.combat_audio', '--source', lib, '--out', path.join(out, 'combat.json')]],
        ['environment.json', [python, '-m', 'retail.environment_audio', '--source', lib, '--out', path.join(out, 'environment.json')]],
        ['catalog.json', [python, '-m', 'retail.audio_catalog', '--media', path.join(source, name), '--out', out]],
      ];
      // The situation-to-track assignments in `retail.music` are authored against
      // USNF's two-digit AIR names. Running it on ATF would fail on missing files
      // rather than produce an ATF score library, so it stays USNF-only.
      if (name === 'usnf97')
        steps.splice(1, 0, [
          'flight-music.json',
          [python, '-m', 'retail.music', '--source', lib, '--out', path.join(out, 'flight-music.json')],
        ]);
      let ran = false;
      for (const [product, step] of steps) {
        if (!options.overwrite && (await Bun.file(path.join(out, product)).exists())) continue;
        plan(step);
        ran = true;
        if (!options.dryRun) await run(step, `audio ${name}`);
      }
      (ran ? built : reused).push(name);
    }
    record('audio', built.length ? 'built' : 'reused', describe(built, reused, 'already exported'));
  }

  // ---- music ------------------------------------------------------------
  const bakedManifests = new Map<Game, string>();
  if (active('music')) {
    if (!options.soundfont) {
      record(
        'music',
        'skipped',
        'no instrument bank selected; music falls back to synthesized tones',
        ['Pass --soundfont <bank.sf2>, or install one, to render real instruments.'],
      );
    } else {
      const built: string[] = [];
      const reused: string[] = [];
      for (const name of options.games) {
        const out = path.join(extracted, 'music-baked', name);
        bakedManifests.set(name, out);
        // Rendering 154 tracks takes minutes; never redo it for an unchanged bank.
        if (!options.overwrite && (await bakedWith(out, options.soundfont))) {
          reused.push(name);
          continue;
        }
        const command = plan([
          python,
          '-m',
          'retail.music_bake',
          '--source',
          path.join(extracted, name, CONTENT_LIB[name]),
          '--out',
          out,
          '--soundfont',
          options.soundfont,
        ]);
        built.push(name);
        if (options.dryRun) continue;
        await run(command, `bake ${name}`);
      }
      record(
        'music',
        built.length ? 'built' : 'reused',
        `${describe(built, reused, 'already rendered')} · ${path.basename(options.soundfont)}`,
      );
    }
  }

  // ---- menu -------------------------------------------------------------
  let menuBundle: string | null = null;
  if (active('menu')) {
    const folder = path.join(extracted, 'menu-ports', options.menuGame);
    const existing = await newestBundle(folder);
    if (!options.overwrite && (await complete(existing, ['screens.json', 'sounds.json']))) {
      menuBundle = existing;
      record('menu', 'reused', `${options.menuGame} already converted`);
    } else {
      const command = plan([
        'bun',
        'tools/menu/port-menu.ts',
        '--source-root',
        extracted,
        '--game',
        options.menuGame,
        '--python',
        python,
      ]);
      if (!options.dryRun) {
        await run(command, 'port menu');
        menuBundle = await newestBundle(folder);
      }
      record('menu', 'built', options.menuGame);
    }
  }

  // ---- terrain ----------------------------------------------------------
  let terrainDataset: string | null = null;
  if (active('terrain')) {
    const config = path.join(REPO, 'theaters', `${options.theater}.json`);
    if (!(await Bun.file(config).exists()))
      throw new Error(`No theater config: ${config}`);
    if (options.rebuildTerrain) {
      const venv = path.join(REPO, '.venv/bin/python');
      const interpreter = (await Bun.file(venv).exists()) ? venv : python;
      const sourceDir = path.join(extracted, 'terrain-source', options.theater);
      const out = path.join(extracted, 'terrain', options.theater);
      const manifest = path.join(out, 'manifest.json');
      const chain: string[][] = [
        [interpreter, '-m', 'pipeline', 'fetch', '--config', config, '--output', sourceDir],
        [interpreter, '-m', 'pipeline', 'build', '--config', config, '--source', sourceDir, '--output', out],
        [interpreter, '-m', 'pipeline', 'imagery', manifest, '--cache', path.join(extracted, 'terrain-source/imagery')],
        [interpreter, '-m', 'pipeline', 'paint-coasts', manifest],
        [interpreter, '-m', 'pipeline', 'color-maps', manifest],
        [interpreter, '-m', 'pipeline', 'shorelines', manifest],
        [interpreter, '-m', 'pipeline', 'probe', manifest],
      ];
      for (const step of chain) {
        plan(step);
        if (options.dryRun) continue;
        const child = Bun.spawn(step, {
          cwd: REPO,
          env: { ...process.env, PYTHONPATH: path.join(REPO, 'terrain-pipeline') },
          stdout: 'inherit',
          stderr: 'inherit',
        });
        if ((await child.exited) !== 0) throw new Error(`terrain stage failed: ${step[3] ?? step[2]}`);
      }
      terrainDataset = out;
      record('terrain', 'built', `rebuilt ${options.theater} from public elevation and imagery sources`);
    } else {
      let chosen: DatasetChoice | null;
      if (options.dataset) {
        const folder = path.resolve(REPO, options.dataset);
        if (!(await Bun.file(path.join(folder, 'manifest.json')).exists()))
          throw new Error(`No terrain manifest under ${folder}`);
        chosen = { folder, passes: [] };
      } else {
        chosen = await selectDataset(path.join(extracted, 'terrain'), options.theater);
      }
      if (!chosen)
        throw new Error(
          `No built terrain for '${options.theater}' under ${path.join(extracted, 'terrain')}. ` +
            'Run with --rebuild-terrain, or pass --dataset <folder>.',
        );
      terrainDataset = chosen.folder;
      const passes = options.dataset
        ? 'explicitly selected'
        : chosen.passes.length
          ? `with ${chosen.passes.join(', ')}`
          : 'base elevation build only';
      record('terrain', 'reused', `${inRepo(chosen.folder)} (${passes})`, [
        'Built from public Copernicus elevation and Sentinel-2 imagery, not from the discs.',
      ]);
    }
  }

  // ---- install ----------------------------------------------------------
  if (active('install')) {
    if (!installRoot) {
      record('install', 'skipped', 'installation not requested');
    } else if (options.dryRun) {
      record('install', 'skipped', `dry run; would install into ${installRoot}`);
    } else {
      const installed: string[] = [];
      await mkdir(path.join(installRoot, 'audio'), { recursive: true });

      for (const [id, bundle] of aircraftBundles) {
        await run(
          [
            'bun',
            'tools/flight/install-aircraft.ts',
            path.join(bundle, `${id}.json`),
            installRoot,
            path.join(bundle, 'audio', `${id}.json`),
            path.join(bundle, `${id}-flight.json`),
            '--id',
            id,
            '--cockpit',
            path.join(bundle, 'cockpits', `${id}.json`),
            '--gun',
            path.join(bundle, `${id}-gun.json`),
            '--loadout',
            path.join(bundle, `${id}-loadout.json`),
          ],
          `install ${id}`,
        );
        installed.push(id);
      }

      if (menuBundle) {
        await run(
          [
            'bun',
            'tools/menu/install-menu.ts',
            path.join(menuBundle, 'screens.json'),
            path.join(menuBundle, 'sounds.json'),
            installRoot,
          ],
          'install menu',
        );
        installed.push('menu');
      }

      // The score library and its manifests are USNF-authored; install that game's
      // audio and leave other renders staged rather than inventing score dispatch.
      const library = path.join(extracted, 'audio-library', 'usnf97');
      for (const name of ['flight-music.json', 'combat.json', 'environment.json']) {
        const from = path.join(library, name);
        if (!(await Bun.file(from).exists())) continue;
        await installFile(from, path.join(installRoot, 'audio', name));
        installed.push(name.replace('.json', ''));
      }

      const baked = bakedManifests.get('usnf97') ?? path.join(extracted, 'music-baked/usnf97');
      const bakedManifest = path.join(baked, 'flight-music-baked.json');
      if (await Bun.file(bakedManifest).exists()) {
        await installFile(bakedManifest, path.join(installRoot, 'audio/flight-music-baked.json'));
        const wavs = path.join(baked, 'music-baked');
        await mkdir(path.join(installRoot, 'audio/music-baked'), { recursive: true });
        let count = 0;
        for (const entry of await readdir(wavs)) {
          if (!entry.endsWith('.wav')) continue;
          await installFile(path.join(wavs, entry), path.join(installRoot, 'audio/music-baked', entry));
          count++;
        }
        installed.push(`${count} rendered tracks`);
      }

      if (terrainDataset) {
        await run(
          [
            'bun',
            'tools/terrain/install.ts',
            '--terrain',
            terrainDataset,
            '--data-root',
            installRoot,
            '--replace',
          ],
          'install terrain',
        );
        installed.push(`terrain ${options.theater}`);
      }
      record('install', 'built', installed.join(', '));
    }
  }

  const report = {
    schemaVersion: 1,
    date: new Date().toISOString(),
    elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    sourceCommit: (await capture(['git', 'rev-parse', 'HEAD'])) || 'unrecorded',
    workingTreeStatus: (await capture(['git', 'status', '--porcelain'])) || 'clean',
    machine: { platform: process.platform, architecture: process.arch, bun: Bun.version },
    options: {
      ...options,
      soundfont: options.soundfont
        ? { path: options.soundfont, sha256: await sha256(options.soundfont) }
        : null,
    },
    stages: results,
    acceptance:
      'Conversion and installation only. How the kit looks, flies and sounds in the app is a separate check.',
  };

  if (!options.dryRun) {
    const folder = path.join(extracted, 'devkit');
    await mkdir(folder, { recursive: true });
    const file = path.join(folder, `devkit-${report.date.replace(/[:.]/g, '-')}.json`);
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nReport: ${file}`);
  }
  return report;
}

/** Stage beside the target, then rename, so a failed copy never truncates what works. */
async function installFile(from: string, to: string): Promise<void> {
  const staging = path.join(path.dirname(to), `.devkit-${crypto.randomUUID()}`);
  await Bun.write(staging, Bun.file(from));
  await (await import('node:fs/promises')).rename(staging, to);
}

export async function main(argv: string[]): Promise<void> {
  const usage = [
    'bun tools/devkit/build.ts [options]',
    '',
    '  --source <dir>        retail media root (default: gameassets), holding usnf97/ and atf-gold/',
    '  --games <list>        default: every game found under --source',
    '  --extracted <dir>     conversion output root (default: extracted)',
    '  --install <dir>       app data root to install into (default: this platform\'s)',
    '  --no-install          convert only; install nothing',
    '  --aircraft <list>     default: f14,a4e,x31',
    '  --menu-game <game>    which game supplies menu art (default: usnf97)',
    '  --theater <name>      terrain theater (default: ukraine)',
    '  --dataset <dir>       install this built terrain folder instead of the default',
    '  --rebuild-terrain     run the full public elevation and imagery chain',
    '  --soundfont <file>    instrument bank for music (default: auto-detected)',
    '  --no-music            skip the render; music falls back to synthesized tones',
    '  --only <stages>       run only these stages',
    '  --skip <stages>       run everything except these',
    '  --overwrite           redo stages whose output already exists',
    '  --python <path>       Python 3.11+ (default: python3)',
    '  --dry-run             print the plan and exit',
    '  --list                describe the stages and exit',
    '',
    `  Stages: ${STAGES.join(', ')}`,
  ].join('\n');

  if (argv.includes('--help')) {
    console.log(usage);
    return;
  }
  if (argv.includes('--list')) {
    console.log('Dev kit stages, in order:\n');
    for (const stage of STAGES) console.log(`  ${stage.padEnd(9)} ${STAGE_SUMMARY[stage]}`);
    console.log('\nTerrain is built from public Copernicus elevation and Sentinel-2 imagery,');
    console.log('not from the discs. It is reused unless --rebuild-terrain is given.');
    return;
  }

  const source = flag(argv, '--source', 'gameassets');
  const resolvedSource = path.resolve(REPO, source);
  const requested = flag(argv, '--games', '');
  const discovered: Game[] = [];
  for (const name of GAMES) if (await isDirectory(path.join(resolvedSource, name))) discovered.push(name);
  const games = requested
    ? requested.split(',').map(part => game(part.trim()))
    : discovered;
  if (games.length === 0)
    throw new Error(
      `No retail media under ${resolvedSource}. Expected ${GAMES.join(' and/or ')} subfolders; pass --source <dir>.`,
    );

  const soundfont = argv.includes('--no-music')
    ? null
    : flag(argv, '--soundfont', '') || (await detectSoundfont());

  const options: Options = {
    source,
    extracted: flag(argv, '--extracted', 'extracted'),
    install: argv.includes('--no-install')
      ? null
      : flag(argv, '--install', defaultDataRoot(process.platform, homedir(), process.env.APPDATA)),
    games,
    aircraft: flag(argv, '--aircraft', DEFAULT_AIRCRAFT.join(','))
      .split(',')
      .map(part => part.trim())
      .filter(Boolean),
    menuGame: game(flag(argv, '--menu-game', 'usnf97')),
    theater: flag(argv, '--theater', 'ukraine'),
    dataset: flag(argv, '--dataset', '') || null,
    rebuildTerrain: argv.includes('--rebuild-terrain'),
    soundfont: soundfont || null,
    stages: selectStages(flag(argv, '--only', ''), flag(argv, '--skip', '')),
    python: flag(argv, '--python', 'python3'),
    overwrite: argv.includes('--overwrite'),
    dryRun: argv.includes('--dry-run'),
  };

  console.log(`Source:    ${resolvedSource}`);
  console.log(`Games:     ${options.games.join(', ')}`);
  console.log(`Install:   ${options.install ?? 'not requested'}`);
  console.log(`Stages:    ${options.stages.join(', ')}`);
  console.log(`Music:     ${options.soundfont ?? 'synthesized fallback (no bank selected)'}`);
  console.log('');

  const report = await build(options);
  if (options.dryRun) console.log(JSON.stringify(report.stages, null, 2));
}

/** Prefer an explicit bank; otherwise look where each platform keeps them. */
export async function detectSoundfont(): Promise<string> {
  const candidates = [
    path.join(homedir(), 'Library/Audio/Sounds/Banks/FluidR3_GM.sf2'),
    '/usr/share/sounds/sf2/FluidR3_GM.sf2',
    '/usr/share/soundfonts/FluidR3_GM.sf2',
    '/opt/homebrew/share/soundfonts/FluidR3_GM.sf2',
  ];
  for (const candidate of candidates) if (await Bun.file(candidate).exists()) return candidate;
  return '';
}

if (import.meta.main) {
  await main(process.argv.slice(2));
}
