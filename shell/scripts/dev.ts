/**
 * `bun run dev:electron`: start the Vite dev server for the engine, bundle main + preload,
 * launch Electron pointed at the dev server. Renderer changes hot-reload via Vite;
 * changes under shell/src rebundle and restart Electron.
 */
import { watch } from 'node:fs';
import path from 'node:path';

import { bundleShell } from './bundle';
import { DevChild } from './devChild';
import { ENGINE_DIR, SHELL_DIR, electronBinary } from './paths';

const DEV_URL = 'http://localhost:5173';

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await Bun.sleep(200);
  }
  throw new Error(`Vite dev server did not answer at ${url}`);
}

let stopping = false;
let vite: ReturnType<typeof Bun.spawn> | undefined;
let watcher: ReturnType<typeof watch> | undefined;
let restartTimer: ReturnType<typeof setTimeout> | undefined;
const electron = new DevChild(shutdown);
let restartQueue = Promise.resolve();

function launchElectron(): void {
  electron.launch(() =>
    Bun.spawn([electronBinary(), SHELL_DIR, ...process.argv.slice(2)], {
      cwd: SHELL_DIR,
      env: { ...process.env, VITE_DEV_SERVER_URL: DEV_URL },
      stdout: 'inherit',
      stderr: 'inherit',
    }),
  );
}

function shutdown(code = 0): void {
  if (stopping) return;
  stopping = true;
  clearTimeout(restartTimer);
  watcher?.close();
  electron.stop();
  vite?.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  vite = Bun.spawn(['bun', 'run', 'dev', '--strictPort'], {
    cwd: ENGINE_DIR,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  void vite.exited.then((code) => shutdown(code));
  await waitForServer(DEV_URL);
  await bundleShell();
  watcher = watch(path.join(SHELL_DIR, 'src'), { recursive: true }, () => {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      restartQueue = restartQueue
        .then(async () => {
          if (stopping) return;
          console.log('[dev] shell/src changed; rebundling and restarting Electron');
          await bundleShell();
          await electron.retire();
          launchElectron();
        })
        .catch((error: unknown) => {
          console.error('[dev] shell rebuild failed:', error);
        });
    }, 150);
  });
  launchElectron();
} catch (error) {
  console.error('[dev] startup failed:', error);
  shutdown(1);
}
