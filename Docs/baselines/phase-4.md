# Phase 4 baseline: original practice flight on Mac

## 2026-09-11: Taxi wind assistance

Ground physics now scales applied wind from 5% at rest to full at 150 knots
horizontal ground speed, with full airborne wind and unchanged weather readouts.
See [ground-wind baseline](ground-wind.md) for the exact rule, tests and scope.


## 2026-09-11: Native brakes and afterburners; ATF F14 exterior

A4 brake backing is preserved with original aft panels instead of a fuselage cut.
X31/F14 native brakes and F14/X31 atlas-mapped burner states are imported. The
F14 exterior now uses the separate ATF rig and gear mounts; its USNF flight source
remains. Models installed, runtime rebuilt, live brake/burner and ground checks
passed. See [device baseline](aircraft-devices.md) for exact source, commands,
41 SH tests, 462 workspace tests/3 skips, visual captures and remaining limits.


## 2026-09-11: Aircraft texture composition and native gear

All three imported aircraft now resolve dynamic decal pages separately, composite
keyed texture paint over native palette base colors, use front-face visibility,
and reuse original textured wheel/strut/door geometry. Imported gear replaces
procedural fallback and supplies visible-pixel support height. Exact commands,
32 SH tests, 460 engine/workspace tests (3 skips), live actuator/ground checks,
source commit and texture limitations are in [texture baseline](aircraft-textures.md).
Native lighting, selected mission liveries and original gear schedules remain
outside acceptance. Runtime rebuilt and exterior JSONs installed locally.


## 2026-09-11: Missing native flap faces restored (correction)

The earlier substitute wing cuts did not repair the A-4's rectangular gaps.
Native `0x12` drawing calls were being skipped, omitting original neutral flap
panels on A4/F31/F14. Calls now use signed end-relative targets and persistent
shared vertex/texture state. Recovered panels/UVs are rigged at their own hinge
edges and installed for all three aircraft. Exact native handler evidence,
source base, 23 passing SH tests, full check results and renderer captures are
recorded in [corrected flap acceptance](flap-placement.md). Earlier silhouette
acceptance is superseded; full native animation remains unproven.


## 2026-09-09 correction: closing-range bar direction

Same Apple M3/macOS 26.6.2, Bun 1.4.2 and Node v22.14.0 as below.
Source: base commit `55c0471de3dddec519bb6cabefca4e6cc73cc052` plus working tree;
`engine/src/flight/GunSightOverlay.ts` SHA256
`6a7c0f0580b6ed1a12fbf937c40e5b794c827fb7fe1ece514ca2050df04cef43`.
The earlier range bar filled in the wrong direction. It now stays absent at or
beyond 1,000 m and on base fallback, then fills west→south→east as range closes.
The thin ring and existing projection/visibility rules are unchanged.

`bun run check`: **256 passed, 0 failed**, 693,172 assertions; typecheck, lint
and formatting pass. Updated arc test checks absent 1,000/2,000/invalid ranges,
left-hand origin, lower-half sweep and endpoints at 750/500/250/0 m. Imported
projection tests also pass with local media, no skips. Desktop smoke assertion
now expects no thick bar at base range. `git diff --check` passes; staging empty.
Electron/packaging, Python and maneuver harness were not rerun for this SVG-only
correction; previous desktop evidence predates the reversed fill. Linux remains
deferred. Next manual check: approach nearer terrain and watch left-to-right fill.

## 2026-09-09 correction: camera-projected gun cue and lower range arc

Machine: Apple M3, macOS 26.6.2 arm64, Bun 1.4.2, Node v22.14.0,
Electron 44.2.0 / Chromium 152.0.7977.76. Base source commit
`55c0471de3dddec519bb6cabefca4e6cc73cc052` plus the uncommitted working tree.
Final engine/tool source inventory:
`extracted/cockpit-gun-smoke/source-projected-reticle.json`, SHA256
`be90f1d05a462b2549f53b94c7d2e125cec3ad01e2c48953f8503a9c0cee2ad6`.
This supersedes the previous sight's authored angular-scale and parallax
limitations. No installer or retail files were changed.

Confirmed defect/reproduction: the previous `gun-sight.ts` discarded the muzzle
origin and mapped angles with unequal horizontal/vertical scales, then
`FlightHud.tsx` centred those inside a per-aircraft artwork rectangle. Arming
F14/A4E/X31 showed the cue follow each HUD artwork centre, not the gun trajectory.
Tests comparing those same angles could not prove screen alignment. Independent
bounded review confirmed this diagnosis and found no additional concrete
regressions in the corrected projection/gating code.

Verification:

- `bun test engine/src/flight/gun-projection.test.ts`: **6 passed, 0 skipped**.
  Actual locally installed gun manifests for all three aircraft were available.
  Tests independently step rounds from each barrel then compare their mean world
  point and projected screen point: world error <1e-7 m, pixel comparisons at
  five decimal places. Cases cover 2560×1440, 1024×768, 3440×1440, centred/offset
  head look, pitched/yawed/banked aircraft and three floating-origin choices.
  Separate tests check eye-to-muzzle parallax, behind-camera rejection, range arc
  endpoints/intermediate range, and armed/ammo/camera visibility gates.
- `bun run check`: **256 passed, 0 failed**, 693,166 assertions; TypeScript,
  lint and format pass, no skips. Existing gun cadence/ballistic tests pass with
  the shared muzzle transform. HUD tests now explicitly reject F2/F3 markup.
- `bun run probe --fresh`: fresh source built, Apple M3 hardware WebGL2, exit 0.
- `bun tools/flight/cockpit-gun-smoke.ts f14`, then the same command with `a4e`
  and `x31`: **all pass**, zero renderer errors, all remain airborne. Imported
  cockpit/flight/gun data loaded; safety hides the cue, armed F1 shows it, F2/F3
  hide the flight HUD, returning to F1 restores it, and 1280×720 resizing retains
  the cue. A4E/X31 runs include additional armed F2/F3 assertions added after
  the F14 run. Screenshot evidence: each aircraft's `armed-reticle.png`,
  `tracers.png`, `F2-orbit.png`, `F3-orbit.png`, `cockpit-720p.png` under
  `extracted/cockpit-gun-smoke/<id>/`. Armed cockpit images inspected for all
  three; F14 tracer screenshot also inspected. Thick lower arc is visible.
