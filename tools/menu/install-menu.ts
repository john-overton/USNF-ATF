/** Install a validated local menu conversion; never bundle or commit the input. */
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { parseRetailMenu, parseRetailMenuSounds } from '../../engine/src/data/retail-menu';

const [screensSource, soundsSource, dataRoot] = process.argv.slice(2);
if (!screensSource || !soundsSource || !dataRoot)
  throw new Error(
    'Usage: bun tools/menu/install-menu.ts <screens.json> <sounds.json> <app-data-root>',
  );

async function read(source: string, limit: number): Promise<string> {
  const file = Bun.file(source);
  if (file.size > limit) throw new Error(`Import exceeds size limit: ${source}`);
  return file.text();
}

const screens = await read(screensSource, 32_000_000);
const sounds = await read(soundsSource, 8_000_000);
const bundle = parseRetailMenu(JSON.parse(screens));
parseRetailMenuSounds(JSON.parse(sounds));

// Validate both inputs before replacing either installed file.
const folder = path.resolve(dataRoot, 'menu');
await mkdir(folder, { recursive: true });
for (const [name, text] of [
  ['screens.json', screens],
  ['sounds.json', sounds],
] as const) {
  const temporary = path.join(folder, `.menu-${crypto.randomUUID()}.json`);
  try {
    await Bun.write(temporary, text);
    await rename(temporary, path.join(folder, name));
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`Installed ${bundle.source.game} menu: ${path.join(folder, name)}`);
}
