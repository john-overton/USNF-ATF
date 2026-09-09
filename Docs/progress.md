# Progress

Current status and append-only engineering log against [build-plan.md](build-plan.md).
Newest entry first. Update the snapshot and add an entry for meaningful port work;
keep commands, evidence, uncertainty, and a concrete next step. Baselines live in
[baselines/](baselines/). The design brief describes the intended product.

## Current snapshot — development 2026-09-09

| Phase | Implemented | Acceptance / remaining work |
|---|---|---|
| 0: retail toolkit | Containers, images/fonts and data readers; bounded nearest-detail F-14 static export with textures | F-14 is recognizable in packaged flight. General SH interpreter, native animation semantics and unified deliverable remain open |
| 1: scaffold and shell | Dev lifecycle/asset fixes, platform contract tests, fresh probe, Mac packaging | macOS tested including DMG launch; Linux hardware/build/checks deferred by user |
| 2: terrain pipeline | Copernicus DEM/WBM fetch, LAEA warp, roughness-selected 30m detail, filtered 100–2700m chunks, quantization, checksums, probe, codec comparison, bounded coastline smoothing, optional RGB atlas, offline coastal color repair, seasonal palette bakes and classified shoreline ribbons | Real Ukraine build and every-chunk probe pass; installed locally. Linux baseline deferred |
| 3: terrain renderer | Streaming, quadtree height/normal/tint morph, complete-coverage source fades, floating origin, free camera, bounded water, shared height/normal edges, eased edge ownership, satellite/seasonal color maps, classified textured shoreline ribbons/banks, conservative coastal coverage masks, analytic water-plane depth, FXAA, worker water triangulation, 24–300 km range with narrower fog and diagnostics | Polished packaged coast/detail ~60 fps at 1440p; current 0↔1 fade passes. Prior 1↔2/24km lateral evidence predates polish. Native GPU memory counters captured; physical-DRAM-only traffic is not established. Live counters and fine edges remain open. Linux deferred |
| 4: flight model | Preserved assisted default plus opt-in retail-envelope and recovered-native-envelope backends; local retail F-14 exterior; throttle/engine/gear/hook/flap/brake controls, retail engine samples, vector HUD, bracket-selected waypoints, shared square 20-button explorer/flight MFD with compass, orientation modes and waypoint teleport, F2/F3 chase, practice starts and 11-case harness, indexed exact water queries | Packaged flight, systems/animation and live fuel acceptance on Mac; exact sources/results in baseline. Authentic F-14 dynamics, physical gamepad and human USNF feel comparison remain open; Linux deferred |
| 5–10 | Plans and importer contracts only | Combat, missions, in-app retail import and release work not implemented |

## 2026-09-09: classified shoreline ribbons and bank faces

Added offline beach/rock/cliff/marsh/unknown appearance hints from inland RGB and
300 m relief, editable ring overrides, variable nominal widths and continuous
coast-distance coordinates. The authoring layer follows existing sea polygons and
dry holes; width checks prevent folded narrow islands and enclosed water. Unsafe
complex junctions collapse locally. Runtime ribbons clip to actual terrain
triangles and follow their morph/seam heights, with shared tile UVs and source
fades. Original prebaked material swatches remain independent of seasonal palettes.

Close-up acceptance exposed coarse ground occluding sea before its vector shore.
Conservative local sea masks now remove only wholly wet terrain fragments near
ribbon patches. Boundary supercovers preserve even sub-texel islands; textured bank
faces seal elevated cuts down to sea level. This is visual geometry, not measured
cliff profiles or a change to height files, water bodies or flight contact.

Independent review found and verified corrections for narrow-island folds,
contained water, reversed atlas rows, repeated over-budget construction, dry-island
mask loss and duplicate bank faces on grid edges. Serialized geometry also retains
full coordinate precision after audits caught sub-millimeter rounding crossings.
Checks pass 142 Bun and 35 pipeline tests; exact current-source packaged evidence,
transient performance, dataset identity and commands are in the phase 3 baseline.
Linux remains deferred and x64 packaging is not an x64 launch test.

The [shoreline workflow](terrain-colors.md) documents confidence, original texture
generation, overrides, budgets and remaining limitations. Next reproducible step:
restart the updated Mac app, inspect the coastline with Summer/Winter ground colors,
and tune whole-ring material/width overrides in the generated source dataset.

## 2026-09-09: water-depth correction and seasonal color-map trial

Reproduced the user's high-altitude water stripes. Sampled CPU water triangles
cover the points at +0.2 m while morphed terrain is near +0.001 m; one water
triangle is approximately 253 km long and only 124 m on its short edge. Small
log-depth biases and reciprocal-W reconstruction did not clear the GPU artifact.
Water now reconstructs logarithmic depth analytically from the pixel ray and the
horizontal water plane, with a small four-step depth bias. The high-altitude
comparison clears the repeated stripes while retaining the dry spit/island.
Water geometry, terrain elevation and contact remain unchanged.

Added `color-maps`: a reusable four-channel appearance-weight map, editable hex
palettes and 1024² RGBA bakes for summer/spring/autumn/winter. RGB-derived classes
are artistic approximations, not verified land cover. Palette-only rebakes need
no source satellite pixels. The Ground colors selector swaps one atlas at a time;
new datasets default to summer and retain satellite imagery for comparison.
Installed the verified `ukraine-palettes` dataset into local app data.

Packaged 1440p six-mode comparison settles at 59.985–60.014 fps. CPU/GPU cache
estimate falls from 410.84 MiB with satellite imagery to 84.28 MiB with a palette,
and returns to the same value after switching back. Shader/flight/probe/check
commands, source identity and observed corrections are in the phase 3 baseline.
The [shoreline ribbon design](terrain-colors.md) records the proposed next layer:
continuous coast-following material bands, shared tile joins, type confidence and
editable width. Rock/beach/cliff classification and ribbon meshes are not built.
Next reproducible step: restart the app, compare Ground colors at the coastline
waypoint, and edit/rebake the separate palette JSON to tune the artistic colors.

## 2026-09-09: coastal texture color repair

Added `paint-coasts` after the imagery bake. It reflects nearby interior land
colors into a bounded coastal strip, with nearest-interior fallback and a
100 m landward feather after a 200 m repair band. Up to 3 km of underwater
texture padding covers ground exposed at coarse source LOD. This uses existing
water polygons, not RGB thresholds or elevation-derived water classification.
Connected-land checks prevent borrowing mainland colors for islands; islands
without a 300 m interior remain untouched. Texture size, height chunks, water
polygons, flight contact and runtime code are unchanged.

Installed `extracted/terrain/ukraine-sentinel-coast` into local app data after the
full probe. The mainland dark fringe is visibly removed in the inspected overview
and detail views. Initial nearest-only padding stretched field colors into stripes;
reflection reduces that artifact. Small-island fringes and geometric coastline
steps remain. Independent review caught stale `coastPaint` provenance after a fresh
imagery bake; the producer now clears it and a regression test covers this.

Verification: 26 Python tests pass, no skips; all 832 chunks pass probe, maximum
shared-edge error 0.02106996 m. Packaged Mac 1440p overview/detail average
60.14 / 60.06 fps, no runtime errors or omitted water. Full evidence, commands,
source snapshot and limits: [phase 3 baseline](baselines/phase-3.md).
Next reproducible step: reload local terrain and inspect the coastline waypoint;
use the preserved original Sentinel dataset to rebake different padding distances.

## 2026-09-09: direct Sentinel-2 mosaic and offline bake

User redirected the proposed Blue Marble change to direct Copernicus Sentinel-2
imagery. Blue Marble was downloaded/baked only into an isolated ignored copy;
it was never installed. Added a direct L2A RGB/cloud-mask workflow using public
Earth Search COGs, summer 2024 low-cloud scene selection, multi-date gap filling,
reprojection and local RGBA bake at the existing 6144-axis target. RGB sources are
10 m; runtime texture pixels remain ~91 m. Elevation is still GLO-30 DEM, not S2.
No network access is added to gameplay. Persistent mask gaps have a distinct-date color-agreement fallback; residual color
interpolation is capped to 0.5% of land / six output pixels and recorded separately.
Larger uncovered areas fail; only manifest-classified water can receive flat water fill.

