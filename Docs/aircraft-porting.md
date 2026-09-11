# Aircraft port helper and acceptance guide

Use this workflow to bring a locally owned retail aircraft into practice flight.
A complete development port includes source attribution, exterior/texture scale,
a flight profile, aircraft systems, a visual rig, audio, runtime selection, and
recorded acceptance. A successful export alone proves only that the supported
conversion completed. Native game-flight parity is a separate milestone.

## Repeat an existing port

The helper has reviewed recipes for **f14**, **a4e**, and **x31**. It runs the SH,
PT, audio, cockpit, internal-gun and loadout converters, validates their output with the engine parsers, checks
profile identity and the selected scale, and writes a unique complete bundle.
It does not automatically identify or rig an arbitrary new aircraft.

```sh
bun tools/flight/port-aircraft.ts --list
bun tools/flight/port-aircraft.ts --aircraft x31 --dry-run
bun tools/flight/port-aircraft.ts --aircraft x31
bun tools/flight/port-aircraft.ts --aircraft a4e --install "$HOME/Library/Application Support/USNF-ATF/data"
```

Run from the checkout; `--source-root` defaults to repo-relative `extracted/`.
That directory should contain extracted `atf-gold/ATF_2.LIB/` and/or
`usnf97/USNF_2.LIB/` directories. Use `--source-root /path/to/extracted` for another
local extraction and `--python /path/to/python3` if necessary. Python 3.11+ and
Bun are required. The toolkit uses standard-library Python; no new packages are
needed. See [retail extraction](../tools/retail/README.md) for disc handling.

Each successful run creates:

```text
extracted/aircraft-ports/<id>/<timestamp-and-id>/
  <id>.json                 # geometry, textures, authored rig and provenance
  <id>-flight.json          # converted PT facts and confidence metadata
  audio/<id>.json           # PT-selected PCM and source hashes
  cockpits/<id>.json        # transparent retail frame and mirror masks
  <id>-gun.json             # PT/JT-selected gun, PCM and authored ballistics
  <id>-loadout.json         # PT hardpoints and the JT/GAS/SEE/ECM stores they name
  port-report.json          # dimensions, moving groups, checks, hashes and limits
```

Existing bundles are retained. A failed conversion/validation removes only its
private staging directory; it does not install a partial conversion. `--dry-run`
prints the recipe and argument arrays without writing files or installing.
`--install` is optional and uses the existing validated installer after the
bundle is ready. Installation is atomic per file, not transactional across the
installed files; an I/O failure can leave a mixed installed set. The report records
installation failure and the validated bundle remains available for a retry.
The helper rejects output directories redirected through symlinks, keeping all
converted bytes inside the checkout's ignored extraction tree.

The report records the source commit/working-tree state, tool versions, executed
and reproduction commands, source/output hashes, dimensions, moving groups, PT
mass/thrust/G rows and recipe caveats. Its `loadout` section records the station
and store counts, the gross weight of the retail default loadout against the
aircraft's maximum take-off weight, and the hardpoint fields that remain
unresolved. The helper fails the port if a store file a station names is
missing, if the loadout and gun manifests disagree about the source `.PT`, or if
the retail default loadout does not itself validate. Its visual/runtime acceptance starts as
**pending**. Review it and record separate evidence in `Docs/baselines/phase-4.md`;
do not turn those fields into “passed” just because the converter exited zero.

## Start a new aircraft with an evidence sheet

Copy [the port worksheet](templates/aircraft-port.md) into a new original-work
Markdown note under `Docs/`. Put derived previews, meshes, JSON, PCM, debug dumps
and detailed retail coordinate dumps under `extracted/`, never in `Docs/` or
`engine/public/`. Keep original discs/installs in `gameassets/`. No retail-derived
bytes may be committed or bundled.

Prefer ATF-GOLD art, but compare actual variants rather than assuming every newer
asset is better. Model, PT, cockpit and audio may legitimately come from different
games; record the origin and reason separately for each. The reviewed F-14 now
uses ATF-GOLD F14.SH/PALETTE.PAL with explicit `--rig-variant F14_ATF`; its
USNF97 F14.PT flight/audio profile remains the comparison source. Do not apply
USNF wing pivots, gear words or exhaust-subtype assumptions to the ATF exterior.

