/**
 * The shell boundary (brief section 4.2). Everything the engine needs from the host
 * lives behind this one interface. Nothing else in the engine may know which shell it
 * is running in. Implementations: `browser.ts` (Vite dev server) and `electron.ts`
 * (Electron preload bridge).
 */

/** Named filesystem roots. Paths passed to the fs API are always relative to one of these. */
export type FsRoot =
  /** Read-only assets shipped with the app (dev: `engine/public/dev-root`). */
  | 'assets'
  /** Per-user writable data: settings, imported retail assets, logs. */
  | 'appData'
  /** Disposable cache: terrain chunks, shader binaries. */
  | 'cache';

export const FS_ROOTS: readonly FsRoot[] = ['assets', 'appData', 'cache'];

export interface PlatformFs {
  readBytes(root: FsRoot, relPath: string): Promise<Uint8Array>;
  readText(root: FsRoot, relPath: string): Promise<string>;
  writeBytes(root: FsRoot, relPath: string, data: Uint8Array): Promise<void>;
  writeText(root: FsRoot, relPath: string, text: string): Promise<void>;
  exists(root: FsRoot, relPath: string): Promise<boolean>;
}

export interface PlatformPaths {
  /** Absolute path (or URL, in the browser) of a root. For display and diagnostics only. */
  rootPath(root: FsRoot): Promise<string>;
}

export interface PlatformWindow {
  setTitle(title: string): Promise<void>;
  setFullscreen(fullscreen: boolean): Promise<void>;
  toggleFullscreen(): Promise<boolean>;
  isFullscreen(): Promise<boolean>;
}

export type PowerSource = 'unknown' | 'ac' | 'battery';
export type ThermalState = 'unknown' | 'nominal' | 'fair' | 'serious' | 'critical';

export interface PowerState {
  readonly source: PowerSource;
  readonly thermal: ThermalState;
}

export type Unsubscribe = () => void;

export interface PlatformPower {
  current(): Promise<PowerState>;
  subscribe(listener: (state: PowerState) => void): Unsubscribe;
}

export interface PlatformDiagnostics {
  /** Hand a renderer probe result to the shell. Electron prints it in `--probe` mode. */
  reportProbe(result: unknown): Promise<void>;
}

export interface ShellDescription {
  readonly name: string;
  readonly version: string;
  readonly os: string;
  readonly arch: string;
  readonly capabilities: {
    readonly persistentWrites: boolean;
    readonly nativeWindow: boolean;
    readonly powerState: boolean;
  };
}

export interface Platform {
  /** Quit the desktop app; browser development requests closing its tab. */
  quit(): Promise<void>;
  readonly fs: PlatformFs;
  readonly paths: PlatformPaths;
  readonly window: PlatformWindow;
  readonly power: PlatformPower;
  readonly diagnostics: PlatformDiagnostics;
  describe(): ShellDescription;
}
