import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { assetsDirectory } from './assetRoot';

test('development assets work without a renderer build and immediately reflect source edits', async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'usnf-assets-'));
  try {
    const app = path.join(repo, 'shell');
    const source = path.join(repo, 'engine/public/dev-root');
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, 'hello.txt'), 'first');
    const asset = path.join(assetsDirectory(app, true), 'hello.txt');
    expect(await readFile(asset, 'utf8')).toBe('first');
    await writeFile(path.join(source, 'hello.txt'), 'second');
    expect(await readFile(asset, 'utf8')).toBe('second');
    expect(assetsDirectory(app, false)).toBe(path.join(app, 'dist/renderer/dev-root'));
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