Copernicus credit is retained in root ATTRIBUTIONS.md and About / Data credits.
New optional `attributionDisplay` defaults to `overlay` for existing datasets;
direct S2 declares `credits`, omitting the permanent line. EOX sources remain an
explicit `--provider eox` option with their own terms and visible credit.
The6142×6144 direct atlas (85.06MB compressed) is now installed; all832 height
chunks and water polygons are unchanged. Bake provenance records301,478 temporal
fallback pixels and56,165 bounded interpolated land-color pixels. Current source
scope, actual bake, installation and packaged checks are recorded
in the phase 2/3 baselines. Final checks pass135 Bun /20 Python tests; packaged
waypoint flight averages59.77–60.14 fps at1440p, with no runtime errors or omitted
water. Source/retail pixels stay outside Git and app bundles.


## 2026-09-09: attribution document and quieter credits UI

Added root `ATTRIBUTIONS.md` with imagery/data sources, modification notes and
license links, linked from README. Repeated full dataset notices in the helper
panel now live in a closed Data credits disclosure; the persistent imagery line
contains source attribution only, without the long license text. The complete
license stays in the manifest/diagnostics and disclosure. EOX's published guidance
requires a visible imagery credit, so the requested source-only move is only
partially applied: that required credit remains visible. Source guidance checked:
https://cloudless.eox.at/documentation/license/ and
https://creativecommons.org/licenses/by-nc-sa/4.0/ .

Installed terrain is `~/Library/Application Support/usnf-atf/data/terrains/ukraine`
(~160 MiB on disk). Generated copy: `extracted/terrain/ukraine-4x`; imagery source
cache: `extracted/terrain-source/imagery`. No dataset files or attribution metadata
were removed. Verification/source scope is recorded in the phase 3 baseline.


## 2026-09-09: doubled view range and narrower fog

Terrain/water selection now uses altitude ×16, clamped to 24–300 km (previously
×8, 12–150 km). At the user's follow-up request, the fog fade band is halved:
82.5% of the range to 100%, instead of 65% to 100%. Far clipping continues to
follow the horizon at 120%. Correction to the earlier conversational description:
80–180 km fog values are startup defaults only; active fog was already dynamic.
The narrower band keeps full visibility farther out rather than shortening range.

The 25-chunk/source-LOD budget remains; wider range can select coarser sources.
The first 300 km check failed the zero-omitted-water acceptance gate at the old
128-batch cap (443 omitted). The water working-set caps are now 1024 batches /
32 MiB, retaining four outstanding worker jobs. A central 300 km selection now
fits all 571 nearby batches, with no omissions.
Final high-altitude packaged acceptance passes at 60.18 fps with all 571 batches
and zero omissions/runtime errors; 135 tests pass. Source scope and exact packaged
measurements are in the phase 3 baseline.


## 2026-09-09: actual 4× imagery and terrain handoff

User authorized installing higher-detail imagery and committing/pushing the terrain
work. Added bounded tiled WMS fetching for a real ~6144-square source, expanding
producer/runtime limits to 6144 per axis / 152 MiB compressed and checking the GPU
texture-size limit explicitly. A single 6144 WMS request returned HTTP 400; the
four-request geographic mosaic resolves that service limit. Tile-grid tests cover
north/south orientation, exact seams and partial final tiles. Existing smoothed
water and DEM chunks are preserved. The earlier upscaled allocation experiment
remains historical evidence, not proof of the newly fetched imagery. Product commit **9658fd8** is built and installed with the real 6142×6144 atlas
(~91.39 m/pixel, 82.2 MB compressed). All 832 chunks pass the probe; 135 Bun and
16 Python tests pass. Six actual-texture flight jumps average 59.84–60.18 fps at
1440p, final 720p 60.10 fps, with zero pending/omitted water or runtime errors.
Exact commands, installation and fresh packaged results are in the phase 3 baseline.


## 2026-09-09: texture resolution performance experiment

A user-requested four-times-texel test doubles the atlas axes from 3071×3072 to
6142×6144 through isolated CDP instrumentation. Six packaged flight jumps held
59.86–60.17 fps at 1440p, with first mountain/coast maximum frames of 50 ms and
no repeated-jump degradation; 720p averaged 60.17 fps. GPU mip allocation rises
from ~48 to ~192 MiB, plus CPU source storage from ~36 to ~144 MiB. These are
calculated allocations, not physical residency. The test upscales existing pixels;
new imagery detail, larger-file loading and production support above the existing
4096 cap remain untested. Exact source, scope and results are in the phase 3 baseline.
Installed data and renderer defaults are unchanged by this experiment.


## 2026-09-09: waypoint flight slowdown — indexed water queries

Repeated packaged waypoint jumps reproduced a persistent slowdown specifically
in practice flight: mountains averaged 13.39 fps and coast 11.82 fps on the first
cycle, falling to 9.87 fps on a later coast visit. The explorer recovered to about
60 fps at the same destinations. Flight CPU submission reached 65–114 ms after
loading completed. A ten-second mountain CPU profile spent 7.323 seconds in
`inRing`, the full polygon containment loop. The smoothed coastline increased the
work in a path queried repeatedly by the fixed 120 Hz simulation and chase camera.
The earlier explorer-only polish acceptance did not cover this workload.

GroundSampler now pre-indexes each original ring into bounded scanline buckets,
with bounds rejection and a separate list for long edges. Queries retain the
identical ray-crossing expression and island-hole semantics; no collision polygon
simplification, lower simulation rate or altered assisted physics is introduced.
The index holds at most eight references per edge and 256 buckets per ring.
Real-theater samples at three destinations agree with the previous classifier;
200 mountain/coast queries measured about 33×/103× faster in the local Bun probe.
Independent review additionally passed 105,107 deterministic polygon comparisons.

A separate first-visit profile found about 340 ms in shoreline triangulation.
Water geometry now builds in one module worker with at most four outstanding
batches; obsolete results are discarded, disposal terminates the worker and
readiness still waits for live water. This preserves the original triangulation
and budgets while moving its large blocking operation off the flight thread.

Settled shared-edge graphs also stop recalculating and uploading unchanged
buffers; morph changes or new topology resume updates, and the final 250 ms
ownership-easing update is retained. Repeated-jump tools and exact before/after
packaged measurements are recorded in the phase 3 baseline. Final six-jump flight
averages are 59.85–60.18 fps at 1440p (60.14 fps at 720p), with first mountain/coast
maximum frames of 50.9/48.9 ms and no pending water at each stage end.
`bun run check` passes 135 tests / 22,098 expectations; Mac packages rebuilt.
Water budgets now also account for extra hole triangles, and workers preserve
16-bit indices when possible to prevent eviction/rebuild loops. Linux remains
deferred. These changes preserve the paint, smoothing, FXAA and earlier terrain
work; they address the user-reported runtime regression in that work.

## 2026-09-09: terrain paint, coast smoothing and shared panel edges

Added an optional, geographically registered satellite atlas to phases 2/3. The
local Ukraine build uses label-free EOX Sentinel-2 cloudless 2024 at 3071×3072
(about 183 m/pixel), with source URL/checksum, CC BY-NC-SA attribution and a persistent
credit. Terrain installation validates/copies the optional image; missing imagery
metadata retains the original tint. Outputs remain under ignored extracted/ and
app data. See [terrain-polish.md](terrain-polish.md) for reproducible commands,
provider sources, exact limitations and the local dataset path.

Coast exteriors receive bounded 25 m/12.5 m corner cuts while island holes, clipping
boundaries and point-touch junctions stay fixed. The resulting 492,147 water points
fit the existing 500,000-point budget. All 832 height chunks remain unchanged.

Independent review reproduced a 4.838429 m shared-edge mismatch from per-patch
morph factors and discontinuous one-sided chunk normals. A shared boundary graph
now stitches heights and lighting, with separate graphs during source fades.
Review then reproduced a 3.376860 m ownership pop during subdivision; retained edge
values and interpolated prior-edge samples ease the handoff over 250 ms. The
morph interval is widened while preserving split-boundary parity. Dynamic edge
uploads are now included in the upload estimate. Geometry coarsening and existing
source-fade silhouette stipple remain temporal limits; this is not a claim that
every camera path is artifact-free.

An Odesa screenshot still showed ocean dashes after land stitching. A controlled
MSAA-off comparison removed those dashes; FXAA now provides post-process edge
smoothing without the multisample/log-depth interaction. The first imagery
screenshot also exposed DataTexture's nearest magnification default; explicit
linear filtering fixes the visible pixel blocks. Screenshot inspection caught
both issues despite passing geometry tests and 60 fps counters.

