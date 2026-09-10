/**
 * Shape of the object the Electron preload script exposes as `window.usnfShell`.
 * Shared between the preload (producer) and `electron.ts` (consumer) so both sides are
 * typed against the same contract. This file must not import from 'electron'.
 */
import type { FsRoot, PowerState, ShellDescription } from './Platform';

export interface ShellBridge {
  quit(): Promise<void>;
  describe(): ShellDescription;
  fsReadBytes(root: FsRoot, relPath: string): Promise<Uint8Array>;
  fsReadText(root: FsRoot, relPath: string): Promise<string>;
  fsWriteBytes(root: FsRoot, relPath: string, data: Uint8Array): Promise<void>;
  fsWriteText(root: FsRoot, relPath: string, text: string): Promise<void>;
  fsExists(root: FsRoot, relPath: string): Promise<boolean>;
  rootPath(root: FsRoot): Promise<string>;
  windowSetTitle(title: string): Promise<void>;
  windowSetFullscreen(fullscreen: boolean): Promise<void>;
  windowToggleFullscreen(): Promise<boolean>;
  windowIsFullscreen(): Promise<boolean>;
  powerCurrent(): Promise<PowerState>;
  /** Returns an unsubscribe function. */
  onPowerChange(listener: (state: PowerState) => void): () => void;
  reportProbe(result: unknown): Promise<void>;
}

export const SHELL_BRIDGE_KEY = 'usnfShell';

declare global {
  interface Window {
    usnfShell?: ShellBridge;
  }
}

export function getShellBridge(): ShellBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.usnfShell;
}
