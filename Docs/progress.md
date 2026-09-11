# Progress

Current status and append-only engineering log against [build-plan.md](build-plan.md).
Newest entry first. Update the snapshot and add an entry for meaningful port work;
keep commands, evidence, uncertainty, and a concrete next step. Baselines live in
[baselines/](baselines/). The design brief describes the intended product.

## Current snapshot — development 2026-09-11

## 2026-09-11: Extend cloud range and darken heavy weather

Implementation `caa22ba` removes Sunshine's layer-thickness-dependent viewing
cutoff (about 7.5–10 km for low cloud presets). Exponentially increasing minimum
step widths cover the 180 km viewing range with the existing primary budget;
clouds fade from 150–180 km based on first density. Step spacing is independent
of scene depth, which only clips the ray. Unknown terrain still suppresses
terrain-relative clouds. Overcast cloud radiance is multiplied by .75 and
cumulonimbus by .5 before haze/tone mapping, in all three cloud appearances.

476 tests pass, 3 existing imported-mount skips. Actual GPU regression renders
opaque clouds where terrain only begins 80 km away; geometry-depth changes behind
an opaque cloud produce identical output. Rendered brightness ratios are .75002
and .5. Fresh desktop above/overcast/tower captures pass with median frame times
16.7–16.9 ms on this Linux GPU. See [phase 3 baseline](baselines/phase-3.md) for
commands and limits. Next: restart and revisit the long-distance flight view;
check distant small-cloud stability while moving. Fog remains Weather → Fog only.

## 2026-09-11: Sunshine cloud port and weather-only fog

Implementation `0f4f506` ports SunshineClouds2's density/light functions, actual
Godot-exported noise/height textures, additive adaptive march, temporal history
and bicubic reconstruction. Sunshine is the default; prior appearances remain
selectable. Ground fog is now enabled only by the dedicated Fog weather preset;
this supersedes the previous default-on/checkbox behavior. Terrain-relative
heights and cirrus remain. Unrelated legacy cloud shadows are disabled in
Sunshine. MIT notice and source/asset provenance are committed and shipped.

476 tests pass, 3 existing imported-mount skips. Actual GPU density and sunlight
comparisons match upstream at 128 sampled positions within 1e-4; floating-origin
comparison is identical, and low clouds remain visible from 20 km altitude.
Desktop cloud, weather-selection, Salt Lake AGL and imported-F-14 pause checks
pass. This is not full Godot pixel parity or new cross-platform acceptance.
[Port notes](sunshine-cloud-port.md) and [phase 3 baseline](baselines/phase-3.md)
record scope, exact commands, failures/corrections and remaining gaps. Next:
restart and compare Sunshine cloud exteriors/entry, especially storm shape and
bright-top contrast; Fog selection alone should enable low-level fog.

## 2026-09-11: Terrain-relative clouds, ground fog and solid exterior

Implementation `3c04820` makes low/storm cloud heights terrain-relative and adds
ground fog dense through 200 ft AGL, tapering clear by 600 ft. Independent weather
DEMs preserve contact/visual-LOD boundaries and unknown terrain. Default solid
exterior uses the density field's contour and gradient, blending to volume near
entry/inside; the panel retains a Volumetric comparison. Cirrus stays translucent.
Storm field stretching, denser sampling and half-float composition address repeat
patterns and quantization separately; not all silhouette artifacts are eliminated.

`bun run check`: 474 pass, 3 existing imported-mount skips. Fresh Electron GPU
checks, Salt Lake valley/hillside fog/cloud captures, synthetic cloud matrix and
imported F-14 pause/resume pass. No new platform acceptance claim. See
[phase 3 baseline](baselines/phase-3.md) for exact commands, initial failures,
review corrections, costs and remaining gaps. Next: restart the rebuilt app,
compare Solid exterior/Volumetric during cloud entry and inspect storm contours.
These remain authored cloud shapes, not meteorological simulation.

## 2026-09-11: Cloud billows, optical-depth lighting and distinct cloud types

Implemented the approved [cloud review](cloud-rendering-review.md): separate broad
3D shape and weak edge erosion, progressive view/light integration, sky occlusion
and camera-step-independent source lighting. Broad rolling motion is periodic,
world anchored and paused with the viewer. Cumulus has rounded tops/flatter bases;
stratus keeps its layer; storm now uses 0.7–10.5 km cumulonimbus towers/anvils.
High cirrus uses thin elongated curled patches and separate upper-level wind.
CPU visibility queries and ground shadows remain coarse coverage approximations.
This is authored atmospheric appearance, not fluid convection/native-game parity.
See [phase 3 baseline](baselines/phase-3.md) for checks, GPU invariants, captures,
initial failed checks and remaining limits. Restart the rebuilt desktop app and
compare Scattered cumulus, Broken cumulus, Overcast and Thunderstorm towers.

## 2026-09-11: CS2 smoke reference and cloud rendering review

Committed/pushed the accumulated implementation as `576db2b`, then reviewed
Garrett Gunnell's Unity smoke recreation at `17f5579` against our cloud pass.
[Cloud review](cloud-rendering-review.md) records confirmed camera-step-dependent
lighting and truncated sunlight integration, the unconfirmed erosion/dimpling
hypothesis, reference-code limitations, and a bounded implementation/visual
acceptance sequence. This is source research only; cloud rendering is unchanged.
Next step is matched baseline captures, then broad billows, weaker edge erosion
and improved optical-depth lighting. Existing phase acceptance remains unchanged.

## 2026-09-11: Commit/push checkpoint verification

User requested committing and pushing the accumulated aircraft, audio, terrain,
sky and menu changes. Verified the working tree based on `aa530d0` before this
checkpoint commit: `bun run check` passed (464 pass, 3 imported-mount tests skipped),
`bun run harness` passed; terrain discovery passed (37 run, 1 missing local
Copernicus source skip). Full retail discovery ran 171 tests with 1 error and
1 missing scratchpad skip: `test_every_lib_entry_decompresses_to_size_prefix`
rejects truncated `ATF_10.LIB`, entry 84 `S35_S.CB8`, offset
417294033..425884021. This is the previously documented local-media limitation;
full retail compatibility is not claimed. Resource/deprecation warnings also
remain. `git diff --cached --check` passed; staged paths contain no retail outputs.
See the [phase 4 checkpoint](baselines/phase-4.md) for commands/platform scope.
Cloud rendering review follows this checkpoint; no new cloud appearance is claimed.

## 2026-09-11: Ground wind assistance ramps with taxi speed

Applied wind now ramps linearly from 5% at rest to 100% at 150 knots horizontal
ground speed while grounded. At 2 knots it is 6.33%. The default retail/recovered
integrator applies this only to its aerodynamic input; the preserved assisted
source uses the same adapter at the FlightLayer boundary. Weather fields and
true-air telemetry remain unchanged; airborne wind is full strength. This is
an authored handling adjustment, not a recovered retail force law. See
[ground-wind baseline](baselines/ground-wind.md) for focused/full verification.
Desktop bundles rebuilt; restart the app to try taxi/takeoff feel.

## 2026-09-11: Native brakes, ATF F14 exterior and afterburner mapping

Corrected the A4 brake hole by restoring fixed skin and importing native aft
panels/backing; X31 and ATF F14 now also use their native brake state geometry.
F14 exterior/atlas/rig/gear now come from ATF-GOLD, while its USNF flight profile
remains selected. F14/X31 afterburners reuse original atlas-mapped flame faces;
nozzle textures survive engine/burner switches. All three exterior bundles are
installed and runtime rebuilt. See [device acceptance](baselines/aircraft-devices.md)
for source identity, 41 SH tests, 462 workspace tests/3 skips and live keyboard,
close-up and native-gear ground verification. F14 brakes switch the native raised
pose; continuous schedules remain unported. Next reproduction: restart the built
app, start a new flight, then B / 6 / T. This supersedes the earlier authored A4
brake cut and USNF exterior choice, not the preserved USNF flight comparison.

## 2026-09-11: Aircraft materials and native textured gear

Corrected E0 dynamic decal binding (blank fallback instead of full aircraft atlas),
keyed paint over palette-filled skin, native surface facing, texel-center UVs and
filtered/mipmapped sampling. Damage/debris clones and cloud shadows preserve the
skin shader. All three models now import native textured gear geometry in place
of procedural struts/wheels, with authored retraction and visible-wheel ground
support heights. Updated model JSONs are installed and desktop bundles rebuilt.
See [texture acceptance](baselines/aircraft-textures.md) for live G-key/ground
checks, close-up captures, tests and limits. Dynamic livery selection, native
lighting/retraction schedules and exact multi-wheel ground pitch remain open.

## 2026-09-11: Correction — missing native flap subroutine geometry restored

The user's reference disproved the earlier stepped-wing explanation. Native
opcode `0x12` is an end-relative shape call; the exporter was skipping it and
therefore omitting original flap panels on all three aircraft. Implemented call
traversal with persistent shared slots/textures, restored the panels and original
UVs, and rigged their actual leading edges. The earlier substitute-strip fix and
its silhouette acceptance are superseded. See [corrected evidence](baselines/flap-placement.md)
and [SH findings](formats/sh.md). Neutral A4 now has a complete inboard trailing
wing; deflection/mixing remains authored. Reload updated installed models to view.

## 2026-09-11: Flap placement corrected from actual wing edges