Verification, exact source scope, observed failures and remaining acceptance are
recorded in [phase 3 baseline](baselines/phase-3.md). Linux remains deferred; x64
packaging does not establish x64 launch acceptance. No flight force routines or
retail decoder behavior changed. Next reproducible acceptance: launch the current
Mac app, use the coast/mountain waypoints, and compare near-ground refinement
against the recorded camera runs.

## 2026-09-09: square 20-button MFD and cartographic distance scale

The shared explorer/flight map now uses a square F-16-inspired bezel with five
blank buttons on each edge and two decorative lower-corner dials. Assigned
controls retain adjacent green screen labels; unassigned keys are cosmetic.
The nautical-mile scale uses outlined alternating black/transparent rectangles
and keeps its distance tied to the visible world width at every zoom level.

A square instrument needs screen overlays rather than stacking legends below a
square map, which would make the outer instrument tall. Keep scale measurement
relative to the actual map width when positioning its labels or adding padding.
Verification and exact source are recorded in [phase-4 baseline](baselines/phase-4.md).

## 2026-09-09: fixed elevation colors and flap/neutral-afterburner comparison

Map016e945 replaces regional percentiles with common MSL bands: green0m,
yellow500m, red1500m, brown2500m, white3500m. The legend labels each fixed stop;
Ukraine lowlands stay green. Water masks/dry holes are unchanged. These are
visualization defaults, not a claimed formal aviation-chart standard.

50d2ec4 separates experimental flap maximum lift from zero-AoA camber. The old
inferred offset converted all native stall-speed improvement into constant lift,
then trimmed against it with large negative AoA. The new approximation uses
PT51/256 as modest absolute camber and grows the remaining gain with positive
AoA. Native1G flapped maximum lift stays intact. This is not a recovered native
pitching-moment law; negative pitch/AoA alone is not necessarily wrong. The
preserved assisted physics is unchanged. See[flight-dynamics.md](formats/flight-dynamics.md).

User requested full-flaps/afterburner with no pitch/roll/yaw input in all3models.
The six-case fixed-mass comparison and three real60second runs now record
attitude, flight path, AoA and airborne state. Fullcheck123tests/5,189expectations,
both14-case experimental harnesses and all runtime input/finite-state checks
pass. Important observation: experimental first-airborne state on the real
practice strip occurs at its raised-deck end, before lift supports weight;
that must not be misreported as aerodynamic rotation. Raw outputs and source
scope are in[baseline](baselines/phase-4.md).

The user's takeoff-trim hypothesis also prompted actual-binary research into
`FMUpdateGearPitch` and `groundPitch`; findings and isolated native verification
are kept distinct from the authored hybrid correction. No guessed automatic
Tomcat nose-up bias is added. Linux remains deferred.

## 2026-09-09: shared MFD map, orientation modes and all-mode teleport

The terrain explorer now shares the map with all three practice-flight models.
Waypoint buttons load destination terrain before moving the free camera or
establishing a safe airborne flight state. The jump preserves model, fuel,
payload, engine/system commands and chase view; a stopped engine stays stopped.
Height clears the finest containing chunk's maximum by1,000m, with raised water
also considered. The new airborne state runs at150–250m/s facing into the theater;
it restarts state time/interpolation, not fuel or system settings.

The user's cockpit-display reference led to plain bezel buttons with adjacent
screen labels for teleport, range and N-UP/HDG-UP. A compass and heading readout
orient the view. North-up uses the existing clamped viewport; heading-up centers
the aircraft/camera before rotating the full raster and markers together. This
avoids rotating an edge-positioned marker out of view. Uncovered rotated corners
show a hatch instead of invented terrain. Teleport, orientation and zoom buttons
return focus to movement controls. Other theaters do not get a fictional Ukraine
strip simply because its numeric coordinates happen to fit their extents.

Implementation74f2456/6f55ab5, MFDa6cc129/10c318e. Focused teleport tests include
finest-vs-coarse heights, dry water holes, failed loads, overlapping requests,
disposal and fuel/system retention. Independent integration review found no
blocking defects. Full check at10c318e:120tests/5,134expectations, type/lint/format
pass. Exact packaged acceptance is recorded in[baseline](baselines/phase-4.md).

Lessons: optional teleport loads must not poison normal contact state; stale
async results need cancellation at both viewer and flight-layer boundaries;
heading-up requires terrain and marker transforms to share their pivot. A prior
normal-contact error remains sticky and requires reloading terrain; teleport
is not a repair mechanism for an already failed theater. Existing flight force
routines and fuel rates are unchanged. Linux remains deferred.

## 2026-09-09: practice navigation and MFD terrain map

Implemented the handoff's navigation pass in66d73e3/2b5d2c9, with waypoint
readability polishcf238d9. `[ / ]` select strip, mountains and coast; the HUD
shows horizontal NM range, grid bearing and a steering cue. The top-right map
uses regional height colors and actual water polygons. The user's follow-up
adds −/+ zoom1×–16×, a visible NM scale and MFD-style border. Map controls restore
flight focus, and the map survives helper minimization. The preserved assisted
physics and both experimental force backends are unchanged.

Destinations are derived from installed Ukraine coverage. Mountain and coast
positions were independently sampled from finer30/100m terrain and checked dry;
straight routes have no missing coverage at≤1km samples. This is coverage
verification, not an entire route flight. The map loads a bounded overview once,
using validated coarse chunks; zoom magnifies it rather than loading finer map
terrain. Water holes remain dry and missing samples are excluded from percentiles.

Full check at2b5d2c9 passes117tests/5,101expectations. Independent review found no
blocking defects. Mac packaged acceptance and source-specific measurements are
in [baseline](baselines/phase-4.md). The initial native run passed functional
checks but screenshots showed waypoint text over the chase aircraft at1440p;
cf238d9 moves it above the heading tape without enlarging the HUD. This is why
DOM assertions and screenshot review are both needed.

Lessons: use world theater coordinates, never floating-origin offsets, for map
markers; keep map water classification separate from elevation; return focus
after MFD buttons or flight keys remain intentionally suppressed; scale bars must
measure the current viewport. Coarse peak heights differ from fine contact data
(1350m overview vs1467m at the mountain destination), so an overview must not be
presented as a landing chart. A95th-percentile white threshold describes land
area, not the top5% of the numerical height range. See
[implementation notes](phase-4-navigation.md) and updated[handoff](handoff.md).
Linux remains deferred; human flight-feel/controller gates stay open.

## 2026-09-09: resumed fuel acceptance passes; navigation handoff recorded

The previously interrupted fuel test now completes in the packaged Mac app:
`fuel-smoke.ts`, runtime **8b6a2d4**, test-tool source **ac3a142**, evidence
`extracted/flight-fuel-resume`. Preserved assisted and recovered-envelope modes
both pass live slider, military/AB consumption, engine-off zero burn, empty
tank/thrust cutoff, refill and manual restart. Observed rates are 0.9071847400
and 4.5359237000 kg/s; experimental mass tracks fuel loss while assisted handling
mass remains 9,000 kg. No renderer errors. Screenshots show the expected fuel/
engine states and a clear orange automated-test label. No product fix was needed.

The user asked to record the next development pass in [handoff.md](handoff.md):
HUD waypoint switching with [ / ], destinations for the practice strip, Ukraine
mountains and coast, plus a top-right location map using regional height colors
and the actual water mask. The clarified palette is blue water and green →
yellow → red → brown land, with white for the highest roughly 5% of land elevations. These requests are documented, not implemented here.
The broader final aero/approach retest remains separate from this fuel acceptance;
Linux remains deferred. See the baseline for exact scope and reproduction.

## 2026-09-09 checkpoint: commit/push before continuing acceptance

Per the user's request, development stops at this checkpoint. Runtime `8b6a2d4`
is built for Mac and passes110 tests/5,045 expectations plus both14-scenario
fixed-reference flight suites. It includes the live fuel slider and recovered
fuel-rate calculation. The preferred assisted model remains the default with
its handling mass preserved; experimental models account for burned fuel mass.

The user accidentally closed the automated fuel window before asking to commit,
push and compact. Its report contains a CDP timeout, so the fuel cutoff/refill
and experimental mass acceptance remain **incomplete**, not passed. The initial
assisted slider, military/AB burn and engine-off checks did complete. Follow-up
test tooling adds unmistakable automated-window labels and immediate disconnect
errors. See [baseline](baselines/phase-4.md) and [handoff](handoff.md) for exact
sources, finished checks and the first commands to resume. Linux remains deferred.

