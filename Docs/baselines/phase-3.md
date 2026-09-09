# Phase 3 baseline: packaged terrain on Apple M3

## 2026-09-09: analytic water depth and selectable seasonal maps

Source: dirty tree based on `f5625d3c0dac0ecf3ba1a0bbb2f6fc1250783867`.
Exact changed product/tool/source copies and patch:
`extracted/terrain-plane-palette-source`; source-files.json SHA-256
`489c827bf11148c99518d11ad3d92feaaea154725b57848c1e462fa00024fca1`.
Machine: Apple M3 arm64, macOS 26.6.2, Bun 1.4.2, Node 22.14.0,
Python 3.14.6, Three.js 0.185.1, Electron 44.2.0. Final Mac package build
23.2 s. x64 artifacts built, not launched; Linux remains deferred.

The user's 22,476 m altitude screenshot was reproduced at projected
304726/272303, yaw 0.80285, pitch -0.45. CPU ray intersections at five sampled
stripe locations found one covering water triangle at +0.200000003 m and actual
morphed terrain near +0.001 m. One triangle had edges approximately 252.9 km,
123.7 m and 252.8 km. The accepted water shader reconstructs view depth from the
fragment's ray intersecting its horizontal plane, then computes logarithmic
depth with four 24-bit depth steps of bias. Camera roll/pitch, plane elevation,
floating-origin X/Z and framebuffer viewport are included. Geometry/contact are
unchanged and normal depth occlusion remains enabled. The formula assumes the
current centered perspective camera; asymmetric projection would need extension.

Observed unsuccessful experiments: four-step and 32-step biases retained stripes
(`water-overlap-fixed` and `terrain-palette-acceptance`); a diagnostic 10000-step
bias cleared them but displaced depth too much to accept (`water-depth-probe`).
Using reciprocal gl_FragCoord.w instead of interpolated vFragDepth also retained
the stripes (`water-reciprocal-probe`). These folders are diagnostic evidence,
not accepted builds. The final analytic-plane comparison clears the repeated
stripe pattern with the original small bias and retains the dry spit/island.
It does not remove coarse-LOD coast outlines or change the original water mask.

New `colorMaps` metadata uses the existing checked RGBA transport. Runtime
selects one image, releases the previous texture, and checks superseded loads
before decode and before GPU ownership. The helper exposes satellite plus four
seasons; the new dataset defaults to summer. Offline `weights.npz` preserves four
uint8 appearance weights and grid identity; editable hex palettes bake directly
from those weights. They are RGB-derived appearance approximations, not verified
land-cover classes or observed seasonal weather. The current map is 1024²
(~548 m/pixel), intentionally broad; it does not specify 25 m shoreline detail.

Output source `extracted/terrain/ukraine-palettes`, installed into
`~/Library/Application Support/usnf-atf/data/terrains/ukraine`:

| Map | Compressed bytes | SHA-256 |
|---|---:|---|
| Summer | 1,159,132 | `2f438e5e37b3278df2cea9f72f39141fde1e143696881c8e2f8e0a7b593894f8` |
| Spring | 1,177,437 | `66235184621918a16b52717d26361caba3a13934e5a4ccff6e48c84aa6d5659c` |
| Autumn | 1,178,170 | `f573cce3195969ec1e62dfc4ee0bd3bc8c78c5c8e3fa48b85aee18205b412d17` |
| Winter | 1,055,141 | `b6119573b6f02325b880548991ebc669b5d115dc6c4a46c751a280c975b71cbb` |

Satellite imagery remains available for comparison. Every height chunk/water
record equals the previous installed dataset; the installed manifest equals the
accepted source manifest exactly. The installer validates/copies all declared
palettes. Authoring weights, palettes and provenance stay in the generated source
folder; source imagery and generated pixels remain ignored and outside app bundles.

```sh
cp -R extracted/terrain/ukraine-sentinel-coast extracted/terrain/ukraine-palettes
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline color-maps extracted/terrain/ukraine-palettes/manifest.json
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline probe extracted/terrain/ukraine-palettes/manifest.json
PYTHONPATH=terrain-pipeline .venv/bin/python -m unittest discover -s terrain-pipeline/tests
bun run check
bun run build
bun tools/terrain/palette-smoke.ts extracted/terrain-plane-palette-final
bun tools/terrain/waypoint-performance.ts --terrain extracted/terrain/ukraine-palettes --flight --retail --ids 2,3,1 --assert-recovery --out extracted/terrain-plane-palette-flight
bun tools/terrain/install.ts --terrain extracted/terrain/ukraine-palettes --data-root "$HOME/Library/Application Support/usnf-atf/data" --replace
bun tools/terrain/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --terrain extracted/terrain/ukraine-palettes --out extracted/terrain-plane-palette-low --camera '219144.16245100333,1800,267020.80352811713,-1.5707963267948966,-0.35' --seconds 5
git diff --check
```

