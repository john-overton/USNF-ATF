# Phase 3 baseline: packaged terrain on Apple M3

## 2026-09-08: source fades and mesh transition polish

Current packaged source **`12851d8`**, including renderer commits `05d0ecd`,
`7442ac7` and shader correction `3f7a6b2`; build passed in **26.7 s** with Mac
arm64/x64 DMG and ZIP outputs. Actual launch/measurement is arm64 on Apple M3,
macOS 26.6.2, Electron 44.2.0 / Chromium 152, ANGLE Metal, 2560×1440 at scale 1.
Later smoke-tool/documentation HEADs do not change the packaged renderer.
The real Ukraine data is unchanged from the [phase 2 baseline](phase-2.md).

All runs use isolated profiles and synthetic input through normal camera
handlers. The harness suppresses physical input, disables background/occluded
window throttling, and emulates focus through CDP. This is an intentional
benchmark configuration, not the normal app's power/background behavior.
Source mesh selection and morph evaluation now run each frame; source data and
water selection remain at 200 ms. Source changes wait for complete coverage and
a 400 ms stable selection, then use an 800 ms complementary screen-door fade.

### Untraced warm cadence

One-second post-load warmup, 15-second stationary sample, then 1.5 seconds W.

| View | Mean FPS | Mean frame ms | p95 ms | p99 ms | Moving mean ms |
|---|---:|---:|---:|---:|---:|
| Crimean detail | 60.036 | 16.657 | 17.600 | 17.700 | 16.642 |
| Odesa coast | 60.014 | 16.663 | 17.500 | 17.700 | 16.640 |

Both passed without console errors, terrain errors, or omitted water. Compared
with the earlier log-depth baseline below, these short warm samples retain
approximately 60 fps; they do not establish a statistically agreed regression
margin or long-duration thermal performance.

### Moving source transitions

Each leg is four seconds of input plus two seconds stationary. Values below
include that stationary tail; per-frame `moving`/`rafFrameMs` fields permit
separate analysis. Every leg observed an active fade, completed the destination
source level, retained visible patches, and reported no error or omitted water.

| Route/leg | Source LOD | Mean ms | p95 ms | p99 ms | Maximum ms |
|---|---|---:|---:|---:|---:|
| Altitude/detail KeyE | 0 → 1 | 16.748 | 17.500 | 17.700 | 49.400 |
| Altitude/detail KeyQ | 1 → 0 | 16.641 | 17.400 | 17.600 | 17.700 |
| Fast lateral KeyW | 0 → 1 | 16.792 | 17.500 | 17.700 | 66.600 |
| Fast lateral KeyS | 1 → 0 | 16.657 | 17.600 | 17.800 | 17.800 |
| Altitude/coarse KeyE | 1 → 2 | 16.752 | 17.500 | 17.600 | 50.100 |
| Altitude/coarse KeyQ | 2 → 1 | 16.651 | 17.400 | 17.600 | 17.700 |

LOD 0/1/2 correspond to 30/100/300 m source spacing. Altitude/detail starts at
1293.345 m; altitude/coarse starts at 5000 m. Fast lateral holds Shift and covers
about 24.1 km each direction at 6 km/s, rebasing north origin 49152 → 73728 →
49152 m. Its peak geometry cache was 31,639,104 bytes, below the 96 MiB cap;
peak combined reported cache was 41,237,554 bytes. These estimates omit driver,
Electron and transient process memory. The 49–67 ms maximum frames are real
isolated stalls in the outward transition legs, despite p95 near 17.5 ms; do not
hide them behind the warm 60 fps average.

### Reproduce and inspect

Use the commands in [the smoke guide](../../tools/terrain/README.md). The exact
accepted ignored output directories are:

- `extracted/terrain-transition-detail-final-v2`: 15 s warm detail and altitude 0 ↔ 1.
- `extracted/terrain-polish-coast-final`: 15 s warm Odesa coast.
- `extracted/terrain-transition-lateral`: 3 s warmup sample, fast lateral 0 ↔ 1.
- `extracted/terrain-transition-coarse`: 3 s warmup sample, altitude 1 ↔ 2.
- `extracted/terrain-transition-captures`: separate visual run, timing perturbed by screenshots.

