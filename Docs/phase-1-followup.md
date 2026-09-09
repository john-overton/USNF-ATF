# Phase 1 development-loop follow-up — 2026-09-08

Source checkpoint: `fe08a61` (checks ran on its exact source before commit).
Machine: macOS Apple Silicon development box; Bun 1.4.2.
This closes the three confirmed shell/platform defects from the September 8 review.
Linux launch, Linux hardware rendering, and installer verification remain separate gates.

## Changes and evidence

- `shell/scripts/devChild.ts` retires the old Electron child before killing it.
  Only the current child may end the development session. `dev.ts` serializes
  rebuild/restart work, closes the watcher on shutdown, and cleans up startup
  failures. Vite uses a strict port to avoid quietly starting on a different URL.
- Development filesystem reads now use `engine/public/dev-root` directly through
  `shell/src/assetRoot.ts`; a missing or stale renderer build no longer affects
  development asset reads. Production continues to read its bundled asset folder.
- Browser asset writes reject with the same read-only error as Electron. Asset
  reads also ignore old localStorage overrides created by the former bug.
  appData and cache still support independent persistent development writes.
- `bun run probe --fresh` rebuilds current source and launches the unpackaged app.
  Existing default probe behavior is preserved. `--fresh` takes precedence over a
  previously packaged app; it does not rebuild installers.

## Verification

Commands, all exit 0 after the test lint fixes below:

```sh
bunx tsc -p shell/tsconfig.json
bunx eslint shell engine/src/platform --max-warnings 0
bun test shell/scripts/devChild.test.ts shell/src/assetRoot.test.ts engine/src/platform/browser.test.ts
git diff --check
```

Focused suite: **5 tests pass, 13 expectations**, no skips. Coverage includes two
intentional restarts followed by ordinary child exit, shutdown during a pending
restart, source asset edits with no renderer build, rejected browser asset writes,
legacy override bypass, and writable-root persistence across platform instances.
An initial lint run rejected `await` on Bun's non-Promise assertion typing and an
empty mock function; these test-only lint issues were corrected and the commands
above passed. No implementation failure was observed in the focused tests.

A live Electron development smoke also passed. Started with:

```sh
bun shell/scripts/dev.ts --remote-debugging-port=9223
```

A temporary Bun CDP client connected to the engine renderer using
`http://127.0.0.1:9223/json/list`, evaluated the preload bridge's `fsReadText` and
`rootPath`, and touched `shell/src/ipc.ts` twice. Observed:

1. Temporary `engine/public/dev-root/phase1-smoke.txt` read as `first source`.
2. Editing that source file to `edited source` was visible through preload IPC
   immediately, with no bundle rebuild.
3. Each of two shell touches rebuilt and restarted Electron; the client connected
   to each replacement renderer and read `edited source` again. Vite stayed alive.
4. The reported asset root was the checkout's `engine/public/dev-root`.

The temporary asset was deleted and the development session terminated. No retail
files were involved. The client was a temporary diagnostic, not committed tooling.
To reproduce without that client, start the command above, create the temporary
text file, and run in the engine window's DevTools console:

```js
await window.usnfShell.fsReadText('assets', 'phase1-smoke.txt')
await window.usnfShell.rootPath('assets')
```

Edit the file and read again. Run `touch shell/src/ipc.ts` from another terminal,
wait for the replacement window, and repeat twice. Remove the temporary file.
The debug port is optional and enabled only by explicitly passing that argument.

## Lessons and next verification

- Bun reports a signal-killed child with a numeric exit code (143 here). Exit
  codes alone cannot distinguish an intentional hot restart from a user exit;
  track ownership of the current child and retire it before killing it.
- Debouncing filesystem events does not serialize async rebuilds. The development
  loop now queues restart work so edits arriving during a rebuild cannot race to
  launch multiple Electron processes.
- A read-only contract applies to both new writes and previously persisted
  overrides. Rejecting new writes alone would leave stale browser assets active.
- Unit tests cannot establish that renderer-to-preload-to-main IPC works; the live
  development smoke covers that path in addition to isolated lifecycle tests.
- Next: root integration should run `bun run check`, `bun run probe --fresh`, and
  current-source macOS packaging/probe. Record Linux as pending until verified on
  the Linux GPU machine. These focused changes do not close that hardware gate.