Revised all three exporter rigs and installed the regenerated exterior JSONs in
Linux app data. A-4 inboard flap is narrower/aft with a higher hinge; F-14 follows
a narrow swept trailing strip; X-31 reuses the outboard tabs and their sloped
hinge instead of cutting fixed inboard wing. This corrects the earlier flap
placement acceptance. Geometry preservation and trailing-region regressions pass;
Electron inspection covers neutral/deployed views. See
[flap evidence](baselines/flap-placement.md) and the updated
[porting technique](aircraft-porting.md#recover-the-complete-wing-before-fitting-hinges-corrected-2026-09-11).
Hinges remain authored mesh fits. Next step: reload the installed models in flight.

## 2026-09-11: Utah east/west orientation corrected at runtime boundary

Salt Lake now converts source east-positive coordinates to world west-positive
coordinates (`worldX = theaterWidth - sourceX`) when loading. DEM columns, chunk
placement, all paint atlases, water including holes, optional shorelines, authored
runway/waypoints and ground contact are converted together. LOD coverage counting
and collision lookup retain the source-grid indexing; partial eastern tiles are
clipped at the reflected left boundary. Compass/physics are unchanged. Navigation
now places Denver east of Salt Lake and Bonneville west. Disk data/hashes remain
unchanged; no rebake/install required. This Utah-specific migration does not fix
Ukraine's documented geographic mirroring. See [Salt Lake evidence](baselines/salt-lake.md).

## 2026-09-11: Curved lunar phases and image-derived glow

Replaced the straight lunar cutoff with a projected spherical terminator whose
curvature follows phase, mirrored for waxing/waning. The rim and phase edge use
a 2%-of-diameter feather. Moon glow now convolves the phase-masked photograph's
luminance with near/broad Gaussian kernels, rather than illuminating a full disc
behind every phase. Work is confined to the moon's small sky region; no extra
render target or sun/terrain-light changes. Tests cover area, mirroring, feather
and zero emission at new moon. See [sky evidence](baselines/sky-lighting.md).

## 2026-09-11: Larger sun/moon discs and softer lunar halo

Visible sun and moon angular radii are now 5× their original values, including
the moon photograph's UV footprint. Sun scattering/glow, limb feather width,
astronomical positions/phases and terrain lighting remain unchanged. Moon haze
now has an independent Gaussian angular falloff with a gentle outer taper and
sub-code-value dithering to reduce dark gradient bands. See
[sky baseline](baselines/sky-lighting.md) for checks and desktop captures.

## 2026-09-11: Aircraft selection resets incompatible loadout stations

Confirmed A-4E/X-31 Fly blockers came from inherited F-14 station selections:
unknown AIM54C/AIM120 and sensor stores, incompatible counts and nonexistent
stations. Their installed native defaults both validate with no problems.
`choose-aircraft` now clears only station selections on an actual plane change,
allowing the shell to seed the selected aircraft's own defaults. Reselecting the
same plane keeps edits; fuel, theater and other mission settings are preserved.
Async default installation also checks the current aircraft before applying.
Validation remains enabled; this does not implement missile firing.
See [loadout-switch evidence](baselines/aircraft-loadout-switch.md).

## 2026-09-11: Live seasonal satellite tint and white snow

Satellite mode now smoothly follows the calendar: lighter spring green, darker
summer green, autumn brown and winter gray. Viewer-local uniforms update without
atlas reloads. Salt Lake shares the offline snow bands, interpolated through the
year using morphed terrain elevation; pure-white snow replaces source albedo
before normal lighting. Fixed seasonal bakes were also rebaked/reinstalled white.
No water/contact or flight changes. Tests and live evidence are recorded in the
[Salt Lake baseline](baselines/salt-lake.md). Remaining tuning is artistic: RGB
vegetation hints and snowlines are not observed cover or physical accumulation.

## 2026-09-11: Elevation-driven seasonal snow

The color-map baker now accepts optional per-theater snow rules: smooth seasonal
elevation bands plus a permanent-snow override, sampled from verified DEM chunks.
Salt Lake's four maps were rebaked from existing appearance weights; no satellite
refetch or geometry/contact changes. Ukraine is unchanged. Rules are artistic,
not observed snow coverage; coarse atlas texels can miss small summit patches.
See [snow authoring](terrain-colors.md#elevation-based-snow--2026-09-11) and the
[Salt Lake baseline](baselines/salt-lake.md). Next tuning step: fly mountain terrain
in each season and adjust `theaters/salt-lake-snow.json`, then rebake/reinstall.

## 2026-09-11: Salt Lake seasonal bake and actual desktop flight review

Installed four 1024×409 seasonal maps using the same appearance weights/palettes as
Ukraine. Navigation starts at 400 statute miles across on large theaters; smaller
theaters retain full coverage. Practice links and aircraft/model/payload reloads
now serialize the current mission plus loaded manifest instead of stale page URLs.

Correction to the earlier flight acceptance: the old strip crossed six WBM water
samples, despite passing the height-only probe. Moved the authored strip 1.5 km west
within the airport area, updated waypoint 1, and validated the full footprint with
the actual GroundSampler (dry, 1285.11–1287.51 m; deck 1288 m). Fresh Electron tests
verify flight starts, seasonal switching, teleports and settled rendered terrain.
See [Salt Lake review](baselines/salt-lake.md) for evidence and known geographic limits.

## 2026-09-11: Salt Lake theater selection persists into flight

The flight-hosted terrain helper now commits theater selection to the same mission state
used by the main menu, loadout, pause and resume flows; it no longer reloads the Ukraine
manifest after selecting Salt Lake. A 370-point KSLC deck probe found terrain elevations
of 1284.3–1292.4 m across the strip, so the authored contact deck is 1293 m: five metres
above airport chart elevation, but within the existing 10 m terrain-fit validation limit.

## 2026-09-11: Salt Lake direct Sentinel texture accepted with recorded bounded gaps

The Salt Lake & Front Range direct Sentinel-2 bake exhausted its summer 2024 low-cloud
scene set with 0.61% residual land coverage after three-date temporal filling. The
pipeline now makes its residual interpolation fraction and radius explicit, bounded
per-bake settings (hard caps: 2% and 12 output pixels). This theater records 0.7% and
10 pixels; it retains the three-date agreement requirement. The verified installed
dataset contains 4,666 Copernicus DEM chunks, 12,747 water bodies and a 3072×1227
direct-Sentinel atlas. See `theaters/salt-lake.json` and the terrain polish guide.

## 2026-09-11: Salt Lake & Front Range theater authored

Added the public-data theater configuration covering Salt Lake City, Bonneville Salt
Flats and Denver, plus a selectable runtime theater definition. The main menu and terrain
explorer now choose the installed theater; the Salt Lake definition supplies KSLC's runway
start and three named map/flight teleport points. The generated terrain and Sentinel-2
paint atlas remain a local, ignored install artifact; pipeline build/install verification
is the next reproducible step.

## 2026-09-11: Clouds inherit solar exposure and colour

The cloud march previously copied the sky light colours but discarded their intensities,
leaving a full-strength neutral hemisphere fill that washed dawn, dusk and night clouds
white. Direct and ambient cloud scattering now use the same noon-relative intensities as
the scene lights, preserving the warm low-sun key and reducing fill after sunset. Targeted
cloud/sky shader tests, TypeScript and the production renderer build pass; GPU appearance
acceptance remains open.

## 2026-09-11: Live date picker and lunar eighths

The environment controls now place a native date picker beside the time control in
both terrain and pause settings. It updates the running calendar year/day without
restarting flight. A labeled icon reports the computed new, crescent, quarter,
gibbous or full phase in its waxing/waning eighth; hover text exposes the phase name
and illumination. Environment and UI coverage pass; desktop visual acceptance remains
open alongside the moon/low-sun pass.

## 2026-09-11: Astronomical moon disc and low-sun terrain key

Night now renders the simulation's computed moon position and phase with a bundled
public-domain NASA Galileo lunar photograph and a restrained cool halo. The low sun
no longer loses its directional-light strength merely because it is near the horizon:
Lambert shading still keeps level terrain dim at a grazing angle, while ridges and
terrain faces oriented toward sunrise or sunset receive the expected warm key light.
This is direct lighting rather than an indiscriminate post-process wash; fog continues
to inherit the scattering-model horizon colour. The full check passes (440 tests, 3
existing import-dependent skips); visual acceptance remains the next desktop-flight step.
See [sky lighting evidence](baselines/sky-lighting.md).

## 2026-09-10: Classic-style Escape bar and mixer

Paused flight now exposes live settings and six actual audio groups alongside
briefing/debrief, resume and confirmed exits. Mixer levels persist across reload;
session settings do not reset combat. 438 Bun pass/3 skips, 25 Python pass; see
[desktop evidence and limits](baselines/escape-mixer.md). Original menu-bar pixel
parity and finer speech/effects submixes are not claimed.

## 2026-09-10: User-approved FluidR3 baking and playback

All 154 local XMI files rendered; hash-keyed optional flight playback installed for
USNF, with bounded lazy decode, downbeat preservation, pause/mute/reset and explicit
oscillator fallback. Existing 41-track MUS selection unchanged. ATF assets staged;
unsupported native dispatch not fabricated. 433 Bun pass/3 skips, 25 Python pass;
fresh baked/legacy desktop music checks pass. [Evidence](baselines/fluidr3-audition.md).
Earlier audition-pending/no-engine-integration statements below are superseded.

**Music auditions resumed:** user-installed FluidSynth 2.6.0 and selected FluidR3
GM now render three baseline phrases successfully through the existing offline
exporter. 22 targeted tests pass. No live synth integration or arrangement edits;
listening acceptance pending. [Evidence](baselines/fluidr3-audition.md).

**Selectable guns:** retail-derived projectile dynamics and original imported yellow
geometry now coexist with remake bullets. Both modes share the trailing pipper,
using their programmed speed and an authored drop correction. Main-menu/helper
selection survives reset and live switching preserves combat/ammo. See
[baseline](baselines/retail-guns.md) and [binary evidence](formats/native-guns.md).
This supersedes older target-leading reticle descriptions; full native gun/AI/HUD
parity remains open. Audio work below is unchanged.

## 2026-09-10: Retail-derived gun toggle and shared pipper

Recovered launch/clamp, ammo debit/cadence, scalar deceleration, gravity cap and
lifetime from local executable/JT evidence. Bounded BULLET.SH decoder imports the
near yellow geometry at one foot per source unit, not an authored visibility scale.
Synthetic tests cover physics, decoder rejection, mode state, real combat hits and
target-independent shared pipper behavior. Next: native execution comparison,
hardpoint/AI service details and full renderer LOD, not fabricated parity.

**Audio gap follow-up:** checkpoint `6d941027333d43ee73f6854c90d1a2da89a09f42`
is committed/pushed on main. Strict media audit recovered a separately labeled48s
partial S35_S soundtrack, not seven complete movies. RPN0 pitch range, sustain,
finite loops and pressure preservation improved; offline MIDI/user-bank audition
and explicit capability diagnostics added.419 Bun pass/3 skips,62 targeted Python,
16 harness; fresh build and four serial live checks pass. Exact evidence and four
remaining boundaries: [audio gap baseline](baselines/audio-gaps.md).

## 2026-09-10: Audio gap recovery and safe fallbacks

No missing bytes or native instrument behavior invented. Replacement validation
requires exact sentinel/prefix compatibility; partial PCM is checked against fresh
archive ranges. Twelve-semitone retail bends no longer use fixed two-semitone range.
Infinite loops fail explicitly; pressure/other unrendered controls are visible.
Offline FluidSynth audition is blocked here by missing synth/selected SF2, not
presented as an engine timbre upgrade. No new gameplay solely to trigger speech.
Next: supplied complete media/compatible instruments, separately implemented
gameplay and native-host evidence. Earlier snapshots below remain historical.

**Commit checkpoint:** user authorized commit/push of the accumulated combat,
aircraft, mission and audio work. Final verification:415 Bun pass/3 existing skips,
50 targeted Python pass,16 harness cases pass, fresh build and serial live cue,
music and destruction checks pass. Scope excludes retail outputs and unrelated work;
see [phase6](baselines/phase-6.md) for commands and limitations.

**Newest audio continuation:** original actuator/stall/hit/fuel-empty/touchdown,
wind/tire and bullet-terrain clips are now connected to actual gameplay. Recovered
49 CB8 soundtracks from fresh media; all355 VDO segments have external speech.
Seven truncated ATF video ranges remain missing. MUS runtime choices/jumps/stops
and MIDI expression/pan/bend now work; host situation policy and instrument timbres
remain approximate.415 Bun pass/3 skips; targeted Python31 pass. Fresh Linux cue
and music checks pass. Details and remaining acceptance scope: [phase6](baselines/phase-6.md).

## 2026-09-10: Native audio hooks, CB8 demux and MUS runtime

Native evidence now ties actuator, stall, tires/wind and speech resources to actual
call sites/text pairs. ^OUTGAS is fuel-empty speech; ^OUTFUEL announces ejection and
is intentionally unused. No unsupported wingman/radar/missile behaviors invented.
Optional cue groups keep old imports working. Native score opcodes run with bounded
control flow; controller timelines preserve expressive MIDI events without a new
instrument-bank claim. Independent review caught music phrase-boundary downbeat
loss, distant impact cooldown suppression and overly permissive header-only movie
acceptance; all corrected with regression tests. CB8 is audio demux, not complete
video/index validation. Exact live results and earlier failed checks are in phase6.

**Latest: original audio recovery and situation music:** combat effects now use
retail hit/air-explosion/crash/water samples when installed. Entire identified
standalone audio libraries recovered: USNF809 waveform entries, ATF1,037, plus
all XMI and MUS files. ATF's damaged video archive required explicitly bounded
salvage; all standalone sound ranges are intact. Video-embedded audio is still
undecoded and unused speech/events are not yet wired. Flight music supports
N/volume/M/pause/reset and imported XMI notes. Native MUS bytecode/track groups
are recovered, but host dispatch and instrument rendering remain partial.
405 Bun tests pass/3 existing skips; fresh Linux retail destruction/music checks
pass. See [phase6](baselines/phase-6.md), [audio](formats/audio.md), [music](formats/music.md).

## 2026-09-10: Whole-library audio recovery, original combat samples and music

Independent native review tied PT/JT expType to the executable sound-pointer table,
confirmed crash references, and corrected raw .8K nominal rate to8010Hz. RIFF
headers override extensions; header/chunk/frame bounds are checked, including the
observed final odd unpadded ATF data chunk. Review caught silent acceptance of
truncated WAV and FFmpeg streaming-length headers; both were corrected and tested.
Export retains original hashes/archive entry identity and does not use source
filenames as output paths. Partial ATF ranges never synthesize missing bytes.
MUS CFG decoding preserves chances/jumps/choices and reports unreachable trailers.
Original AIR34 victory/AIR35 defeat presets were not native; current representatives
come from recovered groups. No game-owned instrument bank established: native
InitMusic opens Windows MIDI Mapper. Ancillary DirectX SBK copies are preserved
but not attributed to the game's synth. Next: native host situation transitions,
controller-aware MIDI rendering, remaining gameplay sound hooks, video demux.

**Earlier this pass: destruction/quick mission controls:** damaged skins, smoke/fire, fractured
imported geometry, tumbling debris and original synthesized impact/explosion sound
now cover both gun destruction and ground crashes. Quick missions expose air/runway
start, altitude, separation, orientation, offset and configurable departure grace;
default airborne, and terrain controls initially collapsed. First desktop pass
verifies gun/ground destruction, audio, pause and reset. Details in phase6 baseline.

## 2026-09-10: Destruction and quick mission follow-up

Fracture zones/material treatments are authored, not native damaged-model recovery.
Review caught material cloning serializing the afterburner texture cache; its actual
texture reference is preserved and regression-tested. Enemy spawn admission waits
for terrain and adjusts unsafe altitude offsets upward. Placeholder geometry now
cleans up at reset; shared imported geometry stays alive until layer disposal.
Departure instructions are hidden after death. Model/source and motion tests pass;
local desktop effects and UI evidence remain ignored under extracted/.

**Follow-up: combat freeze and ground wind:** reproduced an imported F14 freeze
at the first damaging hit. Damage multiplied the signed-integer native speed bound
by a fractional scale; native thrust validation threw and stopped the frame loop.
The bound is now truncated at the damage adapter, preserving native validation.
Ground tire impulses now include the current tick's forces and separate lateral
grip from rolling/braking resistance. See the follow-up in the phase 6 baseline.

**Latest, guns-only combat:** the former quick-fight mock now has a shared combat
world, original pursuit/return fire, visual contacts/target selection, swept gun hits,
airframe HP/drag/control damage, destruction, effects and combat debrief. C cycles
targets. Gun/loadout port data supplies damage and HP; missing values are labelled
original defaults. Retail AI, radar/RWR, missiles, subsystem damage and campaign remain
unimplemented. The old phase table below predates this slice; its statements that
combat is unwired or that a loadout screen/world does not exist are superseded here.

**Aircraft corrections:** reviewed 4c/6c texture cutouts fix exterior cockpit/frame
transparency. A4 root walls no longer move as flaps; F14 aft-quarter flap placement
follows the taper to the tip break; X31 trailing surfaces extend inboard. Neutral
source geometry is conserved. Updated imports installed locally with backups.
See [phase 6 baseline](baselines/phase-6.md) for current checks and limitations.

## 2026-09-10: First guns-only combat slice and aircraft cutouts/surfaces

Implemented the user-requested damage/combat integration ahead of the in-app importer.
Runtime now consumes the damage/hit helpers and binds the gun target; the retail AI
VM remains separate from the authored controller. Sweeps retain emission times and
relative target movement, select first hull entry, consume hit rounds, and attribute
kills once. A reviewed endpoint-clamping defect and same-step terrain-death ordering
defect were fixed with regressions. Healthy flight behavior remains unchanged, including
the preserved assisted source file. Data/render integration, reset/pause and debrief
are covered by the new headless and Electron checks in the phase 6 baseline.

The first desktop combat run timed out because the original pursuit controller fell
behind and fired too loosely. Speed matching and a tighter ballistic firing solution
fixed it; the subsequent real Electron fight reached defeat through ten projectile
hits. Initial visual captures did not wait for flight readiness; the poll was corrected
and all three aircraft were captured again with real cockpit art and deployed surfaces.
The Python gun test alone needs `PYTHONPATH=tools/retail`; its initial import error
was corrected by using that invocation. Earlier full Python retail testing still has
the unrelated local ATF_10.LIB offset error, so no full-Python-green claim is made.

## Earlier snapshot and acceptance history (before guns-only combat)

**Commit handoff:** final checks rerun after all rocker refinements: 371 Bun tests
pass, 3 existing imported-mount fixture skips, 0 failures; typecheck/lint/format
pass; four Python menu tests pass. User requested docs, commit and push. Retail
assets stay ignored. Packaged Mac acceptance below is historical, not this build.

**Latest page-control polish:** larger labels/counter and rocker, with raised
bevels and inset/cast shadows; verified visually in live Linux Electron.

**Latest placement correction:** briefing page switch is centered below the page
counter, inset within the grey panel. CSS-only; live Electron visual/bounds check,
Prettier and diff whitespace checks pass.

**Page-rocker reference follow-up:** shared `MenuPageRocker` replaces the briefing's
generic arrow pair with the supplied OG-style black counter, blue labels and pale
vertical switch. Navigation is bounded and keyboard-accessible.

**Latest mission-screen pass:** original quick-mission, briefing and loadout artwork
now frames the authored controls. Escape pauses the retained flight; Resume keeps
its simulation and audio session. Briefing actions sit left, page rocker right.
Linux checks: 371 pass / 3 skips, four Python menu tests, real desktop pause smoke.
See [mission menu evidence](baselines/mission-menu-revision.md); visual parity remains
subject to user review, not established by automated checks.

**Later correction, Omarchy menu revision:** the user rejected the prior menu
presentation. The current local pass fixes duplicate button styling, contrast,
off-screen notes, practice-control placement and secondary-screen layout, and
adds optional original title-theme playback. Linux menu development verification
has now begun; this does not accept the full Linux flight/rendering baseline.
See [menu revision evidence](baselines/menu-revision.md). Retail fonts and exact
original activity-menu music selection remain unverified.

| Phase | Implemented | Acceptance / remaining work |
|---|---|---|
| 0: retail toolkit | Containers, images/fonts and data readers; bounded nearest-detail F-14 static export with textures | F-14 is recognizable in packaged flight. General SH interpreter, native animation semantics and unified deliverable remain open |
| 1: scaffold and shell | Dev lifecycle/asset fixes, platform contract tests, fresh probe, Mac packaging | macOS tested including DMG launch; Linux hardware/build/checks deferred by user |
| 2: terrain pipeline | Copernicus DEM/WBM fetch, LAEA warp, roughness-selected 30m detail, filtered 100–2700m chunks, quantization, checksums, probe, codec comparison, bounded coastline smoothing, optional RGB atlas, offline coastal color repair, seasonal palette bakes and classified shoreline ribbons | Real Ukraine build and every-chunk probe pass; installed locally. Linux baseline deferred |
| 3: terrain renderer | Streaming, quadtree height/normal/tint morph, complete-coverage source fades, floating origin, free camera, bounded water, shared height/normal edges, eased edge ownership, satellite/seasonal color maps, classified textured shoreline ribbons/banks, conservative coastal coverage masks, analytic water-plane depth, FXAA, worker water triangulation, 24–300 km range with narrower fog and diagnostics; scattering sky table driving the sky dome, sun/moon key light, hemisphere ambient and dynamic fog, aircraft and cloud shadows, and a ray-marched cumulus/cirrus pass behind a quality selector with a depth-aware composite, a shared sky highlight rolloff and terrain shading contrast | Polished packaged coast/detail ~60 fps at 1440p, held at every time of day with clouds at half resolution; cloud cost measured with presentation unlocked (+3.4 ms half, +11.7 ms full). Current 0↔1 fade passes. Prior 1↔2/24km lateral evidence predates polish. Native GPU memory counters captured; physical-DRAM-only traffic is not established. Live counters and fine edges remain open. The theater renders mirrored east to west against its own manifest projection; see the 2026-09-09 compass entry. Linux deferred |
| 4: flight model | Retail PT-envelope default with preserved assisted comparison/fallback and opt-in recovered-native-envelope backend; native-metadata profiles now use recovered G commands, thrust/drag and fuel/load corrections; selectable local F-14/A-4E/X-31 exteriors and per-aircraft experimental PT profiles and developer port helper, moving surfaces and A-4-specific hook; throttle/engine/gear/hook/flap/brake controls, retail engine samples, vector HUD, bracket-selected waypoints, shared square 20-button explorer/flight MFD with compass, orientation modes and waypoint teleport, north-referenced heading with A/Ctrl-A heading-altitude and waypoint autopilot holds, Default F1 enlarged retail cockpit frames with aperture-fitted HUD and live F14/A4E mirrors, Shift-arrow look/orbit and center, imported PT/JT practice guns with safety, individual velocity-inheriting rounds and luminous red/green tracers, camera-projected gun pipper using nearer terrain or a 1,000 m base range, thick lower closing-range arc (hidden at/above 1 km) and target-input plumbing; cockpit-only HUD and armed-only reticle; F2/F3 chase, practice starts and a 16-case harness, indexed exact water queries, and a deterministic wind field the flight model reads | Packaged flight, systems/animation and live fuel acceptance on Mac; exact sources/results in baseline. A-4E/X-31 fresh unpackaged checks pass. Authentic per-aircraft dynamics, physical gamepad and human USNF feel comparison remain open; Linux deferred |
| Game shell | Steps 1–8 (all) of [game-shell-plan.md](game-shell-plan.md): one `MissionParams` object describes a session and is threaded through the viewer and the flight layer, a `Screen` state machine puts a main menu in front of the simulation without a router or a page reload, and the menu, aircraft select and debrief screens are drawn at the geometry `retail.mnu` recovers from `CHOOSEAC.DLG`, in original chrome or in the original's own artwork and sounds when a locally ported menu bundle is installed, a working loadout screen over an aircraft's recovered hardpoints, and a mocked quick fight that puts three aircraft in the sky on deterministic spawns inside the one 120 Hz clock | The quick fight's opponents fly fixed profiles: no AI, no acquisition, no damage. Stores are chosen and weighed but do not affect flight, and a station still offers only its own default because the hardpoint compatibility mask is undecoded. The bundle carries no retail fonts and no hover or pressed button art, both stated in [menu-porting.md](menu-porting.md). The `.MNU`/`.DLG` widget tables are decoded (`retail.mnu`), so those layouts can be read from the media rather than redrawn; dial and slider positions, tab order and widget state are still unknown. Two long-stale smoke assertions and one marginal braking threshold fail identically at the parent commit; see the 2026-09-10 shell entry |
| 5–10 | Plans and importer contracts; cockpit/gun developer import brought forward by user request. Phase 6/7 groundwork brought forward 2026-09-09: retail AI script parser and VM interpreter, `.SEE` detection model, damage/hit-point model with the recovered performance penalties, swept gun-round hit geometry, and a reusable MFD bezel extracted for a future target page. 2026-09-10: game shell planned end to end in [game-shell-plan.md](game-shell-plan.md), and the aircraft port now exports `.PT` hardpoints and the `.JT`/`.GAS`/`.SEE`/`.ECM` stores they name into a validated engine contract | Full combat (targets/damage/sensors), missions, in-app retail import and release work remain planned. The new AI and combat modules are pure, unit-tested and verified against all 17 retail AI programs, but NONE of it is wired into the flight loop: no multi-aircraft world, no acquisition, no damage applied from rounds. Nine AI action semantics remain open; parser success is not flown-tactics parity. The loadout data is exported, validated and installable but drives nothing: no loadout screen, stores do not feed mass, and the hardpoint `flags` compatibility mask and `maxWeight` unit are still undecoded |

## 2026-09-10: Menu revision commit handoff

Updated handoff, menu-port documentation and baselines to describe the final
original-art mission screens, title music, Exit, retained-flight pause/resume and
larger two-row page control. Marked the old Mac handoff as historical. Final
`bun run check`: 371 pass / 3 existing skips / 0 fail; Python menu export tests:
4 pass / 0 skips; `git diff --check` clean. User authorized commit and push to
the existing main branch. No retail bytes or local screenshots are included.
Next: user review of the running development build; exact retail fonts and native
widget parity remain open. See [mission menu evidence](baselines/mission-menu-revision.md).

## 2026-09-10: Exit in the top menu bar

Added Exit at the right end of the grey top bar, per the user's placement
correction. It invokes `Platform.quit()` through the isolated preload bridge and
Electron `app.quit()`, including on macOS. Browser development requests tab close,
which browsers may refuse for tabs not opened by script. Updated menu list and
smoke expectations to include Exit. Existing actions retain their positions.

Verified the real Exit action closed the Electron app; relaunched and visually
checked the final top-bar placement (`extracted/menu-exit-top.png`).
`bun run check`: 369 pass, 3 existing asset-dependent skips, 0 fail; initial
format check required formatting Shell.tsx, then passed. `git diff --check` clean.

## 2026-09-10: green buttons and white labels

User screenshot review identified the remaining beige framing in the imported
ACTION sprites and requested green buttons with white text. The menu stylesheet
now draws green beveled buttons with white labels, brighter hover/selected states,
pressed feedback, and darker disabled faces. It no longer draws the beige sprite
chrome; the original screen artwork and button positions stay intact. This is an
authored CSS treatment matching the requested colors, not recovered native drawing.

Verified in the running Linux Electron app; screenshot `extracted/menu-green.png`.
`bunx prettier --check engine/src/ui/styles.css` and `git diff --check` pass.
No new tests or full regression run for this CSS-only follow-up.

## 2026-09-10: Larger, raised briefing rocker

User requested a slightly larger, more three-dimensional control. Increased page
text about 20% and switch dimensions about one-third; added gradient faces,
highlighted bevels, a recessed counter and stronger cast/pressed shadows. The
below-counter placement remains. Live Electron screenshot inspected:
`extracted/rocker-raised.png`. Formatting and diff checks pass; CSS-only change,
no full regression rerun. Next step remains user visual review.

## 2026-09-10: Briefing rocker clipping follow-up

User reported the horizontal arrangement clipped at the grey panel edge and
requested the rocker below the counter. Shared page-control CSS now uses two rows;
the briefing placement has additional right-edge clearance. Live Electron confirms
the switch is below and horizontally centered under the readout. Screenshot:
`extracted/rocker-below-counter.png`. Formatting and `git diff --check` pass;
no full regression rerun for this CSS-only change.

## 2026-09-10: Mission menus and briefing page-control correction

Restored original QUIKMISS/BRIEFSC3 compositions and ORD_KITT store wells. Added
player aircraft/weather/time controls, optional imported ordnance thumbnails, and
true pause/resume with frozen environment, opponents, fuel/ammo, input and audio.
User corrected briefing control placement: actions left, two-page rocker right.
Fresh desktop smoke and code checks are recorded in
[the baseline](baselines/mission-menu-revision.md). Next: user visual review;
original bitmap fonts and native unlabeled-widget geometry remain unrecovered.

## 2026-09-10: Omarchy menu presentation and music correction

User review supersedes the previous shell presentation acceptance. Confirmed in
the running Electron app: `MenuScreen.tsx` assigned `.menu-action` to both wrapper
and button; CSS applied chrome/padding twice. Notes were positioned outside the
right edge, enabled text was pale on pale sprites, cap widths were assumed equal,
and fallback hover variables removed the artwork. `UiAudio` had only one-shots.

The revision separates wrapper/button classes, restores native button dimensions,
uses each sprite cap's width with subpixel overlap, increases and centers labels,
keeps explanatory notes accessible without overflowing, and places the practice
controls below the aircraft picture. Aircraft/debrief panels are centered;
secondary-screen headings remain visible, loadout rows gain spacing and aligned
store columns, and mock descriptions no longer expose parser implementation details.

`TITLE95.SEQ` explicitly names `^MF.11K` as title music. The exporter now includes
that optional bounded PCM clip; the menu loops it with shared mute and closes its
context outside menus. This is an authored reuse of original title music, not a
claim of original activity-menu music parity or XMI decoding. Converted media was
installed only into `/home/john/.config/USNF-ATF/data/menu` and ignored `extracted/`.

Verification: `bun run check` — 369 pass, 3 asset-dependent skips, 0 failures;
`python3 -m unittest discover -s tools/retail/tests -p test_menu.py` — 4 pass;
`git diff --check` clean. Development Electron/CDP checked main-menu bounds at
640×480, 1280×720 and 1920×1080, plus quick-fight/aircraft/loadout navigation and
music output/mute/teardown. Details and limitations: [baseline](baselines/menu-revision.md).
No packaged build or full flight regression is claimed. Next: user visual review
of the running menu, then retail font fidelity and any requested design changes.

## 2026-09-10: the game shell is in, and the regression set says what it cost

Step 8 of [game-shell-plan.md](game-shell-plan.md): the baseline entry, in
[baselines/game-shell.md](baselines/game-shell.md), with the machine, the commits
and every measurement in one place.

The headline is that a person can now launch the app, be met by a menu rather than
a terrain viewer, set up a quick fight or a free flight, choose an aircraft, load
it, fly it, and come back to a debrief — without a page reload anywhere in that
path. The simulation underneath is untouched: same 120 Hz clock in the same frame
loop, same floating origin, same throttled snapshot into React.

Two things came out of running the full Electron set against a packaged build of
the finished series rather than assuming it was green:

- **One real regression, found and fixed.** `retail-smoke` failed with "Mixed
  audio graph was silent". Its tap attaches to the first node that connects to an
  `AudioContext` destination, and the menu audio service added in step 5 was
  constructed for the whole session, so in a flight it could get there first and
  the tap would listen to a silent menu context. The shell now constructs menu
  audio only while a menu is on screen — which is what a flight wants anyway, one
  context rather than two — and `retail-smoke` passes again.
- **Three failures that are not ours**, each reproduced identically on a build of
  the parent commit `092d0d6`: `ground-smoke` and `aircraft-smoke` still assert
  that assisted is the default flight model, which stopped being true in `c6069fe`
  yesterday, and `smoke.ts --scenario approach` lands but brakes only to 7.07 m/s
  inside its 60 s budget against a 5 m/s threshold. The scripts were left
  unchanged rather than edited to pass; they are logged as defects with their
  reproduction, and deciding which behaviour is wanted is a separate call.

`envelope-smoke` could not be completed on this machine today. Its first case
verifies, then the second Electron session fails in Electron's own sandbox
bootstrap, before any of our renderer code runs, on both the new build and the
`092d0d6` build, with no other Electron process running. That is recorded as an
environment problem, not as evidence about the change.

Everything the shell mocks is listed in the baseline and said out loud in the app:
opponents fly fixed profiles with no AI, stores are weighed but do not affect
flight, a station offers only its own default because the compatibility mask is
undecoded, and the menu bundle has no retail fonts.

## 2026-09-10: three aircraft in the sky, and none of them are fighting

Step 7 of [game-shell-plan.md](game-shell-plan.md): the mocked quick fight. The
word mocked is doing real work here, and the screen itself says so.

**What is real.** `engine/src/sim/world/entities.ts` is a pure entity list with a
deterministic spawn: `seededUnit(seed, index)` is counter-based, so the same
mission puts the same aircraft in the same places whatever the frame rate did.
`engine/src/flight/OpponentLayer.ts` is the adapter that owns the models and the
scene graph, and it obeys the two constraints that matter — every opponent is
placed relative to the terrain's floating origin, and every entity advances
inside the player's own 120 Hz clock, so adding aircraft cannot change what the
simulation does per step. `QuickFightSetup.tsx` sets opponent count, aircraft and
skill, and `MissionParams.opponents` carries them into the flight.

**What is not real.** The opponents hold a heading, a speed and an altitude. The
retail AI virtual machine in `sim/ai/` is parsed, unit-tested against all 17 retail
programs and still not bound to aircraft state; nothing acquires, nothing shoots,
and no round does damage. `stepEntity` is deliberately the only function the AI
host will have to replace.

One convention bug was found and fixed by measurement rather than by reading. The
first spawn put the opponents behind the player: `headingOf` took identity forward
as +Z, when the sim's own convention — `attitudeFromEuler` and `bearingDegrees` in
`sim/flight` — is identity forward -Z with a bearing pointing along (-sin, cos).
A range trace showed the gap closing at 85 m/s instead of 360, which is a tail
chase, not a head-on pass. With the convention corrected the trace runs 6,032 m to
740 m at 18 s and opens again, which is the intended geometry.

Verification. `bun run check` clean at 370 tests. `entities.test.ts` covers the
deterministic spawn, the spawn geometry, one exact fixed step, and — the important
one — that three runs at 30, 60 and 144 Hz produce **bit-identical** entities after
2,400 steps, the same assertion `render-rate-determinism` already makes for the
player. `tools/flight/quickfight-smoke.ts` is new and passes against a packaged
build: two opponents exist, each has taken exactly as many steps as the player,
each has moved exactly its own speed times that time, and the test then flies until
the head-on pass is inside 1,500 m and captures it, so the screenshot is evidence
that they are rendered rather than merely counted. `menu-smoke.ts` now also walks
Create Quick Mission into the setup screen and back out. Screenshots are in
`extracted/step7/`.

Next: step 8, the baseline entry.

## 2026-09-10: the loadout screen, on the contract that was waiting for it

Step 6 of [game-shell-plan.md](game-shell-plan.md). The data half of this screen
landed this morning; this is the screen.

`engine/src/ui/menu/loadout-view.ts` turns an aircraft's recovered hardpoints and
the player's choices into rows and readouts, and does no arithmetic of its own —
all of that stays in `data/retail-loadout.ts`. `MenuControls.tsx` adds the rocker
and the dial, one component per recovered `_Draw*` class, and `LoadoutScreen.tsx`
composes them: a rack per selectable station with a store rocker and a count
rocker, a fuel dial over internal fuel, and a weight readout of fuel, stores and
gross against the maximum.

Measured end to end on a packaged build with the F-14's ported hardpoints
installed: the screen arrives on the aircraft's own stock loadout at **65,876 lb**
— the same figure `python3 -m retail.loadout` reported this morning, now reached
through the UI — emptying the Phoenix rack drops it to 61,976 lb, exactly four
975 lb missiles, and the fuel dial at 40% reads 6,296 lb. Clicking Fly starts a
flight whose diagnostics report `fuelFraction` 0.4. That last step is the whole
point of `MissionParams`: a chosen loadout cannot be written as a URL, so it has
to survive an in-app transition, and now it does.

What the screen is honest about, on its face and not only in these notes:

- **Stores do not affect flight.** The `.PT` `loadedDrag` family is displayed —
  drag 60%, G-pull drag 12%, elevator 35%, aileron 35%, rudder 35% for the F-14 —
  with the words "the flight model does not apply them yet" beside it.
- **A station offers its own default and an empty rack, and nothing else**, because
  the hardpoint `flags` compatibility mask is still undecoded. The developer
  toggle that lifts that is labelled after the original's own menu item, "Load
  anything anywhere", and defaults off.
- **An aircraft with no ported hardpoints gets a screen that says so** and points
  at the porting guide, rather than a screen with invented stations.

Verification: `bun run check` clean at 364 tests, six new covering the view model
(selectable stations only, the fuel and gross arithmetic including tanks, the
restricted and unrestricted store lists, the rocker steps, the overweight case)
and the rendered screen. `tools/flight/loadout-smoke.ts` is new and passes against
a packaged build; `desktop.ts` gained a `--loadout` copy option alongside the
existing per-aircraft ones. A screenshot is in `extracted/step6/`.

Next: step 7, `sim/world/entities.ts` and the mocked quick fight — three aircraft
in the sky on fixed profiles, deterministic from the mission seed, with no AI.

## 2026-09-10: the original menu artwork and sounds, as an optional bundle

Step 5 of [game-shell-plan.md](game-shell-plan.md). The menus can now be drawn
from a locally owned disc, and the app is unchanged without one — which is the
normal case and is asserted, not assumed.

The pieces, following the aircraft porting workflow exactly because it already
satisfies the AGENTS.md retail rules:

- `tools/retail/retail/menu.py` converts one game's menu media into two
  manifests: layouts and art from the `.DLG` tables `retail.mnu` decoded in step
  3, and the `&`-prefixed menu sound bank.
- `tools/menu/port-menu.ts` orchestrates it, validates the result through the
  engine's own parser before anything is published, writes to
  `extracted/menu-ports/<game>/<timestamp>/` with a port report, and installs on
  `--install` through `tools/menu/install-menu.ts`.
- `engine/src/data/retail-menu.ts` is the validating contract: caps on image
  size, PCM length, widget counts, label characters and the bundle's total bytes,
  and a check that each PNG's own `IHDR` agrees with the size the manifest claims.
- `engine/src/ui/menu/assets.ts` reduces a validated bundle to data URLs and CSS
  custom properties, loaded once in `Shell.tsx` and handed down, so the menu
  components stay prop-driven and effect-free.
- `engine/src/ui/menu/UiAudio.ts` plays the menu one-shots, and the `M` mute
  listener is now a shared `engine/src/flight/mute.ts` that flight audio and menu
  audio subscribe to, rather than two window listeners.

Measured on local media: 3 screens (main menu, loadout, debrief), 14 widget
records, 12 of them labelled, three nine-slice button parts in two states, and
seven sounds. `screens.json` is 492 KB and `sounds.json` 64 KB, both far inside
the parser's caps.

**Two things were cut deliberately, and the app says so rather than faking them.**
The retail proportional fonts are not in the bundle: they are glyph strips with a
256-entry table, and compositing text glyph by glyph is not something an
effect-free React component can do, so menu text is the app's own font. And hover
and pressed button art is not exported, because `ACTION0..3` and `ACTIOD0..3`
turn out not to be four states: measured on the media they draw 30, 18, 16 and 14
opaque rows inside boxes 30, 30, 28 and 26 tall, which reads as a size set. Only
the enabled button and its disabled twin are exported, and hover and pressed are
a brightness filter in CSS.

Which of that pair is the disabled one is not decoded either; it is read from
mean colour against the button well drawn into `CHOOSEAC.PIC`. The well averages
(172, 188, 144); `ACTIOD0M` averages (147, 155, 108) and blends into it, while
`ACTION0M` averages (212, 196, 163) and stands proud of it. That is the whole
basis for the mapping, and it is recorded in the bundle's own `limitations`.

Verification. `bun run check` clean at 358 tests: 4 parser tests covering 30
rejection cases and the total-byte budget, 5 UI audio tests covering the shared
mute listener and the silent-before-a-gesture path, and the existing menu and
navigation tests. Python is 101 tests, OK, one skip, including 4 new export tests
that read local media and skip without it. Against a packaged build,
`menu-smoke.ts` passes twice: once with no bundle, asserting the screen reports
`data-menu-art="original"`, and once with the ported bundle copied into the
isolated profile, asserting `retail` — after which both walk the same
transitions, so a bundle can change how the menu looks and never what it does.
Screenshots of both are in `extracted/step5/`. The port itself ran end to end on
this Mac; `desktop.ts` gained a `--menu` copy option, leaving every other
script's setup untouched.

[menu-porting.md](menu-porting.md) is the workflow and the limits.

Next: step 6, the loadout screen proper, on the `data/retail-loadout.ts` contract
that has been sitting ready since this morning.

## 2026-09-10: the menu is drawn at the geometry the retail dialog gives

Step 4 of [game-shell-plan.md](game-shell-plan.md): real menu components,
original chrome, no retail bundle yet. `engine/src/ui/menu/PlaceholderMenu.tsx`
is gone, replaced by `layout.ts`, `MenuScreen.tsx` and the `MainMenu`,
`AircraftSelect`, `LoadoutScreen` and `Debrief` screens.

The layout constants are the numbers `retail.mnu` recovered from `CHOOSEAC.DLG`
in step 3, not values chosen by eye: a 238-wide panel, eight buttons at x=31 and
width 180, at y 24, 56, 88, 120, 170, 202, 234, 285, so the two group breaks the
original has are the breaks we draw. `RETAIL_MAIN_MENU_RECT` keeps the original
`(379, 80, 238, 361)` for the bundle in step 5; our own panel is 64 px taller and
sits 40 px higher, which is exactly the room the two rows we add — Free Flight
and Terrain Explorer — need below the retail group. No retail bytes are involved;
these are measurements, in the same spirit as `flight/cockpit-layout.ts`.

Every menu is written in the original's 640x480 box and scaled to the window by
CSS alone: `aspect-ratio` on the frame, container query units for type, and
percentage positions computed from the design box. Nothing measures the window,
so no menu component has an effect — which is what makes them testable at all,
since `renderToStaticMarkup` is the only React test tool in the repo.

The debrief reads time aloft, takeoffs and landings, rounds fired and fuel
remaining out of the flight's own diagnostics snapshot, captured as the player
leaves. That is the same interface the Electron smoke scripts read, rather than
new plumbing through the render loop. It says plainly that damage is not
modelled, so no aircraft is ever lost there.

The loadout screen is still only the `LOADORD.DLG` Fly / Select Plane pair and
says on its face that stations and fuel are not adjustable yet; the real screen
is step 6, on the `data/retail-loadout.ts` contract that already exists.

Verification: `bun run check` clean, 349 tests, six new component tests covering
the retail item list and its disabled entries, the recovered geometry, the
percentage positions, aircraft selection, the loadout pair and the debrief lines.
Against a packaged build of this source, `menu-smoke.ts` passes, and
`smoke.ts --scenario ground`, `navigation-smoke.ts` and `teleport-smoke.ts` — the
three that between them exercise flight, the map and all four deep-link modes —
pass unchanged. A screenshot of the menu at 2560x1440 is in
`extracted/step4/menu/`.

Next: step 5, the retail menu bundle — `tools/menu/port-menu.ts`,
`engine/src/data/retail-menu.ts` and `UiAudio` — with the app still running
identically when no bundle is installed.

## 2026-09-10: the UI tables are decoded, and `.LAY` is not UI

Step 3 of [game-shell-plan.md](game-shell-plan.md). Pure research: no engine
code changed, and nothing here affects what the app does today.

`tools/retail/retail/mnu.py` decodes `.MNU` and `.DLG`. They are data-only Phar
Lap `PL` images of the family already documented for `.FNT` and `.HUD`: an `MZ`
stub, a `CODE` section holding the table, `.reloc` listing every pointer in it,
and for `.DLG` an `.idata` importing from `main.dll` — the host executable's own
export table, as [formats/ai.md](formats/ai.md) established for the AI plug-ins.
The only x86 present is a run of six-byte `jmp [IAT]` thunks, and that is the
useful part: **the imported name is the widget class**, so `_DrawAction`,
`_DrawDial`, `_DrawRocker`, `_DrawListBox` and the rest are read off the import
table rather than inferred.

Measured on local media, 2026-09-10: 182 of the 186 `.MNU`/`.DLG` files across
both discs decode, giving 1,113 widget records in 25 classes, 113 labels that
live in the file, 242 supplied by the host through `_okString`/`_cancelString`/
`_exitString`, and 62 menu entries. The four that do not decode — ATF's
`NETIPX2`, `NETJOIN`, `NETNEW`, `NEWNET` — have no `CODE` section at all, only
`.reloc` and a `$$DOSX` stub, so they carry no table.

Two things the decoder does differently from the plan's sketch, both because the
media said so:

- **Record boundaries are measured, not strided.** The plan recorded a fixed
  38-byte stride from `CHOOSEAC.DLG`, where every record is a `_DrawAction`.
  `LOADORD.DLG` packs a `_DrawRocker` in 39 bytes and a `_DrawDial` in 31, so
  the decoder walks `.reloc` instead: a relocated dword resolving to a thunk
  starts a record, and the dword at `+0x14` is its label.
- **A record's class pointer may be null**, meaning the host chooses the class.
  `QUIKMISS.DLG` is two real buttons plus 61 such records whose label slot points
  at an 80-byte run of zeroes — storage the game fills in per mission. They are
  reported as host-supplied with `runtime_text`, not given an invented class.

**A correction to the 2026-09-10 plan entry.** It said `CHOOSEAC.DLG` matches the
converted `CHOOSEAC.png` "pixel for pixel, including the break between the
mission group and the campaign group". The rect does: counting differing pixels
between adjacent rows and columns of that image puts the strongest vertical edge
at x=379 with its pair at x=616-617, and the top edge at y=80 where exactly 238
pixels change — left, right and top match `(379, 80, 238, 361)` to the pixel.
The button rows do not, because the background art contains no buttons at all;
the `ACTION*` nine-slice sprites are composited at run time. The eight `y`
values rest on the record layout alone.

Still open, and stated as such in [formats/mnu.md](formats/mnu.md): the `x`/`y`
pair at `+0x04`/`+0x06` is confirmed only for classes carrying a text label —
`LOADORD.DLG`'s two dials both decode to `(33, 38)`, which cannot be right for
two visible dials, so those classes keep their position elsewhere in the record.
26 records across both discs trip that check and are reported. Tab order, the
enabled state, the sprite set a widget uses and a dial's range are all unknown.
The `.MNU` node tree is pinned only for its text and accelerators; the flag byte
in front of each label is reported raw.

`ARMPLANE.MNU` decodes to "Weapons", "Unload All" and "Cheat (load anything
anywhere)" — independent confirmation that the original enforces a per-station
compatibility rule we still cannot reproduce, since the `.PT` hardpoint `flags`
mask remains undecoded ([formats/pt.md](formats/pt.md)).

[formats/README.md](formats/README.md) listed `MNU`/`LAY`/`DLG` as one row of
"unknown — UI". That row is now split, and the `LAY` half was simply wrong:
`DAY1`, `DAY2`, `CLOUD1`, `FOG1` and their `V` variants name `wave1.SH` and
`ocean*06.PIC` in their data. They are the sky and sea layer plug-ins a
mission's `layer` key selects, and there are no UI `.LAY` files on either disc.
[formats/mission.md](formats/mission.md)'s `layer` row is corrected too.

Verification: `python3 -m unittest discover -s tools/retail/tests` is 97 tests,
OK, one skip — eight new in `tools/retail/tests/test_mnu.py`, four building a
synthetic `PL` image with its own import table, thunks and relocations, and four
reading local media that skip when it is absent. `bun run check` is unaffected
and still clean at 346 tests.

Next: step 4 of the plan, the menu components and layout constants, replacing
the structural placeholder with original chrome at the recovered geometry.

## 2026-09-10: a session is one object, and the app has a main menu

Steps 1 and 2 of [game-shell-plan.md](game-shell-plan.md), committed separately.
Nothing about the simulation changed: the 120 Hz clock still runs inside the
viewer's own `requestAnimationFrame` chain, React still receives only a throttled
diagnostics snapshot, and the floating origin is untouched.

**Step 1, `MissionParams`.** `engine/src/sim/mission/params.ts` is now the single
description of a session — mode, theater, aircraft, flight model, start, loadout,
environment, camera, opponents and seed — with `DEFAULT_MISSION`,
`parseMissionQuery`, `missionQuery` and `validateMission`. It is pure: no DOM, no
platform, no three.js. The URL is demoted from the place session state lives to
one serializer of it, which is what makes a loadout screen possible at all, since
a loadout is not something a player can type into a URL.

The seven scattered `window.location.search` reads are gone. `main.tsx` reads the
search string once; `startTerrainViewer` and `FlightLayer.create` take the object;
`initialCamera` takes the parsed camera overrides instead of a query string. The
old split between tolerant and strict parsing is preserved deliberately: `mode`,
`root`, `manifest`, `flightStart`, `flightModel`, `flightFuel` and `flightPayload`
fall back to a default, while `aircraft`, the environment set, `contrast` and the
camera pose still throw, and the failure is carried into the viewer panel's
existing error text rather than blanking the app.

**Step 2, the screen state machine.** `engine/src/ui/menu/navigation.ts` holds the
`Screen` union, `initialScreen`, `nextScreen`, `nextMission` and `applyMenuAction`,
all pure. `engine/src/ui/Shell.tsx` owns `{screen, mission}` and mounts either the
renderer probe, the terrain viewer, or a menu. Leaving a mode is a state
transition, not `location.assign`, so no reload is involved. No dependency was
added; there is still no router.

The rule that keeps every machine-facing entry point alive: **a query string
wins.** The menu appears only when the app is launched with nothing in the URL at
all. Every existing Electron script deep-links with at least `view`, `root` and
`manifest`, so all of them land exactly where they did, including the explorer
cases of `teleport-smoke.ts`, which pass no `mode` at all.

The menu itself is a **structural placeholder**, and is called that in the code.
It renders the whole retail `CHOOSEAC.DLG` item list with everything we cannot
deliver visibly disabled and labelled with why, plus Free Flight and Terrain
Explorer below it. The recovered retail layout, artwork, fonts and sounds are
steps 3–5 of the plan; the loadout screen is step 6; the quick fight is step 7.
Choosing "Create Quick Mission" today reaches the same flight with one nominal
opponent recorded in `MissionParams.opponents` and **no opponent flown** — the
mock is not built yet.

Verification, on this Mac, against the packaged and unpackaged builds of the
committed source:

- `bun run check` clean at both commits: 334 tests then 346, typecheck, lint,
  format. Twenty-two new tests: ten for the parameter object (legacy-key parsing,
  round trip, clamping, the strict failures, every validation message), eight for
  the transitions, four for the menu markup through `renderToStaticMarkup`.
- All thirteen existing Electron smoke scripts were run against a build of each
  commit — sixteen runs, since `smoke.ts` has three scenarios and
  `cockpit-gun-smoke.ts` three usable cases — plus the new `menu-smoke.ts`.
- `menu-smoke.ts` is the only script that launches with no query, which required
  a `bareLaunch` option in `desktop.ts` that leaves every other script's defaults
  untouched. It verifies the main menu appears, that the enabled items are exactly
  the three modes this build delivers, that a disabled item goes nowhere, and that
  reaching the explorer, pressing Esc back, and flying an A-4E from Free Flight
  all preserve a marker set on `window` — proof no page reload occurred.

**Three failures, all reproduced identically on the parent commit 092d0d6**, which
was built and run for the comparison. They are pre-existing defects, not
regressions, and the scripts were left unchanged rather than edited to pass:

1. `ground-smoke.ts:41` and `aircraft-smoke.ts:24` both assert that the assisted
   model is the default flight model. That stopped being true in c6069fe on
   2026-09-09, which made the retail PT envelope the default whenever a profile is
   installed and the URL does not ask for `assisted`. Reproduce with
   `bun tools/flight/ground-smoke.ts --binary <packaged>`: "Existing assisted model
   is not the default". The stale claim in `tools/flight/README.md` is corrected
   here; the assertions themselves are left for a decision about which behaviour is
   wanted.
2. `smoke.ts --scenario approach` lands but does not brake below the 5 m/s
   threshold inside the 60 s budget: `landings: 1`, `status: "grounded"`, final
   airspeed 7.07 m/s. Same result at 092d0d6 with the same flags.

One further script, `envelope-smoke.ts`, passed against the step 1 build and could
not be completed against the step 2 build: its second Electron session fails in
Electron's own sandbox bootstrap ("Cannot destructure property 'preloadScripts' of
'binding.startupData'"), before any of our renderer code runs. The same failure hit
`flaps-neutral-smoke.ts`, `aero-smoke.ts` and `surface-smoke.ts` once each and all
three passed on retry, and the 092d0d6 build also fails to complete
`envelope-smoke.ts` in the machine's current state. A development `bun run
dev:electron` instance was running from the same Electron binary throughout. This
is recorded as an environment problem, not as evidence about the change; its first
case (F-14 retail envelope) did verify airborne at 4.63 peak g.

Next: step 3 of the plan, `tools/retail/retail/mnu.py` plus `Docs/formats/mnu.md`
and the formats index correction that `.LAY` is sky and sea layers rather than UI.
That step is pure research and touches no engine code.

## 2026-09-10: game shell plan, and hardpoints and stores in the aircraft port

Two things landed. First, [game-shell-plan.md](game-shell-plan.md) scopes the
screens around the simulation — main menu, an explicit terrain-explorer mode, a
mocked three-aircraft quick fight, and a pre-mission loadout screen — together
with the `MissionParams` refactor that makes them possible and the test work each
needs. It also records two format findings verified against local media: `.MNU`
and `.DLG` are data-only `PL` images whose `CODE` section is a 38-byte widget
record array with inline ASCII labels, and `.LAY` is sky/sea layers rather than
UI. `CHOOSEAC.DLG` decodes to the main menu's exact geometry (header rect
379, 80, 238, 361; eight buttons at x 31, width 180), which matches the converted
`CHOOSEAC.png`. The formats index still lists all three as "unknown — UI"; that
correction is sequenced as step 3 of the plan, alongside a `retail.mnu` decoder.

Second, and brought forward from that plan at the user's request, the aircraft
port now carries weapons and hardpoints:

- `tools/retail/retail/loadout.py` exports a `.PT`'s `:hards` stations together
  with the `.JT`, `.GAS`, `.SEE` and `.ECM` stores they name, classifying each by
  its `structType` byte (7 weapon, 8 tank, 9 ECM, 10 sensor).
- `engine/src/data/retail-loadout.ts` is the engine-side contract: a validating
  parser in the style of `retail-gun.ts`, plus the pure weight and fuel
  arithmetic a loadout screen needs (`defaultLoadout`, `allowedStores`,
  `storesWeightLb`, `externalFuelLb`, `grossWeightLb`, `validateLoadout`).
  Retail units are kept as pounds and feet; SI conversion is at the boundary.
- `tools/flight/port-aircraft.ts` runs the new converter as a sixth step,
  fails the port if a named store file is missing, if the loadout and gun
  manifests disagree about the source `.PT`, or if the retail default loadout
  does not itself validate, and records a `loadout` section in the port report.
  `tools/flight/install-aircraft.ts` gained `--loadout`, installing
  `appData/aircraft/<id>-loadout.json`.

Measured on local media, 2026-09-10. F14.PT: 8 stations, 4 selectable, 8 stores,
15,741 lb internal fuel, stock gross 65,876 lb against a 74,349 lb maximum.
A4E.PT: 7 / 3 / 7, 4,434 lb, 22,426 against 25,000. F31.PT: 9 / 3 / 8, 9,975 lb,
29,360 against 40,200. "Selectable" excludes the sensor and ECM slots and the
internal cannon. Station `maxItems` independently reproduces the gun capacities
`retail.gun` already recovered: 675 M61 rounds on the F-14, 400 Mk 12 on the
A-4E, 740 on the X-31.

Verification. `bun run check` clean: 324 tests, typecheck, lint, format. Five new
Python tests in `tools/retail/tests/test_loadout.py` pass against local media and
skip without it; full Python discovery is 89 tests, OK. Eleven new synthetic
TypeScript tests cover parser rejection, station classification, the weight and
fuel arithmetic and every validation message. All three aircraft ported end to
end and validated; the bundles were not installed.

Two `.PT` hardpoint fields remain **unresolved**, and both are recorded in
[formats/pt.md](formats/pt.md) rather than guessed at. `flags` is the
per-station compatibility mask — the original's own `ARMPLANE.MNU` offers
"Cheat (load anything anywhere)", so a rule certainly exists — and its bits are
undecoded, so `allowedStores` offers a station its own default and nothing else
unless a caller explicitly asks for the unrestricted set. `maxWeight` is a byte
that is not pounds (40 for a 975 lb AIM-54C, 5 for a 190 lb AIM-9M); it is
probably a rack or pylon class. Hardpoint positions are raw words of unverified
unit and are exported unconverted.

Nothing here changes flight. Stores do not yet feed mass, and the `loadedDrag`
family of penalties is exported for display only. Next: the `MissionParams`
refactor, step 1 of the game shell plan, because it is what a loadout screen
needs in order to hand its result to a flight.

## 2026-09-09: recover the retail AI virtual machine, sensors and damage data

Non-player behaviour in USNF'97 and ATF Gold is a scripted virtual machine the
executables call "Chuck-Talk", and its programs ship as plaintext `.AI` source.
That makes the original AI reusable rather than something to approximate. New
format documentation: [formats/ai.md](formats/ai.md) (language, bytecode opcode
table, skill model, execution model), [formats/sensors.md](formats/sensors.md)
(`.SEE`/`.ECM`/`.GAS`) and [formats/damage.md](formats/damage.md). Corrections
landed in `formats/object-types.md`, `formats/pt.md`, `formats/jt.md` and the
formats index.

Implemented, all pure and deterministic, none of it yet wired into the flight
loop:

- `engine/src/sim/ai/program.ts` parses the language; `vm.ts` interprets it with
  reason-priority preemption, per-action suspension, the recovered 5,000-statement
  budget and the four persistent scratch slots.
- `engine/src/sim/combat/sensors.ts` implements the `.SEE` two-zone detection
  model, the four signature channels, the manual's weather range table and the
  configuration signature multipliers.
- `engine/src/sim/combat/damage.ts` implements the single hit-point pool, the
  weapon hardness table, the recovered damage-to-performance scaling, the
  low-skill G penalty and structural overload.
- `engine/src/sim/combat/hits.ts` does swept segment-versus-capsule hit
  detection for both bodies moving.
- `engine/src/ui/Mfd.tsx` extracts the shared MFD bezel from `TerrainMap` so a
  second page can reuse it; `mfd.test.ts` is the first test to render either.

Verification. `bun run check` clean: 313 tests, typecheck, lint and format.
`bun tools/ai/parse-scripts.ts` parses **all 17 extracted retail programs, 0
failures** (`F.AI` 424 instructions, 70 labels, 37 sensors) and decodes all 14
`chance` literals to four in-range per-skill percentages. The tool's independent
reachability check finds exactly the two dead labels the language analysis
predicted, `fastlittlejink` and `offset_done`. Retail media is optional: the tool
skips cleanly without it, and every committed test uses synthetic fixtures.

Findings worth recording as corrections. `.BI` is **not** compiled x86 as this
repository previously stated: it is a PE container whose `CODE` section holds a
custom stack bytecode, with x86 only in the import thunks. There is no
`main.dll` despite every plug-in importing from that name — the host executable
is `main.dll`, resolved through its own `.SMS` symbol table. `ctName` selects the
AI program, not a cockpit. Reviewing the sensor and damage data against the media
also corrected eleven claims in the working research notes, including that `zone1`
is *not* always inside `zone0` (three IRST files inverted), that `.SEE`
`allAspect` rather than `dopplerMinRange` is 50 on those files, and that several
figures quoted as F-14 values (`structureLimit`, the crash limits) are in fact
constant across all 153 `.PT` files — which strengthens the conclusion that the
per-subsystem damage model is engine code against a fixed 45-slot layout, not
per-aircraft data.

Discrepancies deliberately not smoothed over. The manual says damaged AI lose
thrust; no thrust reduction exists in the recovered code, so none is modelled.
The `.JT` `chances[0..3]` index is left UNRESOLVED rather than called a skill
index, because `chances[3]` is 0 in 197 of 210 weapons and ten radar missiles
have `chances[0]` of 0. Three values in the engine code are original
approximations and are labelled as such in source: the nose-on signature floor,
the hull radius as a fraction of length, and the damage coefficients.

Remaining gaps. Nothing is connected to the simulation yet: there is no
multi-aircraft world, no target acquisition, no damage application from gun
rounds, and `FlightLayer.setGunTarget` is still uncalled. Nine action-semantic
questions are open and each names the routine that would settle it; in
particular our seeded generator reproduces a sequence exactly but is not the
original's sequence. Parser success is not flown-tactics parity.

Next reproducible step: bind the VM's sensors and actions to real aircraft state
behind a deterministic harness scenario, so a scripted engagement can be asserted
headlessly before any renderer or UI work.

## 2026-09-09: reverse range-bar fill and hide it outside 1 km

Corrected the user's reported reversed bar in `GunSightOverlay.ts`: the thick
lower bar now starts at west/left just inside 1,000 m, reaches south/bottom at
500 m and fills through east/right at zero. It is absent at or beyond 1,000 m
and for the base-range fallback. The thin reticle ring remains visible while
armed. This supersedes the earlier east-to-west fill description below.
Projection, ballistics and weapon/camera visibility gates are unchanged.
Verification is recorded in the phase 4 baseline. Next manual check: close on
nearer terrain and observe the bar fill left-to-right.

## 2026-09-09: correct gun/camera alignment, add range arc and visibility gates

Confirmed the user's reported alignment bug: `gun-sight.ts` used unequal authored
angular scales, and `FlightHud.tsx` positioned the reticle inside differently
placed cockpit artwork. The sight also discarded muzzle-to-eye parallax. Repro:
arm each aircraft in airborne practice; the old reticle sat at each aperture's
HUD centre rather than the renderer-projected round trajectory. Earlier sight
unit tests only checked the authored angular mapping, not screen alignment.

The sight now returns an absolute world point using the same muzzle transform
as emitted rounds. `GunSightOverlay.ts` projects it through the current renderer
camera after its pose and floating origin are updated, every frame. The thick
lower semicircle grows from east/0 through south/500 to west/1,000 metres. It
clips to the combiner without relocating aimpoints. F2/F3 hide the entire flight
HUD; safe, unavailable or empty weapons hide the reticle. Target mode remains
input plumbing only. The near/base-range rule and default retail/cockpit choices
remain as recorded below.

Independent review confirmed the projection and parallax defects. New tests use
all three locally imported gun manifests and actual stepped rounds, including
both A4E barrels, across window shapes, head look, bank and origin rebasing.
Exact final commands, screenshot evidence and limitations are in the
[phase 4 baseline](baselines/phase-4.md). This supersedes the previous entry's
camera-projection limitation and safe/external sight presentation. General
instrument pitch-ladder calibration and actual ballistic terrain intersection
are separate remaining work. Next: human low-level strafing comparison to tune
range indication against nearer sloping ground.

## 2026-09-09: retail/cockpit defaults and range-aware gun reticle

User supersedes the earlier assisted-default decision: all imported aircraft now
start in retail PT-envelope flight, with assisted unchanged as a selectable
comparison and missing-profile fallback. Cockpit is the initial/reset view;
camera-mode labels are removed from the HUD. Selector/start links follow the new
default. Recovered-native envelope remains opt-in; no complete retail physics
parity is claimed.

The original radar-style gun pipper uses forward contact-surface range, capped at
1,000 m per the user's follow-up. Sky, farther terrain and unloaded data show
an explicit base-range solution, with aircraft velocity and gravity included.
Closer land/water/strip surfaces use measured ray range. This corrects the first
working iteration's no-range sky behavior, not a shipped baseline. Missing data
is never zero ground. The base range is authored tuning, not recovered native
sight behavior. Target mode is plumbing only: absolute world position/velocity
input and a bounded intercept solution, cleared on reset/teleport or lock loss.

Evidence, exact commands and the transient Electron startup failure/retry are in
[phase 4 baseline](baselines/phase-4.md). No flight dynamics or retail decoders
changed. Targets, acquisition and damage remain future work. Next: manually fly
low over sloping ground to tune the range cap and assess aircraft-relative HUD
cue placement; a world-projected collimated sight remains a separate refinement.

## 2026-09-09: fit HUD to cockpit glass and render live mirrors

The user's follow-up requested a larger frame so the HUD fits consistently and
live cockpit mirrors. The frame is now 1.8× viewport width, centered, with full
height retained; each aircraft's measured safe HUD opening determines the SVG's
aspect-preserving fit. Frame, HUD and mirrors share resize/look transforms.
Side mirrors enter view with head look. This supersedes the earlier independent
HUD layout and static-mirror limitation below; native gauge/HUD execution and
3D side/rear cockpit reconstruction remain open.

The exporter now removes only the connected flat-color mirror interiors and
emits exact RGBA masks for F14 and A4E/F4 (three each); X31 has no mirrors in its
retail frame. The renderer reuses a 512×256 rear scene at 10 Hz, with distinct
left/center/right reflected crops, aircraft/tail visible and renderer state
restored afterward. Optics and placement remain original approximations; the
rear view omits volumetric clouds and uses already selected terrain/shadow maps.

Fresh desktop evidence and final checks are in [phase 4 baseline](baselines/phase-4.md).
F14/A4E center mirrors visibly show their tail and the landscape, the complete HUD
fits the opening, and X31 remains mirror-free. A synthetic mask test checks exact
coverage without punching out disconnected pixels of the same color. Existing
external-HUD test failure from an unconditional aperture lookup was corrected;
237 Bun tests pass. Updated cockpit imports are installed in local app data.
Next: manually compare forward and side mirror framing at preferred window size.

## 2026-09-09: retail cockpit views and luminous practice guns

Imported forward cockpit frames for F14, A4E and X31 through the existing
validated developer port helper and installed all three locally. A4E.PT selects
F4.HUD: its shared F4 frame is genuine retail mapping; IIA4E.PIC is a small
silhouette, correcting the older cockpit-set hypothesis in format notes.
F1 opens a window-filling cockpit overlay, Shift-arrows look/orbit, Shift-/
centers, and shifted arrows remain isolated from flight controls.

PT/JT-selected internal guns now bring their own type, capacity and PCM. Tab
fires individual 120 Hz ballistic rounds; Shift-Tab toggles the default-on safety.
Aircraft world velocity is added to muzzle velocity, gravity acts on every round,
and one in five is a tracer. The user's night-visibility follow-up adds self-lit
additive heads: F14/A4E red and ATF X31 green defaults, with configurable imported
belt color. Raw retail grouped-round fields remain separate from authored
ballistics and colors. Default assisted flight physics remain unchanged.

`bun run check` passed 234 tests; Python passed 83 with one optional scratchpad
skip; original flight harness 16/16; fresh M3 hardware probe passed. Day desktop
scenarios passed for all three aircraft, midnight red/green captures were inspected,
and safety/ammo/view/audio-context assertions passed. Multi-session smoke attempts
twice hit an Electron sandbox startup error before app loading; the remaining
X31-night scenario passed separately. Exact commands, source, installations,
failures/skips and scope are in [phase 4 baseline](baselines/phase-4.md).

[Implementation guide](phase-4-cockpit-guns.md) records source mappings,
ballistics citations and controls. This user-requested early extension is recorded
in the build plan; it does not complete phases 5/6. Side/rear cockpit geometry,
working retail gauges/mirrors, conformal native HUD, projectile impacts/damage,
drag/dispersion/recoil and human sound acceptance remain open. Next: run the
installed aircraft in `bun run dev:electron` and compare cockpit views and gun
sound by hand. Linux remains deferred, Windows acceptance remains phase 9.

## 2026-09-09: aircraft-porting guide performance follow-up

Updated [aircraft-porting.md](aircraft-porting.md) to reflect the recovered
performance integration: profile-dependent behavior, G command limits,
coefficient units, fuel/payload corrections and remaining native-parity gaps.
Added partial-throttle, loading and instantaneous/sustained-G acceptance
guidance plus the current F-14 harness, envelope audit and fresh desktop smoke
commands. Aircraft-specific scenarios and unladen tests are explicitly scoped.

Documentation-only follow-up; no new runtime measurements. Cross-checked the
guide against the current tools, native-performance notes and phase 4 baseline;
checked local Markdown links and `git diff --check`. The current snapshot and
performance measurements remain those recorded below. Next: use this checklist
when validating the next aircraft port or extending recovered native coverage.

## 2026-09-09: recover the missing Tomcat G and partial-throttle performance calculations

The reported behavior reproduced in still air: the previous solver sustained
about 681 KTAS at 45% throttle/36,000 ft, and full aft stick from 450 KTAS at
1,000 m peaked at 12.47/12.52G (retail/recovered modes). The HUD reads true
airspeed, so a tailwind is not the explanation. The exact observed 770 KTAS was
not a steady full-fuel equilibrium in this reproduction.

The user's recollection and the manual's envelope/Extra G sections led to the
missing native caller: row classification and fractional G interpolation feed
bounded stick G commands, with fuel/load reductions and a +1G cheat branch
clipped to the PT maximum (9G for F14). Actual local x86 execution also confirms
the 1G upper-speed input to thrust, transonic drag, AB-referenced dry-power drag,
altitude-dependent sound speed and loading corrections. **Correction to earlier
entries:** exclusive sustained-G interpretation of all polygons was an assumption;
those rows also directly govern instantaneous control authority.

Both experimental modes now apply that recovered subset for native-metadata
profiles. An original alpha controller tracks the G request; no HUD/load-number
clamp hides excess lift. Native force arithmetic feeds the existing SI integrator,
with continuous device/AB fractions. Full fuel and aggregate payload now reduce
G authority and increase drag using the recovered percentage corrections.
A-4E/X-31 local profiles have no native USNF metadata and retain the fitted path.
`assisted-flight.ts` is unchanged.

Current full-fuel, no-wind results: 45%/36,000 ft converges to **390.45 KTAS**
from both 450 and 770 KTAS; 450-KTAS full-pull peaks are **5.95/5.96G**. The
intermediate 426-KTAS result omitted native loading corrections and is superseded.
The unladen-native coefficient probes and full-fuel SI trajectories must not be
conflated. [Phase 4 baseline](baselines/phase-4.md) records commands, provenance,
all verification and remaining gaps; [native performance](formats/native-performance.md)
records the recovered formulas and field-confidence corrections.

Verification: 218 Bun tests; all 16 original harness cases; 15 retail-profile
acceptance cases per model; 16 audit trajectories; 600 native G ranges, 108
low-speed reductions, 72 turn rates, 3,200 sound/drag and 800 loading comparisons.
Fresh Mac probe and live flight evidence are recorded in the baseline. Initial
neutral-trim regression was corrected to use airflow-normal lift; the historical
full-fuel AB boundary gate failed once native loading was included and now checks
the unladen boundary separately. A negative-zero mismatch in the isolated turn
translation was corrected to native integer zero. A formatting check initially
failed and was corrected. No unavailable-media skips in these runs.

Remaining: complete native attitude/stall/damage integration, exact hardpoint
partition, and human USNF feel acceptance. No whole-game parity or real-aircraft
certification claim. Linux remains deferred; Windows phase 9. Next reproducible
step: rerun `bun tools/harness/envelope-audit.ts extracted/flight/f14-flight.json
extracted/flight-envelope-audit/f14.json`, then compare manual flying in both
experimental models at the reported altitude/throttle and low-altitude pull-up.

## 2026-09-09: retail coastline research and painted two-sided shoreline ribbons

**How the originals draw coasts (observed, not yet in `Docs/formats/`).** The
`.T2` grid only gives a 2.5 km land/sea boundary. Coast detail comes from
hand-painted 256×256 `.PIC` "tmap" tiles per theater (`UKR0..28`, `VIE0..41`,
`BAL0..65`, `EGY0..48`, `FRA0..46`, `VLA0..51`; Kurils use 128×128 `K<xxx><yyy>`),
placed by `tmap x z index rot` / `tmap_named name x z` lines in the theater `.MM`
master mission on a 4-cell (10 km) grid with 0–3 rotation; both executables
carry an in-game tmap editor. About 20 of the shared 29-tile base set are
sea/land edge shapes with painted beach lines and sandbars. Fallback ground is
`LAND.PIC`, water `OCEAN0..6.PIC` + `WAVE01/02.PIC`; palette bands 0xC0..0xFE come
from the `.LAY` PE modules at runtime, which is why extracted terrain previews are
magenta. New `.T2` facts: tile table = (0, origin-cell color index, majority land
class); land class 1 is deep water and `(0xFF, 0)` a 1–5 cell near-shore band;
Vietnam uses color bank 0xC2..0xC7, all others 0xD0..0xDA; the Baltics water mask
is not an exception. Hypotheses: the shallow band is drawn distinctly; `VLAND.PIC`
is Vietnam ground; the clutter table is indexed by land class. Format docs still
need updating from this.

**Rebuild change: two-sided painted ribbons.** The shoreline ribbon now spans
from a seaward edge across the water line to the landward edge
(`SEA_RATIO` 0.7 of the landward offset, water line at t≈0.41), all vertices
float at least 0.5 m so the sea half sits on the water plane, and the bank faces
are removed (the sloped seaward half replaces them). The atlas is 384×640 RGBA:
five rows from the user's own grayscale paintings in ignored
`gameassets/textures/` (beach, rocks, cliff, marsh; unknown = muted beach), made
seamless, box-downsampled ≈5.7×, colored by a per-class two-tone land ramp and a
water-to-foam ramp toward the engine's slate water, with alpha fading at both
edges so the strip blends rather than outlining. The along-coast repeat is 128 m.
`RIBBON_WIDTH_SCALE` = 3 widens the pipeline cross-sections visually; the
pipeline's narrow-land safety was computed at 1×, so slivers and translucent
overlaps appear on spits and small islands. This is a test value, not accepted art.

Evidence: `bun run check` 214 pass; fresh unpackaged build; shoreline smoke against
`extracted/terrain/ukraine-shorelines` at noon (`time=12`) →
`extracted/terrain-shoreline-seaward/{summer,winter}.png`, 60 fps, 15,459 ribbon
triangles, 72 MiB estimate, no runtime errors. The summer frame reads as a beach/
rock coast with a foam line instead of a grey outline. Not measured: flight-mode
performance, Odesa detail waypoint, other theaters. Next: decide on the width
scale (or move widening into the pipeline with its safety checks), retune class
palettes against the seasonal maps, and document tmaps in `Docs/formats`.

## 2026-09-09: terrain shading contrast

The terrain read as one flat wash at altitude, with hillsides blending into the next
ridge. New `engine/src/terrain/light-contrast.ts` widens the gap between a sunlit face
and a shaded one by scaling the two diffuse terms apart in the terrain material: the
direct term, which is what varies from face to face, goes up by the setting, and the
hemisphere fill, which is near constant across the scene and is therefore the part
doing the flattening, comes down by half as much. It is patched in at
`#include <aomap_fragment>`, after the light loop and after the cloud shadow has
already dimmed the direct term, and before the diffuse terms are summed.

Doing it on the light rather than as a curve over the finished frame is the point: the
sky, the sun disc, the clouds and the haze are not shaded surfaces, and a curve over
the final pixel would stretch the fog along with the ground it is hiding.

**The value is 0.8, chosen by the user against the running renderer, not derived.** A
temporary slider was added under the time-of-day control so it could be dialled in
live, then removed once the value was picked; `?contrast=<fraction>` remains for
comparing values without a rebuild, and there is no in-app control.

What it measures on the Crimean ridge, 10:00, clear, 1280x768 on this M3, over the
foreground terrain of the same frame:

| Setting | mean sRGB luminance | standard deviation |
|---|---|---|
| off | 47.5 | 2.22 |
| shipped 0.8 | 74.0 | 2.80 |

So it brightens as well as separates, which the fill reduction restrains rather than
cancels. That is recorded in the module comment as what it does; the earlier draft of
that comment claimed the mean was held, and the measurement above is what corrected it.
Checked at 13:00 as well: no clipping on sunlit slopes.

Two earlier approaches to the same complaint were built and discarded on the user's
direction, and are not in the tree: elevation contour lines like a topographic chart,
and cel-shaded ink — polygon edges found from the patch cell lattice plus a depth
silhouette. Worth recording from the second one, since it will come up again if
outlines are revisited: only one pass may sample the scene depth. That texture is
attached to one of the composer's two ping-pong targets, so a second depth-sampling
pass inevitably writes to the target the texture is attached to, and the driver
rejects it outright as a framebuffer feedback loop
(`GL_INVALID_OPERATION: Feedback loop formed between Framebuffer and active Texture`).
A silhouette pass therefore has to share the cloud composite, which already holds that
depth, or the scene needs a dedicated depth target outside the ping-pong pair.

Verification on this Mac against this source: `bun run check` — typecheck, lint,
format and 245 bun tests. Seven new tests cover the arithmetic, the shared uniform box,
the query, and that the three shader include this patches still exists and still sits
after the lights and before the diffuse sum. Driven in Electron over CDP at three times
of day: no shader errors, no exceptions.

## 2026-09-09: compass direction, cloud silhouettes, sun highlight and autopilot

A polish pass over four things the user reported flying the practice mission.

**The compass and the map rotation ran backwards.** The scene is right-handed
with `+Y` up and `+Z` north, so east is `−X`; `sky.ts`, `solar.ts` and the wind
readout already assumed that, but the HUD did not. `flightHudReadout` computed
`180° + yaw`, which counts *down* through a right turn, because a right bank
drives `yaw` down in both flight backends. Heading is now
`headingDegreesFromYaw` = `180° − yaw`, shared from `sim/flight` so the HUD, the
explorer overlay and the autopilot cannot diverge; waypoint bearings use a
matching `bearingDegrees` with east as `−X`; and `worldToMap`/`mapPixelWorld`
mirror the raster's x axis so the aircraft marker and the heading-up rotation
match the ground the aeroplane is actually crossing. Tests updated to the
corrected convention, plus a new closed-loop check that a right turn raises the
heading and that the heading agrees with the bearing of the velocity the
aeroplane actually has, measured straight off the world axes.

*Uncovered while fixing it, and left open:* the theater manifest is
east-positive in `x` and north-positive in `z` — Ukraine's
`projection.originX = −280665` puts Crimea at `x ≈ 486 km` of 561 km — and the
renderer places both unchanged, which a right-handed frame cannot honour. So the
terrain is drawn mirrored east to west and the map raster inherits it. Everything
is now self-consistent with what the pilot sees, but the map is a mirror of real
Ukraine, and it was before this change too; the difference is that the marker
used to lie about it as well. Recorded with the required fix in
[environment-plan.md](environment-plan.md). Not attempted here: it has to move
contact sampling and visuals in the same step.

**The aircraft went fuzzy with cloud behind it.** The cloud march runs at half
resolution and the composite upsampled it bilinearly, so on the pixels covering
the aircraft — where the march stopped at the canopy and contributed nothing —
neighbouring texels that marched past into the deck behind bled a bright fringe
over the silhouette. The composite now takes scene depth and the marched texel
size, and where the four surrounding low-resolution texels disagree about depth
it takes the depth-matched tap instead of the blend. Away from silhouettes every
tap agrees and the bilinear result is kept, so the clouds themselves are not
sharpened and cloud genuinely in front of the aircraft still obscures it.

**The daytime sun was a blown-out plate.** Nothing in the pipeline tone maps and
the scattering table is unbounded radiance: measured at a 48.7° sun, the sky is
1.34–1.50 within a couple of degrees of the disc and still near 1.0 at 12°, so
roughly 25° of sky clipped to flat white with a hard rim and the disc itself was
invisible inside it. `skyHighlightRolloff` compresses per channel above a 0.45
knee and is the identity below it, so the calibrated clear-sky, horizon and night
values are untouched; the sky shader carries the same curve with the knee
interpolated from the model so the two cannot drift, and the scene fog is run
through it as well or the dome and the haze part company at the horizon. The sun
and moon discs are added after the transfer — rolled off they would land within a
hundredth of the sky beside them — and the disc now reaches full brightness at
the sun's true angular radius, fading over a third of it again rather than over a
second whole radius. Before and after screenshots at noon: a solid white ball
with no visible disc, versus a graded aureole, blue sky a few degrees out, and a
crisp disc.

**Autopilot, as in USNF '97 and ATF.** New pure `sim/flight/autopilot.ts`. `A`
holds the heading and altitude captured at engagement; `Ctrl-A` keeps the
altitude hold and steers to the selected waypoint's bearing, falling back to the
captured heading when no waypoint is selected or the aeroplane is on top of one.
Each key toggles its own mode off, switching between them keeps the capture, and
touching any stick axis past 0.15 hands the aeroplane back. It flies through the
ordinary control deflections, so the flight model, the wind and the ground stay
in charge and both backends behave the same; the loops ask for a rate and
normalise by the aircraft's own limit, which keeps the gains physical and lets
the model's own `responseSeconds` lag do the damping. Bank is capped at 30°,
climb at 20 m/s. The map overlay pushes the selected waypoint down through
`setNavigationTarget`, and the HUD shows `AP HDG ALT` or `AP NAV`.

Verification, all on this Mac against this source:

- `bun run check` — typecheck, lint, format and 213 bun tests pass.
- `bun run probe --fresh` — hardware ANGLE Metal on M3, no software fallback.
- `bun run harness` — all 16 flight cases pass, including the five wind cases.
- Electron driven over CDP at `mode=flight`: no shader compilation errors and no
  exceptions; the only console output is three's `PCFSoftShadowMap` deprecation
  warning, which predates this work.
- Autopilot in the running app, from a deliberate upset at 2914 m on 180°:
  `A` recovered to 178° and 2866 m within 30 s; `Ctrl-A` picked up bearing 348°
  and turned 178° → 238° → 298° the short way while holding 2920 m; an arrow-key
  nudge disengaged it to `off` in the same frame the pilot's input appeared.
- Six closed-loop autopilot tests fly the preserved assisted model for 90–120 s
  and gate bank, heading, altitude and stall.

Open: the mirrored theater above. The autopilot does not manage throttle, which
matches both originals but means a level hold at low power will slowly bleed
speed. Nothing here touches flight forces, so the preserved assisted feel is
unchanged.

## 2026-09-09: theater clock, wind, sky, shadows and volumetric clouds

Implements [environment-plan.md](environment-plan.md) steps 1–4. The theater now
has a clock with a real sun and moon, a wind field, aircraft and cloud shadows,
and authored cloud layers with a ray-marched cumulus deck and a cirrus sheet.

New pure-simulation module `engine/src/sim/environment/`: NOAA solar position,
truncated-Meeus moon with an approximate phase, four wind presets with a
power-law surface profile blending to a veered upper wind by 3000 m and a bounded
deterministic gust term, five weather presets with authored layer altitudes and
coverage, and an `Environment` that owns the clock and season. No Three.js and no
DOM, so all of it runs under `bun test`. Rendering support modules are equally
headless and tested: a single-scattering Rayleigh/Mie sky table with an
approximate multiple-scattering closure and an ozone layer, and tiling coverage
and Perlin-Worley noise generators shared by the cloud march and the cloud
shadows.

**Wind is the only part of this that touches flight.** `aerodynamics()` already
subtracted `FlightEnvironment.wind` from ground velocity in both backends;
`FlightLayer` now writes it once per fixed step from the flight clock's time.
Five harness cases and a unit test pin the behaviour, including a byte-identical
zero-wind result for the preserved assisted model. Time of day, shadows and
clouds are explicitly not flight-affecting. The parked-in-wind case measured a
bounded 4.5 mm/s creep rather than the plan's predicted stillness; the gate was
set from that measurement and the reason is recorded in the phase 4 baseline.

Rendering: the fixed `AmbientLight`/`DirectionalLight`/`Fog` are replaced by a
`SkyLayer` that rebuilds the scattering table only when the sun moves more than
0.25 deg and feeds the sky shader, the fog colour and both lights from it, so CPU
and GPU colours cannot disagree. Noon is the calibration anchor: the table's
zenith lands on #8ca4c9 against the retired constant `0x91b1c8`, and the key
light is scaled to reproduce the previous `2.4` at `0xfff0d0` at a summer local
noon, reddening on its own through the model's transmittance. Below the horizon
the key light follows the moon. Aircraft shadows use one tight orthographic box
around the aircraft with only aircraft meshes casting. Cloud shadows are a shared
GLSL snippet and one shared uniform set patched into the terrain, water,
shoreline, aircraft and deck materials, sampling the same coverage texture the
march samples, so no extra pass. The cloud march is a new composer pass between
the scene and tone mapping, at selectable full/half/quarter resolution.

The helper panel gains an Environment section: a time-of-day slider showing HH:MM
and sun elevation, and Weather, Wind and Cloud quality selectors, all restoring
canvas focus. URL parameters `time`, `date`, `weather`, `wind`, `clouds` and
`cloudSteps` are validated and fail loudly. `__terrainDiagnostics()` gains an
`environment` block including shadow state; `__flightDiagnostics()` gains wind and
ground speed; the HUD gains `WIND ddd/ss`. The date picks the seasonal colour map
on load when the dataset has one, and the manual selector still wins.

Verified on this Mac: `bun run check` green (204 Bun tests), `bun run harness`
green (16 scenarios). Unpackaged Electron acceptance at 2560x1440 held 59.8–60.1
fps with zero renderer or console errors at noon, dawn, dusk, night, over a
broken cumulus deck and in practice flight. With presentation unlocked the cloud
pass costs +1.3 ms at quarter, +3.4 ms at half and +11.7 ms at full over a 2.75 ms
baseline; half is the shipped default and full is not a safe one. Exact commands,
tables and screenshot findings are in
[baselines/phase-3.md](baselines/phase-3.md) and
[baselines/phase-4.md](baselines/phase-4.md).

Known gaps, none of them silent: the sky table integrates from a 2 m eye, so the
shader clamps below-horizon views to the horizon row and the sky does not deepen
with camera altitude; cloud edges are soft at half resolution because the upsample
is bilinear; fog remains one colour per frame; terrain self-shadowing, time
acceleration, precipitation and in-cloud turbulence stay deferred. From the chase
cameras the aircraft's own shadow is off screen in most sun geometries — confirmed
on the deck in the ground scenario, and the reason is written up in the phase 3
baseline so the next reader does not repeat the search.

Next reproducible step: open practice flight, drag the time slider through dusk
with Weather set to Broken cumulus, and compare `clouds=half` against
`clouds=full` at the mountain waypoint before deciding whether step 5 should spend
its budget on depth-aware upsampling or on a camera-altitude term in the sky
table.

## 2026-09-09: repeatable aircraft-port helper and worksheet

Added `tools/flight/port-aircraft.ts` with reviewed F14/A4E/X31 recipes. One
command converts geometry/rig/textures, PT flight data and audio, validates the
bundle with runtime parsers and checks its scale/aircraft identity. Dated outputs
and a provenance/measurement report remain ignored under extracted; installation
is optional. Reports leave visual/runtime acceptance pending and do not claim
native parity. Unsupported aircraft still require decoder/runtime/rig work.

The [full guide](aircraft-porting.md) covers independent source choices, probe
versus fuselage length, pose-dependent wingspan, origins/axes, per-aircraft PT
facts, native-parity limits, surface clipping/mixing, hook/gear/nozzle placement,
audio, selector integration and acceptance gates. A reusable worksheet captures
new-aircraft evidence, unknowns and handoff. Exact verification is recorded in
the phase 4 baseline. This remains a development tool, not the phase 5 in-app
importer. Next: run `bun tools/flight/port-aircraft.ts --aircraft x31 --dry-run`,
review the recipe, then use the helper and worksheet for the next aircraft.

## 2026-09-09: A-4E / X-31 surface rigs, Skyhawk hook and X-31 scale

Added authored movement to the imported A-4 elevators, ailerons, flaps, rudder
and lateral speed brakes, plus X-31 canards, elevons and rudder. Fixed-wing rigs
keep source textures and neutral shape; triangulation precedes clipping because
independent review found small neutral-shape changes when clipping nonplanar A-4
quads first. Actual-source area/UV conservation tests now cover that case.

Replaced the A-4's scaled F-14 hook placement with its own belly mount, longer
arm/shoe, upward stow and shallower deployment. X-31 calibration now uses the
7.26 m wingspan from its local reference entry, making the whole aircraft 13.46%
larger. All four retail variants have the same small canard/wing proportions;
no decoder shortening was found, so canards are not independently stretched.

Installed the verified 482/398-triangle exports locally. Mac Electron checks
exercise movement, neutral return and hook placement, with separate orthographic
inspection views. Exact source, test results and earlier verification failures
are in the phase 4 baseline. Native animation schedules, X-31 vectoring/paddles,
visual X-31 brakes and carrier arresting force remain unimplemented. These are
visual changes; flight physics and the other agent's environment work are intact.
Next: reload the practice view and exercise pitch/roll, F/B and the A-4 H toggle;
[aircraft setup](phase-4-aircraft.md) contains repeatable conversion/test commands.

## 2026-09-09: selectable A-4E and X-31 with their own flight profiles

Added the sim helper Aircraft dropdown, per-aircraft model/audio/profile paths,
and explicit profile identity checks. Imported both new exteriors/textures from
ATF-GOLD. X-31 uses ATF-GOLD F31.PT; A-4E uses USNF97 A4E.PT for flight data/audio
because its ATF-GOLD counterpart is not available as a decoded PT record.
The experimental envelope solver uses their own mass, fuel, thrust and G rows.
A-4 has no burner; X-31 has one burner and no hook. Preserved assisted handling
remains the default; new imports do not enable F-14 recovered-native helpers.

Fresh Mac Electron checks verify the actual geometry, profile hashes, thrust,
mass, fuel burn and dropdown roundtrips. Independent review confirmed the A-4
needs military thrust as its effective maximum when raw aftThrust is zero, and
found the existing generic smoke lacked an aircraft ID; both are addressed.
Original control assistance, static-pose limitations and X-31 vectoring remain
open. Full native game-flight parity is not claimed. Exact source, commands,
failures/skips and platform limits are recorded in the phase 4 baseline.

Next reproducible step: restart practice flight, choose an aircraft, then select
**Retail PT envelope fit (experimental)**. Compare handling against preserved
assisted using the [aircraft setup](phase-4-aircraft.md). All retail-derived bytes
stay in local ignored extraction/app-data directories. Environment work belongs
to the other agent and is excluded from this aircraft commit.

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