## 2026-09-09: preserve existing feel, import PT dynamics, recover native helpers

The user's drag/weight/power reports led to a concrete audit. Mass did participate
in F/m, trim and load, but the F-14 exterior still used the 9,000 kg trainer's
70 kN thrust and transonic drag tables. At 3 km and about 583 kt the trainer's
AB thrust and drag both reached about 77.4 kN; there was no hidden 600 kt clamp.
Flap lift also faded to zero at the clean stall angle and trim ignored it.

The user then explicitly asked to keep the existing feel. Source `955da68`
preserves the force/control implementation from `f70e10c` in
`engine/src/sim/flight/assisted-flight.ts`, byte-identical after its provenance
comment. It remains the default. The app's selector restarts the same preset
with one of three separate backends:

| Option | Data / behavior | Fidelity boundary |
|---|---|---|
| Preserved assisted | Existing trainer forces and ground support | User's preferred comparison baseline; not Tomcat performance |
| USNF97 envelope fit | Imported mass, total dry/AB thrust and G polygons; corrected flap/drag behavior | Original force fit and control assistance; explicit full-fuel/AB calibration assumption |
| Recovered USNF envelope | Translated native integer speed-bound routine and flap rule inside the fitted forces | Verified isolated native helper; full `FMFlight` remains unported |

The attributed local export now contains all fourteen G polygons and exact
native points/header indices. It installs as `appData/aircraft/f14-flight.json`,
never in the bundle. The imported F-14B has empty mass 18,190.87 kg plus 7,140.00 kg
internal fuel, 126.485 kN military thrust and 185.936 kN AB. A live fuel slider and payload settings expose weight effects in the experimental
modes. Native-rate consumption now reduces their current fuel/mass; the preserved
assisted model keeps its handling mass fixed. Empty fuel cuts the engine, and
payload currently adds mass only.

A major reverse-engineering discovery changed the next step: **USNF.SMS supplies
3,440 symbols**, despite the PE having no COFF debug symbols. The game's BRF
resolver loads this map and resolves `_PLANEProc` to 0x485780. We translated
`_EnvelopeSpeedLimits` / `_CheckFlightEnvelope` and tested them against the actual
local x86 code through an isolated Unicorn oracle. All 240 cases agree. Native
flaps lower the abs(G)≤1 minimum-speed threshold by one quarter, with native
integer rounding; structural overspeed thresholds come from PT `structure[0/1]`.
Separate fuel, slew, thrust-selection and zero-vector scalar-thrust helpers pass
3,200 native comparisons. Subsequent native clock tracing confirmed 256 ticks/second and fuel rates in
pounds/second. Fuel consumption is integrated continuously at 120 Hz rather than
the native five-second batching; other power helpers remain isolated until their
adjusted forward-speed bound and world-state dependencies are recovered.

Lessons and corrections:

- A model/sound import must not imply a dynamics import; the helper now identifies
  the active backend, mass and rated thrust explicitly.
- Preserve a liked implementation before experimenting. Installing a PT profile
  does not select it, and switching back restores the frozen assisted model.
- Native symbols can live outside the executable. “No COFF/PDB” did not mean no
  usable names: inspect runtime-loaded symbol resources.
- Earlier PT notes mixed ATF device values and a 2G stall vertex into USNF1G
  claims; corrected figures and confidence are in [dynamics research](formats/flight-dynamics.md).
- Native oracle comparison caught a wrong initial classification priority. The
  corrected order is below-stall, structural overspeed, G-envelope overspeed.
- A fitted polar still has higher-G coefficient transitions at polygon ceilings;
  steady maximum speed matching does not establish full maneuver parity.

Validation at runtime source `4a76cc5`: 104 tests / 5,005 expectations pass,
including native integer, profile-validation and backend-integration regressions.
Both experimental backends pass all fourteen headless performance/device/weight
scenarios. The Mac package and in-app comparison results are recorded in the
[current baseline](baselines/phase-4.md). The unchanged assisted source retains
its earlier takeoff/landing acceptance; the current selector/default is checked
again in the real packaged app.

The follow-up fuel request adds a live slider, percentage/tonnes/burn readout,
zero-fuel thrust cutoff and manual T restart after refill. Native clock conversion
passes 18 original-code oracle cases. The experimental trim follow-up also
removes an insufficient negative-alpha bound, keeping the preserved model intact.
Final fuel/trim acceptance and source are in the baseline.

Next native extraction targets: map `_COBv`'s adjusted forward bound and
`_FMUpdatePlaneFields`, recover native scheduling/wrap and
weight/state conversion and the complete thrust/world-force path, then compare
whole trajectories. Do not call the hybrid a full USNF97 flight model. Linux
remains deferred by the user. See [native flight](formats/native-flight-code.md)
and [native power](formats/native-power.md) for exact addresses and reproduction.

## 2026-09-09: stationary support, compact retro HUD and helper minimize

The parked-aircraft report reproduced a real defect: angular-rate assistance had
an 8% minimum authority even at zero true airspeed, and ground contact only
constrained translation. Source `16e3bd2` removes that floor. Control authority
now follows air density × true airspeed², including wind. Main-gear support
constrains roll to the terrain plane, parked yaw is suppressed, and low-pressure
pitch settles to the ground. A bounded nose-up rotation envelope opens from 45 to
65 m/s sea-level equivalent. Safe touchdown receives support only after impact
classification, preserving unsafe-arrival rejection. Residual rotation is also
cleared instead of accumulating invisibly against the constraint.

Source `f70e10c` reduces HUD width and height 25% (75% linear scale), doubles
actual screen spacing between 5° pitch rungs and keeps the flight-path marker on
that vertical scale. Thin Courier text, crisp one-unit strokes and removal of
the glow give the requested older instrument appearance. The helper now has a
**−** minimize button and **+** restore button; keyboard focus returns to the
canvas, and flight/HUD continue while the helper content is collapsed.

Lessons: aerodynamic authority needs air-relative velocity and density, whereas
taxi steering needs ground motion. Ground support must handle attitude as well
as position; applying it before impact classification can conceal a crash.
Changing SVG scale also changes tick spacing, so the regression measures actual
screen transforms rather than only SVG coordinates.

Verification: `bun run check` passes 79 tests / 4848 expectations, including four
new physics regressions; all 11 headless maneuvers pass at source 16e3bd2. Fresh
Mac packaging at f70e10c took 26.7 s. The packaged stationary/HUD/panel test passes
with 361 sampled full-control frames, no position/attitude drift, 570×465 px HUD
and 50 px pitch gaps. See [current baseline](baselines/phase-4.md) for maneuver
acceptance and reproducible commands. Screenshots confirm the restored helper
and compact header with the HUD still visible.

The “assisted flight model” label remains accurate: this fixes the reported
behavior but does not port native USNF flight laws or implement individual wheel
rigid bodies. Next: human handling/readability feedback and physical gamepad
acceptance; Linux remains explicitly deferred.

## 2026-09-09: retail engine recordings, movable surfaces and flight HUD

The user's buzzing report exposed a gap between the exterior port and the rest
of the flight test. The former sound was entirely synthesized; the old65–220Hz
sine oscillator was a plausible buzz source. It is removed. `F14.PT` explicitly
names `JET1N.11K`, `JET1A.11K`, `POWERUP.5K` and `POWERDN.5K`; those local samples
now drive the engine loop, secondary layer and distinct start/stop events.
DC removal, loop crossfades and transition fades avoid abrupt signal boundaries.
The secondary-layer assignment to afterburner, low-rate PCM interpretation and
mix remain documented approximations. See [audio findings](formats/audio.md).

Current provenance is explicit:

| Feature | Retail contribution | Remaining original implementation |
|---|---|---|
| F-14 exterior | SH geometry and PIC/palette textures | Bounded static projection; no native renderer execution |
| Moving surfaces | Original faces partitioned with UV interpolation | Authored hinges/mixing for tailerons, rudders, flaps, upper/lower airbrakes |
| Engine sound | Four recordings named by F14.PT, including on/off | Inferred sample rates, looping, mixing and secondary-loop role |
| Other sound | None yet | Wind, gear/hook/contact and missing-import fallback |
| Flight model | PT fields/envelopes decoded for research | Forces, assisted controls, flap/airbrake coefficients remain original |
| HUD | Executable string references and manual behavior | Original SVG instruments; native F14.HUD routines not executed |

