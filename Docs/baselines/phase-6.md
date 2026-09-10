# Guns-only combat slice — 2026-09-10

## Authorized commit checkpoint (2026-09-10)

Reviewed tracked diff and new source/test/docs files before staging. Base remains
`f2d4c44a59d74b6d6b139b44261a9fd6b1a09c10`; user now authorizes commit/push on `main`.
Final `bun run check`:415 pass,3 existing asset-dependent skips,0fail; typecheck,
lint and formatting pass. `bun run harness`:all16 scenarios pass, including ground
wind hold, takeoff/landing and render-rate determinism. Targeted Python commands
from the audio continuation section plus `test_gun.py` and `test_sh_static.py`:
9+14+3+5+1+18=50 pass, no skips. Full media-dependent Python suite is not claimed.

Fresh `buildUnpackaged()` produces `index-3aYg_lZp.js`; serial `audio-cues-smoke`,
`music-smoke`, and `destruction-smoke` all pass again (real menu, F14/A4 combat,
ground crash, audio output, pause/mute/reset). `git diff --check` clean; assisted
comparison source unchanged. Retail archives, extracted assets and built bundles
remain ignored and excluded. No native-fidelity or cross-platform acceptance added.

## Audio continuation: gameplay hooks, CB8 and MUS VM (2026-09-10)

Linux Omarchy; source `f2d4c44a59d74b6d6b139b44261a9fd6b1a09c10` plus the ongoing
uncommitted working tree. Bun1.4.2, Node26.8.1, Python3.14.7. No commit/push requested.
Final source build is renderer `index-3aYg_lZp.js` (earlier first-pass audio checks
used `index-B17vkWyz.js`). No retail bytes bundled or copied into public assets.

Implemented fixed-clock optional actuator/stall/hit/fuel-empty/credited-kill/contact
cues and bullet land/water collision events. Native WIND/TIRES loops replace those
environment placeholders when imported. Original aircraft PT engines and JT gun
audio remain intact. No phantom wingmen, sensors, missiles, carrier or ejection
systems added. Native associations and authored scheduling boundaries: [audio](../formats/audio.md).

Music now runs bounded recovered MUS bytecodes against41 XMI tracks/34,709 notes;
sequence boundaries retain opening chords and FC stops playback. Original file
hashes accompany the local score programs. MIDI CC7/10/11/121 and pitch bend now
drive expression, pan and frequency automation. Host situation policy/RNG and
oscillator timbres remain authored; native ChooseScore evidence and unsupported
MIDI/state dependencies are in [music](../formats/music.md).

Verification:

- `bun run check`:415 pass,3 existing imported-mount skips,0fail;705,433 assertions,
  62 files. Strict typecheck, lint and formatting pass. `assisted-flight.ts` has no
  diff; staged diff empty. This is not a full native/cross-platform parity claim.
- Targeted Python: audio9, music/score14, video3, container5 =31 pass, no skips.
  Full Python suite is not claimed green with the known truncated ATF archive.
- Both video catalogs freshly read source discs: USNF22 and ATF27 embedded-audio
  movies, one silent each. All49 output PCM hashes and WAV payloads audited byte
  for byte;22050Hz mono PCM8, total86,678,550 sample bytes. All355 VDO segments map
  to105 existing external audio names. No prior extracted movie is an input.
- Fresh live `audio-cues-smoke`: real F14 G/F/H controls produce gear/flap/shared
  hook cues; actual fuel consumption triggers exactly one OUTGAS recording.
  Native environment loops installed, nonzero audio-graph RMS (first pass0.08337984),
  pause stops cue voices, M does not replay muted control edges, reset clears cues.
  Final-build rerun passed with RMS0.08566234.
- Fresh live `music-smoke`: imported MUS selects AIR15 for initial NORMAL and
  AIR10 for EJECT-adapted defeat in this deterministic run. Audio-only RMS was
  0.00586266 on the first pass; N/M, pause/resume and reset pass. This establishes
  emitted PCM and state transitions, not human listening or original instrument timbre.
  Final-build rerun passed with RMS0.00439301.
