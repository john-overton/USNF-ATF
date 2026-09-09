# Phase 3 baseline: packaged terrain on Apple M3

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

## Reproduce

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

## Visual findings and fixes

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

## GPU bandwidth and formal exit gate

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
