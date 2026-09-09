# Phase 3 baseline: packaged terrain on Apple M3

## 2026-09-09: installed higher-detail imagery

Source tested: **9658fd8**, Apple M3 arm64/macOS 26.6.2, Bun 1.4.2,
Node 22.14.0, Python 3.14.6, Three.js 0.185.1, Electron 44.2.0.
This documentation-only follow-up records results from that committed product.

Fetched a real 6144×6144 geographic EOX Sentinel-2 2024 mosaic as four
3072×3072 requests after the single larger request returned HTTP 400. Reprojection
produces 6142×6144 RGBA, 91.3922×91.3862 m/pixel, exactly four times the old atlas's
pixel count. Compressed atlas: 82,195,217 bytes; SHA-256
`1ca5a4961d16c56f7504989b27b4391a359997aa93384b402b0074027bb7c5a0`.
Mosaic source SHA-256 `b391d4f6e456eb037676ab6fceadb1357db17006471fb31e3746e7b61fb9ad48`.
Request URLs, per-tile checksums/bounds and source attribution are recorded in
`extracted/terrain-source/imagery/eox-2024-mosaic-ad1ddf0b44e8cbf0.json`.
The EOX attribution/license remain attached and displayed in the app.

```sh
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline imagery extracted/terrain/ukraine-4x/manifest.json --cache extracted/terrain-source/imagery --size 6144
bun run check
PYTHONPATH=terrain-pipeline .venv/bin/python -m unittest discover -s terrain-pipeline/tests
bun run build
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline probe extracted/terrain/ukraine-4x/manifest.json
bun tools/terrain/install.ts --terrain extracted/terrain/ukraine-4x --data-root "$HOME/Library/Application Support/usnf-atf/data" --replace
bun tools/terrain/waypoint-performance.ts --terrain extracted/terrain/ukraine-4x --flight --retail --720p --assert-recovery --out extracted/terrain-4x-accepted
```

Bun: 135 tests / 22,099 expectations, typecheck/lint/format pass. Python: 16 tests,
no failures or skips; existing rasterio/Affine warnings only. New synthetic tests
cover geographic tile orientation/coverage and the expanded runtime dimension cap.
Dataset probe passes all 832 chunks; max shared-edge error remains 0.02106996 m.
Direct manifest comparisons confirm all chunk metadata and water polygons are
identical to the earlier polished dataset. The installer verifies all checksums and
inflated lengths before replacing the app-data theater. Installed path:
`~/Library/Application Support/usnf-atf/data/terrains/ukraine`.
Original lower-detail dataset remains in `extracted/terrain/ukraine-polished`.
No imagery or retail bytes are committed or packaged.

Mac arm64/x64 packaging passed in 28.3 seconds; only arm64 is launch-tested.
Linux remains deferred. This actual-source run supersedes the allocation-only
experiment for rendering acceptance; startup download/decode timing remains outside
the waypoint harness's measurement window. The runtime keeps the complete atlas
resident: ~144 MiB CPU pixels plus ~192 MiB calculated GPU mip allocation.

Actual-texture flight results: six jumps averaged 59.84/59.84/60.18/60.10/60.14/
60.15 fps at 1440p. Final two-second windows were 59.97–60.02 fps; first mountain/
coast peak frames were 49.1/49.9 ms, repeat mountain 33.3 ms and other repeats
17.8 ms. Final 720p averaged 60.10 fps. Every stage ended ready, with zero pending
or omitted water batches and no runtime errors. The initial post-ready sample
included a 66.3 ms frame; this is not a promise of stall-free startup. The final
720p flight screenshot was inspected: imagery loads and registration remains
continuous; close ground still looks soft at this regional texture scale.

