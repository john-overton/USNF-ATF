# Terrain desktop smoke

Runs the real Electron renderer through its local Chromium debugging endpoint.
The source theater is copied to an isolated temporary user profile, so the smoke
does not change normal app data. The profile is removed after the run.
Screenshots, metrics, and Electron logs go under ignored `extracted/` by default.

Build the app first, then run from the repository root:

```sh
bun run build
bun tools/terrain/smoke.ts \
  --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF \
  --terrain extracted/terrain/ukraine \
  --out extracted/terrain-smoke-ukraine \
  --seconds 15
```

For a freshly bundled unpackaged run:

```sh
bun run probe --fresh
bun tools/terrain/smoke.ts \
  --binary shell/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
  --app shell --terrain extracted/terrain-fixture \
  --out extracted/terrain-smoke-fixture
```

`--seconds` is 1–60 (default 15). The smoke requires a real graphical desktop.
It loads the theater, waits for terrain geometry, measures warm frame intervals,
presses W, asserts movement and a 2560×1440 drawing buffer, checks uncaught runtime
exceptions, and captures a screenshot. A successful run writes `report.json`,
`terrain.png`, and `electron.log`. It does not enforce a frame-rate threshold:
review mean and p95 alongside workload, hardware, and visual inspection.

Measurements distinguish animation-frame cadence from CPU render submission.
Geometry upload counters are estimates of created buffers, not GPU DRAM traffic.
Read the report's source commit and working-tree status; an existing app may
still have been built from older source. Rebuild for acceptance evidence.

A synthetic theater can be generated with the documented `terrain-pipeline`
fixture command. Synthetic results verify integration; real-theater acceptance
must use the real source build and clearly identify that provenance.

Use `--camera 'x,y,z,yaw,pitch'` to reproduce a viewpoint (local meters and
radians). Query values are validated and camera positions clamp to the theater.
The report includes moving-frame mean/p95, water cache size and omitted batches;
the smoke fails when selected water was omitted by its budget.

## Install a validated theater

The desktop app shows its app-data root in the terrain panel. On this Mac the
packaged app uses `~/Library/Application Support/usnf-atf/data`:

```sh
bun tools/terrain/install.ts \
  --terrain extracted/terrain/ukraine \
  --data-root "$HOME/Library/Application Support/usnf-atf/data"
```

The installer validates the runtime manifest, hash, inflated size and samples
of every chunk before staging. It installs only the manifest and its referenced
chunks under `terrains/<id>`. Existing targets require `--replace`; replacement
stages a complete verified copy before swapping directories, and restores the
previous theater if the swap fails. Unrelated data is preserved. Terrain here
means generated public elevation data, not the future retail-game importer.

`--trace-gpu` optionally records a native Metal System Trace on macOS using
installed Xcode. It attaches only to the launched app's descendant GPU helper,
uses `--no-prompt`, and records the trace exit/log in the report. Tracing changes
the workload; keep these results separate from untraced performance baselines.
The default template may record no DRAM bandwidth counter. Missing samples
mean unavailable, not zero bandwidth, and device counters may include other GPU
activity. Raw traces stay under `extracted/` because they contain local metadata.

Automated runs suppress physical keyboard/pointer input inside their isolated
page and dispatch synthetic W key events through the normal input handlers.
This prevents ordinary activity on the shared development Mac from changing
benchmark poses. It does not change normal application input behavior.
