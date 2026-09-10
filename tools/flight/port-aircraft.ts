/** Repeat a reviewed development aircraft import. Does not infer a rig or run native code. */
import { realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIRCRAFT, aircraftId, validateAircraftProfile, type AircraftId } from '../../engine/src/flight/aircraft-catalog';
import { parseRetailAircraft } from '../../engine/src/flight/RetailAircraft';
import { parseRetailFlightProfile } from '../../engine/src/data/retail-flight';
import { parseFlightSamples } from '../../engine/src/flight/FlightAudio';
import { parseRetailCockpit } from '../../engine/src/flight/RetailCockpit';
import { parseRetailGun } from '../../engine/src/data/retail-gun';
import { AIRCRAFT_RECIPES } from './aircraft-recipes';

const REPO = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
export function portCommands(id: AircraftId, sourceRoot: string, out: string, python: string): string[][] {
  const recipe = AIRCRAFT_RECIPES[id];
  const source = (relative: string) => path.resolve(sourceRoot, relative);
  return [
    [python, '-m', 'retail.sh_static', source(recipe.model), '--pal', source(recipe.palette), '--out', path.join(out, `${id}.json`), '--name', AIRCRAFT[id].name, `--${recipe.scale.axis}-metres`, String(recipe.scale.metres)],
    [python, '-m', 'retail.flight', '--pt', source(recipe.pt), '--out', path.join(out, `${id}-flight.json`)],
    [python, '-m', 'retail.audio', '--pt', source(recipe.pt), '--out', path.join(out, 'audio', `${id}.json`)],
    [python, '-m', 'retail.cockpit', '--aircraft', id, '--source-root', sourceRoot, '--out', path.join(out, 'cockpits', `${id}.json`)],
    [python, '-m', 'retail.gun', '--pt', source(recipe.pt), '--out', path.join(out, `${id}-gun.json`)],
  ];
}

export function summarizeModel(value: unknown) {
  const model = parseRetailAircraft(value);
  const parts = [model, ...(model.parts ?? [])];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  for (const part of parts) {
    triangles += part.positions.length / 9;
    part.positions.forEach((n, i) => { const axis = i % 3; min[axis] = Math.min(min[axis]!, n); max[axis] = Math.max(max[axis]!, n); });
  }
  return {
    name: model.name, triangles,
    dimensionsMetres: { span: max[0]! - min[0]!, height: max[1]! - min[1]!, length: max[2]! - min[2]! },
    bounds: { min, max },
    movingParts: parts.filter(p => p.rotationAxis).map(p => ({ name: p.name, pivot: p.pivot, axis: p.rotationAxis, parent: p.parent })),
    limitations: model.limitations,
  };
}