Checks: 135 Bun tests / 22,108 assertions pass; 30 Python tests pass in 1.788 s,
no skips (rasterio deprecation warnings only). Probe validates 832 chunks and all
palette transports; maximum shared-edge error 0.021069959933129212 m. Tests cover
water-color exclusion, unchanged physical records, palette-only rebake without
satellite bytes, exact weight preservation, invalid palette/weight rejection
before replacing valid output, and alternate-image path/transport validation.
Independent review caught and corrected weight requantization drift, invalid
float weights, late palette validation, and a winter-only startup default.
Final lint initially rejected five redundant type assertions; removed and full
check passed. An unpackaged diagnostic launch reported Electron sandbox startup
errors; it was rejected and subsequent acceptance used fresh packaged builds.

The 2560 × 1440 six-mode desktop comparison reports 59.985–60.014 fps after
300-frame settling per swap, no runtime errors, no pending/omitted water. Cache
estimate: 410.839 MiB satellite, 84.282 MiB color map, same 84.282 MiB after the
return to summer. This is the app's combined CPU/GPU cache estimate, not physical
GPU-memory measurement. GPU image mip estimate alone falls from ~191.94 MiB to
5.33 MiB. No FPS increase is claimed; the display is already near 60 Hz. Initial
satellite switching still incurs a decode/upload hitch; the earlier 180-frame
settle run included it in its 240-frame average, so final measurement waits 300.

Packaged practice-flight jumps 2/3/1 average 59.55 / 59.86 / 60.17 fps; tails
60.005 / 59.997 / 60.000 fps. Maximum intervals 100 / 50 / 17.8 ms: brief jump
hitches remain, with recovery and zero runtime errors. Reports/screenshots live
in `terrain-plane-palette-final` and `terrain-plane-palette-flight`. The final
rebuild only removed TypeScript assertions after those runs; emitted behavior is
unchanged. The lower coast check uses that final package: 60.137 fps, p95 17.6 ms, zero
runtime errors and zero omitted water. Its screenshot was inspected; the near
shore remains visibly stepped from the existing geometry, with no repeated
water/ground stripes.

Shoreline ribbons remain a design, not an implementation: see
[terrain-colors.md](../terrain-colors.md) for continuous coast parameterization,
material confidence, shared tile endpoints/UVs, variable widths and acceptance
cases. Next reproducible user step is the Ground colors selector at the coast;
palette-only authoring commands in that document need no source-image reread.


## 2026-09-09: coastal color padding, installed

Source: dirty tree based on `f5625d3c0dac0ecf3ba1a0bbb2f6fc1250783867`.
Source copies and tracked patch: `extracted/terrain-coast-paint-source`;
`source-files.json` SHA-256
`d0b882a535caf5bd28cb4e8d12eac4278fbc1cf30e29ffdc7a96b676c99cb1b8`.
Machine: Apple M3 arm64, macOS 26.6.2, Bun 1.4.2, Node 22.14.0,
Python 3.14.6, Three.js 0.185.1, Electron 44.2.0. Runtime source hashes exactly
match the preceding Sentinel packaged build; this pass changes only Python,
data and documentation, so no new app package was needed. Prior Bun check
remains the runtime evidence; it was not rerun for this Python-only change.
Linux remains deferred; no x64 launch or new waypoint benchmark claimed.

The new CLI repairs a 200 m landward band plus a 100 m feather, and pads up to
3,000 m offshore under the rendered water. Donors are at least 300 m inside
known land, excluding all water bodies. Reflected sampling preserves texture
variation; out-of-bounds/water/other-component reflections use nearest safe
interior pixels. Component mismatch skips a target rather than copying across
islands. This does not classify photographed water or measure a new coastline.
The output is a synthetic land-color underlay, with no contact/geometry edits.

Input atlas SHA-256:
`1125e6d4465e03a18534f6d81e03b5ce5f7d674dee1e5a5fc225d310a194d610`.
Output `extracted/terrain/ukraine-sentinel-coast`: 6142 × 6144,
84,947,985 compressed bytes, SHA-256
`c8f7f8623df864f8f1fef8ea4b76831d72e7d170e4061c7278cdc4c7b500418a`.
Changed 204,153 land pixels / 850,411 water-underlay pixels; 309,358 candidates
skipped by the component guard. Manifest and imagery-info retain parameters,
counts and input hash. Original source atlas and dataset remain available.
Every chunk record and water polygon compares equal to the original Sentinel
manifest. The verified installer replaced local app data, and its resulting
manifest compares exactly equal to the accepted output.

