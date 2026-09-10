import { aircraftId, validateAircraftProfile } from '../../engine/src/flight/aircraft-catalog';
/** Install a validated local retail conversion; never bundle or commit the input. */
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { parseRetailCockpit } from '../../engine/src/flight/RetailCockpit';
import { parseRetailGun } from '../../engine/src/data/retail-gun';
import { parseRetailAircraft } from '../../engine/src/flight/RetailAircraft';
import { parseRetailFlightProfile } from '../../engine/src/data/retail-flight';
import { parseFlightSamples } from '../../engine/src/flight/FlightAudio';

const args = process.argv.slice(2);
const idIndex = args.indexOf('--id');
const id = aircraftId(idIndex < 0 ? null : (args[idIndex + 1] ?? ''));
if (idIndex >= 0) args.splice(idIndex, 2);
const optional: Record<string, string> = {};
for (const flag of ['--cockpit', '--gun']) {
  const index = args.indexOf(flag);
  if (index < 0) continue;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
  optional[flag] = value;
  args.splice(index, 2);
}
if (args.some(arg => arg.startsWith('--')) || args.length > 4) throw new Error('Unknown or repeated installer option');
const [source, dataRoot, audioSource, flightSource] = args;
if (!source || !dataRoot)
  throw new Error(
    'Usage: bun tools/flight/install-aircraft.ts extracted/flight/f14.json <app-data-root> [audio.json] [flight-profile.json] [--id f14|a4e|x31] [--cockpit cockpit.json] [--gun gun.json]',
  );
const files: { folder: string; name: string; text: string }[] = [];
async function read(source: string, limit: number): Promise<string> {
  const file = Bun.file(source);
  if (file.size > limit) throw new Error(`Import exceeds size limit: ${source}`);
  return file.text();
}
const text = await read(source, 64 * 1024 * 1024);
const data = parseRetailAircraft(JSON.parse(text));
files.push({ folder: 'aircraft', name: `${id}.json`, text });
if (audioSource) {
  const text = await read(audioSource, 16000000);
  parseFlightSamples(JSON.parse(text));
  files.push({ folder: 'audio', name: `${id}.json`, text });
}
if (flightSource) {
  const text = await read(flightSource, 1000000);
  validateAircraftProfile(id, parseRetailFlightProfile(JSON.parse(text)));
  files.push({ folder: 'aircraft', name: `${id}-flight.json`, text });
}
if (optional['--cockpit']) {
  const text = await read(optional['--cockpit'], 4_100_000);
  parseRetailCockpit(JSON.parse(text), id);
  files.push({ folder: 'cockpits', name: `${id}.json`, text });
}
if (optional['--gun']) {
  const text = await read(optional['--gun'], 8_000_000);
  const gun = parseRetailGun(JSON.parse(text));
  const sourceById = { f14: 'F14.PT', a4e: 'A4E.PT', x31: 'F31.PT' };
  if (gun.aircraftSource !== sourceById[id]) throw new Error('Gun aircraft identity mismatch');
  files.push({ folder: 'aircraft', name: `${id}-gun.json`, text });
}
// Validate all supplied inputs before replacing any installed file.
for (const file of files) {
  const folder = path.resolve(dataRoot, file.folder);
  await mkdir(folder, { recursive: true });
  const temporary = path.join(folder, `.${id}-${crypto.randomUUID()}.json`);
  try {
    await Bun.write(temporary, file.text);
    await rename(temporary, path.join(folder, file.name));
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`Installed ${data.name}: ${path.join(folder, file.name)}`);
}
