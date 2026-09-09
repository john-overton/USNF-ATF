# Phase 4 baseline: original practice flight on Mac

## 2026-09-09: shared MFD, orientation and waypoint teleport in all modes

Product source**10c318e**, Mac Apple M3/macOS arm64, Bun1.4.2, Electron44.2.0.
Mac arm64+x64 DMG/ZIP packaging passes in23.7s; only arm64 launched. Full check
passes120tests/5,134expectations including type/lint/format. Flight force routines
and assisted source are unchanged. Teleport adds input/state transitions only.

Both `extracted/waypoint-teleport/report.json` (tool6f55ab5) and
`extracted/waypoint-teleport-settled/report.json` (tool9923015) pass against10c318e.
Final bezel polish12fc0ab fixes the GO3legend covering the distance scale.
Its build passes in27.0s, full120tests/5,134expectations pass again, and
`extracted/mfd-final/report.json` passes navigation/zoom/720p layout plus explicit
softkey-label containment above the scale. All-mode behavior remains verified
at10c318e;12fc0ab changes MFD nesting/label layout only.

The second tool waits90frames plus stable terrain streaming before screenshots;
initial immediate coast captures included the expected cold terrain transition.
All tests use actual product buttons/keyboard events and isolated app profiles.
No renderer errors in any mode.

| Check | Explorer | Assisted | PT envelope fit | Recovered envelope |
|---|---|---|---|---|
| Map and all3teleport buttons | Pass | Pass | Pass | Pass |
| Teleport to strip/mountains/coast | Pass | Pass | Pass | Pass |
| Controls regain focus | Pass | Pass | Pass | Pass |
| Compass, north-up and heading-up | Pass | Pass | Pass | Pass |
| Zoom and post-jump input | Pass | Pass | Pass | Pass |
|40%fuel, stopped engine, F2view retained | N/A | Pass | Pass | Pass |
| Selected model retained | N/A | Pass | Pass | Pass |

Initial teleport altitudes: strip1135.8m, mountains2544.3m, coast1082.2m MSL.
These use the finest containing chunk's maximum plus1000m, not the destination
pixel alone. Flight snapshots vary slightly because the engine-off aircraft
continues gliding. Position assertions allow200m for advancing simulation; actual
states and UI markers are retained in reports. Heading-up checks verify net
rotation cancels heading and the compass is present. The explorer's W movement
continues after the teleport controls return focus.

Focused backend tests cover stale/disposed requests, invalid/missing destination
coverage, preserved fuel/mass/systems, fine-versus-coarse terrain and raised-water
holes. Optional destination failure leaves current contact state usable. An
already-sticky normal-contact error still requires terrain reload. Teleport
starts a new airborne state/time; it is not mission navigation parity or a flight
performance measurement. No Linux or full-route flight was run.

```sh
bun tools/flight/teleport-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit 10c318e --out extracted/waypoint-teleport-settled
```

## 2026-09-09: navigation HUD and zoomable MFD map

Machine: same Apple M3/macOS arm64, Bun1.4.2, Electron44.2.0. Product source
**cf238d9**, following navigation/map integration**2b5d2c9**. Mac arm64+x64
DMG/ZIP build passes in23.2s (initial2b5d2c9 build26.2s); only arm64 launched.
Full check at2b5d2c9:117tests/5,101expectations plus type/lint/format pass.
The one-line HUD placement polishcf238d9 passes focused5tests/81expectations.
Initial development checks caught explicit-undefined optional props and a
nullish-coalescing lint rule; both were corrected before the accepted full check.

`extracted/flight-navigation/report.json` passes on2b5d2c9;
`extracted/flight-navigation-final/report.json` passes oncf238d9. Both use the
actual packaged Electron app and trusted CDP keys/buttons. No renderer errors.
The first screenshots revealed the waypoint line over the aircraft at1440p;
cf238d9 moves it above the heading tape. Final1440p/720p screenshots confirm
readable placement and map separation. Initial1440p capture caught a transient
cold terrain fade; subsequent toolc31fe2a waits for streaming/transition settling
before visual capture, without changing product behavior. The resulting
`extracted/flight-navigation-settled/report.json` passes oncf238d9 with toolc31fe2a;
the settled1440p screenshot was visually reviewed.