```sh
cp -R extracted/terrain/ukraine-sentinel extracted/terrain/ukraine-sentinel-coast
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline paint-coasts extracted/terrain/ukraine-sentinel-coast/manifest.json
PYTHONPATH=terrain-pipeline .venv/bin/python -m unittest discover -s terrain-pipeline/tests
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline probe extracted/terrain/ukraine-sentinel-coast/manifest.json
bun tools/terrain/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --terrain extracted/terrain/ukraine-sentinel-coast --out extracted/terrain-coast-paint-final-overview --camera '280000,12000,280000,1.5,-0.9' --seconds 5
bun tools/terrain/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --terrain extracted/terrain/ukraine-sentinel-coast --out extracted/terrain-coast-paint-final-detail --camera '219144.16245100333,1800,267020.80352811713,-1.5707963267948966,-0.35' --seconds 5
bun tools/terrain/install.ts --terrain extracted/terrain/ukraine-sentinel-coast --data-root "$HOME/Library/Application Support/usnf-atf/data" --replace
git diff --check
```

Tests: 26 pass in 1.886 s, no failures/skips; rasterio Affine deprecation warnings
only. They cover physical padding distance, feathering, texture variation, lake
exclusion, island ownership, dry holes, unchanged alpha/geometry, hashes,
repeat-pass rejection and clearing stale paint provenance on a new imagery bake.
All 832 chunks pass probe, 33,731 water bodies, maximum seam error
0.021069959933129212 m. `git diff --check` passes; no files staged.

Final 2560 × 1440 packaged overview: 60.135 fps, p95 17.6 ms; detail:
60.062 fps, p95 17.6 ms. Both report no runtime errors and zero omitted water.
Screenshots and reports are in the two `terrain-coast-paint-final-*` directories.
Earlier unmodified overview was 60.103 fps; these short runs show no measurable
cadence regression, not a broad GPU benchmark. Texture dimensions, samplers,
mipmaps and runtime code are unchanged.

Observed iteration: initial nearest-only fill passed tests and removed the main
fringe, but its screenshot showed long stretched field stripes. Replaced it with
component-checked reflected samples and rebaked from the original atlas. Review
found `add_imagery` left stale `coastPaint` metadata, which blocked a later repair
on a fresh image; fixed and regression-tested. No failing verification runs.
The final overview removes the mainland water-colored fringe, but the small
island without a safe donor still has a dark halo. Distant coast geometry remains
stepped, and repaired texture can repeat inland features. This is not complete
imagery/shoreline alignment. Reproduce with the overview command above before
any future geometry refinement; preserve contact behavior and dry islands.

## 2026-09-09: installed direct Sentinel-2 bake

Source: dirty tree based on `f5625d3c0dac0ecf3ba1a0bbb2f6fc1250783867`, including
prior range/fog/water-budget and credit-UI changes. Exact source copies/patch are
in `extracted/terrain-sentinel-source`; source-files.json SHA-256
`d3a3db044bb174c4bc10e1718312a30b4b112664b9e89017b63118e2baec2fb4`.
Machine: Apple M3 arm64, macOS26.6.2, Bun1.4.2, Node22.14.0, Python3.14.6,
Three.js0.185.1, Electron44.2.0. Mac packages rebuilt in25.8s; x64 not launched,
Linux deferred. This is actual direct Sentinel data, not EOX or Blue Marble pixels.

Summer2024 Sentinel-2 L2A RGB/TCI (native10m), using public Earth Search COGs and
native20m SCL. Catalog:696 low-cloud candidates /48 MGRS tiles; up to6 ranked scenes
per tile,246 scenes processed. COG overviews feed the~91m RGB bake. Native mask
contamination aggregates with `max`, explicit255 nodata and a one-output-pixel
buffer. The source API and download paths are absent from runtime loading.

The first strict composite left357,643 land color pixels masked. A documented
fallback filled301,478 where at least3 distinct dates were within12/255 of the
per-channel median (pairwise differences can reach24). Residual56,165 pixels were
filled from nearest valid color: median radius1 pixel, max5.83095 (~533m). Guards
permit this only below0.5% of land and within6 pixels. These are lower-confidence
texture colors, not measured replacement terrain. Remaining3,089,517 pixels without
satellite coverage were flat-colored only where existing water polygons allow it.
No elevation or water-classification changes. Direct comparison confirms every
DEM chunk record and all water polygons match the earlier installed4× theater.