Check the PT's aircraft name, shape reference, sound references and game variant.
Filenames need not match the user-facing aircraft: ATF-GOLD's X-31 uses `F31.SH`
and `F31.PT`. A4.SH supplies the Skyhawk exterior, while USNF97 A4E.PT supplies
its current flight/audio data. ATF-GOLD A4E.PTS is an executable module, not a
BRF PT record. Matching an extension or finding a similarly named file is not
proof that the correct aircraft/configuration was selected.

## Scale and shape: inspect before resizing

| Check | Why it matters |
|---|---|
| Full length versus fuselage length | A probe, hook, nozzle paddle or pitot can extend the bounding box. A fuselage-only reference applied to all vertices undersizes the aircraft. |
| Wingspan in the exported pose | F-14 sweep/folding changes the relevant span. Prefer a dimension whose pose and endpoints are identifiable. |
| Uniform scale and axis conversion | Source vertices are X/right, forward, up; export becomes X/right, Y/up, Z/aft. Preserve ratios and handedness. |
| Vertical origin and center | Bounding-box centering can lower the fuselage because the fin is tall. Current exports preserve the native vertical origin. |
| Extents of every component | Check canards, tailplane, fin, probe, tanks and weapons separately; a misplaced articulated transform can masquerade as a scale problem. |
| Camera perspective | Chase foreshortening can make a correct fuselage look short. Inspect top, side, front and oblique views at known scale. |
| Texture alignment | Correct geometry does not establish correct UV dispatch, palette overlay, transparency or special exhaust materials. |

Choose **one** documented calibration: `--length-metres` or `--wingspan-metres`.
Record the source/reference dimension, whether probes are included, the model
pose and resulting length/span/height. Recheck gear, hook, nozzle/flame positions,
wing pivots and chase framing after scaling. Keep `aircraft-catalog.ts`
presentation dimensions consistent with the installed conversion.

X-31 example: all four retail variants share the same small canard/wing ratio.
Using 13.21 m for the whole exported model gave only 6.399 m of wingspan. The
local reference's 7.26 m wingspan yields a 14.988 m mesh with 2.576 m canards.
That is a justified **presentation calibration**, not proof of native units or
an excuse to stretch the canards independently. Their remaining difference from
the reference's 2.64 m span stays documented. See [SH findings](formats/sh.md).

## Flight profile and aircraft capabilities

Extend `retail.flight` only after inspecting the new PT variant and its field
layout. Its filename/labelling/type-size/G-range guards are deliberate; do not
remove them wholesale to make an unfamiliar aircraft parse. Update source-game
validation and profile-to-aircraft identity together.

Record empty mass, internal fuel, maximum takeoff mass, total-engine military
and maximum thrust, G polygons, device fields, and fuel rates with units and
confidence. Check empty+fuel+payload bounds, malformed polygons, finite force
fits throughout the useful altitude range, burner transitions, fuel depletion,
and live mass changes. Verify which fields describe game configuration rather
than real-world prototype specifications.

For aircraft without afterburners, retain raw `aftThrust=0` and use military
thrust as the fitter's effective maximum. Otherwise the fit receives zero thrust.
Also disable the burner command, effect and audio layer; do not just hide flames.
Keep engine count, hook availability, wing sweep, flaps/brakes and fuel behavior
consistent with the selected aircraft. Optional devices should not inherit
F-14 behavior accidentally.

The **preserved assisted** force/control code stays unchanged and remains the
default comparison model. Both PT modes are opt-in through the flight-model
selector. Their behavior depends on the supplied profile:

| Profile evidence | Current experimental behavior |
|---|---|
| Polygons and mass/thrust only | Original fitted lift/drag polar and exponential thrust lapse. Current A-4E/X-31 imports use this path. |
| Verified USNF `native` rows and structural-speed metadata | Both modes apply recovered G command limits, low-speed control reduction and altitude-dependent sound speed. They still differ in the lift-envelope boundary query. |
| Native metadata plus `coefDrag` and `_gpullDrag` | Both modes also use recovered speed-dependent thrust and drag. Supplied loading coefficients reduce G authority and increase drag with fuel/payload weight. Current F-14 imports use this path. |