| Acceptance | Result |
|---|---|
| Waypoints1→2→3→1 and reverse wrap | Pass, HUD and map agree |
| Key repeat / text-field focus | Selection does not change |
| Minimize helper | Map remains, canvas regains focus |
| Map zoom1/2/4/8/16× and back | Pass, bounded controls |
| Visible scale at those zooms | 100/50/20/10/5NM |
| Zoom click followed by bracket key | Flight focus restored; selection changes |
| Aircraft marker | Tracks actual changing position; north-up coordinate tests pass |
| 1280×720 map/HUD rectangles | No overlap |
| Missing/corrupt/cancelled map data | Focused tests reject bad bytes and queued reads; missing samples excluded |

Destination verification from the installed Ukraine dataset is recorded in
`extracted/flight-navigation-destination-evidence.json`, with exact source chunk
paths/hashes. OverviewLOD4 map is512×512pixels, generated from2700m source; its
valid-land white threshold is254.251m, minimum−15.394m, sampled peak1350.171m.
Negative dry terrain remains land. Water polygons retain their dry holes.

| Destination | East / north metres | Finer terrain check | Distance from strip |
|---|---|---|---|
| 1 Practice strip | 289000 /392000 | 100m ground108.139m; existing deck111m | 0 |
| 2 Mountains | 500483.325 /72926.215 | 30m ground1467.421m, dry | 382.797km |
| 3 Coastline | 275731.777 /309799.333 | 100m ground2.934m, dry | 83.265km |

GroundSampler.sourceAt checks at≤1km intervals find no missing30/100m coverage:
384samples to mountains,85to coast. These checks establish sampled manifest
coverage, not a completed flight or guaranteed clearance. Overview heights are
not fine contact heights. Zoom enlarges the same overview; small water features
can be lost at map resolution. No new native-flight parity claim, performance
baseline or full-route flight is made. Fuel/physics were unchanged and their
older measurements below retain original source attribution. Linux deferred.

```sh
bun run check
bun run build
bun tools/flight/navigation-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit cf238d9 --out extracted/flight-navigation-settled
```

## 2026-09-09: completed packaged fuel acceptance

Resumed run on the same Apple M3/macOS arm64, Electron44.2.0, Bun1.4.2, 2560×1440
package: **runtime8b6a2d4**, test-tool source **ac3a142**. No product changes or
rebuild. `extracted/flight-fuel-resume/report.json` reports **pass** in both tested
modes, with no renderer errors.

| Check | Preserved assisted | Recovered-envelope |
|---|---|---|
| Military measured burn | 0.9071847400 kg/s | 0.9071847400 kg/s |
| Afterburner measured burn | 4.5359237000 kg/s | 4.5359237000 kg/s |
| Engine-off burn | 0 | 0 |
| Live 50% fuel adjustment | Pass; no flight restart | Pass; no flight restart |
| Tank exhaustion | Zero fuel, engine off, effective thrust throttle0 | Same |
| Refill to40% | Engine remains off until T | Same |
| Manual restart | Engine and consumption resume | Same |
| Handling mass | Fixed9,000kg throughout | Fuel loss equals aircraft mass loss |

Experimental mass at half fuel was21,760.8672kg, at empty18,190.8684kg and after
40% refill21,046.8674kg. Assertions compare mass loss to consumed fuel within
1e-6kg and measured burn rates within0.001kg/s. Empty/refilled screenshots were
reviewed; the automated-test banner is clearly visible.

```sh
bun tools/flight/fuel-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit 8b6a2d4 --out extracted/flight-fuel-resume
```

This resolves the interrupted fuel acceptance described below. The intermediate
PT-fit selector mode was not separately run by this two-mode test; its fuel path
is shared with the tested experimental mode. The outstanding final aero/approach
retests were not run as part of this fuel-only request. Prior unit/native-oracle
results remain historical, not newly rerun. Linux remains deferred.

## 2026-09-09 checkpoint: fuel slider and native-rate consumption