B now toggles speed brakes, with wheel braking when grounded; F toggles flaps,
matching the reference manual. Gamepad B retains direct wheel braking. Flaps add
assisted lift/drag, speed brakes add drag, and HUD load reflects flap lift. Surface
partitions conserve each original face's oriented area and remove the old static
faces rather than overlaying duplicates. Flaps inherit wing sweep and deployed
flaps hold wings extended. Gear/hook/arrestor limitations remain unchanged.

The HUD adds heading, attitude/flight-path marker, TAS knots, MSL/AGL feet,
vertical speed, load, throttle and device indicators, updated at30Hz independently
of the120Hz simulation. It is an aircraft-relative instrument in chase views,
not a camera-conformal cockpit display. Downloaded manual text now lives in
[Docs/reference](reference/README.md), per the user's explicit request.

Validation uses unit/model checks plus real packaged key events and actual mesh
transforms. The actual mixed Web Audio graph is recorded to ignored WebM for
signal inspection; this is stronger than merely observing a running AudioContext,
but it still does not establish speaker quality or human listening acceptance.
Exact source commits, counts, flight measurements and artifacts are in the
[phase4 baseline](baselines/phase-4.md). Final source089614f passes **75 tests /
4818 expectations**, **11 maneuvers**, **9 packaged retail checks**, and takeoff/
landing at **60.021 / 60.010 FPS**. Final recorded audio has peak0.279449 and
zero clipped samples. Mac packaging passes in24.4s. All results retain their
source provenance rather than claiming an untested final docs commit was built.

Lessons: `.HUD` is executable drawing code, not a declarative asset file; do not
claim importing it just because its strings are readable. Web Audio rejects
5,512Hz buffers, so low-rate PCM must be explicitly resampled. Match source roles
before choosing recordings. Keep clip provenance separate from inferred mixer
behavior. Screenshot review caught a false airborne wheel-brake annunciator and
pitch-ladder/readout overlap; both were corrected. Device labels now follow the
manual's upper-right placement and disappear when retracted. Authored surface
cuts are useful presentation work, not recovered SH animation semantics.

**Next work:** listen to the revised retail mix on the user's output device;
recover original sound mixer/state semantics and flight-model integration rather
than claiming behavioral parity. Fine hinge seams, native control-surface state
branches, physical controller checks and carrier arresting remain open. Linux
remains deferred. Development commits stay local.

## 2026-09-09: full text manual retained in Docs

At the user's explicit request, downloaded the complete OCR manual into
[Docs/reference](reference/README.md). The supplied Internet Archive `/stream/`
URL returns an HTML reader; the matching `/download/` URL supplies the actual
197638-byte text. Source URL, checksum and OCR/edition caveats are recorded.
This requested reference document is not bundled game data. Work on retail audio,
control surfaces and HUD continues using it alongside local asset/code findings.

## 2026-09-09: local F-14 exterior, USNF-style controls, sound and camera modes

The user's local F-14 now loads into practice flight from app data. The bounded
static SH export produces **186 polygons / 326 triangles** with textured body,
pivoted wings and separate exhaust disks. The earlier eight-face export failure
is preserved in historical records; this is a new nearest-detail projection,
not proof that the broad SH interpreter or original animation program is complete.
See [F-14 setup](phase-4-f14.md), [SH findings](formats/sh.md) and
[phase 4 baseline](baselines/phase-4.md) for provenance and measured acceptance.

- 1–5 select 0/25/50/75/100%; 6 selects afterburner. T toggles the engine,
  G gear, H hook. The helper shows throttle %, AFT, spool and transition progress.
- F2 attaches camera attitude to the aircraft; F3 retains world-up chase. A new
  airborne practice start helps exercise controls without an initial takeoff.
- Gear/hook, speed-dependent wing sweep and attached burner effects animate.
  Safe terrain contact rejects gear-up landings. The hook has no arresting-force
  implementation. Original assisted aerodynamics remain in use.
- Web Audio synthesizes jet/wind/burner/actuator/contact sounds; trusted input
  unlocks the context and M mutes. Human listening is a separate acceptance item.
- Verification: **64 Bun tests / 4726 expectations**, **11 headless maneuvers**
  and **18 packaged systems checkpoints** pass. Imported F-14 takeoff/landing
  achieve **60.021 / 60.009 FPS**, p95 18.6ms, one clamped frame each. Exact
  source/artifact provenance and export-test scope are in the phase 4 baseline.
  Final renderer `730fb6b` builds in23.0s and repeats all18 systems checks after
  the nozzle-anchor refinement; final flame placement was visually inspected.
- Subagents implemented/reviewed the static decoder, input/systems, sound and
  packaged acceptance independently. Retail bytes remain ignored and unbundled;
  the converted model is installed in this Mac's normal app data.

Lessons: parser traversal counts were not exported geometry. Shared destination
slots, structured SH scopes and transformed wing pivots were required for a
recognizable exterior. Bounding-box vertical centering put the belly through the
runway; preserving source vertical zero fixes the presentation. A plausible
texture flip recommendation made the atlas worse: actual screenshots exposed
red logo fragments on the nose/tails, so the change was reversed. Special nozzle
polygons need separate material treatment to avoid permanent burner artwork.
Palette vertex colors require sRGB-to-linear conversion. Burner geometry must
scale from its nozzle anchor, not its center. Keep model hashes, packaged source,
command transitions, actual mesh transforms and screenshot review as distinct
pieces of evidence. Model recognition does not establish original flight behavior.

**Next work:** authentic F-14 coefficients/control-surface behavior, recovered
native animation semantics, human sound/handling review and physical controller
checks remain open. The new local conversion/install route is not the full
in-app retail importer. Linux remains tabled. Changes are committed locally;
no new push is implied by this development entry.

## 2026-09-09: native measurement checkpoint pushed; phase 4 implemented

The completed GPU measurement/terrain-polish checkpoint **`7d19abd` was pushed
to `origin/main`** before phase 4 development. This supersedes the earlier
entry's local-only status. Native GPU external-memory totals were 20.946 GB/s
coast and 13.653 GB/s detail; scope remains sampled GPU-wide traffic, not an
app-exclusive physical DRAM measurement. Linux stays tabled.

Phase 4 source commits `400bdf9`, `cb038c6`, `0110ba7`, `636f80a` and `49a3123`
implement the original coefficient contract/model, safe gear contact, real
terrain integration, controls and deterministic maneuver harness. Independent
subagent review covered model/integration boundaries and packaged visuals.
See [phase 4 baseline](baselines/phase-4.md), [flight guide](phase-4-flight.md)
and [harness guide](phase-4-harness.md).

- **53 tests / 4642 expectations** pass; types, lint and formatting pass.
- All **11 headless scenarios** pass: level/turn/loop/stall/energy, takeoff,
  approach, hard/water impact, render-rate determinism and missing terrain.
- Fresh Mac package from `49a3123` builds in **22.5 s**. Real 1440p arm64
  ground/takeoff/approach samples achieve **60.035 / 60.013 / 60.007 FPS**.
  Takeoff ends at 149.01 m/s and 227.55 m AGL; approach lands and stops inside
  the runway. No renderer exceptions or console errors; visual review passes.
  Approach records one clamped frame, retained in the baseline.
- An additional default terrain-only coast check timed out during CDP frame
  collection. No new explorer timing result is claimed; the cause remains open
  and the phase 3 baseline retains its original source provenance.
- Original procedural aircraft and fictional practice runway require no retail
  assets. Flight contact uses an independent bounded cache and pauses for
  missing data; visual LOD does not determine collision height.
- Reusable packaged acceptance drives ordinary gamepad inputs and preserves
  source provenance, per-frame evidence and screenshots in ignored outputs.

Lessons: clear held controls when a form receives focus; publish diagnostics
only after an asynchronous scene load is accepted; ground initialization is not
a landing; verify velocity trajectories rather than quaternion rotation for
loops. Model determinism, packaged behavior, physical gamepad compatibility and
human flight feel are separate kinds of evidence. Short 60 FPS samples do not
establish long-duration performance or erase isolated clamped frames.