- Fresh live `destruction-smoke`: quick menu, imported F14 versus A4 combat,
  actual player-hit speech (one event), gun destruction, gear-up ground crash,
  original explosion/crash PCM, debris/chase view/pause/reset pass without renderer
  errors. Player-credited kill speech, stall/touchdown and bullet-terrain cues have
  synthetic/state tests but are not all separately exercised by these live scripts.

Failures corrected during this pass: initial video module import used a nonexistent
module name; a terrain assertion was initially inserted into the wrong test; ES2023
findLast was incompatible with the TypeScript target; an optional VM result needed
narrowing in a test. First cue smoke used invalid `mode=practice`, opened explorer
and timed out without a renderer error; changed to the existing `mode=flight` query.
Independent review found lost time-zero notes at fractional phrase boundaries,
inaudible terrain impacts consuming the audible cooldown, and acceptance of
header-only/audio-only CB8 files. Regressions cover the fixes. CB8 demux still does
not validate the entire movie frame index or audiovisual synchronization.

Installed `audio/combat.json`, `audio/environment.json`, `audio/flight-music.json`
under local appData. Replaced manifests from this work are backed up in
`extracted/audio-library/usnf97/combat-before-cues.json` and
`music-before-native-vm.json`; retail assets remain recoverable/local/unbundled.

Remaining blockers/gaps:

- Complete ATF_10.LIB needed for S35_S, X29_D/M/S, X31_D/M/S CB8 soundtracks;
  current archive is91,145,639 bytes short. No missing bytes fabricated.
- No game-owned instrument bank proven; native Windows MIDI Mapper selected the
  user's device. A compatible legally supplied synth/bank is needed for better
  timbres. No synth dependency or bank installed during this pass.
- Native host enums/lock/carrier/ejection/success state, ATF opcode parity and
  AIR015/VALK001 references remain unresolved; no claimed native fallbacks.
- MIDI sustain/RPN/banks/reverb/chorus/XMIDI branch-loop semantics and a movie player
  are not implemented. Unused speech requiring absent gameplay remains unbound.

Reproduction (Electron runs serially):

```sh
PYTHONPATH=tools/retail python3 -m unittest discover -s tools/retail/tests -p 'test_audio*.py'
PYTHONPATH=tools/retail python3 -m unittest discover -s tools/retail/tests -p 'test_music*.py'
PYTHONPATH=tools/retail python3 -m unittest discover -s tools/retail/tests -p test_video_audio.py
PYTHONPATH=tools/retail python3 -m unittest discover -s tools/retail/tests -p test_containers.py
bun run check
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
bun tools/flight/audio-cues-smoke.ts /home/john/.config/USNF-ATF/data
bun tools/flight/music-smoke.ts /home/john/.config/USNF-ATF/data
bun tools/flight/destruction-smoke.ts /home/john/.config/USNF-ATF/data
```

Exporter commands are in formats/audio.md and formats/music.md. Reports/logs under
`extracted/audio-cues-smoke`, `music-smoke`, and `destruction-{menu,combat,ground}`
are local evidence only. Original full-source video catalogs live under
`extracted/audio-library/{usnf97,atf-gold}/video/catalog.json`.

## Audio recovery and situation music (2026-09-10, same f2d4c44 base + working tree)

Linux Omarchy, Bun1.4.2; no commit/push. `CombatAudio` now loads validated retail
PCM via Platform, bounded to2M samples/8 voices; synthesized effects are fallback
only. Native table/PT/JT evidence is in formats/audio.md. The current local appData
has seven original effect clips in audio/combat.json and five representative XMI
note tracks in audio/flight-music.json. Previous music manifest backed up under
extracted/flight-music/flight-music-before-score-recovery.json. No retail public assets.

FlightMusic supports imported notes, fallback melodies, bounded voice scheduling,
mute/volume/N toggle, pause/resume and outcome selection. Native MUS selector scripts
are separately decoded; runtime is not full native selection or instrument parity.

Verification:

- `bun run check`:405 pass,3 existing imported-mount fixture skips,0fail;
  typecheck/lint/format pass. An initial new optional-error assignment failed strict
  typecheck; assigning only a defined string corrected it before the passing run.
