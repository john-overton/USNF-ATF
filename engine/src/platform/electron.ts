/**
 * Platform implementation over the Electron preload bridge (`window.usnfShell`).
 * No 'electron' import here: the engine only sees the typed bridge object.
 */
import type { Platform } from './Platform';
import { type ShellBridge } from './bridge';

export function createElectronPlatform(bridge: ShellBridge): Platform {
  const description = bridge.describe();
  return {
    fs: {
      readBytes: (root, p) => bridge.fsReadBytes(root, p),
      readText: (root, p) => bridge.fsReadText(root, p),
      writeBytes: (root, p, data) => bridge.fsWriteBytes(root, p, data),
      writeText: (root, p, text) => bridge.fsWriteText(root, p, text),
      exists: (root, p) => bridge.fsExists(root, p),
    },
    paths: {
      rootPath: (root) => bridge.rootPath(root),
    },
    window: {
      setTitle: (title) => bridge.windowSetTitle(title),
      setFullscreen: (fullscreen) => bridge.windowSetFullscreen(fullscreen),
      toggleFullscreen: () => bridge.windowToggleFullscreen(),
      isFullscreen: () => bridge.windowIsFullscreen(),
    },
    power: {
      current: () => bridge.powerCurrent(),
      subscribe: (listener) => bridge.onPowerChange(listener),
    },
    diagnostics: {
      reportProbe: (result) => bridge.reportProbe(result),
    },
    describe: () => description,
  };
}