Coastal explorer command:
```sh
bun tools/terrain/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --terrain extracted/terrain/ukraine-4x --out extracted/terrain-4x-coast --camera '219144.16245100333,1800,267020.80352811713,-1.5707963267948966,-0.35' --seconds 10
```
Observed 60.034 mean fps / 17.6 ms p95 at 1440p, no runtime errors. Inspected
`terrain.png`: imagery is present, no dashed ocean artifacts or broad missing
panels; raster-scale coastline steps remain visible as previously documented.
`git diff --check` and staged-file inspection pass. Source/assets are separated:
only code, synthetic tests and documentation are committed.


## 2026-09-09: four-times-texture-pixels allocation experiment

Same Apple M3, toolchain and corrected packaged binary as the waypoint entry below.
User asked about texture resolution, not terrain vertices. Scope is four times the
texel count: 3071×3072 → 6142×6144, doubling each axis. Actual higher-resolution
georeferenced imagery would improve approximately 183 m/pixel to 92 m/pixel.

```sh
bun tools/terrain/waypoint-performance.ts --flight --retail --720p --texture-4x --assert-recovery --out extracted/terrain-texture-4x
```

This is a CDP-injected WebGL allocation/sampling experiment on the unchanged
product binary and original atlas. It expands existing pixels, allocates and
uploads exactly one larger texture with a full mip chain, and retains its CPU
buffer. It is not a visual-detail comparison or larger-source download/decompression
benchmark. The production 4096 dimension cap remains unchanged. Startup pixel
expansion took 30 ms; this synthetic copy is not a production loading measurement.
Renderer cache diagnostics retain original atlas accounting, so experimental bytes
come from the separate `texture-allocation.json`, not those aggregate counters.

| Atlas storage | Current | Four-times pixels |
|---|---:|---:|
| RGBA CPU buffer | 35.99 MiB | 143.95 MiB |
| GPU texture including mipmaps (calculated allocation) | 47.98 MiB | 191.93 MiB |
| Combined expected CPU + GPU allocation | 83.96 MiB | 335.88 MiB |

These are logical allocations, not physical Metal residency measurements. The
experiment additionally retains the original 35.99 MiB source; a native larger
DataTexture would not need that extra copy. Hardware MAX_TEXTURE_SIZE was 16384.
The atlas is resident across jumps; only its initial upload grows, not the ground
vertex count or draw calls. More detailed source pixels could have different cache
behavior; actual higher-resolution dataset loading and appearance remain untested.

Binary source is the waypoint snapshot below. Experiment source copies/checksums
live in `extracted/terrain-texture-4x/source/`: waypoint-performance.ts SHA-256
`43d0381a205b9c8c60f0ce629d288fc30874821902b5df6e5de8b234e7251a7b`,
texture-allocation-probe.js SHA-256
`793e8534a75ad4a7d8fe66e6d78258607453adc4fe390b718bc889bfd00ab156`.
The earlier source map preserves the version used for normal waypoint acceptance.

Observed: six jumps averaged 59.86/59.89/60.12/60.17/60.16/60.12 fps at 1440p;
final two-second windows were 59.99–60.02 fps. First mountain/coast peak frames
were 50.0/50.0 ms, versus 50.9/48.9 ms with the normal atlas. Repeat jumps peaked
at 17.7 ms. Final 720p averaged 60.17 fps. All stages ended ready with zero pending
water, no runtime errors and passing recovery assertions. Within this 60 Hz test,
there was no measurable sustained frame-rate loss or accumulated degradation.
No uncapped GPU headroom claim follows from a vsync-limited result.

Next step for actual sharper imagery is an isolated higher-resolution source build,
with a larger validated atlas budget or tiled textures, followed by startup and
visual checks. This experiment does not change installed terrain or product limits.


## 2026-09-09: waypoint slowdown correction

Machine/toolchain: Apple M3 arm64, macOS 26.6.2 (25G83), Bun 1.4.2,
Node 22.14.0, Three.js 0.185.1, Electron 44.2.0 / Chromium 152.0.7977.76.
Scope: packaged Mac arm64, polished Ukraine terrain, 2560×1440 and a final
1280×720 sample. x64 packaging is not an x64 launch test; Linux is deferred.

