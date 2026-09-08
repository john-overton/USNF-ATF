/**
 * `bun run dev:electron`: start the Vite dev server for the engine, bundle main + preload,
 * launch Electron pointed at the dev server. Renderer changes hot-reload via Vite;
 * changes under shell/src rebundle and restart Electron.
 */
import { watch } from 'node:fs';
import path from 'node:path';

import { bundleShell } from './bundle';
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

const vite = Bun.spawn(['bun', 'run', 'dev'], {
  cwd: ENGINE_DIR,
  stdout: 'inherit',
  stderr: 'inherit',
});
await waitForServer(DEV_URL);
await bundleShell();

let electron: ReturnType<typeof Bun.spawn> | undefined;
let stopping = false;

function launchElectron(): void {
  electron = Bun.spawn([electronBinary(), SHELL_DIR], {
    cwd: SHELL_DIR,
    env: { ...process.env, VITE_DEV_SERVER_URL: DEV_URL },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  void electron.exited.then((code) => {
    if (!stopping && code !== null) shutdown(code);
  });
}

function shutdown(code = 0): void {
  if (stopping) return;
  stopping = true;
  electron?.kill();
  vite.kill();
  process.exit(code);
}

let restartTimer: ReturnType<typeof setTimeout> | undefined;
watch(path.join(SHELL_DIR, 'src'), { recursive: true }, () => {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    void (async () => {
      console.log('[dev] shell/src changed; rebundling and restarting Electron');
      await bundleShell();
      if (electron) {
        const old = electron;
        electron = undefined;
        old.kill();
        await old.exited;
      }
      launchElectron();
    })();
  }, 150);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
launchElectron();