**Next work:** human practice-flight/USNF feel assessment and physical gamepad
checks remain phase 4 acceptance items. Combat and mission work remain phase 5+
plans; Linux testing remains explicitly deferred. Phase 4 changes are committed
locally after validation; the pushed checkpoint above predates them.

## 2026-09-08: verified Mac source transitions and native memory profiling

Packaged source `12851d8`, including renderer fixes `05d0ecd`, `7442ac7` and
`3f7a6b2`. Local commits only; no push. See the updated
[phase 3 baseline](baselines/phase-3.md) for exact measurements and artifacts,
and [GPU notes](gpu-trace-notes.md) for the native measurement's scope/units.

- Source changes now wait for complete coverage and 400 ms stable selection,
  then fade for 800 ms using complementary opaque pixel masks. Both hierarchies
  remain bounded by the existing geometry budget. Mesh selection runs each frame.
- Independent review reproduced and fixed a 5.31 m split-threshold jump and an
  8.96 m clipped-theater-edge jump. Parent height, normals and clamped tint now
  interpolate consistently; four new regressions cover the fixes/state lifecycle.
- Fresh 1440p packaged warm runs: **60.036 fps** detail and **60.014 fps** coast.
  Altitude 30↔100 m and 100↔300 m source transitions pass. Fast Shift flight
  travels ~24.1 km out/back, crosses detail coverage and floating-origin grids,
  and completes both fades without errors or omitted water.
- Six-second moving/settling legs have p95 ≤17.6 ms. Outward legs include real
  49–67 ms maximum stalls; the average is not a claim of hitch-free streaming.
  Fast-flight geometry cache peaks at 31,639,104 bytes, within 96 MiB.
- Mid-fade and settled screenshots were inspected independently. Expected
  silhouette/lake-edge stipple disappears after the fade. Thin dashed patch
  edges and blocky 100 m shorelines persist and remain documented refinement work.
- Native Instruments Performance Limiters configuration captures hardware GPU
  read/write/external-memory bandwidth. The tool preserves the difference from
  the absent legacy `DRAM Bandwidth` counter, GPU upload estimates, and live
  in-app counters. Measurements are GPU-wide sampled intervals, not exclusive
  physical-DRAM traffic attributable to the app. Sample-weighted totals: **20.946 GB/s coast**, **13.653 GB/s detail** in native exported units; sample coverage differs, so these are not wall-time means. Exact read/write figures and scope are in GPU notes.
- `bun run check`: **41 pass / 4580 expectations**, strict types/lint/format pass.
  GPU Python tooling: **6 pass**. Explicit smoke-tool TypeScript check passes.
  Mac arm64/x64 DMG/ZIP build passes in **26.7 s**; only arm64 was launched.
  Pipeline/retail sources are unchanged, so earlier Python results are historical.

Lessons from failed validation are retained: a shader vec3/vec4 mismatch made
land disappear while triangle counters looked healthy; smoke now fails browser
console errors. A descent check ran before debounce, and diagnostic `frameMs`
overwrote raw samples; the harness now waits for completed fades and records
`rafFrameMs`. Two early sampling runs timed out; isolated background/focus
controls made subsequent runs complete, without proving occlusion as the sole
cause. Instruments can exit 0 with an unsupported counter profile; inspect
actual exported samples and native units rather than trusting the exit status.
Full native counter exports expanded to multi-GiB XML and took minutes; an
optional display-label sentinel required a parser regression while preserving
the valid numeric value. Use shorter counter captures for routine profiling.

**Next work:** keep Linux tabled per user decision. Remaining Mac refinement is
fine patch/shoreline edges, isolated streaming stalls and longer thermal runs;
a live native on-screen memory counter and agreed regression margin remain
separate acceptance work. Phase 4 entry (terrain renders) is met on this Mac;
no aircraft, gameplay, retail import or completed Linux gate is implied.

## 2026-09-08: Linux testing tabled; Mac terrain follow-up

User decision: defer Linux testing for now and continue GPU DRAM bandwidth
measurement and terrain transition polish on this Mac. Original cross-platform
criteria remain documented for later; they no longer block this development
pass. AGENTS, README and the build plan now reflect this scope. Historical
entries below retain their original pending-Linux wording.

## 2026-09-08: real Ukraine installed; packaged terrain verified

Final implementation checkpoint `0407365`; full pipeline implementation
`f229ad7`. Evidence is in [phase 2](baselines/phase-2.md),
[phase 3](baselines/phase-3.md), and [GPU trace notes](gpu-trace-notes.md).

- All 832 real chunks pass the Python probe and TypeScript decoder/installer.
  Build: 86.196 s, 71,245,197 gzip bytes + 24,907,069 manifest bytes.
  Water: 33,731 components with 347,838 exterior/interior ring points.
- Installed the validated theater into this Mac's normal app data. Run
  `bun run dev:electron` or open `build/mac/mac-arm64/USNF-ATF.app`; the default
  terrain panel loads `terrains/ukraine/manifest.json`. Nothing was published.
- Final logarithmic-depth package: Odesa coast 60.057 mean fps, 17.6 ms p95;
  Crimean 30m detail 60.039 mean fps, 17.6 ms p95, both at 2560×1440.
  Movement loads detail chunks, screenshots show relief and water, no omitted
  water batches or runtime errors. Measurements are short warm samples.
- `bun run check` passes 37 tests / 4,543 expectations; typecheck/lint/format
  clean. Final `bun run build` passes in 23.7 s, Mac arm64+x64 artifacts.
  Terrain Python suite passes 13 tests in 1.901 s. GPU XML summary has two
  passing synthetic tests. Retail code was unchanged during this development
  pass; the previous 52-test retail result is historical, not rerun here.
- Native Metal tracing and export succeed, but the default counter set has no
  DRAM-bandwidth samples. Added a summary tool that reports unavailable rather
  than zero; follow-up needs a correctly configured Instruments template.

Additional lessons: fix shared GDAL border queries rather than loosening seam
checks; preserve water holes rather than exploding polygons into scanline
rectangles; check actual rendered depth over the sea; isolate automated input
on a shared desktop; separate cold shader startup stalls from warm FPS.

**Next work:** record Linux phase 1–3 checks on real GPU hardware; configure and
measure native DRAM counters; agree a frame-time regression margin; improve
source-LOD transitions, fine edge artifacts, shoreline detail and longer flight
stress coverage. Phase 4 flight-model work remains separate. Phase 0 SH gaps
remain unchanged; no claim of retail gameplay parity or complete phase 3 exit.

## 2026-09-08: phase 1 fixes and first terrain milestones

Work is split across independent shell, pipeline and renderer agents, with root
integration and an independent audit. Local commits are authorized; no push.

- `fe08a61`, `5ae06d5`: fix deliberate child exits shutting down Vite, live dev
  asset reads, and browser read-only asset semantics. Five new tests plus actual
  two-restart Electron/preload smoke pass. [Details](phase-1-followup.md).
- `26bdd18`: shared terrain contract established before parallel implementation.
- `41da203`, `81fb094`, `88041fb`: pipeline, coverage/aliasing corrections,
  reproducible codec comparison. [Pipeline commands and limits](phase-2-pipeline.md).
- `e0615fa`, `aaeba65`: renderer plus sparse-detail fallback, continuous source
  normals, bounded water rendering, hole rings and reproducible camera poses.
  [Renderer commands and limits](phase-3-renderer.md).
- `4c14ff7`: ignore `.venv` in ESLint and Prettier. A Python dependency's vendored
  JavaScript otherwise made the full workspace check fail.
- `ae82289`: CDP packaged terrain smoke with isolated app profile, screenshot,
  1440p frame sampling and input checks. `eef3119`: atomic verified local terrain
  installation; four tests exercise successful staging and failure preservation.

Integrated validation at this checkpoint: `bun run check` passes 36 tests /
4,540 expectations; `bun run build` produces both Mac architectures' DMG/ZIP
in 27.8 s on a warm build. Earlier in this pass a read-only mounted arm64 DMG
launched with hardware probe exit 0; see [phase 1 baseline](baselines/phase-1.md).
A packaged 51km synthetic fixture runs around 60 fps at 2560×1440, camera moves
and the origin rebases. This is integration evidence, not real-terrain acceptance.

Lessons recorded during implementation:

- Original WBM is available under AWS AUXFILES; do not infer its absence from
  a short dataset README. Water class 0 means land, not missing data.