- Audio Python tests:9 pass; XMI/score tests:13 pass; container tests:5 pass.
  A first mistyped `test_ealib.py` filter ran zero tests; actual test_containers.py
  was then run. Full Python suite is not claimed green (known damaged ATF media).
- Fresh unpackaged renderer `index-DkSWPHJb.js`; destruction-smoke passes imported
  F14 vs A4 and actual gear-up ground crash with `combatAudio.source=retail-pcm`,
  fragments, chase view, pause and reset. Music-smoke passes actual nonzero PCM
  signal, N/M, pause/resume, defeat transition to AIR10 and reset.
- Both disc catalogs rerun with RIFF validation, ADPCM normalization and bounded
  ATF salvage. USNF809/ATF1037 waveform entries; XMI104/102, MUS9each. Seven ATF
  video entries unavailable; video/sidecar audio remains unknown, not recovered.
- Post-export audit validates all1,846 waveform RIFF/chunk/frame extents and every
  preserved original SHA-256. AUTORUN is now19,070 actual PCM16 frames at11025Hz,
  not a streaming-length sentinel. Music-only measured RMS0.00140954 is nonzero.
- Independent review found truncated-WAV acceptance and FFmpeg pipe WAV unknown
  size sentinels; final exporter validates source extents and writes real output
  frame sizes. Synthetic malformed/odd-final-chunk tests cover those bounds.
- Preserved assisted-flight.ts unchanged. No packaging/platform parity claim.

Commands/evidence:

```sh
PYTHONPATH=tools/retail python3 -m unittest discover -s tools/retail/tests -p 'test_audio*.py'
PYTHONPATH=tools/retail python3 -m unittest discover -s tools/retail/tests -p 'test_music*.py'
PYTHONPATH=tools/retail python3 -m unittest discover -s tools/retail/tests -p test_containers.py
bun run check
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
bun tools/flight/destruction-smoke.ts /home/john/.config/USNF-ATF/data
bun tools/flight/music-smoke.ts /home/john/.config/USNF-ATF/data
```

