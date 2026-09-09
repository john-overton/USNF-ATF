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
Use `--query 'time=6.2&weather=broken&wind=gusty&clouds=half'` to set viewer
parameters such as the environment clock, weather, wind and cloud quality;
invalid values fail the load with the viewer's explicit error.
Use `--unlock-vsync` to drop `--disable-gpu-vsync --disable-frame-rate-limit`
into the launch. Every quality level holds the display's 60 Hz cap otherwise,
which hides the relative cost of an added pass. Numbers taken this way are a
relative GPU cost, not a user-visible frame rate, and must be labeled as such.
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
of every chunk before staging. It installs only the manifest, its referenced
chunks and optional checksum-validated RGBA imagery atlas under `terrains/<id>`. Existing targets require `--replace`; replacement
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

## Source-level transition flight

After rebuilding the renderer, use the real detail region to exercise a complete
30m → 100m → 30m source transition through normal altitude controls:

```sh
bun tools/terrain/smoke.ts \
  --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF \
  --terrain extracted/terrain/ukraine \
  --out extracted/terrain-transition-flight \
  --camera '470475,1293.3447265625,49725,3.141592653589793,-0.2' \
  --seconds 15 --transition-flight
```

The route holds E for four seconds, samples two more seconds while stationary,
then waits for confirmed completion of the new source level. It repeats with Q.
Each leg records six seconds of frame cadence, including its stationary tail;
per-frame `moving` and `rafFrameMs` fields distinguish the actual input interval. `transition-flight.json`
records per-frame diagnostics and each leg's mean/p95/p99 frame intervals.
Both legs must change source level, expose an active transition, and keep
terrain visible without errors or omitted water. These route assertions are
specific to the supplied camera and real Ukraine detail coverage.

Add `--capture-transitions` for a separate visual inspection run that writes
mid-transition screenshots with matching diagnostic snapshots. Screenshot
capture perturbs timing: its report explicitly marks those measurements and
must not be used as an untraced performance baseline.

`--trace-template <name-or-path>` selects an Instruments template when used
with `--trace-gpu`; the default remains `Metal System Trace`. Counter selection
must be verified from the exported trace, rather than inferred from its name.

The isolated benchmark also disables Chromium's occluded-window/background-timer
throttling using `--disable-backgrounding-occluded-windows` and
`--disable-background-timer-throttling`. This keeps ordinary shared-desktop
activity from intentionally pausing animation sampling; the report records these
flags. Normal application launch settings remain unchanged. The flag meanings
are documented by [Google's chrome-launcher](https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md#task-throttling).
Browser console errors (including Three.js shader failures) now fail the smoke
and are preserved in `runtime-errors.json`, even if geometric draw counters look
healthy.

Add `--lateral-transitions` alongside `--transition-flight` to replace the altitude
route with four-second Shift+W / Shift+S legs (6 km/s), crossing the sparse-detail
boundary and returning at the same altitude. The documented detail camera covers
about 24 km per leg and crosses a floating-origin boundary. Both directions
still must complete a source fade. CDP focus emulation keeps the isolated page
active during automated sampling.

## Repeated waypoint performance

After rebuilding, exercise the real product's map buttons and check recovery:

```sh
bun tools/terrain/waypoint-performance.ts --flight --retail --720p --assert-recovery --out extracted/terrain-waypoints-flight-final
bun tools/terrain/waypoint-performance.ts --assert-recovery --out extracted/terrain-waypoints-explorer-final
bun tools/terrain/water-query-benchmark.ts
```

The default binary is the packaged Mac arm64 app; `--binary` overrides it.
The terrain is `extracted/terrain/ukraine-polished`. `--retail` uses the local F-14,
audio and profile under `extracted/flight`; omit it for the original placeholder.
Omit `--flight` for explorer. Default route is mountains/coast/runway twice;
`--ids 2,3,1` selects a shorter route. Each stage records ten seconds of frame
intervals and diagnostics, including loading. `--assert-recovery` requires at
least 50 fps over the final roughly two seconds of every stage. This separates
cold loading stalls from lasting slowdowns. `--720p` repeats a final settled
measurement at 1280×720 after the 2560×1440 route.

A final five-second CPU profile is always recorded and is a separate profiled
stage. `--profile-jump` additionally profiles the first mountain jump; do not
compare profiled timings as uninstrumented performance. Raw stage data, summaries,
profiles and screenshots stay under the selected ignored output directory.
The water-query probe compares the original exact polygon classifier against the
new index on 600 locally supplied real-theater samples; it does not substitute
for actual Electron flight acceptance.

For a texture allocation experiment on the current 3071×3072 atlas, add
`--texture-4x` to `waypoint-performance.ts`. The CDP-only
`texture-allocation-probe.js` doubles both dimensions at the WebGL upload boundary
and retains an enlarged CPU buffer. It verifies exactly one atlas allocation and
upload, records actual dimensions/byte counts in `texture-allocation.json`, and
uses the same waypoint route. The product binary and installed data are unchanged.
This uses upscaled existing pixels: it measures rendering/allocation pressure,
not improved imagery, larger-file loading/decompression or importer support.
Renderer cache counters still describe the original atlas; use the separate
allocation report for experimental texture bytes. The probe also retains the
original source, so CPU retention is one original atlas larger than a native
6142×6144 implementation. The current production atlas limit remains 4096.
