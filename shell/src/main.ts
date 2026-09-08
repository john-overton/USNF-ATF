/**
 * Electron main process. Owns the filesystem roots, window, and power state, and
 * answers the preload bridge over IPC. `--probe` launches the renderer, waits for the
 * engine's WebGL2 probe result, prints it as JSON to stdout, and exits:
 *   0  hardware renderer
 *   2  renderer string looks like a software fallback
 *   3  probe did not arrive (renderer error or timeout)
 */
import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  FS_ROOTS,
  type FsRoot,
  type PowerState,
  type ShellDescription,
} from '@usnf/engine/platform/Platform';
import { looksLikeSoftwareRenderer } from '@usnf/engine/render/glProbe';

import { IPC } from './ipc';

const PROBE_MODE = process.argv.includes('--probe');
const PROBE_TIMEOUT_MS = 30_000;
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// Bun's bundler bakes `__dirname` to the source path, so locate dist/ from the app path
// instead: shell/ when unpackaged (`electron <shell dir>`), app.asar when packaged.
const DIST_DIR = path.join(app.getAppPath(), 'dist');

// ---------- filesystem roots ----------

function rootDir(root: FsRoot): string {
  switch (root) {
    case 'assets':
      return path.join(DIST_DIR, 'renderer', 'dev-root');
    case 'appData':
      return path.join(app.getPath('userData'), 'data');
    case 'cache':
      return path.join(app.getPath('userData'), 'cache');
  }
}

function resolveInRoot(root: unknown, relPath: unknown): string {
  if (typeof root !== 'string' || !(FS_ROOTS as readonly string[]).includes(root)) {
    throw new Error(`unknown fs root: ${String(root)}`);
  }
  if (typeof relPath !== 'string') throw new Error('path must be a string');
  const base = rootDir(root as FsRoot);
  const full = path.resolve(base, relPath);
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error(`path escapes root ${root}: ${relPath}`);
  }
  return full;
}

async function writeUnderRoot(
  root: unknown,
  relPath: unknown,
  data: Uint8Array | string,
): Promise<void> {
  if (root === 'assets') throw new Error('assets root is read-only');
  const full = resolveInRoot(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

// ---------- power / thermal ----------

function thermalFromElectron(state: string): PowerState['thermal'] {
  switch (state) {
    case 'nominal':
    case 'fair':
    case 'serious':
    case 'critical':
      return state;
    default:
      return 'unknown';
  }
}

function currentPowerState(): PowerState {
  let thermal: PowerState['thermal'] = 'unknown';
  try {
    // getCurrentThermalState exists on macOS only in Electron's typings; guard at runtime.
    const pm = powerMonitor as unknown as { getCurrentThermalState?: () => string };
    if (typeof pm.getCurrentThermalState === 'function')
      thermal = thermalFromElectron(pm.getCurrentThermalState());
  } catch {
    thermal = 'unknown';
  }
  return { source: powerMonitor.isOnBatteryPower() ? 'battery' : 'ac', thermal };
}

function broadcastPower(): void {
  const state = currentPowerState();
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.powerChanged, state);
}

// ---------- description ----------

function describe(): ShellDescription {
  return {
    name: 'electron',
    version: `${app.getVersion()} (electron ${process.versions.electron}, chrome ${process.versions.chrome})`,
    os: process.platform,
    arch: process.arch,
    capabilities: { persistentWrites: true, nativeWindow: true, powerState: true },
  };
}

// ---------- IPC ----------

function registerIpc(onProbe: (result: unknown) => void): void {
  ipcMain.on(IPC.describe, (event) => {
    event.returnValue = describe();
  });
  ipcMain.handle(
    IPC.fsReadBytes,
    async (_e, root, p) => new Uint8Array(await readFile(resolveInRoot(root, p))),
  );
  ipcMain.handle(IPC.fsReadText, (_e, root, p) => readFile(resolveInRoot(root, p), 'utf8'));
  ipcMain.handle(IPC.fsWriteBytes, (_e, root, p, data: Uint8Array) =>
    writeUnderRoot(root, p, data),
  );
  ipcMain.handle(IPC.fsWriteText, (_e, root, p, text: string) => writeUnderRoot(root, p, text));
  ipcMain.handle(IPC.fsExists, async (_e, root, p) => {
    try {
      await stat(resolveInRoot(root, p));
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle(IPC.rootPath, (_e, root) => resolveInRoot(root, '.'));
  ipcMain.handle(IPC.windowSetTitle, (e, title: string) =>
    BrowserWindow.fromWebContents(e.sender)?.setTitle(title),
  );
  ipcMain.handle(IPC.windowSetFullscreen, (e, f: boolean) =>
    BrowserWindow.fromWebContents(e.sender)?.setFullScreen(f),
  );
  ipcMain.handle(IPC.windowToggleFullscreen, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return false;
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    return next;
  });
  ipcMain.handle(
    IPC.windowIsFullscreen,
    (e) => BrowserWindow.fromWebContents(e.sender)?.isFullScreen() ?? false,
  );
  ipcMain.handle(IPC.powerCurrent, () => currentPowerState());
  ipcMain.handle(IPC.reportProbe, (_e, result: unknown) => {
    onProbe(result);
  });

  powerMonitor.on('on-ac', broadcastPower);
  powerMonitor.on('on-battery', broadcastPower);
  powerMonitor.on('thermal-state-change', broadcastPower);
}

// ---------- window ----------

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'USNF-ATF',
    backgroundColor: '#07090d',
    show: !PROBE_MODE,
    webPreferences: {
      preload: path.join(DIST_DIR, 'preload', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL);
    if (!PROBE_MODE) win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(path.join(DIST_DIR, 'renderer', 'index.html'));
  }
  return win;
}

// ---------- lifecycle ----------

let probeDone = false;

function finishProbe(payload: unknown, code: number): void {
  if (probeDone) return;
  probeDone = true;
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  app.exit(code);
}

function probeExitCode(result: unknown): number {
  const r = result as { renderer?: unknown; vendor?: unknown } | null;
  if (!r || typeof r.renderer !== 'string') return 3;
  const vendor = typeof r.vendor === 'string' ? r.vendor : '';
  return looksLikeSoftwareRenderer(r.renderer, vendor) ? 2 : 0;
}

function onProbe(result: unknown): void {
  if (!PROBE_MODE) return;
  finishProbe({ shell: describe(), probe: result }, probeExitCode(result));
}

if (PROBE_MODE) {
  // Give Chromium no reason to pick a fallback; a real GPU or nothing.
  app.commandLine.appendSwitch('disable-software-rasterizer');
}

void app.whenReady().then(() => {
  registerIpc(onProbe);
  createWindow();
  if (PROBE_MODE) {
    setTimeout(() => {
      finishProbe({ shell: describe(), probe: null, error: 'probe timeout' }, 3);
    }, PROBE_TIMEOUT_MS).unref();
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || PROBE_MODE) app.quit();
});