The shared 52.5 m² area normalizes the lift fit; it is not a claim that all
aircraft share a real wing area. Lift, attitude response, stall/poststall
behavior, lateral damping and ground support remain original integration.
Fractional devices and AB spool interpolate recovered force endpoints.

Do not treat every G polygon as an exclusively sustained-turn boundary or
cap an aircraft at the highest numbered row everywhere. The native caller
classifies and interpolates the rows at the current altitude and true airspeed,
then reduces the G request for loading and low speed. Its extra-G flag adds
one G and clips to the PT range; the F-14's 9G maximum is not a universal normal
flight limit. Our controller approaches the resulting G target through angle
of attack; it does not clamp the HUD reading or directly clip lift forces.
Transient overshoot and full native maneuver parity remain open.

Preserve raw coefficient values and distinguish their recovered units:
`coefDrag` is an 8.8 force normalization, not aerodynamic CD; `_gpullDrag` and
device drag fields are 8.8 weight-relative force factors. `loadedDrag`,
`loadedGpullDrag` and `loadedElevator` are percentage correction coefficients.
Earlier exports may still label these probable/unknown; changing those labels
does not require changing the numeric values. Fuel-only loading uses native
whole-pound percentages. Aggregate payload lacks the original hardpoint
partition and can differ by one percentage point from separate rounding.

Do not add a `native` block to a new profile merely because its points convert.
Recovered helper parity requires actual local x86 execution for the applicable
game/aircraft/caller assumptions. Isolated helper parity still is not full flight
parity. X-31 vectoring/paddle laws and ATF fuel-time convention reuse are examples
of limitations that must remain explicit. See [flight dynamics](formats/flight-dynamics.md)
and [native flight](formats/native-flight-code.md). The
[native performance recovery](formats/native-performance.md) records the G,
thrust/drag and loading callers, coefficient meanings and exact x86-oracle
commands. Keep new ports within that verified scope; do not copy the F-14's
native metadata into another aircraft to enable the selector.

## Texture pages, decals and surface facing (2026-09-11)

Resolve the active texture binding before applying UVs. `E2` names the aircraft
atlas; `E0` selects a separate mission/player decal by index. It does **not**
reuse the preceding atlas. Without a selected livery, native `BrushFromIndex`
uses all-transparent `BLANK.PIC`; our default export omits those invisible faces.
Squadron/nose customization remains unselected until a livery input is supported.
Do not substitute the full skin page, or invent a crop from unrelated atlas art.
`D0` draws condensation streamers, not textures.

Source V is bottom-origin. Native `G_TextureFlip` applies `height-1-V`; the
export addresses texel centers as `(U+0.5)/width, (height-0.5-V)/height`, with
`DataTexture.flipY=false`. Retain per-face UV order when reversing winding.
Mipmaps, linear filtering and anisotropy reduce distant oblique shimmer; this
filter choice is a modern presentation setting, not the native rasterizer.

Keyed texture drawing and a transparent airframe are different operations:

| Face type | Correct composition |
|---|---|
| Texture-only `4C/5C/6C/7C` | Index 255 is transparent; other palette indices remain opaque. |
| `EE` | Opaque base from captured `F6` per-vertex palette colors, then keyed texture paint. |
| `ED/CD` | Opaque base from the header palette color, then keyed texture paint. |

The native subtype bit `0x08` keys index 255 in the texture pass; bit `0x80`
preserves the base fill selected by low bits. Export base colors with each face
and interpolate them alongside UVs when partitioning. The renderer combines base
and paint in one material draw; two coplanar meshes would add depth competition.
Preserve this shader when cloning damage/debris materials and composing cloud
shadows. Do not globally discard white RGB or make keyed skin transparent.

Use the stored native face normal (X/up/forward) to orient exported triangles,
then cull their backs. Drawing both sides exposes opposite-facing skin/decals
that occupy the same plane. Texture-only overlays use a small depth bias while
retaining depth tests; do not disable depth testing to hide clipping.

### Textured landing gear

The reviewed gear-state projections select ATF F14 word `0x802c` (USNF F14
uses `0x570c`), A4 `0x6d36`, or
F31 `0x65b2` as 1, leaving other words neutral. Compare with the neutral model
by source face address and coordinates, retain all common skin, and group only
the gear-state differences at the inspected native mounts. Preserve original
UVs and keyed wheel/strut artwork. These are retail flat textured panels and
doors, not newly modeled volumetric wheels. Rig functions must preserve gear
metadata and must not classify F14 gear `part-*` branches as wings.

