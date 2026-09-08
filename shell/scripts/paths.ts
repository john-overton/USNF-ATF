import path from 'node:path';

export const SHELL_DIR = path.resolve(import.meta.dir, '..');
export const REPO_DIR = path.resolve(SHELL_DIR, '..');
export const ENGINE_DIR = path.join(REPO_DIR, 'engine');
export const ENGINE_DIST = path.join(ENGINE_DIR, 'dist');
export const SHELL_DIST = path.join(SHELL_DIR, 'dist');
export const RENDERER_DIST = path.join(SHELL_DIST, 'renderer');
export const MAIN_BUNDLE = path.join(SHELL_DIST, 'main', 'main.cjs');
export const PRELOAD_BUNDLE = path.join(SHELL_DIST, 'preload', 'preload.cjs');
export const BUILD_DIR = path.join(REPO_DIR, 'build');

/** build/<platform>/ for the current OS: mac, win, linux. */
export function platformBuildDir(): string {
  const name =
    process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
  return path.join(BUILD_DIR, name);
}

/** Path to the electron binary from the workspace install. */
export function electronBinary(): string {
  // The electron package exports the binary path as its default export (CommonJS).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('electron') as string;
}
