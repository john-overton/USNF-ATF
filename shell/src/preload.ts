/**
 * Preload bridge. Runs sandboxed; exposes exactly the ShellBridge contract from the
 * engine on window.usnfShell. `describe()` is synchronous so the engine can read it
 * during module init; everything else is async over ipcRenderer.invoke.
 */
import { contextBridge, ipcRenderer } from 'electron';

import type { ShellBridge } from '@usnf/engine/platform/bridge';
import type { PowerState, ShellDescription } from '@usnf/engine/platform/Platform';

import { IPC } from './ipc';

const description = ipcRenderer.sendSync(IPC.describe) as ShellDescription;

const bridge: ShellBridge = {
  describe: () => description,
  fsReadBytes: (root, p) => ipcRenderer.invoke(IPC.fsReadBytes, root, p) as Promise<Uint8Array>,
  fsReadText: (root, p) => ipcRenderer.invoke(IPC.fsReadText, root, p) as Promise<string>,
  fsWriteBytes: (root, p, data) =>
    ipcRenderer.invoke(IPC.fsWriteBytes, root, p, data) as Promise<void>,
  fsWriteText: (root, p, text) =>
    ipcRenderer.invoke(IPC.fsWriteText, root, p, text) as Promise<void>,
  fsExists: (root, p) => ipcRenderer.invoke(IPC.fsExists, root, p) as Promise<boolean>,
  rootPath: (root) => ipcRenderer.invoke(IPC.rootPath, root) as Promise<string>,
  windowSetTitle: (title) => ipcRenderer.invoke(IPC.windowSetTitle, title) as Promise<void>,
  windowSetFullscreen: (f) => ipcRenderer.invoke(IPC.windowSetFullscreen, f) as Promise<void>,
  windowToggleFullscreen: () => ipcRenderer.invoke(IPC.windowToggleFullscreen) as Promise<boolean>,
  windowIsFullscreen: () => ipcRenderer.invoke(IPC.windowIsFullscreen) as Promise<boolean>,
  powerCurrent: () => ipcRenderer.invoke(IPC.powerCurrent) as Promise<PowerState>,
  onPowerChange: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: PowerState) => listener(state);
    ipcRenderer.on(IPC.powerChanged, handler);
    return () => ipcRenderer.removeListener(IPC.powerChanged, handler);
  },
  reportProbe: (result) => ipcRenderer.invoke(IPC.reportProbe, result) as Promise<void>,
};

contextBridge.exposeInMainWorld('usnfShell', bridge);