Detail/lateral camera: `470475,1293.3447265625,49725,3.141592653589793,-0.2`.
Coarse camera changes altitude to `5000`. Odesa camera:
`219144.16245100333,1800,267020.80352811713,-1.5707963267948966,-0.35`.

Mid-fade and settled screenshots were inspected independently. Land remains
continuous in the checked views. Stipple at differing silhouettes and lake
edges is visible during the fade and disappears after it. Thin dashed patch
edges and blocky 100 m shoreline geometry remain; this is improved transition
behavior, not a claim of seamless finished terrain. The Odesa sea retains the
prior broad-stripe depth fix. Captured diagnostics precede the screenshot by a
CDP round trip, and HUD updates only every 500 ms; fade percentages are nearby
samples, not exact pixel/frame synchronization.

### Verification and failed attempts

`bun run check`: **41 pass, 0 fail, 4580 expectations**, TypeScript/lint/format
clean. GPU tooling Python suite: **5 pass**. The separately excluded smoke tool
also passes an explicit Bun-types TypeScript check. Pipeline/retail code and
source data were unchanged; their previous test counts are historical.

- Review reproduced a 5.31 m split jump: CPU square distance and shader vertex
  distance disagreed. Sharing a per-patch metric fixes the threshold mismatch.
- Review reproduced an 8.96 m clipped-boundary jump: child coarse samples used
  vertices beyond the actual clipped parent. Parent triangle sampling now uses
  clipped endpoints and interpolates clamped tint as well as heights/normals.
- Early shader incorrectly assigned a vec3 to Three.js's vec4 `vColor`. The
  package reported triangles/draws but displayed only water. `3f7a6b2` assigns
  `vColor.rgb`; console errors now fail the smoke. Failed-land timing is invalid.
- The first descent assertion ran before source debounce began. The harness now
  waits for a completed destination fade and samples its stationary tail.
- An early sample's `frameMs` was overwritten by the diagnostic rolling mean;
  `rafFrameMs` now preserves actual intervals. Early failed-run timing is unused.
- Two pre-focus runs timed out awaiting CDP frame sampling. Background throttling
  was a plausible cause, not proven in a controlled A/B. Runs with isolated
  background/focus controls completed, including while captures were inspected.

### Native bandwidth and deferred gates

Final native hardware memory measurements are recorded in
[GPU trace notes](../gpu-trace-notes.md). Native external-memory counters are
separate from geometry upload estimates and the absent legacy `DRAM Bandwidth`
counter; they do not isolate physical DRAM traffic. WebGL2 exposes no live
bandwidth counter. Linux testing is **deferred by the user**;
it is not a blocker for current Mac development and has not been performed.
A live in-app native counter, an agreed regression margin, long thermal runs,
and remaining fine-edge/shoreline refinement are follow-up work.

## Previous log-depth baseline (`0407365`, retained as history)

Recorded 2026-09-08 local time (2026-09-09 UTC). Apple M3, macOS 26.6.2,
arm64, Electron 44.2.0 / Chromium 152. Hardware renderer: ANGLE Metal Apple M3.
Final renderer implementation `0407365` (logarithmic depth), including
`37119c5` water limits and `814369d` orientation diagnostics. Final Mac package
build passed in 23.7 s. Later documentation/tool commits in report HEAD fields
do not imply the app was rebuilt from those commits; no later renderer changes
are included in these measurements.

Dataset: real Copernicus DEM/WBM Ukraine artifact described by the
[phase 2 baseline](phase-2.md). Both runs use the packaged arm64 app, isolated
profiles, 2560×1440 drawing buffers at device scale 1, 1 s post-load warmup,
15 s stationary animation-frame sampling and ~1.5 s scripted forward flight.
Physical desktop pointer/keyboard events are suppressed only in the benchmark
page; synthetic key events exercise the normal camera handlers. The application
itself retains normal desktop input behavior.

### Reproduce