`gearPose` marks deployed/stowed groups; imported gear replaces the procedural
fallback. Grouped rotation and the existing three-second actuator remain authored.
Fit `gearHeightM` to the visible opaque texel footprint, excluding transparent
billboard borders. Current level-pose support heights are ATF F14 2.557155 m (older USNF 1.877799 m),
A4 2.600300 m, X31 1.826424 m at their reviewed scales. Keep scale calibration
based on neutral exterior bounds. Nose/main bottoms differ slightly in these
source models; simultaneous wheel contact would need a separate ground-pitch
model, which is not part of this texture pass.

Rebuild the runtime **and** regenerate model JSONs for these material changes:

```sh
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
bun tools/flight/port-aircraft.ts --aircraft a4e --install "$HOME/.config/USNF-ATF/data"
# Repeat f14 and x31, then fully restart the application.
bun tools/flight/aircraft-texture-smoke.ts "$HOME/.config/USNF-ATF/data/aircraft" extracted/aircraft-textures/views
bun tools/flight/aircraft-texture-smoke.ts "$HOME/.config/USNF-ATF/data/aircraft" extracted/aircraft-textures/ground-views runway
```

Inspect both sides, upper/lower wings, fins and gear up/down. The script checks
actual G-key actuator endpoints in the flight renderer and captures five close-up
views. See [texture evidence](baselines/aircraft-textures.md) and
[native material findings](formats/sh.md).

### Native speedbrakes and afterburner mapping (2026-09-11 correction)

The earlier A-4 brake rig removed fixed fuselage skin too far forward, leaving a
hole when deployed. Recover the selected native state **before** authoring cuts:

| Exterior | Brake word = 1 | Burner word = 1 | Added brake / flame faces |
|---|---|---|---|
| ATF A4 | `0x6d30` | None | 12 / 0 |
| ATF F14 | `0x8026` | `0x8020` | 4 / 8 |
| ATF F31 | `0x65a6` | `0x65a0` | 4 / 4 |

Compare `(source address, vertices)` against the unpartitioned neutral projection.
These branches add faces and remove **no** neutral fuselage faces. Preserve the
fixed backing. Keep A4 panel pairs separate from their recessed strips/braces.
`sh_devices.py` appends the reviewed state deltas after gear extraction and before
surface partitioning; rig functions must pass all device groups through intact.
Never compare against already-clipped surface triangles, which would make common
skin look like newly added device geometry.

Brake vertices are already fully open. `nativeBrakeAngle` records a signed measured
opening angle; runtime retracts by `-angle * (1 - fraction)` about the supplied
axis and hides panels at zero to avoid closed-pose coplanar jitter. A4 and X31
use fitted yaw rotations. A4 support geometry is visibility-only. ATF F14's brake
attachment edges are not collinear, so its exact native raised pose is selected
by visibility rather than imposing an unsupported single hinge. Continuous native
animation/timing is not recovered.

Afterburner branches supply crossed textured flame faces and original atlas UVs.
Separate these as `afterburner-*`, preserve nozzle texture in every engine state,
and use emissive rendering while the engine/burner state is active. Do not replace
nozzle maps with flat gray or retain procedural cones when native flames exist.
Exclude flames from airframe length calibration and preserve neutral nozzle paint:
ATF F14 uses subtype `0x74`, F31 `0x64`, while the older USNF F14 uses `0x44`.
Texture-only keyed overlays also include ATF subtypes `0x5c/0x7c`; opcode matching
must not assume only USNF `0x4c/0x6c` occur.

Rebuild, re-port all three aircraft, then run:

```sh
bun tools/flight/aircraft-devices-smoke.ts "$HOME/.config/USNF-ATF/data/aircraft" extracted/aircraft-devices/views
```

Inspect closed/half/open brakes, intact backing, rear paint, both engine states,
and burner alignment from both sides and below. The script exercises B, 6 and T
in live flight and records isolated views through the production renderer. See
[device acceptance](baselines/aircraft-devices.md) for results and limitations.

## Moving surfaces, gear, hook and engine presentation