async function run(command: string[]): Promise<void> {
  // Argument arrays keep paths, ampersands and quotes out of shell interpretation.
  const child = Bun.spawn(command, { cwd: REPO, env: { ...process.env, PYTHONPATH: path.join(REPO, 'tools/retail') }, stdout: 'inherit', stderr: 'inherit' });
  if (await child.exited !== 0) throw new Error(`Failed command: ${JSON.stringify(command)}`);
}
async function sha256(file: string): Promise<string> {
  return createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex');
}
async function capture(command: string[]): Promise<string> {
  const process = Bun.spawn(command, { cwd: REPO, stdout: 'pipe', stderr: 'pipe' });
  const [out, error, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (code !== 0) throw new Error(error);
  return out.trim();
}

export async function main(args: string[]): Promise<void> {
  const usage = 'bun tools/flight/port-aircraft.ts --aircraft f14|a4e|x31 [--source-root extracted] [--python python3] [--dry-run] [--install <app-data-root>]';
  if (args.includes('--help') || args.includes('--list')) {
    console.log(usage);
    console.log(JSON.stringify(AIRCRAFT_RECIPES, null, 2));
    return;
  }
  const options: Record<string, string> = {};
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (key === '--dry-run') { dryRun = true; continue; }
    if (!['--aircraft', '--source-root', '--python', '--install'].includes(key) || options[key] !== undefined)
      throw new Error(`Unknown or repeated option ${key}. ${usage}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    options[key] = value;
  }
  if (!options['--aircraft']) throw new Error(usage);
  const id = aircraftId(options['--aircraft']);
  const recipe = AIRCRAFT_RECIPES[id];
  const sourceRoot = path.resolve(REPO, options['--source-root'] ?? 'extracted');
  const python = options['--python'] ?? 'python3';
  const outputRoot = path.join(REPO, 'extracted/aircraft-ports', id);
  const output = path.join(outputRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`);
  const commands = portCommands(id, sourceRoot, output, python);
  if (dryRun) {
    console.log(JSON.stringify({ aircraft: id, recipe, commands, output, install: options['--install'] ?? null, acceptance: 'Conversion only; visual/runtime/native acceptance remains separate.' }, null, 2));
    return;
  }
  // Keep generated retail bytes inside this checkout's ignored extracted tree.
  // Reject redirected output directories rather than following a symlink into tracked files.
  for (const folder of [path.join(REPO, 'extracted'), path.dirname(outputRoot), outputRoot]) {
    await mkdir(folder, { recursive: true });
    if (await realpath(folder) !== folder) throw new Error(`Output directory must not be redirected: ${folder}`);
  }
  for (const file of [recipe.model, recipe.palette, recipe.pt])
    if (!(await Bun.file(path.resolve(sourceRoot, file)).exists())) throw new Error(`Missing local source: ${path.resolve(sourceRoot, file)}`);
  const staging = await mkdtemp(path.join(outputRoot, '.pending-'));
  let published = false;
  try {
    const executedCommands = portCommands(id, sourceRoot, staging, python);
    for (const command of executedCommands) await run(command);
    const modelFile = path.join(staging, `${id}.json`);
    const profileFile = path.join(staging, `${id}-flight.json`);
    const audioFile = path.join(staging, 'audio', `${id}.json`);
    const cockpitFile = path.join(staging, 'cockpits', `${id}.json`);
    const gunFile = path.join(staging, `${id}-gun.json`);
    const cockpit = parseRetailCockpit(await Bun.file(cockpitFile).json(), id);
    const gun = parseRetailGun(await Bun.file(gunFile).json());
    if (gun.aircraftSource !== path.basename(recipe.pt)) throw new Error('Gun aircraft identity mismatch');
    const model = summarizeModel(await Bun.file(modelFile).json());
    if (model.name !== AIRCRAFT[id].name) throw new Error('Model identity mismatch');
    const profile = parseRetailFlightProfile(await Bun.file(profileFile).json());
    validateAircraftProfile(id, profile);
    parseFlightSamples(await Bun.file(audioFile).json());
    const measured = recipe.scale.axis === 'length' ? model.dimensionsMetres.length : model.dimensionsMetres.span;
    if (Math.abs(measured - recipe.scale.metres) > 1e-6) throw new Error('Export does not match the chosen scale reference');
    const report = {
      schemaVersion: 1, date: new Date().toISOString(), aircraft: id,
      sourceCommit: await capture(['git', 'rev-parse', 'HEAD']), workingTreeStatus: await capture(['git', 'status', '--short']),
      machine: { platform: process.platform, architecture: process.arch, bun: Bun.version, pythonCommand: python, pythonVersion: await capture([python, '--version']) },
      recipe, executedCommands, reproductionCommands: commands, model,
      sourceSha256: { model: await sha256(path.resolve(sourceRoot, recipe.model)), palette: await sha256(path.resolve(sourceRoot, recipe.palette)), pt: await sha256(path.resolve(sourceRoot, recipe.pt)) },
      flight: { source: profile.source, name: profile.name, emptyMassKg: profile.emptyMassKg, fuelCapacityKg: profile.fuelCapacityKg, militaryThrustN: profile.militaryThrustN, maximumThrustN: profile.afterburnerThrustN, gRows: profile.envelopes.map(e => e.g), nativeDataPresent: !!profile.native },
      cockpit: { label: cockpit.label, width: cockpit.width, height: cockpit.height },
      gun: { name: gun.name, aircraftSource: gun.aircraftSource, capacity: gun.capacity },
      outputSha256: { model: await sha256(modelFile), profile: await sha256(profileFile), audio: await sha256(audioFile), cockpit: await sha256(cockpitFile), gun: await sha256(gunFile) },
      acceptance: { conversion: 'validated', visual: 'pending', runtime: 'pending', nativeParity: 'not established by this helper' },
      installation: { status: options['--install'] ? 'pending' : 'not requested', dataRoot: options['--install'] ? path.resolve(options['--install']) : null },
    };
    await Bun.write(path.join(staging, 'port-report.json'), JSON.stringify(report, null, 2) + '\n');
    await rename(staging, output);
    published = true;
    if (options['--install']) {
      try {
        await run([process.execPath, path.join(REPO, 'tools/flight/install-aircraft.ts'), path.join(output, `${id}.json`), path.resolve(options['--install']), path.join(output, 'audio', `${id}.json`), path.join(output, `${id}-flight.json`), '--id', id, '--cockpit', path.join(output, 'cockpits', `${id}.json`), '--gun', path.join(output, `${id}-gun.json`)]);
        report.installation.status = 'installed';
      } catch (error) {
        report.installation.status = 'failed; inspect installer output';
        throw error;
      } finally {
        await Bun.write(path.join(output, 'port-report.json'), JSON.stringify(report, null, 2) + '\n');
      }
    }
    console.log(`Validated aircraft bundle: ${output}\nReview: ${path.join(output, 'port-report.json')}\nVisual and flight acceptance are still required; see Docs/aircraft-porting.md.`);
  } finally {
    if (!published) await rm(staging, { recursive: true, force: true });
  }
}
if (import.meta.main) await main(process.argv.slice(2));