- `bunx prettier --check README.md AGENTS.md`, `git diff --check` pass;
  staged files empty. No Python suites or flight maneuver harness rerun because
  decoders, terrain pipeline and aircraft motion solvers were unchanged.

The reticle projects a newly fired round at the selected range using the current
camera. Earlier rounds in a manoeuvre can differ because they retain the velocity
at firing. A4E represents the two parallel barrels' mean, not artificial
convergence. Surface ranging still uses a sampled forward ray (25 m intervals),
not exact ballistic terrain collision. General pitch-ladder/flight-path artwork
is not re-calibrated by this fix. Target mode remains synthetic plumbing only.
No frame-rate benchmark, installer, night or physical-input acceptance in this
pass. Linux deferred; Windows phase 9. Next human check: low-level strafing with
terrain inside 1 km, observing the arc shorten toward south/east and round paths.

## 2026-09-09: retail/cockpit defaults and gun ranging

Machine: Apple M3, macOS 26.6.2 arm64; Bun 1.4.2, Node v22.14.0,
Electron 44.2.0 / Chromium 152.0.7977.76. Source: base commit
`55c0471de3dddec519bb6cabefca4e6cc73cc052` plus this uncommitted working tree.
Source inventory: `extracted/cockpit-gun-smoke/source-defaults-reticle.json`,
SHA256 `6d6b3a701656970155d2982227dba0e2d8bfa0e843f7d75bbaac81a1a62d50ea`.
Scope is defaults, input reset, gun-sight calculation/HUD and smoke assertions;
assisted and experimental flight solvers and retail bytes are unchanged.

- `bun run check`: **249 passed, 0 failed**, 693,018 assertions; TypeScript,
  lint and formatting pass. Four new sight tests compare terrain cue to actual
  stepped rounds, solve a moving target intercept, reject invalid direction or
  unreachable targets, and check near/far/sky/missing-data ranges and lateral
  inertia. No Bun skips.
- `bun run probe --fresh`: final source rebuilt, hardware Apple M3 WebGL2 probe
  passes. An earlier rebuild logged macOS `task_policy_set` invalid argument but
  returned a successful hardware report; final probe also exits 0.
- `bun tools/flight/cockpit-gun-smoke.ts`: F14 and A4E passed with imported PT
  profiles, default cockpit, default `retail-envelope`, a range solution capped
  at 1,000 m, removed camera HUD label, mirrors/look/chase and gun/safety/audio
  checks, zero renderer errors. X31 launch then failed inside Electron's sandbox
  startup (`binding.startupData` null / `preloadScripts`), before app acceptance.
- `bun tools/flight/cockpit-gun-smoke.ts x31`: isolated retry passed, zero renderer
  errors. All three aircraft remain airborne after the gun/control exercise.
  F14 screenshot inspected: ring and 1,000 m base-range label visible, cockpit
  fits, camera label absent. Range text initially crossed the pitch ladder; moved
  to the vacated lower-right HUD row afterward. Final fresh-source X31 rerun
  verifies that placement. Screenshots/reports in `extracted/cockpit-gun-smoke/`
  supersede prior files for matching aircraft/scenarios.
- `git diff --check` passes; staged-file inspection is empty. Python suites and
  maneuver harness were not rerun: no decoder, pipeline or flight solver changes.
  Installer packaging, physical controller/feel acceptance and night reruns were
  not performed for this change. Linux remains deferred; Windows phase 9.

The 1,000 m base range is an authored gameplay assumption. Surface probes step
25 m and refine sampled crossings; thin features can be missed. The gun sight
uses aircraft-relative HUD scales rather than camera-projected optics. Target
input is tested synthetic plumbing only; it has no acquisition/UI or game targets.
Next reproducible human check: start airborne in each aircraft, descend toward
terrain inside 1 km and compare `GUN RDR` / `GUN BASE` transition and tracer cue.

## 2026-09-09 follow-up: enlarged HUD fit and live mirrors

This supersedes the initial independent HUD layout/static-mirror limitation
below. Same M3/macOS/Bun/Python/Electron machine and base source commit
`40d5fb9ffe2c5de41efef2274e04d13f5d5c9843`, with the follow-up working tree.
Final changed-source inventory: `extracted/cockpit-gun-smoke/source-with-mirrors.json`,
SHA256 `290fd41cf89842de2ed09b559b79d2f45a25f0a6d9b5b4f80b2bc6af4706dcae`.
The initial inventory remains separate at `source-files.json`.

The user's larger-frame/HUD-fit request is implemented with a centered 1.8×
horizontal frame and per-aircraft safe glass rectangles. The full SVG fits
without changing its aspect ratio at 1280×720, 1920×1080, 2560×1440 and 1024×768
(test geometry); frame/HUD/mirror transforms share 30 Hz flight UI updates.
Forward framing crops the side mirrors, which enter view during head look.

Exact connected mirror fills are extracted as RGBA masks and alpha holes (three
F14, three shared F4/A4E, none F31/X31). One 512×256 rear target refreshes at
10 Hz, with distinct reflected left/center/right crops. Tail/airframe rendering
is temporarily enabled only for the mirror pass. Renderer target/viewport/scissor,
clear/shadow-update state and primary aircraft visibility are restored. Rear
terrain uses the already selected radial terrain; volumetric cloud compositing
is omitted. This is authored mirror optics, not recovered game code.

Final verification:

- `bun run check`: **237 passed, 0 failed**, 692,954 assertions; typecheck,
  lint and formatting pass. Intermediate check had one external HUD fixture
  failure because cockpit layout was looked up in chase mode; conditional
  lookup corrected it. The normal external HUD fixture is unchanged.
- `python3 -m unittest discover -s tools/retail/tests`: **84 tests, OK,
  1 optional scratchpad skip**, 62.768 s. Mirror coverage test proves exact alpha
  and preservation of disconnected pixels of the same color. Initial A4E mirror
  seed fell outside opaque art and export rejected it; reviewed seed corrected
  before successful exports. Existing ResourceWarnings remain as noted below.
- `bun run probe --fresh`: final source build and M3 hardware probe pass.
- `bun tools/flight/cockpit-gun-smoke.ts f14`: enlarged cockpit, all three masks
  loaded, updating live rear tail view and controls/gun checks pass. This first
  mirror run precedes the final distinct-crop refinement.
