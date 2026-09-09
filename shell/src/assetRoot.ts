import path from 'node:path';

/** Development reads source assets directly; production reads the bundled copy. */
export function assetsDirectory(appPath: string, development: boolean): string {
  return development
    ? path.resolve(appPath, '..', 'engine', 'public', 'dev-root')
    : path.join(appPath, 'dist', 'renderer', 'dev-root');
}