- COG pixel footprints differ from integer-degree cells after border removal.
  Synthesized ocean cells initially left a 15m gap; the builder correctly failed.
- A no-error export can still fail the seam probe: the first real build emitted
  832 chunks but failed a detail border. Keep the probe as an acceptance gate.
- Sparse 30m source coverage must not displace complete 100m ground. Mesh LOD
  is dyadic inside source tiles; source grids themselves do not nest at 30→100m.
- Skirt triangles sharing normals with top-surface vertices caused a visible
  bevel grid. Source-height normals fixed it; screenshots caught what numeric
  transport/mesh tests did not.
- Water islands decomposed into scanline rectangles produced 80,660 surfaces
  in the real theater. Explicit hole rings and a spatial water cache address
  this scale problem; synthetic fixtures had only two water bodies.
- Smooth synthetic terrain exaggerated delta compression's benefit. Measure
  actual quantized source chunks before choosing the transport.
- Animation-frame intervals, CPU submission, uploaded geometry and actual GPU
  DRAM traffic measure different things. The viewer labels each accurately;
  native bandwidth profiling is not implemented by WebGL2 counters.

The previous review below is historical: its claims that implementation code
was unchanged and its three open phase 1 defects describe that earlier review,
not this development checkpoint. Final real-data baselines follow when verified.

## 2026-09-08: repository review and logging baseline

### Verified in this review

- `bun run check`: exit 0, 12 tests pass (41 expectations); typecheck, lint,
  formatting pass. Scope is clock and renderer-name heuristic tests, not gameplay.
- `python3 -m unittest discover -s tools/retail/tests`: exit 0, 52 tests run in
  63.067 s, 51 pass and one skips for missing `USNF_SCRATCHPAD` independent slice.
  Both retail discs are available; archive-handle ResourceWarnings remain.
- Rebuilt current unpackaged renderer/main/preload, then ran
  `bun run probe --unpackaged`: exit 0, Apple M3 via ANGLE Metal,
  `unmaskedInfo: true`, `softwareRenderer: false`. Installer packaging was not
  rerun. Exact commands and machine details: [phase 1 baseline](baselines/phase-1.md).
- Read-only SH and PIC censuses used local extracted media; exported OBJ strings
  were inspected in memory. No viewer acceptance was claimed. Counts, timings,
  scope and reproduction commands: [phase 0 baseline](baselines/phase-0.md).
- No tracked files under `gameassets/`, `extracted/`, or `build/` at review start.
  This is a tracked-path check, not the planned retail-signature release scan.

### Corrections to the previous entry

1. SH was committed in `8af84a5`; it is not untracked. There is no pending
   superseded x86 decoder removal identified in the current file. Treat old
   session intentions as historical until checked against source.
2. Phase 1 is not fully complete under the build plan: Linux checks, build,
   hardware launch and baseline are still outstanding. macOS progress continues.
3. The 8,413 compressed LIB entries counted the two main embedded LIBs per title.
   All-disc coverage is 10,035 compressed LIB entries plus 27 PKWA ESA entries.
4. The earlier 4,140 PIC count matches the integration test's archive list. It
   excludes 21 USNF_8 and 22 ATF_4C images. A broader census now decodes all 4,183
   without exceptions; this does not validate every image visually or fix palettes.
5. SH batch conversion returns 1 for the reported zero-polygon/stopped shapes;
   the earlier exit-0 claim is inconsistent with committed code. A single-file
   exit 0 also does not guarantee usable geometry.
6. F-14's dropped faces are not explained by a writer that handles only one
   table. It offsets every table. Observed causes: 96 polygon references exceed
   their assigned table's size; one has no assigned table. Shared vertex-buffer
   addressing is the next hypothesis to test, detailed in [SH notes](formats/sh.md).
7. PT field layout and mass/thrust evidence are useful, but coefficient meaning
   and runtime flight behaviour are not fully proven. Corrected an erroneous
   Su-27 arithmetic comparison and the “every field named” claim in [PT notes](formats/pt.md).

### Open code review findings

These are follow-up work, not fixes delivered by this documentation review.

| Priority / finding | Evidence and impact | Next verification |
|---|---|---|
| High: SH vertex addressing | `tools/retail/retail/sh.py`, `_Walker.step`, `to_obj`: ignores the `0x82` header word at +4; F-14 drops 97 polygons. Values such as 1512 = 189×8 suggest destination slots. | Synthetic buffer-update tests; record dropped primitives; view F-14 from multiple angles; repeat both-title census. |
| High: Electron shell restart can shut down dev session | `shell/scripts/dev.ts:46` attaches shutdown to every child exit; watcher intentionally kills that child at :69. A killed Bun child returns numeric 143, satisfying shutdown's condition. | Distinguish deliberate restart from user exit; make two shell edits and verify Vite stays alive and Electron relaunches. Full UI restart test still needed. |
| Medium: Electron dev asset reads can be missing/stale | `shell/src/main.ts:36` resolves assets in copied production output; `shell/scripts/dev.ts:33` bundles shell without refreshing renderer assets. | Read `hello.txt` through platform FS from a clean dev checkout and after changing the source asset. |
| Medium: browser accepts writes to read-only assets | `engine/src/platform/browser.ts:67` accepts `assets` writes, contrary to `Platform.ts:10` and Electron rejection. Agent reproduction wrote and read back an overridden asset. | Shared contract checks: asset writes reject, appData/cache writes round-trip. |
| Medium: retail coverage and resource cleanup | `test_pic.py` omits two archives; ESA/EALIB retain open handles and tests emit ResourceWarnings. No SH tests. | Expand media coverage, retain absent-media skips, and add explicit archive lifetimes plus focused malformed-input tests. |

Other SH limitations: state-insensitive visitation, x86 table reset, incomplete
bounds validation, unresolved axes/scale and no texture export. Zero-polygon
shapes remain unclassified. T2 elevation/tile semantics, runtime palette slots,
JT timers and PT damage semantics remain open. The phase 5 retail scan is absent.

### Lessons learned

- Track four milestones separately: record decoded, export structurally valid,
  asset visually recognizable, behaviour matches retail. Eight valid OBJ faces
  from 105 parsed polygons show why “no exception” is too weak an exit gate.
- Count the actual input set. Embedded archives, all disc archives, extracted
  files, and hand-selected test lists have different totals; record which one
  a measurement covers and whether the files were regenerated.
- ATF's surviving field comments help recover USNF schemas; names transfer more
  confidently than units or runtime semantics. Keep unknowns explicit.
- Archive boundaries matter: EALIB sentinel entries, duplicate names, and the
  ESA codec tag's trailing NUL were useful earlier findings. Keep those lessons
  with format notes and synthetic regression fixtures when changing parsers.
- A green unit suite does not exercise shell restarts, IPC or packaging. Test
  those flows directly when they change; preserve provenance for GPU probes.
- Probe scripts reuse outputs. Rebuild before claiming current-source evidence,
  and distinguish an unpackaged launch from an installer installation.
- Commit research checkpoints with limitations. A durable checkpoint is useful;
  describing it as complete hides the next task. Historical logs need corrections
  when later measurements change the explanation.

### Next work, in order

1. Resolve and test SH vertex-buffer indexing; inspect an F-14 preview stored in
   `extracted/`. Keep the phase 0 two-week time box (through 2026-09-22); phase 5
   can use a placeholder if SH remains unresolved.
2. Fix the dev restart and asset-root/contract issues before relying on the
   shell for frequent terrain iteration. Use the verification steps above.
3. Integrate the phase 0 commands into the disc-to-listing/PNG/OBJ deliverable,
   expand regression coverage, and refresh the baseline after implementation.
4. Record Linux evidence when the GPU box is available; phase 1 stays open.
   The phase 2 entry gate only requires the scaffold, so Linux pending does not
   prevent beginning the Ukraine terrain pipeline.
5. Begin phase 2: define theater projection/bounds and manifest contract, build
   the offline terrain pipeline, run the chunk probe and measure size before
   choosing compression. No new theater or compression decision made here.

### Documentation delivered

Added root `AGENTS.md` for this macOS checkout; updated the existing `README.md`
with runnable capabilities and commands; aligned plan status; added phase 0
baseline and provisional SH notes; refreshed format counts and phase 1 evidence.
No runtime or decoder code changed. Final validation: Markdown relative links,
`bun run format:check`, and `git diff --check` pass; the embedded baseline
census snippets rerun successfully with matching counts. Local commit is
authorized; no push requested.