- After rebuilding, `bun tools/flight/cockpit-gun-smoke.ts a4e`,
  `bun tools/flight/cockpit-gun-smoke.ts x31` and
  `bun tools/flight/cockpit-gun-smoke.ts f14-night`: **all pass**, zero renderer
  errors. A4E has three loaded masks, no mask errors; X31 has zero regions/updates.
  Final F14-night includes the distinct-crop code. A4E center and side mirror
  images, F14 center tail view, and X31 720p fitted HUD were inspected. Red night
  luminance remains visible with the final enlarged cockpit. Earlier green night
  evidence is below; the gun renderer did not change in this follow-up.
- `git diff --check` and staged-file inspection pass; staging remains empty.
  Default assisted-flight source is unchanged; its 16-case harness pass below
  remains applicable (no physics changes in this follow-up).

Canonical cockpit manifests were regenerated with
`PYTHONPATH=tools/retail python3 -m retail.cockpit --aircraft <id> --source-root extracted --out extracted/flight/cockpits/<id>.json`
and installed for each ID with
`bun tools/flight/install-aircraft.ts extracted/flight/<id>.json "$HOME/Library/Application Support/USNF-ATF/data" --id <id> --cockpit extracted/flight/cockpits/<id>.json --gun extracted/flight/<id>-gun.json`.
These supersede the initial bundle's static cockpit imports. The helper will
produce the new masks in future complete bundles. Screenshot/report paths below
are reused by later scenarios, so the latest files supersede earlier captures.

Mirror diagnostic CPU submission samples were 0.8 ms F14 and 0.6 ms A4E on update
frames; these are single samples, not a GPU benchmark or 60-fps acceptance. Target
storage is about 1 MiB plus small mask textures. Remaining limitations: authored
mirror optics/cropping, small-window HUD readability requires human acceptance,
static retail instrument art, no 3D side/rear cockpit, no volumetric clouds in
mirrors, no native HUD projection, and the previously recorded intermittent
Electron startup failure. Next: compare mirror framing and HUD readability in
`bun run dev:electron` at the user's preferred window size. Linux deferred;
Windows remains phase 9.


## 2026-09-09: cockpit frames, view controls and luminous practice guns

Source: working tree based on `40d5fb9ffe2c5de41efef2274e04d13f5d5c9843`,
including this change; no new source commit claimed. Mac Apple M3 arm64,
macOS 26.6.2, Bun 1.4.2, Python 3.14.6, Electron 44.2.0 / Chromium
152.0.7977.76. The original `assisted-flight.ts` has no diff. Changed source
hashes are in ignored `extracted/cockpit-gun-smoke/source-files.json` (SHA256
`72a728ada89a096c7b1d3a0d69b571af85e99c7049bef9dca81e9e855e0d89ed`).

All three full bundles converted and installed under local app data with:
`bun tools/flight/port-aircraft.ts --aircraft <id> --install "$HOME/Library/Application Support/USNF-ATF/data"`.
Bundles under `extracted/aircraft-ports/<id>/`: F14
`2026-09-10T01-53-16-651Z-0bf13d96`, A4E
`2026-09-10T01-54-20-652Z-9eaf782e`, X31
`2026-09-10T01-54-21-337Z-d194815e` (UTC names; local date September 9).
Each report records source/output hashes. Retail bytes stay ignored and outside
the build. Cockpit/PIC and gun/JT source mappings and ballistics references are
in [cockpit and guns](../phase-4-cockpit-guns.md).

Verification:

- `bun run check`: **234 passed, 0 failed**, 692,887 assertions; typecheck,
  lint and formatting passed. Intermediate runs stopped on a nullish-coalescing
  lint error, fixed before the final pass. Focused tests also exposed/fixed
  signed-zero and synthetic-fixture errors and truncated-PNG acceptance.
- `python3 -m unittest discover -s tools/retail/tests`: **83 tests, OK,
  1 skip** (optional scratchpad USNF_1.LIB slice comparison; `USNF_SCRATCHPAD`
  unavailable). New three-aircraft gun and cockpit retail coverage ran without
  missing-media skips. Existing archive ResourceWarnings were emitted.
- `bun run harness --output extracted/flight-harness/report.json`: **16/16**
  original flight cases passed. This is not retail gun or aircraft parity.
- `bun run probe --fresh`: fresh unpackaged build passed, Apple M3 Metal
  hardware WebGL2, `softwareRenderer: false`; no new installer build claimed.
- `bun tools/flight/cockpit-gun-smoke.ts`: day F14/A4E/X31 and midnight F14
  scenarios passed. Two multi-session attempts stopped during Electron startup
  with `sandboxed_renderer.bundle.js` / null `binding.startupData.preloadScripts`,
  before application loading (first at A4E, then at X31-night). The second attempt
  passed all daylight cases and F14-night. Final
  `bun tools/flight/cockpit-gun-smoke.ts x31-night` passed independently.
  Successful scenes had **zero renderer errors**, decoded cockpit images,
  working look/orbit/center controls without roll input, safe-fire inhibition,
  actual ammunition debit, minority tracers and running imported audio contexts.
  The intermittent Electron startup failure remains recorded, not suppressed.
- `git diff --check`: passed; no staged files or retail bytes added to Git.

The final recorded shot counts after safety reengaged were 85 F14/day,
30 A4E/day, 80 X31/day, 85 F14/night, 77 X31/night. These include CDP screenshot
latency while the key remained held and are not cadence measurements; deterministic
unit tests establish 100 M61 rounds and 20 tracers per second at 120 Hz. A test at
800 m/s aircraft speed verifies 1,830 m/s forward projectile world speed, plus
lateral/vertical inherited velocity and gravity. Mk12 pair uses 33⅓ rounds/s.

Screenshots/reports live under `extracted/cockpit-gun-smoke/{f14,a4e,x31,f14-night,x31-night}/`.
Inspected F14 day/night and X31 night tracers and A4E 720p cockpit: retail alpha
shows the scene, the artwork expands with the viewport, and red/green luminous
heads and streaks remain visible at midnight. Cockpit proportions stretch with
the window; mirrors/gauges are static retail art. Forward art moves/fades while
looking, with no invented side/rear cockpit. The original HUD is independent of
the retail HUD glass and is not a recovered conformal gunsight. Audio context
running establishes active Web Audio, not human listening acceptance.

