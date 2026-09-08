/**
 * `bun run probe`: run the Electron shell with `--probe` and print the renderer JSON.
 * Uses the packaged app under build/<platform>/ when one exists, otherwise the
 * unpackaged bundles in shell/dist (building them first if missing). Exit code follows
 * the shell: 0 hardware, 2 software fallback, 3 no probe result.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { buildUnpackaged } from './build';
import {
  MAIN_BUNDLE,
  PRELOAD_BUNDLE,
  RENDERER_DIST,
  SHELL_DIR,
  electronBinary,
  platformBuildDir,
} from './paths';

function findPackagedBinary(): string | undefined {
  const dir = platformBuildDir();
  if (!existsSync(dir)) return undefined;
  const candidates: string[] = [];
  if (process.platform === 'darwin') {
    const preferred = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
    for (const sub of [preferred, 'mac-arm64', 'mac']) {
      const app = path.join(dir, sub, 'USNF-ATF.app', 'Contents', 'MacOS', 'USNF-ATF');
      if (existsSync(app)) candidates.push(app);
    }
  } else if (process.platform === 'linux') {
    for (const sub of ['linux-unpacked', 'linux-arm64-unpacked']) {
      const bin = path.join(dir, sub, 'usnf-atf');
      if (existsSync(bin)) candidates.push(bin);
    }
  } else if (process.platform === 'win32') {
    const bin = path.join(dir, 'win-unpacked', 'USNF-ATF.exe');
    if (existsSync(bin)) candidates.push(bin);
  }
  return candidates[0];
}

const packaged = process.argv.includes('--unpackaged') ? undefined : findPackagedBinary();
let cmd: string[];
if (packaged) {
  console.error(`[probe] using packaged app: ${packaged}`);
  cmd = [packaged, '--probe'];
} else {
  if (!existsSync(MAIN_BUNDLE) || !existsSync(PRELOAD_BUNDLE) || !existsSync(RENDERER_DIST)) {
    console.error('[probe] no build found; building unpackaged shell');
    await buildUnpackaged();
  }
  console.error(`[probe] using unpackaged bundle: ${MAIN_BUNDLE}`);
  cmd = [electronBinary(), SHELL_DIR, '--probe'];
}

const proc = Bun.spawn(cmd, { cwd: SHELL_DIR, stdout: 'inherit', stderr: 'inherit' });
process.exit(await proc.exited);