Source: uncommitted working tree based on
`4e3f22667a31e3c1dae575ccc8d4e89a76974eaa`. Changed source/test bytes and tracked
patch are preserved under `extracted/terrain-waypoints-source/`; source-files.json
SHA-256 is `af800cc989a21242ec282858a48b3beb3307f9874594fcff43cc11137bc96f32`.
Copies use `.txt` suffixes so Bun does not rediscover copied tests. Documentation
was written after testing and is not claimed to be part of the measured binary.

Reproduction and diagnosis:

- Before: six flight jumps mountain/coast/runway twice averaged
  13.39/11.82/60.18/12.87/9.87/60.17 fps. Last-frame CPU at mountain/coast was
  65–114 ms; the first mountain jump's longest frame was 715.8 ms. Explorer
  recovered to ~60 fps, so earlier explorer-only acceptance missed this regression.
- A ten-second mountain CPU profile spent 7.323 seconds in full-ring `inRing`.
  The new scanline index preserves exact crossing and hole semantics, with at
  most eight references per edge and 256 buckets per ring. It does not simplify
  collision coastlines or change assisted physics / the fixed 120 Hz simulation.
- Real-theater benchmark: all 600 sampled classifications agree with the old
  classifier. For 200 queries, mountain 74.77→2.28 ms; coast 60.20→0.585 ms;
  runway 0.617→0.121 ms. Index construction took 17.59 ms in Bun. These are
  CPU microbenchmarks, not frame-rate predictions.
- Indexing recovered frame rate but a cold jump still blocked ~383 ms. A separate
  imported-F14 profile identified ~340 ms of Earcut triangulation in that first
  second. Geometry now builds in one worker, with four outstanding jobs maximum,
  stale-result disposal, explicit errors and readiness until live water arrives.
- Review caught an underestimate for polygons with holes: ten vertices/two holes
  estimated 360 bytes but require 384 with uint32 indices. Selection now reserves
  `36N + 24H` bytes and the worker retains uint16 indices where possible, preventing
  selected geometry from evicting itself and rebuilding at the cache limit.
- Unchanged settled seam graphs skip recalculation and uploads; moving morphs and
  ownership easing still update. Independent review passed 105,107 deterministic
  indexed/reference polygon comparisons and found no further worker lifecycle defect.

Commands and artifacts:

```sh
bun tools/terrain/waypoint-performance.ts --flight --out extracted/terrain-waypoints-flight-before
bun tools/terrain/waypoint-performance.ts --flight --ids 2 --profile-jump --out extracted/terrain-waypoints-flight-profile-before
bun tools/terrain/water-query-benchmark.ts > extracted/terrain-waypoints-water-query.json
bun run check
bun run build
bun tools/terrain/waypoint-performance.ts --flight --retail --720p --assert-recovery --out extracted/terrain-waypoints-flight-accepted
bun tools/terrain/waypoint-performance.ts --ids 2,3,1 --assert-recovery --out extracted/terrain-waypoints-explorer-final
```

The first two commands were run against the earlier polish binary, before rebuilding.
Each waypoint is clicked through the product UI and measured for ten seconds;
recovery assertions require at least 50 fps over the final two seconds. Timing starts
after the click returns; it includes subsequent loading but is not a measurement of
synchronous click-handler latency. Before flight used the placeholder aircraft;
after flight additionally loads the local F-14 model/profile/audio, retaining the
preserved assisted model. Audio context was locked in automation; this is not audio
playback acceptance. Raw per-frame records, summaries, CPU profiles and final
screenshots live in the respective ignored output directories.

Verification: `bun run check` passes 135 tests / 22,098 expectations, including exact
water-query parity, boundary cases, idle seam uploads, bounded/stale worker jobs,
disposal, explicit errors and hole budget regression. An earlier check discovered
copied test sources in the prior ignored polish snapshot; those copies were renamed
`.ts.txt`. Intermediate typecheck/lint failures (attribute version access and a
non-type-only import) were corrected before the passing check. An automation poll
initially treated false as ready; the script was corrected before recorded runs.
No Python producer changed in this correction; prior pipeline acceptance stands.