Remaining: drag/dispersion/recoil, terrain impacts, targets/damage, native cockpit
layout/working instruments/mirrors, manual audio/visual familiarity, and the
intermittent Electron startup issue. Full phase 5/6 acceptance is not claimed.
Linux deferred; Windows launch remains phase 9. Next reproducible step: run
`bun run dev:electron`, select each installed aircraft, F1, Shift-arrow/Shift-/,
then Shift-Tab and Tab; listen to the selected gun and compare day/night tracers.



## 2026-09-09: Tomcat envelope controls, longitudinal forces and loading

Source: working tree based on `8a4af2fa2c7b21331a5d24d2269a114d122b5de2`,
including this performance change; no new source commit claimed. Mac Apple M3
arm64, macOS 26.6.2, Bun 1.4.2, Electron 44.2.0, Chrome 152.0.7977.76,
Unicorn 2.1.4. Profile: local `extracted/flight/f14-flight.json` with its source
hash recorded in each JSON report. All data/output remain ignored.

Full internal-fuel mass held fixed at 25,330.87 kg, no payload/burn, no wind,
clean devices, fixed 120 Hz. Four 3,600-second level trajectories per model
start at 450/770 KTAS, 36,000 ft, 45/100% dry throttle. Four ten-second full-pull
trajectories per model start at 1,000 m and the speeds below. No state edits occur
after initialization. Before: `f14.json`; after: `f14-final.json`, both under
`extracted/flight-envelope-audit/`.

| Measurement | Before retail / recovered | After retail / recovered |
|---|---|---|
| 45% dry equilibrium, KTAS | 680.91 / 680.96 | 390.45 / 390.45 |
| 100% dry equilibrium, KTAS | 1100.05 / 1100.06 | 793.34 / 793.34 |
| Peak G from 250 KTAS | 5.19 / 5.21 | 3.76 / 3.77 |
| Peak G from 350 KTAS | 9.00 / 9.03 | 5.62 / 5.64 |
| Peak G from 450 KTAS | 12.47 / 12.52 | 5.95 / 5.96 |
| Peak G from 550 KTAS | 16.13 / 16.19 | 6.26 / 6.28 |

After level altitude excursions stay below 10 m; final 30-second speed changes
are below 0.01 KTAS. The 100% dry result is still supersonic according to the
recovered sound-speed helper: this targets original-game behavior, not a
real-world Tomcat performance reconstruction. Scalar x86 tests at unloaded
coefficient state bracket 45% equilibrium at 400–450 KTAS; including full-fuel
load corrections gives the lower runtime result above.

The existing retail acceptance suite now has 15 cases per native profile.
Full-fuel AB at 100/3,000/10,972.8 m reaches 683.73/731.13/1145.79 KTAS;
unladen 36,000-ft AB reaches 1344.94 KTAS, preserving the clean 1G upper boundary.
Full-fuel speed is no longer incorrectly required to reach that unladen bound.
Weight acceleration, gear/flap/airbrake energy losses and low-speed departure
checks pass in both models.

Commands/results (all from this working tree):

```sh
bun run check
bun run harness
PYTHONPATH=tools/native extracted/native-flight/.venv/bin/python tools/native/g-limits-oracle.py --exe extracted/usnf97/SETUP.ESA/USNF.EXE --out extracted/native-flight/g-limits-synthetic.json
bun tools/native/check-g-limits.ts extracted/native-flight/g-limits-synthetic.json
PYTHONPATH=tools/native extracted/native-flight/.venv/bin/python tools/native/drag-oracle.py --exe extracted/usnf97/SETUP.ESA/USNF.EXE --out extracted/native-flight/drag-oracle.json
bun tools/native/check-drag.ts extracted/native-flight/drag-oracle.json
bun tools/harness/envelope-audit.ts extracted/flight/f14-flight.json extracted/flight-envelope-audit/f14-final.json
bun tools/harness/retail-flight.ts --profile extracted/flight/f14-flight.json --output extracted/flight-envelope-audit/acceptance-retail-final.json
bun tools/harness/retail-flight.ts --profile extracted/flight/f14-flight.json --model recovered-envelope --output extracted/flight-envelope-audit/acceptance-recovered-final.json
bun run probe --fresh
bun tools/flight/envelope-smoke.ts
python3 -m py_compile tools/native/g-limits-oracle.py tools/native/drag-oracle.py
git diff --check
```

- Check: 218 pass, typecheck/lint/format clean. Harness: all 16 pass.
- Oracle: 600 G ranges, 108 low-speed reductions, 72 turn rates; 3,200 sound/drag
  and 800 loading cases pass against actual x86, no import/arithmetic stubs.
  Six separate native caller slices also verify forward-bound plumbing.
- Mac fresh probe: hardware ANGLE Metal Apple M3, no software renderer.
- Live desktop flight: all four cases passed, no renderer errors: F14 retail
  peak 4.62G, F14 recovered 4.64G, A-4E retail 7.34G, X-31 retail 6.57G.
  `extracted/flight-envelope-audit/desktop.txt` and `desktop-*/report.json` use
  ordinary key input and a ten-second autopilot hold followed by a ten-second
  pull from the standard 3,000-m/150-m/s airborne start, not high-altitude
  performance acceptance. Recorded AP states stay level then switch off on
  pitch input; hold altitude excursions 14.46/14.40/4.73/5.37 m respectively.
  Screenshot inspection confirms the F14 HUD and aircraft rendered; captures
  occurred at night and are not an exterior-art or frame-time acceptance.
- No unavailable-media skips. Python retail/pipeline suites not run: no decoder
  or terrain producer changes. Native oracle scripts execute against local media.
- Initial failures, corrected: neutral-trim test retained the old body-up cosine;
  G-to-turn helper returned JS negative zero; full-fuel AB acceptance assumed
  unladen boundaries; one initial Prettier check. These are not remaining failures.

Limits: original SI lift/rotation/contact/stall remain; helper parity is not
complete game-flight parity. Payload mass is aggregated rather than partitioned
into native hardpoint groups (up to one percentage point difference). The Extra G
UI, damage and native NPC flight are absent. Preserved assisted source unchanged.
No new installer packaging or x64 launch test. Linux deferred; Windows phase 9.

