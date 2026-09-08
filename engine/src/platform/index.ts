import { getShellBridge } from './bridge';
import { createBrowserPlatform } from './browser';
import { createElectronPlatform } from './electron';
import type { Platform } from './Platform';

export type * from './Platform';

let instance: Platform | undefined;

/** The platform for this process: Electron when the preload bridge is present, else browser. */
export function getPlatform(): Platform {
  if (!instance) {
    const bridge = getShellBridge();
    instance = bridge ? createElectronPlatform(bridge) : createBrowserPlatform();
  }
  return instance;
}