Output `extracted/terrain/ukraine-sentinel`:6142×6144,85,056,009 compressed bytes,
SHA-256 `1125e6d4465e03a18534f6d81e03b5ce5f7d674dee1e5a5fc225d310a194d610`.
Provenance: `extracted/terrain-source/sentinel-2/sentinel-2024-b4fa15a3cf6639a8.json`,
including scene IDs/dates/URLs, scene-cache hashes and all fallback counts.
Original EOX copies and the uninstalled Blue Marble experiment remain ignored.

```sh
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline imagery extracted/terrain/ukraine-sentinel/manifest.json --provider sentinel --cache extracted/terrain-source/sentinel-2 --size 6144
bun run check
PYTHONPATH=terrain-pipeline .venv/bin/python -m unittest discover -s terrain-pipeline/tests
bun run build
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline probe extracted/terrain/ukraine-sentinel/manifest.json
bun tools/terrain/install.ts --terrain extracted/terrain/ukraine-sentinel --data-root "$HOME/Library/Application Support/usnf-atf/data" --replace
bun tools/terrain/waypoint-performance.ts --terrain extracted/terrain/ukraine-sentinel --flight --retail --ids 2,3,1 --assert-recovery --out extracted/terrain-sentinel-accepted
```

All832 chunks pass probe, maxshared-edge error0.02106996m. Verified installer
replaced `~/Library/Application Support/usnf-atf/data/terrains/ukraine` only after
checksums/inflated lengths passed. Credits read “Contains modified Copernicus
Sentinel data 2024” in About / Data credits, ATTRIBUTIONS.md and the manifest;
`attributionDisplay: credits` suppresses the permanent line. Legacy manifests
default to overlay, preserving EOX behavior. Source terms checked against the
[Copernicus legal notice](https://cds.climate.copernicus.eu/licences/ec-sentinel).

Observed failures/corrections: initial TypeScript exact-optional assignment of
undefined replaced with conditional assignment. Review found nearest-downsampled
SCL could miss small clouds. The first max-mask attempt failed its regression
because using1 as nodata collided with the binary contamination value. Explicit
255 source/destination nodata fixes that; distinct cache versions prevent reuse
of those masks. The invalid-mask bake was never installed. Two intentionally
strict coverage runs stopped before installation, motivating the explicitly
bounded/documented color-gap treatments above. Final independent review found no
additional confirmed gap-fill array/date/indexing errors. The final mask regression
covers small clouds, all-cloud, all-nodata and outside-source regions.


Final checks: 135 Bun tests /22,102 expectations plus20 Python tests pass,
including type/lint/format; Python has no failures/skips, only existing rasterio
warnings. Packaged three-jump flight averages59.77/59.89/60.14 fps at1440p, with
~60 fps final windows, zero omitted/pending water and no runtime errors. Cold
mountain/coast peak frames66.6/50.0 ms; initial post-ready sample includes83.4 ms.
Inspected final flight screenshot: baked ground imagery present, no persistent
imagery credit, About / Data credits present/closed. Diagnostic attribution includes
the exact Copernicus notice; it has not been removed from the dataset.

Additional overview command:
```sh
bun tools/terrain/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --terrain extracted/terrain/ukraine-sentinel --out extracted/terrain-sentinel-overview --camera '280000,12000,280000,1.5,-0.9' --seconds 5
bun tools/terrain/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --terrain extracted/terrain/ukraine-sentinel --out extracted/terrain-sentinel-land --camera '280000,10000,450000,0,-1.4' --seconds 5
```
The first overview averaged60.103 fps /17.6ms p95 with zero omitted water/runtime
errors. Screenshot shows coastline/sea and loaded imagery; it primarily covers
water, so the second viewpoint targets inland mosaic appearance. The inland run
averaged60.154 fps /17.6ms p95 with no runtime errors; inspected screenshot shows
continuous field/vegetation paint with no blank land regions in that view. Fine
features remain softened by the~91m bake. Existing coarse
source-LOD shoreline silhouettes remain a limit, separate from texture resolution.
Final source checksum map matches the working tree; diff check passes, staged set
is empty. These latest changes have not been committed/pushed.

## 2026-09-09: attribution UI relocation

Source: working tree based on `f5625d3c0dac0ecf3ba1a0bbb2f6fc1250783867`, including
the prior range/fog/water-budget changes. Changed product files and attribution
document are hashed in `extracted/terrain-attribution-ui/source-files.json`, SHA-256
`37d6f808072c5af7a906a433e40b046242ec41993a41364ed0c99e50afd35767`. Mac M3/macOS 26.6.2, Bun 1.4.2, Electron 44.2.0.

The required EOX source credit stays visible. Full license text is removed from
the persistent line, and full dataset credits are in a closed helper disclosure.
Root `ATTRIBUTIONS.md` records source/license/modification notices and is linked
from README. This avoids treating a source-only document as a substitute for
EOX's stated visible-credit requirement. Attribution metadata and installed data
are unchanged.

Commands: `bun run check`, `bun run build`, then an isolated packaged flight CDP
check through `tools/flight/desktop.ts`. Check passes 135 tests / 22,099 expectations,
including type/lint/format. Python not rerun for UI/document changes. Mac packages
rebuilt; x64 launch and Linux remain untested/deferred as previously recorded.
Packaged UI check passes: visible footer contains EOxCloudless without the license
paragraph; Data credits exists and starts closed, contains CC BY-NC-SA notices,
and opens on demand. `verification.json`, `credits-open.png` and runtime logs are
in `extracted/terrain-attribution-ui`; no runtime errors. Final diff check passes.


## 2026-09-09: doubled range / half-width fog band

Source: working tree based on `f5625d3c0dac0ecf3ba1a0bbb2f6fc1250783867`, with
three changed product files: lod.ts SHA-256
`c9b065160d2f0ac5e5f4c0b2ec3f6643abd69c2d80fc4e9307e6b03cfb75d829`, viewer.ts SHA-256
`e617a7a03bcfb76048bcc3dc4e06d68e36d2aba76a72d6ec406ffe992b832b91`, water.ts SHA-256
`ca4282632b82dac6670837d380aa5d237458b540eae3b3dc86b73f40d937f718`.
Mac M3 arm64 / macOS 26.6.2, Bun 1.4.2, Node 22.14.0, Electron 44.2.0,
Three.js 0.185.1. Dataset: installed real 4× imagery, identical to prior acceptance.

Range now uses world altitude ×16, clamped 24–300 km. Fog's fade width changes
from 35% to 17.5% of that range, starting at 82.5%; full fog remains at the horizon.
Far clipping remains 1.2× horizon. The earlier answer's fixed 80–180 km fog claim
was incorrect: the selection loop overrides startup values every 200 ms.

A central-theater selection probe at altitude 1/3/10/20 km selects horizons
24/48/160/300 km, source LOD 1/1/2/3, and 4/16/22/9 source chunks. Existing water
budgets omit 0/0/40/443 distant batches at those positions. The initial 300 km packaged smoke failed its omitted-water gate, while frame
cadence was ~16.67 ms and there were no renderer exceptions. The failing output
is retained in `/tmp/usnf-range-fog-high.log` and `extracted/terrain-range-fog-high`.
Water caps were then expanded to 1024 batches / 32 MiB; selection at the same
position fits 571 batches / 16,528,800 estimated bytes with zero omissions.
The worker still has four outstanding jobs maximum. Flight physics is unchanged.

`bun run check`: 135 tests / 22,099 expectations pass, including type/lint/format.
Python was not rerun for these renderer-only constants. Linux remains deferred;
building x64 is not x64 launch acceptance. Source and metadata changes are local.

An interim doubled-range build before the fog follow-up passed six flight jumps
at 59.76–60.19 fps, with final windows ~60 fps; first mountain/coast peak frames
66.6/50.9 ms. Artifacts: `extracted/terrain-range-flight`. These interim numbers
do not claim the narrower fog was present.

Final source verification commands:
```sh
bun run check
bun run build
bun tools/terrain/waypoint-performance.ts --terrain extracted/terrain/ukraine-4x --flight --retail --ids 2,3,1 --assert-recovery --out extracted/terrain-range-fog-flight
bun tools/terrain/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --terrain extracted/terrain/ukraine-4x --out extracted/terrain-range-fog-high-accepted --camera '280000,20000,280000,1.5,-0.35' --seconds 5
```


Final narrow-fog flight (before only the water-cap expansion) averaged
59.78/59.88/60.19 fps across mountain/coast/runway, final windows ~60 fps,
zero omitted water and no runtime errors. Peak cold mountain/coast frames were
65.8/50.9 ms. Final expanded-cap package built in 23.7 seconds and passes the
300 km high-altitude smoke: 60.178 fps, 17.7 ms p95, all 571 water batches loaded,
zero omitted batches and zero runtime exceptions. Its screenshot was inspected:
long-range terrain/water are present; coarse source silhouettes and shoreline
mismatch remain visible at source LOD3. This is not finer elevation data.
All 135 tests / 22,099 expectations pass after the cap expansion. Final diff check
passes and no files are staged. Restart the rebuilt app for these local changes.

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