Final packaged flight: six jumps averaged 59.85/59.89/60.18/60.16/60.14/60.15 fps;
all final two-second windows were 59.97–60.03 fps. First mountain/coast maximum
frames were 50.9/48.9 ms; repeat jumps peaked at 17.8 ms. The final 720p sample
averaged 60.14 fps. Every stage ended ready with zero pending/omitted water batches
and runtime-errors.json was empty. Mac packaging passed in 26.7 seconds.
These results establish recovery, not zero loading stalls or performance on other
hardware. A separate explorer run also passed the recovery assertions; settled
stationary seam uploads were zero. Next reproducible step is the same repeated-jump
command on the user's session; restart the rebuilt app to load this code.



## 2026-09-09: satellite paint, shared edges, coastline and FXAA acceptance

Machine: Apple M3 / arm64, macOS 26.6.2 (25G83), Bun 1.4.2, Node 22.14.0,
Python 3.14.6, Three.js 0.185.1, Electron 44.2.0 / Chromium 152.0.7977.76.
Hardware probe: ANGLE Metal Renderer Apple M3; WebGL2, not software rendering.
Scope: fresh Mac arm64 packaged renderer with real Ukraine DEM/WBM and optional
EOX 2024 imagery. Linux remains deferred. x64 DMG/ZIP built, no x64 launch claim.

Source: **uncommitted working tree based on
`4e3f22667a31e3c1dae575ccc8d4e89a76974eaa`**, not the unchanged base commit.
`extracted/terrain-polish-source/source-files.json` records every changed code/test
file checksum. Its canonical source-file-map SHA-256 is
`aaf6bb009de2a154439bd4ed6a766e35ff315f34bfb79d7547cc3d8fd76314e4`.
The same folder preserves changed source files and the tracked patch. Reports
record the base commit plus working-tree status. Documentation added afterward
is not claimed to have existed during the binary runs.

Final commands (all from repository root):

```sh
bun run check
PYTHONPATH=terrain-pipeline .venv/bin/python -m unittest discover -s terrain-pipeline/tests
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline probe extracted/terrain/ukraine-polished/manifest.json
bun run build
bun tools/terrain/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --terrain extracted/terrain/ukraine-polished --out extracted/terrain-polish-odesa-accepted --camera '219144.16245100333,1800,267020.80352811713,-1.5707963267948966,-0.35' --seconds 10
bun tools/terrain/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --terrain extracted/terrain/ukraine-polished --out extracted/terrain-polish-detail-accepted --camera '470475,1293.3447265625,49725,3.141592653589793,-0.2' --seconds 10 --transition-flight
bun tools/terrain/install.ts --terrain extracted/terrain/ukraine-polished --data-root "$HOME/Library/Application Support/usnf-atf/data" --replace
```

`bun run check`: 128 tests, 9186 expectations, all pass; strict typecheck, lint,
format all pass. Python: 15 tests, no failures or skips, including locally supplied
Copernicus shared-border queries. Only rasterio/Affine deprecation warnings.
Probe: 832 chunks, no checksum/coverage/edge failures; details in phase 2 baseline.
Installer passes and installs the polished Ukraine theater to the displayed app
root. `git diff --check` passes; staged diff is empty. No push or commit.

| Final packaged run | Mean fps | p95 frame ms | Moving mean / p95 ms | Final cache estimate |
|---|---:|---:|---:|---:|
| Odesa |60.0196|18.5|16.5659 /18.5|155745244 bytes|
| Mountain/detail |60.0550|18.5|16.7633 /18.6|174892752 bytes|