## 2026-09-09: wind is the only environment input to the flight model

Source: dirty tree based on `0b10b548d8e6655466002819c3aa4cc0579d892b`.
Machine: Apple M3 arm64, macOS 26.6.2, Bun 1.4.2. `bun run harness` now runs 16
scenarios, all passing; the 11 pre-existing maneuver cases are unchanged. The new
five exercise `FlightEnvironment.wind`, which `aerodynamics()` already subtracted
from ground velocity in both the native and the preserved assisted backends.

| Scenario | Measured |
|---|---|
| `wind-zero-identity` | Omitted wind, explicit `{0,0,0}` and the `calm` preset produce byte-identical `FlightState` over 30 s of banked flight (`assert.deepEqual`). A separate `bun test` case repeats this for the preserved assisted backend over 1200 steps. |
| `parked-in-surface-wind` | Gear down, brakes on, 15 m/s wind from 270, 60 s: 0.269 m drift, terminal velocity 4.5 mm/s, still `grounded`. |
| `headwind-versus-tailwind-takeoff` | Ground roll 424.8 m into a 10 m/s headwind, 538.3 m in still air, 666.1 m with a 10 m/s tailwind. Liftoff airspeed 87.425 vs 87.433 m/s, spread 0.008 m/s. |
| `crosswind-cruise-drift` | 10 m/s crosswind at 150.9 m/s: drift 3.7997 deg against an expected 3.7998 deg; ground speed 150.66 vs airspeed 150.90 m/s. |
| `gusty-level-hold` | `gusty` preset (9 m/s surface, 4 m/s gust), 60 s level hold: peak altitude excursion 4.13 m, peak load factor 1.281 g, no stall flag, finishes airborne at 150.5 m/s. |

**The parked case contradicts the plan's estimate and the gate was set from the
measurement, not the other way round.** The environment plan predicted under
0.05 m of drift on the argument that rolling friction is two orders of magnitude
above the aerodynamic drag of a 15 m/s wind. What the model actually does is
reach a steady 4.5 mm/s creep, because the on-ground branch applies rolling
friction as `min(friction, speed / dt)` — friction balances the wind drag at that
speed rather than exceeding it. The drift is bounded, linear in time (0.27 m at
60 s, 1.08 m at 240 s) and there is no weathervaning, so the harness asserts
under 0.5 m in 60 s and separately that the residual velocity stays under
0.02 m/s. This is an observation about the preserved model, not a change to it.

The gusty case is the guard on feel: the plan's concern was that gusts would make
the liked assisted model twitchy. A 1.28 g peak over a minute of level flight at
the default gust amplitude is not twitchy. Nothing in the flight model changed;
`assisted-flight.ts` is untouched.

Wind reaches the model through `FlightLayer.environmentModel`, written by the
terrain viewer, and is sampled once per fixed step at the flight clock's time so
the app and the headless harness evaluate the same field. When no environment is
attached the `wind` property is deleted rather than set to `undefined`, which is
what keeps the zero-wind identity exact under `exactOptionalPropertyTypes`.
`__flightDiagnostics()` gains `wind`, `windBearingDeg`, `windSpeed` and
`groundSpeed`; the HUD gains a `WIND ddd/ss` readout in knots, `WIND CALM` at
zero. Packaged confirmation: `WIND 250/15` on the practice approach with the
`light` preset, `WIND CALM` with `wind=calm`.


## 2026-09-09: aircraft port helper conversion acceptance

Helper/guide source **d56b3b7**, Apple M3 arm64, macOS 26.6.2 (25G83),
Bun 1.4.2, Python 3.14.6. Ran in the shared checkout with unrelated environment
work present; each report records the complete working-tree status. This scope
validates the conversion orchestrator and existing parsers, not a new renderer
build or flight-model acceptance. No new dependencies or runtime changes.

```sh
bun tools/flight/port-aircraft.ts --aircraft x31 --dry-run
bun tools/flight/port-aircraft.ts --aircraft f14
bun tools/flight/port-aircraft.ts --aircraft a4e
bun tools/flight/port-aircraft.ts --aircraft x31 --install extracted/aircraft-ports/install-check
bun tools/flight/port-aircraft.ts --aircraft x31 --python /usr/bin/false
bun test tools/flight/port-aircraft.test.ts
git diff --check
```

All three real-media bundles passed model, PT identity, audio and reference-scale
validation; X31 also installed successfully into the ignored scratch app-data
root. No media skips. The deliberate `/usr/bin/false` converter command exits
nonzero as expected and leaves no `.pending-*` staging directories. Synthetic
helper tests: **3 pass, 0 fail, 16 assertions**. Diff whitespace check passes.
An earlier development run failed hashing an ArrayBuffer; the helper now hashes
a Uint8Array, and all three final conversions passed with that fix.

| Aircraft | Triangles | Measured span m | Measured length m |
|---|---:|---:|---:|
| F14 | 364 | 21.828571 | 19.100000 |
| A4E | 482 | 8.146667 | 12.220000 |
| X31 | 398 | 7.260000 | 14.988387 |

These are exported geometry bounds, not independently validated real-aircraft
dimensions. F14 retains its existing authored length calibration and source pose.
Reports include source/output SHA-256 values, commands, tool versions, scale,
moving groups, PT summaries and explicit pending visual/runtime acceptance:

- `extracted/aircraft-ports/f14/2026-09-09T21-57-36-253Z-de09c7f3/port-report.json`
- `extracted/aircraft-ports/a4e/2026-09-09T21-57-36-626Z-c35e4dcc/port-report.json`
- `extracted/aircraft-ports/x31/2026-09-09T21-57-37-091Z-a93d42ee/port-report.json`

Independent read-only review found no blocking defects. Full Bun/Python suites,
Electron launch, maneuver/surface acceptance and installer packaging were not
rerun for this tool/documentation change; prior runtime evidence below retains
its original scope. Linux remains deferred; Windows launch remains phase 9.
Next: use the linked [port guide](../aircraft-porting.md) and worksheet for a new
aircraft, extending its decoder/rig/catalog before adding a reviewed recipe.

