/**
 * Convert the local retail menu media into one validated bundle, and optionally
 * install it. Mirrors `tools/flight/port-aircraft.ts`, and for the same reason:
 * the discs stay on the user's machine, the conversion is reproducible and
 * attributed, and nothing reaches the engine that the engine has not validated.
 *
 * Usage:
 *   bun tools/menu/port-menu.ts [--source-root extracted] [--game usnf97]
 *                               [--python python3] [--dry-run]
 *                               [--install <app-data-root>]
 */
import { realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRetailMenu, parseRetailMenuSounds } from '../../engine/src/data/retail-menu';

const REPO = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const GAMES = ['usnf97', 'atf-gold'] as const;
type Game = (typeof GAMES)[number];

export function portCommand(game: Game, sourceRoot: string, out: string, python: string): string[] {
  return [python, '-m', 'retail.menu', '--source-root', sourceRoot, '--game', game, '--out', out];
}

async function run(command: string[]): Promise<void> {
  // Argument arrays keep paths, ampersands and quotes out of shell interpretation:
  // the retail menu samples are literally named `&CLICK.11K`.
  const child = Bun.spawn(command, {
    cwd: REPO,
    env: { ...process.env, PYTHONPATH: path.join(REPO, 'tools/retail') },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if ((await child.exited) !== 0) throw new Error(`Failed command: ${JSON.stringify(command)}`);
}

async function capture(command: string[]): Promise<string> {
  const child = Bun.spawn(command, { cwd: REPO, stdout: 'pipe', stderr: 'pipe' });
  const [out, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(error);
  return out.trim();
}

async function sha256(file: string): Promise<string> {
  return createHash('sha256')
    .update(new Uint8Array(await Bun.file(file).arrayBuffer()))
    .digest('hex');
}

export async function main(args: string[]): Promise<void> {
  const usage =
    'bun tools/menu/port-menu.ts [--source-root extracted] [--game usnf97|atf-gold] [--python python3] [--dry-run] [--install <app-data-root>]';
  if (args.includes('--help')) {
    console.log(usage);
    return;
  }
  const options: Record<string, string> = {};
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (key === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (!['--source-root', '--game', '--python', '--install'].includes(key) || options[key])
      throw new Error(`Unknown or repeated option ${key}. ${usage}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    options[key] = value;
  }
  const game = (options['--game'] ?? 'usnf97') as Game;
  if (!GAMES.includes(game)) throw new Error(`Unknown game ${game}. ${usage}`);
  const sourceRoot = path.resolve(REPO, options['--source-root'] ?? 'extracted');
  const python = options['--python'] ?? 'python3';
  const outputRoot = path.join(REPO, 'extracted/menu-ports', game);
  const output = path.join(
    outputRoot,
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`,
  );
  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          game,
          command: portCommand(game, sourceRoot, output, python),
          output,
          install: options['--install'] ?? null,
          acceptance: 'Conversion only; how the menu looks with the bundle is a separate check.',
        },
        null,
        2,
      ),
    );
    return;
  }
  // Keep converted retail bytes inside this checkout's ignored extracted tree, and
  // refuse a redirected output directory rather than follow a symlink into tracked files.
  for (const folder of [path.join(REPO, 'extracted'), path.dirname(outputRoot), outputRoot]) {
    await mkdir(folder, { recursive: true });
    if ((await realpath(folder)) !== folder)
      throw new Error(`Output directory must not be redirected: ${folder}`);
  }
  const staging = await mkdtemp(path.join(outputRoot, '.pending-'));
  let published = false;
  try {
    await run(portCommand(game, sourceRoot, staging, python));
    const screensFile = path.join(staging, 'screens.json');
    const soundsFile = path.join(staging, 'sounds.json');
    const bundle = parseRetailMenu(await Bun.file(screensFile).json());
    const sounds = parseRetailMenuSounds(await Bun.file(soundsFile).json());
    if (bundle.source.game !== game || sounds.source.game !== game)
      throw new Error('Bundle does not identify the game it was converted from');
    const main = bundle.screens['main-menu'];
    if (!main) throw new Error('The bundle has no main menu screen');
    // The one thing worth asserting about the layout: it is the recovered rect,
    // not a redrawn one. See Docs/formats/mnu.md.
    if (main.rect.width !== 238 || main.rect.height !== 361)
      throw new Error(`Unexpected main menu rect ${JSON.stringify(main.rect)}`);
    const labelled = main.widgets.filter((widget) => widget.label).length;
    if (labelled < 8) throw new Error(`Main menu has only ${labelled} labelled widgets`);
    const report = {
      schemaVersion: 1,
      date: new Date().toISOString(),
      game,
      sourceCommit: await capture(['git', 'rev-parse', 'HEAD']),
      workingTreeStatus: await capture(['git', 'status', '--short']),
      machine: {
        platform: process.platform,
        architecture: process.arch,
        bun: Bun.version,
        pythonCommand: python,
        pythonVersion: await capture([python, '--version']),
      },
      command: portCommand(game, sourceRoot, output, python),
      screens: Object.entries(bundle.screens).map(([id, screen]) => ({
        id,
        source: screen.source,
        rect: screen.rect,
        widgets: screen.widgets.length,
        labelled: screen.widgets.filter((widget) => widget.label).length,
        background: screen.background
          ? `${screen.background.source} ${screen.background.width}x${screen.background.height}`
          : null,
      })),
      sprites: Object.fromEntries(
        Object.entries(bundle.sprites).map(([id, states]) => [
          id,
          states.map((entry) => entry.state),
        ]),
      ),
      sounds: Object.fromEntries(
        Object.entries(sounds.sounds).map(([id, clip]) => [
          id,
          { source: clip?.source, sampleRate: clip?.sampleRate, samples: clip?.pcm.length },
        ]),
      ),
      sourceSha256: bundle.source.sha256,
      outputSha256: { screens: await sha256(screensFile), sounds: await sha256(soundsFile) },
      limitations: bundle.limitations,
      acceptance: {
        conversion: 'validated',
        visual: 'pending',
        audio: 'pending',
      },
      installation: {
        status: options['--install'] ? 'pending' : 'not requested',
        dataRoot: options['--install'] ? path.resolve(options['--install']) : null,
      },
    };
    await Bun.write(path.join(staging, 'port-report.json'), JSON.stringify(report, null, 2) + '\n');
    await rename(staging, output);
    published = true;
    if (options['--install']) {
      try {
        await run([
          process.execPath,
          path.join(REPO, 'tools/menu/install-menu.ts'),
          path.join(output, 'screens.json'),
          path.join(output, 'sounds.json'),
          path.resolve(options['--install']),
        ]);
        report.installation.status = 'installed';
      } catch (error) {
        report.installation.status = 'failed; inspect installer output';
        throw error;
      } finally {
        await Bun.write(
          path.join(output, 'port-report.json'),
          JSON.stringify(report, null, 2) + '\n',
        );
      }
    }
    console.log(
      `Validated menu bundle: ${output}\nReview: ${path.join(output, 'port-report.json')}\n` +
        'How it looks and sounds in the app is a separate check; see Docs/menu-porting.md.',
    );
  } finally {
    if (!published) await rm(staging, { recursive: true, force: true });
  }
}

if (import.meta.main) await main(process.argv.slice(2));