Latest packaged runtime **`8b6a2d4`** includes live fuel, mass updates and the
experimental negative-alpha trim correction `5795e9f`. Fresh Mac arm64/x64
DMG/ZIP packaging passed in **24.6 s**. `bun run check`: **110 pass / 5,045
expectations**, TypeScript/lint/format pass. The first UI integration typecheck
caught an omitted `setFuelFraction` viewer return-type member; it was corrected
before the accepted check/build.

The native clock oracle adds **18 passing original-code cases**, confirming
256 ticks/second and fuel rates in pounds/second. Full military / AB F-14 burn
is **0.90718474 / 4.5359237 kg/s**. Runtime fuel integrates smoothly at 120 Hz
rather than the native five-second batch. Actual experimental mass decreases;
preserved assisted handling mass stays 9,000 kg. Empty tanks cut thrust; live
refill requires a manual T restart. Without an imported PT, fallback capacity
and rates are explicitly original.

Both fixed-reference-mass headless suites pass all **14 scenarios** at8b6a2d4:
`extracted/flight-harness/fuel-era-retail.json` and `fuel-era-recovered.json`.
These calibrate flight forces with a fixed reference load; packaged FuelSystem
integration is separate. The exact experimental trim now uses the full
unstalled negative-alpha branch; the preserved assisted source is unchanged.

**Interrupted acceptance, not a pass:** the user accidentally closed the
packaged fuel-test window, then explicitly requested commit/push/compaction.
`extracted/flight-fuel-accepted/report.json` records a CDP timeout while querying
diagnostics. Assisted-mode live 50% slider, military/AB burn windows and engine-
off zero burn had completed. Empty-tank/refill/restart and the experimental-mode
fuel/mass run did not complete. The chained final aero and approach tests did
not start. No fuel end-to-end acceptance is claimed for this checkpoint.

Earlier packaged native takeoff and approach at4a76cc5 both passed: approximately
60 fps, p95 17.6/17.5 ms, one takeoff / one safe stopped landing respectively.
Evidence: `extracted/flight-models-native-takeoff` and `flight-models-native-approach`.
Those precede the trim/fuel changes and must not be relabeled as8b6a2d4 results.

Tool follow-up labels automated windows in their title and with an orange banner;
CDP disconnects now reject pending operations immediately. Standalone TypeScript
checking passes; the visual label/disconnect behavior still needs the next live
run. A native-power source comment was also corrected to reflect fuel wiring;
neither follow-up changes the packaged product behavior.

Resume commands and current state are in [the handoff](../handoff.md). Linux
remains deferred. No further tests were started after the user's checkpoint request.

## 2026-09-09: selectable flight models and recovered native routines

Machine: Apple M3/macOS arm64, Electron 44.2.0, Bun 1.4.2; real Ukraine terrain,
local F-14 exterior/audio/PT data; packaged renderer 2560×1440. Runtime source
**`4a76cc5`** includes the three-mode selector and native-envelope bridge. Fresh
Mac arm64/x64 DMG/ZIP packaging completed in **26.0 s**; only arm64 launched.
A previous two-mode package at `955da68` completed in 24.1 s and supplied the
first PT device A/B evidence. Documentation edits during measurements are
recorded in the reports and do not change the named runtime binary.

### Preservation and imported profile

The default assisted backend is the exact `f70e10c` simulation source, apart from
its provenance comment. Its implementation SHA-256 is
`d10533425d70602fe4139459d75b51ced4161ea9f5b3a5fe63df98baacbc7cd1`.
The preserved file uses the existing trainer tables and systems, while PT and
recovered-envelope work is opt-in. This is an explicit user requirement.

`extracted/flight/f14-flight.json`: **21,483 bytes**, SHA-256
`60c5d8e4c756962a192e5035f25c3947b6f7515cb3f978804034e40c99028ea6`.
It supplies fourteen native G polygons, 18,190.8684 kg empty mass, 7,139.9975 kg
fuel capacity, 126,485.1816 N military thrust and 185,935.6635 N AB thrust. Full
fuel/no payload is the experimental reference mass of 25,330.8659 kg. Native
integer points, header indices and structural thresholds are also preserved.
The installed model/audio hashes remain those in the earlier retail baseline.

### Verification and interpretation