Both use 2560×1440 with zero runtime errors and zero omitted water batches.
The detail route completes 0→1→0. Unperturbed six-second ascent/descent stages:
mean 16.7855/16.6476 ms, p95 18.6/18.5ms, p99 18.7/18.7ms. Timings include the
stationary tail as documented by the harness. Final CPU submission samples were
4.3 ms coast / 6.1 ms detail; these single samples are not CPU percentiles.
Dynamic edge upload estimates were about 41.9/58.3 MB/s at final samples. This
includes work that the prior geometry-created-only estimate omitted. Cache now
includes CPU atlas pixels, estimated GPU mipmaps and approximately 59 MB of
post-process targets. These estimates are not native GPU memory/DRAM counters.

Visual inspection: accepted coast and detail `terrain.png` screenshots show
registered, smoothly filtered low-resolution terrain paint and no broad missing
panels. The ocean's former dashed triangle lines are absent, and sky/fog colors
match again. Coast corners are softened conservatively; the original 100 m mask
shape is still apparent. This is not photogrammetric coast reconstruction.
Earlier `terrain-polish-detail-final/transition-*.png` captures inspected the
same terrain/seam implementation before the background-color-only correction;
those captures perturb timing and are not used for final transition performance.
The existing screen-door source fade and coarse silhouette changes remain limits.
Coarsening can still lose fine boundary curvature, and fallback height tint is
not a shared color field. No assertion that every near-ground camera path is
perfectly seamless. Prior 1↔2/24km lateral evidence below predates this polish.

Observed failures/corrections, retained rather than counted as passes:

- Initial seam graph review found a 3.376860 m ownership pop; regression and 250 ms
  retained-edge easing added before accepted runs.
- Initial imagery screenshot used DataTexture nearest magnification. Explicit
  linear magnification fixes its pixel blocks.
- Odesa MSAA/log-depth run retained water dashes; the controlled `odesa-no-msaa`
  screenshot removed them. Final pipeline uses FXAA with MSAA disabled.
- Two-pass coast polygons written as indented JSON exceeded the 32 MiB runtime
  guard; the smoke correctly failed. Compact producer output is 12,277,911 bytes
  and passes the unchanged guard.
- First FXAA screenshot showed a bright background/hard fog horizon. A scene-owned
  background fixes RenderPass's clear-color-space interaction; final accepted
  screenshots were inspected after rebuilding.
- Full-check lint caught invalid awaited Bun assertion typings and an untyped
  FXAA resolution uniform call. Both corrected; final full check passes.

Next reproducible step: open the rebuilt Mac app with the installed theater,
select coast/mountain waypoints, and assess near-ground motion visually. The
higher-resolution imagery/detail-streaming decision remains separate from this
bounded regional atlas. Linux remains deferred and Windows phase 9 remains planned.


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
clean. GPU tooling Python suite: **6 pass**. The separately excluded smoke tool
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
[GPU trace notes](../gpu-trace-notes.md). Native exported units are GB/s; means
are weighted over recorded intervals, not wall-time averages or app-exclusive
physical DRAM measurements. Both recordings selected Performance Limiters,
kept the default GPU performance state, and attached to this app's GPU helper.

| View | GPU read GB/s | GPU write GB/s | GPU total GB/s | Samples per counter | Summed sample seconds | Timestamp span seconds |
|---|---:|---:|---:|---:|---:|---:|
| Odesa coast | 8.860 | 12.086 | 20.946 | 59,551 | 5.819 | 15.660 |
| Crimean detail | 5.484 | 8.169 | 13.653 | 148,831 | 12.430 | 15.719 |

GPU-wide scope and different sampling coverage prevent treating these numbers
as directly comparable whole-run physical-memory averages. Native total-counter
maxima were 95.186 and 98.612 GB/s respectively, over individual sampled
intervals. No legacy `DRAM Bandwidth` samples were exposed. The native trace
exports expanded to roughly 3 and 6.4 GiB of XML and took several minutes to
export/parse. One optional display label was a sentinel; preserving the valid
numeric row required a parser regression, bringing GPU tooling to **6 tests**.
 Native external-memory counters are
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