```sh
bun run build
bun tools/terrain/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --terrain extracted/terrain/ukraine --out extracted/terrain-smoke-ukraine-odesa-final --seconds 15 --camera '219144.16245100333,1800,267020.80352811713,-1.5707963267948966,-0.35'
bun tools/terrain/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --terrain extracted/terrain/ukraine --out extracted/terrain-smoke-ukraine-detail-final --seconds 15 --camera '470475,1293.3447265625,49725,3.141592653589793,-0.2'
```

Each output folder contains `report.json`, `terrain.png`, and `electron.log`,
all ignored. The screenshot after movement was inspected in both runs.

| Measurement | Odesa coast | Crimean 30 m detail |
|---|---:|---:|
| Mean FPS | 60.057 | 60.039 |
| Mean frame ms | 16.651 | 16.656 |
| p95 frame ms | 17.600 | 17.600 |
| p99 frame ms | 17.700 | 17.700 |
| Moving mean frame ms | 16.629 | 16.646 |
| Moving p95 frame ms | 17.600 | 17.400 |
| Movement meters | 1821.120 | 1820.040 |
| Source LOD | 1 | 0 |
| Chunks cached after movement | 4 | 17 |
| Triangles after movement | 49,356 | 63,047 |
| Draw calls after movement | 42 | 66 |
| CPU/geometry cache bytes after movement | 4,204,816 | 9,258,810 |
| Water cache bytes | 731,640 | 671,562 |
| Water batches omitted | 0 | 0 |

Both runs exited 0 with no uncaught runtime exceptions, no terrain errors,
no pending chunks at final capture, and no water omitted by budget. Fine detail
streaming grew from 13 to 17 cached chunks during the measured movement.
A previous controlled mountain run also verified an origin rebase at 65,536 m.

These are short warm samples, not a long-duration stress test or a promise of
60 fps everywhere. Cold shader compilation/initial allocation caused a ~499 ms
initial frame in the coast run; it is excluded from the warm cadence table and
remains a startup/streaming optimization opportunity. Cache numbers exclude
Electron/Chromium, parsed manifest/source arrays and other process memory.

### Visual findings and fixes

- Surface normals initially incorporated skirts, producing a beveled patch
  grid. Source-gradient surface normals fixed that visible defect.
- Ordinary shared-desktop input moved/rotated early benchmark cameras before
  scripted movement. Those early screenshots are not reproducible pose evidence;
  isolated input and explicit yaw/pitch diagnostics fixed the harness.
- Standard perspective depth produced severe horizontal green/blue sea stripes.
  `0407365` enables logarithmic depth after vertex morphing. The final Odesa
  screenshot removes the broad striping while maintaining the measured cadence.
  Fine edge artifacts and blocky 100 m shorelines still merit visual refinement.
- Low-detail terrain remains a flat tint without land-cover textures. Actual
  relief is visible in the fine-detail view; this is terrain-engine validation,
  not finished game art. Water holes retain dry islands.

Independent geometry audit decoded all 832 chunks and triangulated every water
component: 666 batches, 242,313 triangles, 8,913,414 bytes total geometry. Summed
triangulated water area agrees with input rings to about 5.8×10⁻⁹ relative
Float32 error. Runtime construction remains lazy, spatially selected and bounded
by a 16 MiB water cache; it does not instantiate the entire theater upfront.

### GPU bandwidth and formal exit gate

A native Metal System Trace attached to this app's GPU helper successfully
recorded/exported, but its default profile exposed only RT Unit Active and no
DRAM-bandwidth samples. **Bandwidth remains unavailable, not zero.** See
[gpu-trace-notes.md](../gpu-trace-notes.md) for evidence, counter scope, and the
custom-template step. This trace preceded the depth fix and is method validation,
not a final performance baseline. Uploaded geometry bytes are not DRAM traffic.

The local phase 3 deliverable works: free flight over installed real terrain in
the packaged app, measured at 1440p. Formal phase completion remains open for
Linux hardware performance, actual DRAM counter measurements, and an agreed
regression margin. Source LOD changes are still discrete between independently
sampled grids; mesh patches morph within a source level. Production transition
polish and longer flight/streaming tests remain follow-up work. No aircraft,
collision-aware camera, flight model, or gameplay is implied by this viewer.