## Earlier log (historical)

The entry below is preserved as originally recorded. Its completion, repository
state, scope, and root-cause claims are superseded by the review above.

---

## 2026-09-08: phase 1 complete, phase 0 nearly complete

### Summary

| Phase | Status | Commit |
|---|---|---|
| Repo hygiene | done | `46074cf` |
| 1. Scaffold, shell, packaging | done on Mac; Linux baseline deferred | `3be679f` |
| 0. Containers (EALIB, ESA, DCL) | done | `c83967a` |
| 0. PAL, PIC, FNT to PNG | done | `77762b1` |
| 0. PT, JT, OT, NT, T2, M, MT | done (T2 and M partial) | `3e770d0` |
| 0. SH shapes to OBJ | **in progress, uncommitted** | see below |
| 0. CLI integration and baseline | not started | |

Phase 0's exit criteria: `.PT` thrust, mass, and an aero coefficient are
identified with confidence (met). F-14 OBJ recognizable in a viewer (not
yet met; see the SH section).

### Phase 1: scaffold (done)

Bun workspaces (`engine`, `shell`, `importer`), strict TypeScript, ESLint 9,
Prettier, Vite, React 19, Three.js, Electron 44. Main and preload are
bundled with `Bun.build`; the engine never imports `electron`. Platform
interface in `engine/src/platform/Platform.ts` with browser and Electron
implementations. `FixedStepClock` (120 Hz accumulator) is unit-tested.

Scripts: `bun run check` (typecheck, lint, format check, tests),
`bun run dev`, `bun run dev:electron`, `bun run build` (products land in
`build/`), `bun run probe` (launches the app with `--probe`, prints the
WebGL2 capability JSON, exit 0 hardware / 2 software / 3 timeout).

Verified on the Mac: `bun run check` clean with 12 tests; `bun run build`
produced arm64 and x64 dmg and zip under `build/mac/` in about 49 s; the
probe reports the Apple M3 through ANGLE Metal, not a software renderer.
Details in `Docs/baselines/phase-1.md`. The Linux GPU box section of that
baseline is empty until that machine exists.

### Phase 0: containers (done)

`tools/retail/retail/{dcl,ealib,esa,disc}.py`, CLI `python3 -m retail
{list,extract,cat,stats}`. The flag-4 LIB codec is PKWare DCL implode
(port of zlib's `blast.c`). Every compressed entry on both discs decodes to
its declared size: 8,413 LIB entries and 27 ESA entries, zero failures.
Both discs are extracted to `extracted/usnf97/` and `extracted/atf-gold/`
(gitignored, 1.5 GB). Notes: `Docs/formats/{ealib,esa,dcl}.md`.

Quirks recorded: EALIB directories end in a sentinel entry; `USNF_2.LIB`
lists 52 `.XMI` files twice; the earlier ESA off-by-one was the NUL after
the codec tag.

### Phase 0: images, palette, fonts (done)

`retail/{pal,pic,fnt,png}.py`. PIC is a 64-byte header followed by raw
rows or a span-list sprite, optionally with an embedded 6-bit palette that
overlays hardware slots from index 0. All 4,140 PIC files across both
titles decode. FNT files are Phar Lap PE images with one compiled x86
routine per glyph; a small interpreter recovers the bitmaps, 24 of 24
render. The F-14 canopy frame (`~F14H.PIC`, 1280x490) and HUD fonts were
checked by eye. PNGs are under `extracted/png/` (gitignored).

Open: runtime palette ranges 192..254 (sky and some flight sprites) come
from a source not yet located; whether index 255 in `_*.PIC` textures is a
key colour waits on SH texturing.

### Phase 0: plane types, weapons, terrain, missions (done, some partial)

`retail/{brf,pt,jt,t2,mission}.py`. `.PT`, `.JT`, `.OT`, `.NT` are CRLF
text in an assembler-like data language; ATF Gold's copies carry the
original C field names as trailing comments, and USNF'97's are the same
statement sequence without comments, so names transfer by position. `.M`
and `.MT` are plain text. `.HUD` and `.PTS` are small Win32 PE plug-ins.

Identified with evidence: `weight` (F-14 40,104 lb, Jane's empty weight),
`maxTakeoffWeight` (74,349 lb), `thrust` and `aftThrust` (41,800 lbf, two
TF30s in afterburner), `internalFuel`, drag and lift coefficients in 8.8
fixed point, and per-G flight envelope polygons in ft/s and ft. Angles are
1/65536 of a turn. Notes: `Docs/formats/{pt,jt,t2,mission,object-types}.md`.

Theater census (missions referencing each map): Ukraine 103, Kuril 41,
North Vietnam 36 in USNF'97; Vladivostok 58, Egypt 51, Baltics 50, France
25 in ATF Gold. T2 grids are 25x25 to 32x32 tiles of 8x8 cells, 8,192
world units (ft) per cell, so a theater is roughly 500 to 640 km on a side.

**Decided 2026-09-08:** Ukraine is the first theater (most missions, 77%
land); Kurils second. Recorded in `build-plan.md` phase 2 and section 3.

Open: T2 elevation byte units and tile table, Baltic sea encoding, JT
timer units, PT `structure` and `systemDamage` semantics.

### Phase 0: SH shapes (in progress, stopped by a spend limit)

State: `tools/retail/retail/sh.py` exists (473 lines) and is **untracked**.
`Docs/formats/sh.md` was **never written**, although the module docstring
references it. No tests. The agent's last stated intent was to remove a
superseded idiom-based x86 decoder from the module, save its opcode survey
as a reusable script, and re-run it.

What the module does: treats a `.SH` as a tiny PE image (`MZ` stub, `PL`
signature, `CODE`, optional `.idata` importing `do_start_interp` and
`_nightHazing` from `main.dll`, `.reloc`). The CODE section is a
byte-oriented drawing program: vertex tables (opcode `0x82`, int16 XYZ),
BSP-style plane tests with relative jumps, polygon, line, and point
primitives with palette colours, normals, and optional UVs, plus short x86
stubs that branch on engine state (gear, wing sweep) before re-entering
the interpreter. The parser walks the program as a control-flow graph,
following every branch, and collects the geometry it understands.

Measured on 2026-09-08 (`python3 -m retail.sh --all
extracted/usnf97/USNF_2.LIB -o extracted/obj/usnf97`, exit 0):

| Measure | Value |
|---|---|
| Shapes fully walked with polygons | 316 of 353 |
| Shapes walked with zero polygons | 35 (effects, trees, buildings, clouds, weapons) |
| Shapes that hit an unknown opcode | 2 (`F8.SH` opcode `0x6e`, `SUN.SH` opcode `0x13`) |
| `F14.SH` | 34 vertex tables, 533 vertices, 105 polygons, no stops |
| `F14.obj` as written | 533 vertices, **8 faces** |
| F-14 vertex bounds | x -91..93, y -15..29, z -86..113 (model units) |

The bounds are aircraft-shaped (wide in x and z, thin in y), so vertex
decoding looks right. The gap is between the 105 polygons the parser
reports and the 8 faces `to_obj` emits; likely the OBJ writer only
resolves faces against one vertex table or drops polygons whose indices
refer to tables other than the current one. Until that is fixed the
exit criterion (recognizable F-14 in a viewer) is not met and no preview
image has been rendered.

The 35 zero-polygon shapes are probably billboard sprites and particle
emitters that use primitives the walker does not yet classify, not
parse failures.

To resume: read `sh.py`'s `_Walker` and `to_obj`; fix face emission
across tables; render an orthographic wireframe of `F14.obj` and look at
it; write `Docs/formats/sh.md`; add `tests/test_sh.py`; then commit. Time
box from the plan: if this is not done within two weeks of 2026-09-08,
phase 5 uses a placeholder model.

### Not started

- Integrate `pic`, `fnt`, `sh`, `pt`, `jt`, `t2`, `mission` as
  subcommands of `python3 -m retail` (each currently runs as its own
  module, `python3 -m retail.pic ...`).
- `Docs/baselines/phase-0.md`: decode counts and timings above, recorded
  with machine and commit.
- Phase 1 exit on the Linux GPU box.

### Repo state

Working tree after this entry: one untracked file, `tools/retail/retail/sh.py`.
Nothing under `extracted/`, `gameassets/`, or `build/` is tracked.
Nothing has been pushed.
