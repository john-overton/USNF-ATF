/**
 * `bun run build`: production Vite build of the engine, copy it into shell/dist/renderer,
 * bundle main + preload, then electron-builder for the current platform only, writing
 * everything under <repo>/build/<platform>/.
 */
import { cp, rm } from 'node:fs/promises';

import { bundleShell } from './bundle';
import { ENGINE_DIR, ENGINE_DIST, RENDERER_DIST, SHELL_DIR, platformBuildDir } from './paths';

async function run(cmd: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'inherit', stderr: 'inherit', stdin: 'inherit' });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${cmd.join(' ')} exited with ${code}`);
}

export async function buildUnpackaged(): Promise<void> {
  await run(['bun', 'run', 'build'], ENGINE_DIR);
  await rm(RENDERER_DIST, { recursive: true, force: true });
  await cp(ENGINE_DIST, RENDERER_DIST, { recursive: true });
  await bundleShell();
}

export async function buildPackaged(): Promise<void> {
  await buildUnpackaged();
  const platformFlag =
    process.platform === 'darwin' ? '--mac' : process.platform === 'win32' ? '--win' : '--linux';
  await run(
    ['bunx', 'electron-builder', platformFlag, `--config.directories.output=${platformBuildDir()}`],
    SHELL_DIR,
  );
}

if (import.meta.main) {
  const started = performance.now();
  await buildPackaged();
  console.log(
    `build finished in ${((performance.now() - started) / 1000).toFixed(1)} s -> ${platformBuildDir()}`,
  );
}