`bun run check` at the three-mode runtime: **104 pass / 5,005 expectations**,
TypeScript/lint/format pass. Two early checks caught `prefer-const` and a control-
character regex lint violation; both were fixed before accepted source. The
first exporter invocation omitted required `--pt`, failed without producing
output, and was corrected. Targeted PT flight export: **7 synthetic tests pass**;
local F-14 export/validation/install succeeds. No Linux or x64 launch acceptance.

The native oracle maps the actual local PE sections into Unicorn and supplies
synthetic game state. Executable SHA-256:
`ecd3eb067f624fe48ea6547e8d4b80d1232723a9b7e0113f77d0e94fcb14caf9`.
**240 cases** match both recovered envelope helpers. **3,200 cases** match fuel,
slew, thrust selection and zero-vector scalar thrust (800 each). The initial
envelope translation got classification priority wrong; executing the original
instructions exposed it, and the corrected implementation passes. This verifies
isolated routines, not a booted game or complete native trajectory. Power
helpers are not connected to the flight backends yet.

At source4a76cc5 both `tools/harness/retail-flight.ts` modes pass **14 scenarios**,
with complete source/dirty-tree provenance in:

- `extracted/flight-harness/retail-accepted-final.json`
- `extracted/flight-harness/recovered-accepted-final.json`

Each level trial runs 600 simulated seconds through normal control inputs at
120 Hz. No aircraft state is overwritten. Full-fuel clean final speeds in knots
true airspeed:

| Altitude | PT fit military / AB | Recovered-envelope hybrid military / AB |
|---|---:|---:|
| 100 m | 660.12 / 801.85 | 660.47 / 802.23 |
| 3,000 m | 706.02 / 858.19 | 706.28 / 858.51 |
| 36,000 ft | 1,093.92 / 1,340.38 | 1,093.48 / 1,339.84 |

These are calibrated remake measurements. Treating the native polygon's upper
edge as full-fuel, clean AB equilibrium is an explicit fit assumption; these
numbers are not retail-game flight measurements. The tests also verify mass
changes acceleration, engine-off devices dissipate extra energy and low-speed
stalls remain possible. Native helpers preserve original integer rounding and
flap thresholds, while the surrounding force law remains original.

Packaged `ground-smoke.ts` at4a76cc5 passes: default remains the 9,000 kg assisted
model; the selector switches to both 25,330.87 kg experimental modes and back.
Held stationary controls, HUD 570×465px /50px pitch gap, helper collapse/restore,
canvas focus and continued simulation all pass. Screenshots reviewed. Evidence:
`extracted/flight-models-ground-final`.

Packaged six-case device/mass A/B at955da68 (`extracted/model-switcher-aero`) and
recovered-envelope at4a76cc5 (`extracted/flight-models-native-aero`) pass. Ten-second
specific-energy losses (J/kg) at zero throttle:

| Mode | Clean | Flaps | Airbrake | Gear |
|---|---:|---:|---:|---:|
| PT fit | 1,220.11 | 1,660.62 | 2,513.00 | 1,791.39 |
| Recovered-envelope hybrid | 1,221.83 | 2,256.70 | 2,512.33 | 1,794.02 |

AB gains are 7,975.45 vs10,475.99 J/kg (PT) and7,968.07 vs10,477.68 J/kg
(recovered) for full vsquarter fuel. Actual key paths, animated deployment,
profile provenance and exact PT AB/military ratio are checked. The recovered
flap screenshot exposed excessive ballooning due to a positive-only trim search;
a subsequent experimental-only correction and its acceptance are recorded below.

Remaining limits: original atmosphere/thrust lapse, alpha response and control
assistance; higher-G fitted drag transitions at polygon ceilings; nearest-fit
extrapolation beyond covered altitude; fixed fuel load and payload mass without
store-specific drag; incomplete native world-state/power integration. The
preserved default's feel is not overwritten to chase these experiments.

## 2026-09-09: ground support and compact HUD/helper controls

