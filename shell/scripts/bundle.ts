/**
 * Bundle the main process and preload script with Bun's bundler into CommonJS files that
 * Electron can load directly. `electron` stays external; everything else (including the
 * engine's shared platform types/helpers) is inlined.
 */
import path from 'node:path';

import { MAIN_BUNDLE, PRELOAD_BUNDLE, SHELL_DIR } from './paths';

export async function bundleShell(): Promise<void> {
  const targets: { entry: string; out: string }[] = [
    { entry: path.join(SHELL_DIR, 'src', 'main.ts'), out: MAIN_BUNDLE },
    { entry: path.join(SHELL_DIR, 'src', 'preload.ts'), out: PRELOAD_BUNDLE },
  ];
  for (const t of targets) {
    const result = await Bun.build({
      entrypoints: [t.entry],
      outdir: path.dirname(t.out),
      naming: path.basename(t.out),
      target: 'node',
      format: 'cjs',
      external: ['electron'],
      sourcemap: 'linked',
      minify: false,
    });
    if (!result.success) {
      for (const log of result.logs) console.error(log);
      throw new Error(`bundle failed: ${t.entry}`);
    }
  }
}

if (import.meta.main) {
  await bundleShell();
  console.log('shell bundles written to dist/main and dist/preload');
}
