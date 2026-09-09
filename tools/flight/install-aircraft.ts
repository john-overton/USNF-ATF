/** Install a validated local retail conversion; never bundle or commit the input. */
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { parseRetailAircraft } from '../../engine/src/flight/RetailAircraft';

const [source, dataRoot] = process.argv.slice(2);
if (!source || !dataRoot)
  throw new Error(
    'Usage: bun tools/flight/install-aircraft.ts extracted/flight/f14.json <app-data-root>',
  );
const input = Bun.file(source);
if (input.size > 64 * 1024 * 1024) throw new Error('Aircraft import exceeds 64 MiB');
const text = await input.text();
const data = parseRetailAircraft(JSON.parse(text));
const folder = path.resolve(dataRoot, 'aircraft');
await mkdir(folder, { recursive: true });
const temporary = path.join(folder, `.f14-${crypto.randomUUID()}.json`);
try {
  await Bun.write(temporary, text);
  await rename(temporary, path.join(folder, 'f14.json'));
} finally {
  await rm(temporary, { force: true });
}
console.log(`Installed ${data.name}: ${path.join(folder, 'f14.json')}`);
