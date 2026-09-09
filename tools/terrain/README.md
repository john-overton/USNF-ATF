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
