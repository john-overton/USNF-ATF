import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installTerrain } from './install';

async function fixture(run: (source: string, data: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'usnf-install-test-'));
  try {
    const source = path.join(root, 'source'),
      data = path.join(root, 'appData');
    await mkdir(path.join(source, 'chunks'), { recursive: true });
    const bytes = Bun.gzipSync(new Uint8Array(131072));
    await writeFile(path.join(source, 'chunks', '0.gz'), bytes);
    await writeFile(path.join(source, 'unreferenced.txt'), 'must not install');
    await writeFile(
      path.join(source, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'synthetic',
        name: 'Original synthetic fixture',
        projection: { crs: 'EPSG:32636', originX: 0, originY: 0 },
        extents: { width: 25500, height: 25500 },
        lods: [1],
        source: 'synthetic',
        attribution: ['Original test fixture'],
        waterBodies: [],
        chunks: [
          {
            lod: 1,
            x: 0,
            y: 0,
            path: 'chunks/0.gz',
            spacing: 100,
            size: 256,
            originX: 0,
            originZ: 0,
            offset: 0,
            scale: 0.001,
            minElevation: 0,
            maxElevation: 0,
            byteLength: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          },
        ],
      }),
    );
    await run(source, data);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function failure(operation: Promise<unknown>, text: string) {
  await operation.then(
    () => {
      throw new Error('Expected installation failure');
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(text);
    },
  );
}

test('installs only validated manifest and referenced chunks; preserves unrelated user files', async () => {
  await fixture(async (source, data) => {
    await mkdir(data);
    await writeFile(path.join(data, 'settings.json'), 'keep');
    const target = await installTerrain(source, data);
    expect(target).toBe(path.join(data, 'terrains/synthetic'));
    expect((await readdir(target)).sort()).toEqual(['chunks', 'manifest.json']);
    expect(await readFile(path.join(target, 'chunks/0.gz'))).toEqual(
      await readFile(path.join(source, 'chunks/0.gz')),
    );
    expect(await readFile(path.join(data, 'settings.json'), 'utf8')).toBe('keep');
    expect(await readdir(path.join(data, 'terrains'))).toEqual(['synthetic']);
  });
});

test('corrupt source rejects before creating the data root', async () => {
  await fixture(async (source, data) => {
    const chunk = path.join(source, 'chunks/0.gz');
    const bytes = await readFile(chunk);
    bytes[0] ^= 255;
    await writeFile(chunk, bytes);
    await failure(installTerrain(source, data), 'checksum');
    expect(await Bun.file(path.join(data, 'terrains/synthetic/manifest.json')).exists()).toBe(
      false,
    );
    expect(await readdir(path.dirname(data))).toEqual(['source']);
  });
});

test('requires explicit replace and a corrupt replacement preserves existing theater', async () => {
  await fixture(async (source, data) => {
    const target = await installTerrain(source, data);
    await writeFile(path.join(target, 'old-only.txt'), 'old');
    await failure(installTerrain(source, data), 'already exists');
    await installTerrain(source, data, true);
    expect(await Bun.file(path.join(target, 'old-only.txt')).exists()).toBe(false);
    const original = await readFile(path.join(target, 'chunks/0.gz'));
    await writeFile(path.join(source, 'chunks/0.gz'), 'invalid');
    await failure(installTerrain(source, data, true), 'length');
    expect(await readFile(path.join(target, 'chunks/0.gz'))).toEqual(original);
    expect(await readdir(path.join(data, 'terrains'))).toEqual(['synthetic']);
  });
});

test('rejects source symlinks outside the terrain folder without changing user data', async () => {
  await fixture(async (source, data) => {
    const chunk = path.join(source, 'chunks/0.gz');
    const outside = path.join(path.dirname(source), 'outside.gz');
    await writeFile(outside, await readFile(chunk));
    await rm(chunk);
    await symlink(outside, chunk);
    await failure(installTerrain(source, data), 'escapes terrain folder');
    expect(await Bun.file(path.join(data, 'terrains/synthetic/manifest.json')).exists()).toBe(
      false,
    );
  });
});