## 2026-09-09: fixed-wing surfaces, A-4 hook and X-31 presentation scale

Product source **976d43e** (following initial rig commit **1f5beb0**), isolated
`/tmp/usnf-surfaces-verification-20260909`. Apple M3 arm64, macOS 26.6.2 (25G83),
Bun 1.4.2, Node 22.14.0, Python 3.14.6, Electron 44.2.0. Existing dependencies,
local media and ignored extraction outputs were symlinked from the main checkout.
The other agent's environment changes were excluded. No new installer packaging,
Linux, Windows, x64-launch or performance acceptance is claimed; Linux remains
deferred and Windows launch remains phase 9.

Commands:

```sh
PYTHONPATH=tools/retail python3 -m retail.sh_static extracted/atf-gold/ATF_2.LIB/A4.SH --pal extracted/atf-gold/ATF_2.LIB/PALETTE.PAL --out extracted/aircraft-surfaces/a4e.json --name 'A-4E Skyhawk' --length-metres 12.22
PYTHONPATH=tools/retail python3 -m retail.sh_static extracted/atf-gold/ATF_2.LIB/F31.SH --pal extracted/atf-gold/ATF_2.LIB/PALETTE.PAL --out extracted/aircraft-surfaces/x31.json --name 'X-31 EFM' --wingspan-metres 7.26
bun run typecheck
bun run lint
bun test
python3 -m unittest discover -s tools/retail/tests -p test_sh_static.py
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
bun tools/flight/surface-smoke.ts
bun tools/flight/surface-smoke.ts --id x31
```

Final typecheck/lint pass. All five changed engine TS files pass explicit
Prettier checks. The combined `bun run check` still stops at the pre-existing
`CLAUDE.MD` formatting warning; it is outside this aircraft change. Standalone
Bun suite: **145 pass, 0 fail**, 24,054 expectations. Static-export Python suite:
**15 pass, 0 skips**, including actual local A4/F31 neutral mesh/UV conservation
and existing F14 regression tests. The full slow media suite was not rerun for
this visual-only change; its earlier 79-test result is recorded below.

Verified exports have **482 A4 triangles / 9 moving groups** and **398 F31
triangles / 6 moving material groups** (five logical surfaces; rudder is split
by material). Neutral face geometry, scalar triangle area, area vector, UV area,
colors and textures are conserved. Independent review found a maximum 0.4061
native-square-unit change when clipping nonplanar A4 quads before triangulation
(face 0x3b5d); the converter now retains the original fan triangles before clipping,
and the regression tests catch that error. No SH opcode semantics were changed.

Electron flight tests drive actual keyboard handlers and verify pitch/roll/yaw,
flaps, A4 lateral brakes and hook, then device/surface neutral return. Hook tip
height is checked near authored wheel-contact height, with the arm staying under
the fuselage rather than behind the tail. Separate top/side/oblique inspector
screenshots use the same runtime model/hinge/hook code; the inspector omits gear
and does not establish flight behavior. Inspected A4 stowed/deployed views show
the attached belly mount, upward stow and lower deployment. X31 inspection shows
moving original canards/elevons/rudder and preserved proportions.

A4 hook: mount local (0,-0.86,2.24)m, arm 3.15m plus shoe, stowed -0.18rad,
deployed +0.4rad. Position, dimensions and timing are authored. No carrier
arresting force is added; F14 hook presentation is preserved.

All four retail F31 variants share 62 native units of wingspan and 22 of canard
span. No dropped probe line or aspect-ratio deformation was found. Calibrating
to local F31.INF's 7.26m wingspan gives 14.988m overall length and 2.576m canard
span (old 13.21m whole-length calibration gave 6.399m / 2.270m). The whole mesh
is 13.46% larger; canards are not independently stretched. This is presentation
calibration, not a recovered native unit or nose-probe convention. Native X31
vectoring/nozzle-paddle schedules and a definite dorsal brake panel remain open.

Earlier verification failures: the preview bundler initially could not resolve
Three from the tools folder; it now resolves the engine's installed dependency.
A type-only Group import fixed lint. Test predicates initially returned false,
which `openDesktop.poll` treats as a completed value; they now return undefined
while pending. The earlier aircraft dropdown smoke received the same correction.
Intermittent Electron `sandboxed_renderer.bundle.js` null-startupData errors
recurred at process startup, including after an initial-document readiness guard;
that guard is not claimed to fix the underlying Electron issue. Both aircraft
passed in a combined run before the final inspector framing adjustment; a later
final-source A4 run passed but the next X31 process hit the same startup error.
The `--id x31` rerun passes, including inspector captures, without repeating the
passed A4 run. Both final per-aircraft reports have zero renderer errors.
The optional single-aircraft test switch is a test-only follow-up to product
976d43e. Reports/images live under `extracted/aircraft-surfaces/smoke-{a4e,x31}/`.

Updated models were copied to the canonical ignored `extracted/flight` paths and
installed into local app data with `install-aircraft.ts --id a4e|x31`; old exports
are retained as `extracted/aircraft-surfaces/{a4e,x31}-before.json`. Next: reload
practice flight and compare the surfaces and A4 H toggle. See
[aircraft setup](../phase-4-aircraft.md) for limits and repeatable commands.

## 2026-09-09: A-4E / X-31 selection and retail flight profiles

Source **2a1bf9590e76bff406c0c8f9871fe1612934b5b3**, isolated detached worktree
`/tmp/usnf-aircraft-verification-20260909`. Mac Apple M3 arm64, macOS 26.6.2
(25G83), Bun 1.4.2, Node 22.14.0, Python 3.14.6, Electron 44.2.0. Dependencies and ignored
local retail/terrain inputs were symlinked from the main checkout. The isolation
excludes concurrent environment-agent changes; source files match this commit.
No installer packaging, x64 launch or Linux test is claimed. Linux is deferred;
Windows launch acceptance remains scheduled for phase 9.

Commands, run in that worktree:

```sh
bun run check
bun test
python3 -m unittest discover -s tools/retail/tests
bun run harness --output extracted/flight-harness/aircraft-additions.json
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
bun tools/flight/aircraft-smoke.ts
```

Results:

- `bun run check`: typecheck and lint pass; formatting fails on pre-existing
  `CLAUDE.MD` only. It was not reformatted because this commit owns only aircraft
  work. Explicit Prettier checks of the eight changed engine TypeScript files
  pass. Standalone `bun test`: **144 pass, 0 fail**, 24,042 expectations.
- Python retail suite: **79 run, 78 pass, 1 skip**, 69.737 s. Skip is the missing
  optional scratchpad `USNF_1.LIB` comparison (`USNF_SCRATCHPAD`); both discs and
  both newly imported PT records were exercised. Existing unclosed-file
  ResourceWarnings remain in media tests. New static-export and flight-profile
  synthetic tests pass; no committed fixtures contain retail bytes.
- Original placeholder maneuver harness: **11/11 pass**, including exact state
  equality at 30/60/144 Hz. This is regression evidence, not A-4/X-31 parity.
- Fresh unpackaged production renderer build succeeds. Actual Electron smoke
  loads A-4's **371** and X-31's **350** triangles with their own audio manifests,
  exercises both dropdowns, returns through missing-F14 placeholder, reloads
  the correct model, and checks PT hashes, mass, military/maximum thrust, fuel
  decrease and burner capability. Both runs pass with **zero renderer errors**.
  `extracted/aircraft-smoke/{a4e,x31}/{report.json,airborne.png,retail-flight.png}`
  records the observed states and images. Inspected chase screenshots show the
  distinct textured exteriors. Audio remains gesture-locked: this establishes
  manifest loading, not audible mixing. Runs are short functional checks, not
  steady-state GPU/performance or full takeoff/landing acceptance.

| Imported fact | A-4E (USNF97 PT) | X-31 (ATF-GOLD PT) |
|---|---:|---:|
| Empty mass | 4,898.80 kg | 7,359.54 kg |
| Internal fuel | 2,011.23 kg | 4,524.58 kg |
| Military / effective maximum thrust | 49.82 / 49.82 kN | 93.41 / 142.34 kN |
| G rows | -4..7 | -4..9 |
| Observed full-power fuel rate | 0.45359 kg/s, no burner | 6.35029 kg/s, burner |

Both models/textures use ATF-GOLD. A-4 PT/audio falls back to USNF97 because the
ATF-GOLD archive has only an A4E.PTS executable module, not a decoded A4E.PT.
Raw A-4 aftThrust=0 is retained; effective maximum equals military thrust for
positive force fitting. Converted profiles omit native-helper data. Field
conversion is evidence about the game's parameters, not real aircraft specs.
ATF fuel timing/scaling, aerodynamic device scaling, angular assistance and
X-31 vectoring remain unverified/original approximations.

Earlier working-tree checks encountered concurrent unfinished environment
TypeScript/lint/test failures; the isolated checks above supersede those for
this aircraft commit only. A first smoke assertion used the wrong expected
sound-source enum (`retail` versus `retail-pt-samples`); corrected in the test.
One intermediate Electron launch failed in `sandboxed_renderer.bundle.js` with
null `startupData`; subsequent runs including this exact-source run passed.
A test-fixture lint error was also corrected before this commit.

Independent bounded review confirmed profile-path isolation and finite envelope
fits, identified the A-4 zero-maximum-thrust fitting failure, and found generic
`tools/flight/smoke.ts` lacked an aircraft ID. Effective-thrust normalization and
`--aircraft-id` address those defects. Native per-aircraft flight/vectoring and
moving surfaces remain open. Next: restart the dev app, choose an aircraft and
**Retail PT envelope fit (experimental)**, then compare manual handling with the
preserved assisted mode. See [conversion/setup](../phase-4-aircraft.md).

## 2026-09-09: practice-flight waypoint performance