Map each control to an actual visible surface: elevator/taileron, aileron/elevon,
canard, rudder, flap, spoiler or airbrake. Record which source articulated parts
can be reused and which static faces need partitioning. For unrecognized source
branches, investigate the decoder rather than inventing missing geometry.

Triangulate source faces with the export's original fan **before clipping**.
Nonplanar A-4 quads otherwise change shape in neutral. Preserve winding, colors,
UV interpolation and material identity. Conserve per-face scalar area, area
vectors and bounds, and retain each source face's identity in tests. Do not
leave the original fixed polygon underneath its moving replacement.

Author hinges in the correct coordinate space. Export pivots in metres;
`rotationAxis` is in renderer X/up/aft coordinates. Confirm a chosen axis lies
on the intended hinge, survives scale conversion, and moves both textured and
colored parts together. Preserve nested hierarchy for swept wings and attached
flaps. Do not name a fixed X-31 wing `wing-left` if that triggers F-14 sweep.

### Recover the complete wing before fitting hinges (corrected 2026-09-11)

**Correction:** the earlier explanation that the A-4 had a stepped inboard
trailing edge was wrong. The rectangular gaps were omitted neutral flap panels.
Moving a cut on the incomplete fixed wing could not fix that silhouette.

Before authoring any surface, compare the neutral projection with a reference
and inspect SH calls/state branches for missing panels. The original file can
store fixed wing and moving surfaces in separate out-of-line vertex tables.
`0x12` is a signed relative subroutine call: target = opcode address + 4 + rel16;
return resumes immediately after the four-byte call. The native handler saves
only the instruction pointer; shared vertex and texture writes persist. Our
previous exporter skipped these calls, omitting flap faces on **all three**
reviewed aircraft. See [decoder evidence](formats/sh.md#2026-09-11-relative-shape-calls-restore-missing-flap-panels).

The corrected recipes reuse the recovered neutral panels and their original UVs:

| Aircraft | Moving region and hinge |
|---|---|
| A-4E | Complete inboard upper/lower flap panels fill the former rectangular gaps. Hinge sits on their forward upper edge, adjoining fixed wing; outboard ailerons remain separate. |
| F-14 (ATF) | Whole native aft-strip panels follow the swept seam and their respective textured wing anchor. The older USNF variant has different inner/outer panels and its own rig. |
| X-31 | Recovered inboard panels plus existing outboard tabs. Separate inner/outer hinges follow the different spanwise heights; both retain the elevon pitch/roll/flap mix. |

Source coordinates are X/right, Y/forward, Z/up: **aft is decreasing source Y**,
while aft is increasing renderer Z. For two source hinge endpoints `a` and `b`,
use the same centered/metre conversion as the mesh for the pivot; the renderer
axis direction is `(b.x-a.x, b.z-a.z, -(b.y-a.y))`. Choose endpoint ordering with
positive renderer X so positive flap rotation lowers the trailing edge on both
sides. Keep upper/lower faces on the same hinge and preserve material/UV identity.
Do not mirror panels or translate them by guessed flap widths to hide a gap.

Test **completeness before conservation**: known neutral panel subroutines must
appear in the projected model, then their full area must belong to moving groups.
Conserving an incomplete projection simply preserves its holes. Check neutral
silhouette and full deployment from top, side and rear-oblique views. Angle-only
tests do not establish placement. The restored geometry/call semantics are
retail-derived; runtime deflection angles, schedules and control mixing remain
authored approximations.

Regenerate installed JSON after exporter changes. On Linux:

```sh
bun tools/flight/port-aircraft.ts --aircraft a4e --install "$HOME/.config/USNF-ATF/data"
# Repeat for f14 and x31.
python3 -m unittest discover -s tools/retail/tests -p 'test_sh*.py'
bun tools/flight/flap-placement-smoke.ts "$HOME/.config/USNF-ATF/data/aircraft" extracted/flap-recovery/views
```

The inspection script uses development Electron bundles and the local
`extracted/terrain/ukraine` fixture. Rebuild the shell if runtime code changed.
It bundles the current model inspector and loads the specified JSONs through
`RetailAircraft`. Restart the app or start a new flight to reload installed models.

Check deflection signs with visible trailing-edge motion: conventional elevator
trailing edge up for pitch-up, canard trailing edge down for pitch-up, opposing
ailerons for roll, rudder toward the yaw command, flaps down, and lateral brakes
outward. These are current authored mixes, not recovered native schedules.
Check combined commands, bounded travel, neutral return, and reversals mid-travel.
Surface movement is visual unless the selected physics backend implements its
force effect; a moving vectoring paddle would not itself create vector thrust.

Fit gear support height, nose/main spacing, wheel rotation, retraction clearance,
hook mount/arm/shoe, stowed/deployed angles and engine nozzle/flame positions to
the aircraft. Check hook attachment from the side in both poses and its tip
against wheel-contact height. The A-4's former scaled F-14 mount is the failure
example. Hook animation is not carrier arresting force. Maintain the terrain
floating origin, 120 Hz simulation and missing-ground semantics.

## Audio, runtime wiring and repeatable verification

Import the selected aircraft's PT sound references; filenames can contain `&`.
Use argument arrays when invoking tools. Verify clip roles, source hashes,
encoding/rates, engine start/stop, loop transitions, throttle/burner mixing and
mute. The manifest parser passing while Web Audio is gesture-locked proves
loading only. Use a trusted input and an audible/captured mix for sound acceptance.

When adding an ID, update these linked components deliberately:

| Component | Files |
|---|---|
| Catalog, names, capabilities, presentation scale, accepted profile identity | `engine/src/flight/aircraft-catalog.ts` |
| Reviewed conversion recipe | `tools/flight/aircraft-recipes.ts` |
| PT variant decoding/export and validation | `tools/retail/retail/pt.py`, `flight.py`; `engine/src/data/retail-flight.ts` |
| Experimental performance integration and recovered helpers | `engine/src/sim/flight/index.ts`, `retail-dynamics.ts`, `native-g-limits.ts`, `native-drag.ts`, `native-power.ts` |
| Static source projection / authored rig | `tools/retail/retail/sh_static.py` |
| Surface mixing / special device geometry | `engine/src/flight/ControlSurfaces.ts`, `AircraftHook.ts`, `FlightLayer.ts` |
| Model/audio parsing and selected paths | `RetailAircraft.ts`, `FlightAudio.ts`, `FlightLayer.ts` |
| Selection UI and test coverage | `engine/src/ui/TerrainViewer.tsx`, `tools/flight/` |

Catalog and recipe records are typed together, but metadata alone does not
implement a decoder, rig or flight model. Unsupported aircraft must fail clearly.
Preserve per-ID paths (`aircraft/<id>.json`, `aircraft/<id>-flight.json`,
`audio/<id>.json`), reject cross-aircraft profiles, and identify missing imports
as placeholders. Check aircraft/model switching, practice-start links, reset,
fuel/payload retention and partial/malformed installs.

Run relevant Python and Bun tests, fresh-source desktop checks and manual
inspection. `bun run check` does not run Python, launch Electron or rebuild a
packaged app. `bun run harness` currently tests the original placeholder; it
cannot certify a newly imported aircraft's handling. Existing scripts have
specific scopes—extend their expected IDs/capabilities instead of using F-14
assertions for another plane.

```sh
bun run check
python3 -m unittest discover -s tools/retail/tests
bun run harness --output extracted/flight-harness/report.json
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
bun tools/flight/aircraft-smoke.ts
bun tools/flight/surface-smoke.ts --id x31
```

The last two scripts currently use the canonical `extracted/flight/` and
`extracted/aircraft-surfaces/` paths respectively, not the helper's dated bundle.
Copy the reviewed bundle's corresponding JSON to those ignored test paths, or
extend the test's input arguments. The general maneuver smoke accepts explicit
bundle paths. For example, after building a fresh Mac package with `bun run build`
(replace the placeholders with the tested commit and bundle directory):

```sh
bun tools/flight/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit <built-commit> --scenario takeoff --aircraft-id x31 --aircraft <bundle>/x31.json --flight-profile <bundle>/x31-flight.json --audio <bundle>/audio/x31.json --out extracted/x31-takeoff
```

For an unpackaged build, pass its Electron binary with `--binary` and add
`--app shell`. The F-14 systems/retail scripts have separate expectations; see
[flight tools](../tools/flight/README.md).

Test ground clearance, taxi/rotation, takeoff, cruise/turn/stall/recovery and
approach/landing, devices in intermediate/final poses, missing terrain and
render-rate independence. Add per-aircraft assertions where meaningful; do not
call a short advancing-flight smoke a complete maneuver acceptance. Inspect
actual images and sound separately from parser/telemetry success.

### Performance-envelope acceptance

Start in still air and record **true airspeed**, altitude MSL, throttle/AB,
fuel, payload and device positions. The HUD speed is TAS, so a tailwind does not
explain excessive displayed TAS. Repeat level runs from above and below the
expected equilibrium and record the final speed trend; merely passing through
a speed does not establish sustained cruise.

Compare partial dry throttle, full military power and afterburner where fitted,
at low altitude and near the aircraft's upper operating range. Repeat at light
and full fuel, and with payload when supported. Native load corrections mean
full-fuel AB need not reach the unladen PT upper boundary. The unladen harness
case intentionally suppresses fuel-exhaustion logic to isolate that boundary;
it does not demonstrate flight with empty tanks in the app.

For G response, test full pulls and pushovers at several initial speeds and
altitudes. Record peak G, the changing available G range, speed loss and
recovery. Distinguish instantaneous G from a sustained turn and from structural
or damage limits. Keep the default assisted model as a separate comparison.

The current F-14 checks are reproducible with the canonical local profile:

```sh
bun tools/harness/retail-flight.ts --profile extracted/flight/f14-flight.json --model retail-envelope --output extracted/flight-envelope-audit/acceptance-retail.json
bun tools/harness/retail-flight.ts --profile extracted/flight/f14-flight.json --model recovered-envelope --output extracted/flight-envelope-audit/acceptance-recovered.json
bun tools/harness/envelope-audit.ts extracted/flight/f14-flight.json extracted/flight-envelope-audit/f14.json
bun run probe --fresh
bun tools/flight/envelope-smoke.ts
```

The retail harness runs 15 cases for native profiles, including a separate
unladen upper-boundary check. The envelope audit runs both models at 45/100%
dry throttle and 36,000 ft from 450/770 KTAS, plus ten-second pulls from
250/350/450/550 KTAS at 1,000 m. These are F-14-oriented scenarios; adapt their
altitudes, speeds and burner assertions before applying them to a new aircraft.
The audit reports observations rather than certifying game parity.

The desktop smoke uses canonical `extracted/flight/` geometry/profile paths for
F-14, A-4E and X-31. It checks advancing flight and renderer errors with ordinary
key input, and F-14 G response in both experimental modes. Its short autopilot
and pull segments are not the high-altitude performance test. For a new port,
extend the smoke's aircraft/capability expectations and supply the reviewed
bundle at its expected paths.

For the corrected full-fuel F-14, the 2026-09-09 baseline records roughly
390 KTAS at 45%/36,000 ft and 6G in the pull from 450 KTAS/1,000 m. Use
[the phase 4 baseline](baselines/phase-4.md) for exact source, conditions and
results. These are regression references for this port, not universal aircraft
targets or proof of real-world F-14 performance. When porting more native
arithmetic, run the applicable x86 oracle and its independent TypeScript
comparison as well as the flight tests.

Record commit, date, machine/tool versions, exact commands, dataset identity,
source/output hashes, failures/skips, screenshots and remaining gaps. Use an
isolated checkout for acceptance when another agent is changing shared runtime
files. Never bundle or commit retail inputs/outputs with the code. Update the
progress snapshot/log, relevant format notes and phase baseline. Commit only
the port's work; pushing/publishing requires separate authorization. Mac is the
current acceptance platform, Linux is deferred, and Windows launch is phase 9.

## Cockpit and practice gun extension

See [cockpit views and practice guns](phase-4-cockpit-guns.md) for the F1/Shift-arrow
controls, safety, per-aircraft source mappings, ballistics references and desktop
acceptance command. A4E.PT explicitly selects F4.HUD: import that shared cockpit
rather than selecting an unrelated image by filename. Gun sound comes from the
selected JT, not the engine PCM list. Keep raw retail grouped-round/speed fields
separate from authored individual-round cadence, muzzle speed, tracer color and
mount locations. A cockpit parser passing does not establish native gauge/view
parity; gun liveness does not establish collision or damage behavior.