Ignored evidence: extracted/audio-library/*/catalog.json, music-scores.json,
extracted/destruction-{menu,combat,ground}/ and extracted/music-smoke/report.json.
Original visuals remain procedural; this pass replaces sound, not explosion sprites.

## Destruction and quick mission expansion (2026-09-10, same base)

`AircraftDamage` owns per-instance material clones and partitions visible model
triangles into six authored fracture zones. Source geometry/textures remain intact;
fragments retain UVs and are separately disposed. `AircraftBreakup` uses event-seeded
kicks and a fixed120Hz integration, terrain settling, at most four wrecks and20s
lifetimes. `CombatEffects` caps pooled sprites at256. Fire/smoke/explosions are
procedural code-native visuals, not retail effects. `CombatAudio` synthesizes impact,
air explosion, ground and water cues, attenuates distance, caps eight voices and
honors mute/pause/reset/dispose. No new dependencies or distributed retail bytes.

Mission encounter fields are canonical and URL-round-tripped. Default quick mission
is airborne; explicit runway links remain runway. Settings:500..8000m AGL,
2..40km separation, head-on/tail-chase/behind/crossing, ±3000m enemy offset,
0..120s departure grace. Protected runway fights hold enemies until sustained
flight at least100m AGL; they then enter at the configured relative geometry.
Zero grace opts into immediate combat. Spawn altitude is subject to terrain+200m
clearance after contact data arrives, not an invented zero ground. Quick terrain
tools initially collapse. Flight physics/AI tactics otherwise unchanged.

Verification before music follow-up:398 Bun tests pass,3 imported-mount skips;
typecheck/lint/format pass; all16 flight harness cases pass.
Fresh desktop commands:

```sh
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
bun tools/flight/destruction-smoke.ts /home/john/.config/USNF-ATF/data
```

Imported F14 versus A4 gun kill and gear-up ground impact both pass: nonempty
fragment meshes, one destruction cause, played synthesized sound, chase view,
continued frame loop, pause freeze and reset clearing fragments. Screenshots and
diagnostics are in `extracted/destruction-{combat,ground}/`. Initial sound assertion
failed because the smoke helper blocked trusted keyboard events; the interactive
test flag now admits CDP input to exercise gesture unlock. Initial menu capture
preceded compositor settling and repeated tiles; a paint wait produced the correct
single frame in `extracted/quick-setup-check/setup.png` (2560x1440 viewport,
1919.99x1439.99 centered menu frame). Footer spacing was subsequently tightened.
Final user visual/audio acceptance is separate from automated playback assertions.

Review fixes include preserving afterburner texture references across material
clones, reset/final geometry ownership and suppressing departure guidance on defeat.
Spawn-admission initially invalidated a manually positioned collision fixture; it
now explicitly marks its targets already admitted. New tests cover terrain-safe
spawn admission and departure release, ground/water event causes, material isolation,
triangle/UV conservation, render-cadence-independent debris and bounded disposal.

## Follow-up: combat freeze and ground wind (same date/base commit)

User reported a frozen frame during F14 versus A4 combat and all-aircraft wind slip
on the ground in the default PT model. Read-only system checks found no recent
coredump, Crashpad minidump, OOM kill or GPU journal error. An isolated desktop run
with the installed F14 model/profile/gun/loadout/audio reproduced a stopped frame
at step 1987, 17.857% damage. Captured exception: `Native signed 16-bit integer
required`, in native-power validation reached through the damage-adjusted speed
bound. Evidence: `extracted/combat-hang-diagnostic/runtime-errors.json`.
The damage adapter now truncates that bound; native helpers stay strict.

The old tire calculation applied friction only to existing velocity and used
rolling resistance for lateral slipping. The default model now limits predicted
ground-axis velocity with load-dependent tire impulses, separately along/across
the wheels. Lateral coefficient 0.7 is authored dry-tire grip, not native recovery.
Wind remains active in flight; grip fades with wheel normal load at liftoff.
Brakes hold against wind at rest without reversing the velocity at a stop.

Verification commands for this follow-up:

```sh
bun run check
bun run harness
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
bun tools/flight/retail-combat-regression.ts /home/john/.config/USNF-ATF/data
```

Final source check: 383 pass, 3 existing imported-mount skips, 0 fail;
TypeScript/lint/format pass. New synthetic regressions cover fractional damaged
native bounds in both PT backends, 60 seconds of gusting parked crosswind with
brakes on/off, powered rolling and stopping without reversal.
Local imported F14/A4/X31 checks over 60 seconds at 15 m/s measure zero crosswind
drift with brakes on or off and zero head/tailwind drift with brakes. Unbraked F14
wheels still roll longitudinally (384.54 m in the head/tailwind fixtures); use B
to park. This fix prevents sideways tire slip, not all physically possible
unbraked rolling. Other two aircraft remain still in these fixtures.

The initial extended imported-aircraft damage matrix exposed a separate error
with A4's opt-in recovered-envelope mode at 3000 m: `Imported flight envelope
cannot be fitted at this altitude`. Shortening the run did not resolve it.
That mode is not the user's default PT model; this follow-up does not fix or
claim acceptance for it. The final imported damage matrix checks the default
model on all three types and additionally the opt-in F14, one second each.
The real desktop regression uses installed F14 versus installed A4 and requires
simulation to advance five seconds beyond damage plus responsive Escape.
Final fresh-bundle run passes those assertions with no captured renderer errors;
report and screenshot are in `extracted/retail-combat-regression/`. An earlier
attempt passed continued combat but its pause assertion timed out because the
test synthesized Escape's `code` without its `key`; correcting the test event
made pause pass. All 16 flight-harness cases also pass. The preserved assisted
source diff and `git diff --check` remain clean. No commit/push performed.

## Scope and provenance

Linux/Omarchy, Linux 7.1.9-arch1-2, Bun 1.4.2, Python 3.14.7.
Source: uncommitted working tree based on `f2d4c44a59d74b6d6b139b44261a9fd6b1a09c10`.
This is the user-prioritized guns-only slice, not completion of phase 6 or
cross-platform acceptance. Native AI, radar/RWR, missiles, subsystem damage and
campaigns are not implemented here. No new dependency or retail asset is committed.

## Implementation and evidence

The 120 Hz combat world owns acquisition, original pursuit, gun emission, swept
moving-aircraft collision, terrain interception, damage, destruction, counters and
outcome. Imported HP/JT damage are used where present; defaults are labelled.
Damage reduces authority and increases drag without editing the preserved
`assisted-flight.ts`. Effects, collision hulls and damage-class selection remain
authored approximations. Opponents are kinematic, not the retail AI/flight host.

Palette index 255 now cuts out exterior 4c/6c cockpit-frame/pilot polygons; other
white palette indices stay opaque. Alpha testing preserves depth writes. This
does not establish native canopy glass translucency. The existing F1 cockpit
PNG masks were retained. A4 root-wall faces stay fixed; F14 trailing-edge cuts
follow wing taper; X31 elevons extend to the inboard trailing edge. Hinges/cuts
are geometry fits, not recovered native animation. Other texture/SH dispatch
limitations remain; visual recognition does not establish retail parity.

All three aircraft were exported and installed using:

```sh
bun tools/flight/port-aircraft.ts --aircraft f14 --install /home/john/.config/USNF-ATF/data
bun tools/flight/port-aircraft.ts --aircraft a4e --install /home/john/.config/USNF-ATF/data
bun tools/flight/port-aircraft.ts --aircraft x31 --install /home/john/.config/USNF-ATF/data
```

Prior aircraft/cockpit/audio directories are recoverable from the ignored
`extracted/aircraft-before-combat-VMgiRT/` backup. Latest bundles are under
`extracted/aircraft-ports/{f14,a4e,x31}/2026-09-10T19-07-*`.

## Reproducible checks

```sh
bun run check
bun run harness
PYTHONPATH=tools/retail python3 -m unittest discover -s tools/retail/tests -p test_sh_static.py
PYTHONPATH=tools/retail python3 -m unittest discover -s tools/retail/tests -p test_gun.py
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
bun tools/flight/visual-combat-smoke.ts
bun tools/flight/combat-smoke.ts
git diff --check
git diff -- engine/src/sim/flight/assisted-flight.ts
```

- Final `bun run check`: TypeScript, lint and formatting pass; 380 tests pass,
  3 existing imported-mount fixture tests skip (F14/A4E/X31), 0 fail.
- Flight harness: all 16 pass.
- SH exporter tests: 18 pass, including local geometry/UV conservation and new
  palette-index cutout, fixed-root and inboard-elevon regressions.
- Gun exporter: 1 test passes across all three local aircraft, checking damage.
- Combat unit tests: 8 pass, including first-hit ordering, swept hull endpoints,
  same-step terrain destruction attribution, damage effects and identical
  30/60/144 Hz render schedules around the fixed simulation clock.
- Fresh unpackaged Linux Electron visual smoke: all three aircraft pass;
  cockpit and neutral/deployed top/side/oblique evidence is in
  `extracted/combat-visual/{f14,a4e,x31}/`. The preview uses local exported
  geometry/cockpits/gun/loadout with assisted flight, not native flight parity.
- Fresh unpackaged Linux Electron combat smoke: acquisition, enemy return fire,
  actual round hits, player destruction, pause/resume, reset and a second
  engagement followed by debrief pass, with no captured renderer errors.
  `extracted/combat-smoke/report.json` records the first defeat at 14.94 simulated
  seconds, ten damaging hits, reset to healthy/zero counters/full ammunition,
  and another defeat at 14.93 seconds. This desktop fixture uses original
  fallback aircraft/gun data. Player victory is covered by combat unit tests.
- Preserved assisted source diff is empty. No retail output is staged.

Earlier failed attempts are not acceptance: the first combat smoke timed out
because pursuit speed/aim never yielded hits; speed matching and iterative lead
were corrected. Initial visual polling incorrectly treated false as readiness;
the readiness predicate was fixed. The standalone Python gun test initially
lacked PYTHONPATH; the explicit command above passes. A new renderer test needed
a typed/non-null texture-data access and type-only import before check acceptance. The earlier
full Python sitrep suite had an unrelated local ATF_10.LIB entry-84 offset error
(and one skip); it is not claimed green by these targeted runs.

Next: user flight/visual review of this slice, then separately scope the native
AI host and improved sensor/weapon import. Further flap refinement should use
local native evidence rather than treating these fitted hinges as recovered data.