Accepted runtime source **`f70e10c`**, including physics commit `16e3bd2`, on
Apple M3/macOS arm64, Electron 44.2.0, Bun 1.4.2, real Ukraine terrain and local
F-14 geometry/audio imports at 2560×1440. Fresh `bun run build` completed in
**26.7 s**, producing arm64/x64 DMG/ZIP; only arm64 was launched. Subsequent
documentation edits were present during maneuver recording, but no runtime source
changed. Imports are the same hashes recorded in the preceding baseline.

- `bun run check`: **79 pass, 0 fail, 4848 expectations**; types/lint/format pass.
- `bun run harness --output extracted/flight-harness/ground-support-final.json`:
  **11/11 pass**, source `16e3bd2`. New pressure/support checks cover stationary
  full controls and residual rates, taxi/takeoff, TAS²/density/wind authority and
  slope-aligned landing support. The agent's initial lint run found a
  `prefer-const` violation, corrected before commit; final checks pass.
- `ground-smoke.ts`: **pass**, evidence `extracted/ground-support-accepted`.
  Full positive inputs were observed for 180 frames and full negative inputs for
  181 frames. Position/quaternion remained within 1e-6 of the resting state;
  angular velocity remained below 1e-8. Actual HUD box **570×465 px**, pitch-rung
  gap **49.999998 px** per 5° (previous 25 px), no CSS filter, one-unit stroke and
  Courier font. Collapse/restore preserves visible HUD, canvas focus and advancing
  simulation. Both screenshots visually reviewed.

- Packaged takeoff, 40 s: **pass**, 60.0142 fps, p95 17.6 ms; 1 takeoffs / 0 landings, final airborne, 149.0223 m/s and 228.0999 m AGL. 1 clamped frame(s), no renderer errors. Evidence: `extracted/ground-support-takeoff`.
- Packaged approach, 60 s: **pass**, 60.0027 fps, p95 17.6 ms; 0 takeoffs / 1 landings, final grounded, 0.0000 m/s and 0.0000 m AGL. 1 clamped frame(s), no renderer errors. Evidence: `extracted/ground-support-approach`.

Reproduction, after rebuilding the named runtime source:

```sh
bun tools/flight/ground-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit f70e10c --out extracted/ground-support-accepted
bun tools/flight/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit f70e10c --aircraft extracted/flight/f14.json --audio extracted/flight/audio/f14.json --scenario takeoff --out extracted/ground-support-takeoff
bun tools/flight/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit f70e10c --aircraft extracted/flight/f14.json --audio extracted/flight/audio/f14.json --scenario approach --out extracted/ground-support-approach
```

This establishes the reported stationary behavior and Mac flight regression;
it does not establish native USNF aerodynamic parity, per-wheel suspension,
physical controller acceptance or Linux support. Audio decoder/animation suites
were not repeated because those implementations did not change.

## 2026-09-09: retail audio, movable surfaces and HUD

Accepted runtime source **`089614f`** on Apple M3/macOS arm64, Electron44.2.0,
Bun1.4.2 and the real Ukraine theater at2560×1440. Mac arm64/x64 DMG/ZIP packaging
passed in **24.4s**; only arm64 launched. Source `2d662c4` supplied the first
packaged evidence; `6bfe9b8` and `089614f` corrected HUD overlap/annunciation and
aligned device labels with the manual before the final rerun. Subsequent
helper-tool/docs commits are not retrospectively part of the measured binary.

The installed model now has **364 triangles / 18 material groups**. Its186 source
faces are partitioned into206 faces; tailerons, rudders, flaps and upper/lower
speedbrakes reuse those faces and UVs with authored hinges/mixing. No new opaque
surface is simply layered over its old static counterpart. The importer retains
source hashes and a limitation statement in the local data.

- Model:11471313 bytes, SHA-256
  `b6dbd672e412b9af0ba6da22562c5b46523b591614db2929c561f614241097ea`.
- Audio:397237 bytes, SHA-256
  `9fd9b3f87c6b8c59a01be0ba4fac3ee9849d274fa2f31742c6cfd6758dc5a678`.
- Both imports were installed into this Mac's app data, never bundled.

### Automated and packaged checks