See [phase 3 waypoint correction](phase-3.md#2026-09-09-waypoint-slowdown-correction)
for the exact dirty source snapshot, packaged commands, profiles and repeated-jump
measurements. Smoothed water polygons caused repeated full-ring collision queries
at 120 Hz, reproducing 10–14 fps near mountain/coast waypoints. GroundSampler now
indexes the same exact rings; flight physics, assisted-model defaults and missing
terrain semantics are preserved. Worker triangulation also removes the major cold
water-build stall. Synthetic parity, actual-theater query comparisons and packaged
flight are separate evidence; this does not establish original-game flight parity.


## 2026-09-09: square 20-button MFD and segmented distance bar

Product **ce533a3**, Apple M3/macOS arm64, Bun1.4.2/Electron44.2.0. Mac arm64
and x64 DMG/ZIP packaging26.1s; only arm64 launched. Full `bun run check` passes:
123tests,5,189expectations, typecheck/lint/format clean. Linux remains deferred.

```sh
bun run check
bun run build
bun tools/flight/navigation-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit ce533a3 --out extracted/square-mfd-navigation
bun tools/flight/teleport-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit ce533a3 --out extracted/square-mfd-teleport
```

Navigation report passes: outer334×334px at1440p, exactly20keys/five per edge,
2dials, all keys inside bezel. The same geometry checks pass at720p without HUD
overlap. GO labels stay within the map and above the scale. Bracket selection,
focus restoration, marker movement and bounded zoom pass. Physical scale widths
match viewport distances:100/50/20/10/5NM at1/2/4/8/16×. Reviewed720p and zoom16
screenshots show gray bezel, blank light keys, corner dials and segmented black/
transparent scale. The static512pixel raster still limits high-zoom map detail.

All-mode teleport report also passes: explorer, assisted, PT-envelope and recovered
envelope each jump to all3destinations. Orientation/compass, focus and retained
flight model/fuel/engine/chase settings pass with zero renderer errors. Reviewed
explorer heading-up coastline screenshot.

Lessons: fit legends as screen overlays to keep the outer instrument square;
placing GO controls in left slots2/3/4 clears the top header. Compact windows hide
the elevation legend to preserve space. Scale width must use the map's content
width, without an extra padded container changing its physical meaning. Square
viewports use equal world spans in both axes, with hatch beyond source coverage.
No flight dynamics changed; this is an authored F-16-inspired UI, not recovered
retail cockpit artwork or avionics logic.

## 2026-09-09: native ground/gear-pitch hypothesis verified

Research tool29a4765:1,000gear-pitch and21ground-pitch cases match actual local
USNF97x86, executableSHAecd3eb067f624fe48ea6547e8d4b80d1232723a9b7e0113f77d0e94fcb14caf9.
Only `_T_Info` terrain height/orientation is replaced with an explicit fixture;
ground predicate, takeoff-speed lookup, angle slew, GetGround and conversion
execute native instructions. Evidence`extracted/native-flight/gear-pitch-oracle.json`.
Python compilation/diff checks pass. No product physics changed for this research.

`FMUpdateGearPitch` fades an on-ground gear display offset over approximately
75–100% of its native takeoff-speed value. F14`gearPitch` is0; nativeTakeoffSpeed
returns the first1G envelope speed170ft/s. Model/HUD/view code adds the current
gear angle to copied orientation. `groundPitch` is terrain orientation converted
for contact/landing. This does not prove a real Tomcat takeoff-trim schedule or
exclude every native pitch-controller path. No guessed nose-up bias is added.
Formula, addresses, consumers, limits and reproduction are in
[native-gear-pitch.md](../formats/native-gear-pitch.md).

## 2026-09-09: fixed map elevation bands and full-flaps neutral-afterburner runs

Runtime**50d2ec4**, Apple M3/macOS arm64, Bun1.4.2/Electron44.2.0. Macarm64/x64
DMG/ZIP packaging27.9s, onlyarm64launched. Full check123tests/5,189expectations.
Both14-case fixed-reference experimental suites pass:
`extracted/flight-harness/flap-camber-{retail,recovered}.json`. Those reports name
016e945 plus the two then-dirty physics files subsequently committed unchanged
as50d2ec4; they do not pretend the future commit existed during the run.

**Map:** native `extracted/fixed-elevation-map/report.json` passes at50d2ec4.
1440p/720p screenshots reviewed: green lowlands, fixed0/500/1500/2500/3500m legend,
water mask blue, compass/bezel controls, labels above NM scale and no HUD overlap.
The product includes map016e945; it no longer uses a regional white percentile.
The earlier shared-map/teleport functional results keep their original sources.

**No-input flight:** `extracted/flaps-neutral/report.json`, product50d2ec4,
tool6d2756f. ActualF/G systems: fullflaps, geardown, afterburner, neutralpitch/roll/
yaw, no braking;60wallseconds after fullflaps or firstcrash. Allthree runs finish
airborne without renderer errors or changed control conditions. Zero recorded
samples meet the pronounced nose-down-climb flag (pitch<−1°, climbangle>0.2°,
AGL>2m). These are behavioral observations, not a requirement to self-rotate.

| Mode | First airborne simtime / speed | Body pitch / path / AoA there | Final body pitch / path / AoA |
|---|---|---|---|
| Preserved assisted |16.24s /158.06m/s |+0.709° /+0.228° /+0.481° |−9.030° /−9.415° /−0.386° |
| PT fit |29.02s /171.10m/s |0° /0° /0° |−0.228° /+0.216° /−0.444° |
| Recovered envelope |29.12s /171.34m/s |+0.003° /−0.038° /+0.040° |−0.236° /+0.208° /−0.444° |

The PT/recovered first-airborne positions arez390599/390590m, at the end of the
raised practice deck(z390600m). Lift/weight is only0.749/0.797: rolling off that
edge creates clearance before an aerodynamic takeoff. The original tool field
`firstLiftoff` must be read as **first airborne state**, not successful rotation;
the follow-up tool renames it `firstAirborne`. Do not compare that event directly
to the flat-ground harness. Assisted's existing neutral augmentation produces
a large climb arc (finalaltitude4771m); its implementation was preserved, not
claimed to match the native Tomcat. Final PT/recovered altitudes are≈130/129m.

The reusable headless6-case tool `tools/harness/flap-attitude.ts` passes against
the same physics (report`extracted/flight-harness/flap-attitude-corrected.json`,
then50d2ec4 plus newuntrackedtool subsequently committedba96273). It applies
fullflaps/AB instantly at fixedfullfuelmass overflat110mground. Neutral first rise
>0.1m occurs: assisted15.742s/157.80m/s,+0.616°pitch; PT/recovered37.6s/203.6m/s,
about−0.011°pitch. At70m/s the focused test requires positive pilot rotation;
neutral input remains grounded. Airborne flap-deployment samples now settle at
positivepitch/AoA instead of the former large negativecambertrim. The fixed tests
exclude runtime spool, actuator transit, fuel depletion and realterrain.

```sh
bun tools/harness/flap-attitude.ts --output extracted/flight-harness/flap-attitude-current.json
bun tools/flight/flaps-neutral-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit 50d2ec4 --out extracted/flaps-neutral-current
```

Native flap maximum-lift gain remains; zero-alpha camber/pitch assistance is still
an authored approximation. Negative pitch alone is not proof of a defect. The
user's takeoff-trim hypothesis is investigated separately in native-format notes;
no guessed Tomcat auto-rotation is added. Linux remains deferred.

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


## 2026-09-11 accumulated-work checkpoint

Machine: Linux x64, kernel 7.1.9-arch1-2; Bun 1.4.2, Node v26.8.1,
Python 3.14.7. Source: `aa530d0c0cfada24d27594dbe345d2a2bcde5895`
plus the accumulated working-tree changes committed in the checkpoint containing
this entry. Checks ran before commit creation; no fresh Electron visual or
cross-platform acceptance is implied by this checkpoint.

- `bun run check`: exit 0; 464 pass, 3 skip, 0 fail. Skips: imported
  F14/A4E/X31 mount/camera/rebasing integration tests.
- `bun run harness`: exit 0, synthetic original-aircraft flight scenarios.
- `python3 -m unittest discover -s tools/retail/tests`: exit 1; 171 run,
  1 error, 1 skip. Error in complete-library decompression integration:
  local truncated ATF_10.LIB rejects S35_S.CB8 directory offsets. Skip:
  unavailable USNF_1.LIB scratchpad comparison. ResourceWarnings remain.
- `PYTHONPATH=terrain-pipeline .venv/bin/python -m unittest discover -s terrain-pipeline/tests`:
  exit 0; 37 run, 1 skip (local Copernicus sources unavailable).
  Rasterio deprecation warnings remain.
- `git diff --cached --check`: exit 0.

Next reproduction: use the same commands on this checkpoint; complete ATF media
and the optional local test fixtures are needed for the skipped/failed gates.
