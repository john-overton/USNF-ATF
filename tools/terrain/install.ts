/** Validate and atomically stage a public terrain dataset into an explicit Platform appData root. */
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { decodeChunk, decodeTerrainBytes } from '../../engine/src/terrain/chunk';
import { parseManifest } from '../../engine/src/terrain/manifest';

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function installTerrain(
  terrain: string,
  dataRoot: string,
  replace = false,
): Promise<string> {
  const source = await realpath(terrain);
  async function sourceBytes(relative: string): Promise<Buffer> {
    const resolved = await realpath(path.join(source, relative));
    if (!resolved.startsWith(source + path.sep))
      throw new Error(`Source path escapes terrain folder: ${relative}`);
    return readFile(resolved);
  }
  const manifestBytes = await sourceBytes('manifest.json');
  const manifest = parseManifest(manifestBytes.toString('utf8'));
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(manifest.id))
    throw new Error('Terrain id must be a safe basename');
  for (const chunk of manifest.chunks) {
    if (chunk.path === 'manifest.json' || chunk.path.startsWith('manifest.json/'))
      throw new Error('Chunk path conflicts with manifest');
    await decodeChunk(await sourceBytes(chunk.path), chunk);
  }
  if (manifest.imagery) {
    const image = manifest.imagery;
    await decodeTerrainBytes(await sourceBytes(image.path), image, image.width * image.height * 4);
  }
  // All source content passes the same transport checks used by the renderer before destination changes.
  const parent = path.resolve(dataRoot, 'terrains');
  await mkdir(parent, { recursive: true });
  if (!(await lstat(parent)).isDirectory())
    throw new Error('Terrain destination must be a real directory');
  const target = path.join(parent, manifest.id);
  const lock = path.join(parent, `.${manifest.id}.install-lock`);
  await mkdir(lock); // Concurrent installers must not race a target replacement.
  let staging: string | undefined;
  let backup: string | undefined;
  let oldMoved = false;
  try {
    if (await exists(target)) {
      if (!replace)
        throw new Error('Terrain target already exists; pass --replace to replace this theater');
      if (!(await lstat(target)).isDirectory())
        throw new Error('Existing terrain target must be a real directory');
    }
    staging = await mkdtemp(path.join(parent, `.${manifest.id}.install-`));
    await writeFile(path.join(staging, 'manifest.json'), manifestBytes);
    for (const chunk of manifest.chunks) {
      const bytes = await sourceBytes(chunk.path);
      // Revalidate the bytes actually written: source files may have changed since the first pass.
      await decodeChunk(bytes, chunk);
      const destination = path.join(staging, chunk.path);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }
    if (manifest.imagery) {
      const image = manifest.imagery, bytes = await sourceBytes(image.path);
      await decodeTerrainBytes(bytes, image, image.width * image.height * 4);
      const destination = path.join(staging, image.path);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }
    if (await exists(target)) {
      if (!replace) throw new Error('Terrain target appeared during staging; refusing replacement');
      if (!(await lstat(target)).isDirectory())
        throw new Error('Existing terrain target must be a real directory');
      backup = await mkdtemp(path.join(parent, `.${manifest.id}.backup-`));
      await rename(target, path.join(backup, 'previous'));
      oldMoved = true;
    }
    try {
      await rename(staging, target);
      staging = undefined;
    } catch (error) {
      if (oldMoved && backup) {
        try {
          await rename(path.join(backup, 'previous'), target);
          oldMoved = false;
        } catch (restoreError) {
          throw new AggregateError(
            [error, restoreError],
            `Install and restore failed; previous terrain preserved at ${backup}`,
          );
        }
      }
      throw error;
    }
    if (backup) {
      await rm(backup, { recursive: true });
      backup = undefined;
      oldMoved = false;
    }
    return target;
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
    // A failed restore leaves its backup intact for recovery.
    if (backup && !oldMoved) await rm(backup, { recursive: true, force: true });
    await rm(lock, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        terrain: { type: 'string' },
        'data-root': { type: 'string' },
        replace: { type: 'boolean', default: false },
      },
      strict: true,
      allowPositionals: false,
    });
    if (!values.terrain || !values['data-root'])
      throw new Error(
        'Usage: bun tools/terrain/install.ts --terrain <folder> --data-root <Platform appData root> [--replace]',
      );
    const target = await installTerrain(values.terrain, values['data-root'], values.replace);
    console.log(`Installed verified terrain: ${target}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