`bun run check`: **75 tests / 4818 expectations**, types/lint/format pass.
`bun run harness --output extracted/flight-harness/f14-retail-accepted.json`:
**11 maneuvers pass**, source089614f. New device-force tests verify speedbrake
energy loss and flap lift/drag; load telemetry includes the flap contribution.
Targeted Python suites: **13 SH tests** (12 synthetic plus one available-media
area-conservation check) and **3 audio tests** (including available F14.PT sample
mapping), all pass with no skips. The full retail/container suite was not rerun
for this isolated decoder/audio change; its prior baseline remains historical.

`retail-smoke.ts` passes **9 packaged checkpoints** at source089614f, with real
keyboard events, actual rendered surface transforms, neutral restoration and a
visible HUD. Retail sound loading is required. Exactly one recorded shutdown and
one startup are observed; no repeated events occur during later surface tests.
The actual audio graph is tapped through a parallel MediaStream destination and
recorded to `extracted/f14-retail-accepted/engine-cycle.webm` (plus decoded WAV).
Final decoded15.06s mono48kHz signal: **RMS0.047196, peak0.279449, zero clipped
16-bit samples**. No console/renderer/audio errors are recorded. This proves
non-silent, non-clipped graph output, not speaker quality or subjective freedom
from buzz. The inferred playback rates and authentic low-rate PCM texture remain
part of the uncertainty; the prior synthesized sine has been removed.

Independent earlier review of source2d662c4's15.48s capture also measured distinct
shutdown/start envelopes and no clipping. Its artifact is
`extracted/f14-retail-acceptance/audio-independent-review.json`; it is separate
from the final recording above.

| Final packaged maneuver | Duration | Mean FPS | p95 frame ms | Result |
|---|---:|---:|---:|---|
| F-14 + HUD takeoff | 40s | 60.021 | 17.500 | One takeoff;149.02m/s,228.04m AGL |
| F-14 + HUD approach | 60s | 60.010 | 17.700 | One landing;stopped at x289000/z391213.966 |

Both runs record **one clamped frame** and no renderer errors. Landing final
speed is approximately zero, y113.2, inside the practice runway. The recordings
are `extracted/f14-hud-takeoff` and `extracted/f14-hud-approach`. Those two
maneuvers use virtual gamepad inputs; retail smoke separately unlocks and tests
real audio with trusted keys. Short cadence samples do not establish thermal or
physical-gamepad acceptance.

### Visual review and limits

Screenshots show coherent flap, upper/lower brake, pitch/roll tailplane and rudder
movement. Neutral poses restore continuous silhouettes; small hinge seams remain
below reliable chase-scale inspection. Final HUD screenshot inspection confirms
no airborne wheel-brake label, no ladder/readout overlap and upper-right device
annunciators. It displays TAS (not unimplemented IAS), feet MSL/AGL and aircraft-
relative attitude/path in chase view. It is original SVG, not executed F14.HUD.

The [reference manual](../reference/README.md) is retained in Docs per the user's
request, with exact download/hash metadata. Asset provenance and remaining
original flight/mixer/hinge logic are tabulated in [progress](../progress.md).
Linux remains deferred. Original physics parity, native SH/HUD execution, carrier
arresting and human sound/handling acceptance remain open.


## 2026-09-09: local retail F-14 and aircraft systems

Runtime flight measurements below use **`fe83ce8`**, built in **23.4 s**, with
the local static model generated by exporter `f96c65f`. Later flame-anchor-only
rendering verification is recorded separately below; do not relabel these flights
as measurements of that later package. Machine is the same Apple M3/macOS arm64,
2560×1440, Bun 1.4.2 and real Ukraine terrain. Mac arm64/x64 DMG/ZIP packaging
passed; only arm64 was launched. Linux remains deferred.

The F-14 exterior contains **186 source polygons / 326 triangles**, eight material
parts, textures, separate wing pivots and exhaust disks. Local JSON is 8,213,574
bytes with SHA-256
`a58b25a139d42e76fbe3676eb432a9aacf330fb49135e981df96b2e312bf4f82`.
Source F14.SH hash is
`88200fd0db0b0374812287f19dec39e23987df9b968feb4d78bebc8046eef710`.
This is a bounded static nearest-detail export with original supplementary
gear/hook/burner geometry; dynamics remain the original assisted coefficient set.

| Packaged flight case | Duration | Mean FPS | p95 frame ms | Result |
|---|---:|---:|---:|---|
| F-14 takeoff | 40 s | 60.021 | 18.600 | One takeoff; final149.02m/s,227.92m AGL |
| F-14 approach | 60 s | 60.009 | 18.600 | One landing; stopped at x289000/z391214.757 |

Both runs pass, with no renderer errors and **one clamped frame each**. Final
landing speed is approximately zero and the position is inside the practice
runway. Takeoff/landing automation uses normal virtual gamepad inputs, never
writes aircraft state, and does not test physical controllers. Evidence:
`extracted/f14-takeoff-final` and `extracted/f14-approach-final`.

The real-keyboard systems test at `fe83ce8` passed **18 checkpoints** in
`extracted/f14-systems-final`. These cover six throttle presets, actual afterburner
thrust/visibility, engine cutoff and spool/restart, intermediate/final gear and
hook mesh transforms, wing sweep above180m/s and restoration, banked F2/F3
camera up vectors, running AudioContext and mute/unmute. Screenshots were
independently inspected: F2 aircraft remains screen-level with a banked horizon;
F3 keeps the horizon level with a banked aircraft; hook and sweep visibly move;
engine cutoff darkens nozzles and removes flames. This test is functional
acceptance, not a cadence benchmark or human listening test. Immediate preset
checks establish bindings, not settled acceleration at every detent. Packaged
camera coverage includes one banked orientation; the pure camera test separately
checks bank and inversion.

`bun run check` passed **64 tests / 4726 expectations**, types/lint/format clean.
All **11 headless maneuver scenarios** still pass with optional system controls
omitted (baseline semantics preserved). Retail Python suite ran **60 tests: 59 passed
and one optional scratchpad check skipped** before the final two export-contract tests;
all **10 current synthetic SH tests** pass. Existing container ResourceWarnings
and the scratchpad byte-oracle gap remain recorded, not silently resolved.

Initial images caught a wrong UV flip despite passing numeric systems tests;
reversing it restored coherent markings. Special nozzle disks were separated to
avoid displaying fixed burner artwork at idle. Palette RGB now converts from
sRGB to linear before entering vertex attributes. A final visual refinement
anchors flame geometry at nozzle bases while scaling, eliminating forward/inboard
flames. Exact original texture dispatch/animation and authentic F-14 aerodynamics
remain unverified. See [setup and controls](../phase-4-f14.md) for reproduction.

Final renderer source **`730fb6b`** contains only the subsequent nozzle-anchor
refinement and camera-label screenshot synchronization. Its Mac build passed in
**23.0 s**, and all **18 systems checkpoints** passed again in
`extracted/f14-systems-accepted`. Final afterburner screenshot inspection confirms
both flame bases now attach to their nozzle centers. The final source check still
passes64 tests/4726 expectations. The earlier takeoff/landing metrics above retain
`fe83ce8` provenance because they were not rerun after this visual-only adjustment.

## Earlier original-aircraft baseline

Verified 2026-09-09 on Apple M3, macOS 26.6.2, Bun 1.4.2. Packaged runtime
source **`49a3123`**; subsequent documentation and smoke-tool commits do not
change that binary. Mac arm64/x64 DMG/ZIP packaging passed in **22.5 s**;
only arm64 was launched. The real Ukraine terrain is the phase 2 dataset.

## Implementation and automated acceptance

The original aircraft uses validated JSON coefficient tables and a pure 120 Hz
assisted flight model, quaternion attitude, aerodynamic forces, throttle,
stall, gear contact, brakes and crash states. The app adds a procedural aircraft,
chase camera, HUD, keyboard/standard gamepad input and runway/approach starts.
Terrain contact independently samples decoded 30/100 m data with an 8 MiB LRU;
unavailable samples pause simulation. The practice runway validates dry terrain
coverage before flight. It is fictional, not a surveyed airport or retail asset.

`bun run check` passed **53 tests / 4642 expectations**, including strict types,
lint and formatting. `bun run harness --output extracted/flight-harness/phase4-final.json`
passed all **11 scenarios** at source `49a3123`:

| Case | Measured result |
|---|---|
| Level flight, 60 simulated s | Maximum altitude error 4.04 m; final 150.90 m/s |
| Sustained 35° bank | Velocity heading changes 156.05°; altitude error 20.26 m |
| Unpowered flight | Specific energy falls 40669.95 → 36909.74 J/kg |
| Vertical trajectory loop | 360.06° in 40.55 s; peak altitude 7270.33 m; minimum speed 145.98 m/s |
| Stall and recovery | 79 stalled diagnostic samples; last at 8.61 s; final 152.59 m/s |
| Takeoff from rest | Airborne at 237.86 m and 130.73 m/s after 45 s |
| Approach and braking | Touchdown at 24.11 s; stops after 3585.77 m, inside the equivalent runway |
| Hard impact / water impact | Both enter crashed state |
| Render cadence independence | Identical state after 7200 ticks at 30/60/144 Hz |
| Missing terrain | No integration until contact samples become available |

The loop is an actual velocity-path maneuver with an imperfect return, not just
an attitude rotation. See [harness contracts](../phase-4-harness.md) for gates.

## Packaged real-terrain flight

[Reproduction commands](../../tools/flight/README.md) launch isolated profiles
at 2560×1440. A virtual standard gamepad drives the normal input adapter; the
feedback pilot never writes aircraft state. Background/occlusion throttling is
disabled and CDP emulates focus. Screenshots are outside the measured interval.
These settings describe the benchmark, not ordinary app background behavior.

| Scenario | Sample duration | Mean FPS | p95 frame ms | Final result |
|---|---:|---:|---:|---|
| Ground | 15 s | 60.035 | 18.600 | Grounded, stationary, no false landing |
| Takeoff | 40 s | 60.013 | 17.300 | One takeoff, 149.01 m/s, 227.55 m AGL |
| Approach | 60 s | 60.007 | 17.600 | One landing, stopped inside runway |

All three passed with no renderer exceptions or browser console errors, and
screenshots were independently inspected. Approach stopped at x=289000,
y=113.2, z=391217.614, speed approximately zero, throttle zero and brakes on.
Runway center is (289000, 392000), dimensions 100×2800 m, elevation 111 m;
the aircraft's 2.2 m gear offset accounts for final center height.
Each run used 262144 decoded contact-cache bytes. Ground and takeoff recorded
zero clamped frames; approach recorded **one clamped frame**. A 60 FPS average
does not prove every frame was smooth or establish long-duration performance.

Ignored evidence directories contain report JSON, per-frame flight/terrain
samples, initial/final screenshots, runtime errors and Electron logs:

- `extracted/phase4-ground-final`
- `extracted/phase4-takeoff-final`
- `extracted/phase4-approach-final`
- `extracted/flight-harness/phase4-final.json` (headless report)

Reports distinguish packaged source from current HEAD/working-tree status;
the smoke tools were uncommitted during capture. Do not infer that subsequent
documentation was in the measured binary.

An additional default terrain-only coast run on this package timed out in its
65-second CDP frame-collection request (`extracted/phase4-terrain-regression.log`).
It produced no accepted timing report. The earlier phase 3 coast baseline remains
historical; this attempt does not establish a new explorer performance result.
The cause is unresolved and should be checked before claiming that regression
gate passed. The three flight runs above completed separately.

## Remaining acceptance and lessons

Physical controller hardware and human comparison with USNF handling remain
unverified. This is an original assisted placeholder, not recovered retail
flight behavior. Combat, missions and retail aircraft import remain planned.
Linux is deferred by user decision; x64 launch and long thermal runs are untested.
Contact resolution can change across authored 30/100 m coverage. Runway sample
validation is not a proof about every terrain pixel, and camera behavior remains
an initial implementation.

Focus changes must clear held keys, including key releases targeting form
controls. Async scene construction must publish diagnostics only after its load
is accepted, or a stale load can remove the active flight diagnostics. Both have
regressions. Ground spawn must not count as a landing; actual airborne clearance
arms the counters. Render triangles alone cannot establish valid shaders or
visible aircraft: retain console-error checks and screenshot review alongside
physics assertions. Keep control-driven packaged acceptance separate from
synthetic deterministic model tests and from human feel assessment.
