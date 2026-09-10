# Development handoff — 2026-09-10

## Latest: remaining audio gaps follow-up

Checkpoint **`6d941027333d43ee73f6854c90d1a2da89a09f42`** is committed/pushed on
`main`; its415 Bun/50 Python/16 harness and three live results are preserved in
[audio gap baseline](baselines/audio-gaps.md). Earlier “nothing committed/pushed”
statements below are historical. No manual compaction API was available; this
checkpoint and explicit four-gap scope are preserved here.

Added strict media/replacement audit; recovered48 seconds of intact S35_S packets
as separate **partial**, hashed output. All seven ATF movies remain incomplete or
absent. RPN0 bend range, sustain/releases, bounded finite loops and pressure
preservation improved. Offline MIDI/user-bank FluidSynth audition reports missing
dependencies without native-instrument claims. Capability diagnostics distinguish
missing imports, absent gameplay and unmapped triggers; no fake hooks added.

Follow-up:419 Bun pass/3 existing skips,62 targeted Python pass,16 harness cases,
fresh build and four serial live checks pass. Exact commands, corrections and
remaining MIDI/media/instrument/gameplay scope: [audio gap baseline](baselines/audio-gaps.md).
Next external inputs: complete owned ATF_10.LIB and a selected compatible instrument
source. Unsupported MIDI controls/host branches and radar/wingman/subsystem/
ejection/carrier/movie systems remain open. Follow-up commit/push result is reported
after Git confirms it; all retail/generated outputs remain ignored.

## Commit checkpoint: combat, aircraft fixes, missions and audio

The user authorized committing and pushing the accumulated work on `main`.
Pre-commit verification against the current tree based on `f2d4c44`:415 Bun tests
pass/3 existing imported-mount skips;50 targeted Python tests pass; all16 flight
harness cases pass. Fresh renderer `index-3aYg_lZp.js` passes the live audio-cue,
music and destruction/menu/combat/ground-crash scripts. No unrelated changes or
retail asset outputs are included; preserved assisted flight remains unchanged.
Earlier “no commit/push requested” statements below describe their original passes.
The commit/push result is reported separately after Git confirms it.

## Latest: autonomous audio continuation

Installed retail gear/flap/hook actuator, airborne stall, player-hit/fuel-empty
speech, touchdown, wind/tire loops and land/water bullet-impact audio. Actual
simulation events drive cues; timing/mixing are explicitly authored. Radar,
missile, wingman, ejection and subsystem-specific clips remain unbound rather than
playing unsupported chatter. See [mapping/evidence](formats/audio.md).

Recovered 49 CB8 soundtracks from freshly read available media: USNF22, ATF27.
Two complete movies are silent. All355 USNF VDO segments map to105 already-recovered
external speech assets. Seven ATF CB8 files remain unavailable in truncated
ATF_10.LIB; older extracted copies were not substituted. Original/sample hashes,
source ranges, raw PCM and WAV previews stay in ignored audio-library outputs.

Music now executes recovered MUS sequence choices/jumps/stops using a41-track
library and applies MIDI volume/expression/pan/bend events. Native ChooseScore
host priorities are documented, but the five-situation gameplay adapter/RNG and
oscillator timbres remain authored. No game-owned instrument bank established;
better timbres need an explicitly selected compatible synth/bank. ATF native score
opcode parity and two missing track references remain separate open work.

Current source checks:415 Bun pass/3 existing imported-mount skips; Python audio9,
music14, video3, containers5 pass. Fresh Linux live cue/environment/fuel speech and
music-output checks pass; see [phase6](baselines/phase-6.md) for combat follow-up and
exact scope. Assisted flight unchanged; nothing committed/pushed or retail-bundled.
Next reproducible work: obtain complete ATF_10.LIB for the seven missing videos;
choose a legally supplied MIDI synth/bank; trace remaining native host state enums
before porting carrier/ejection/sensor music triggers. No new authority presumed.

## Latest: retail audio recovery and engine music

Recovered all identified standalone audio from both available discs into ignored
`extracted/audio-library/{usnf97,atf-gold}/`: original bytes, SHA-256/provenance
catalogs and WAV previews. USNF: 809 waveform entries, 104 XMI entries (52 unique
files), nine music selector plugins; ATF: 1,037 waveforms, 102 XMI, nine selectors.
Ancillary DirectX SBK banks are preserved separately by catalog provenance, not
claimed to be the game's instrument bank. ATF_10.LIB is truncated; bounded salvage
recovers all 56 intact audio entries, but seven video entries are unavailable.
Video-embedded audio remains undecoded. See [audio recovery](formats/audio.md).

Installed `audio/combat.json` now replaces synthetic hit/air-explosion/crash/water
effects with retail PCM. Native PT/JT/effect-table associations confirm air
destruction and bullet-hit groups; water-crash assignment/mixing remain authored.
Native raw rates recovered: 5512/8010/11025 Hz (.5K/.8K/.11K); RIFF headers override
extensions in library conversion. All unused speech/environmental clips are
recovered, not yet connected to every gameplay event.

`FlightMusic` provides gesture-unlocked situation music, N toggle, volume, M mute,
pause/resume/reset and bounded synthesis. XMI notes are original; instrument
rendering/controllers remain approximate. Nine MUS scripts are now decoded into
prefixes, chances, choices, jumps and stops. Runtime currently uses representatives
from their groups, not the full native dispatcher. Earlier AIR34 victory/AIR35
defeat assignments were authored and are superseded. Windows MIDI Mapper output,
not a confirmed game-owned sample bank, supplied the original instrument sound.
See [music findings](formats/music.md). Fresh Linux destruction/music checks pass.

## Latest: destruction and configurable quick missions

Added per-aircraft damage darkening/smoke/fire, six authored geometric fracture
zones preserving imported triangles/UVs, deterministic tumbling debris (20s bound),
layered explosions and water/ground cues. Retail sound now supersedes the initial synth pass.
Gun kills and ground crashes switch the player to chase view. Effects/audio clear
on reset and freeze/stop on pause. Native subsystem damage and breakup are not recovered.

Quick missions default airborne and expose start height, runway start, enemy range,
orientation, altitude offset and departure grace (default30s continuously above
100m AGL). Enemies are staged, then placed relative to the player at release; set
grace0 for immediate combat. Enemy altitude is raised to terrain+200m where needed.
Terrain tools start collapsed. Bare legacy practice starts remain unchanged.

Real Electron tests passed imported F14/A4 gun destruction and an actual gear-up
ground impact, including fragment geometry, played sounds, chase view, pause and
reset. Music and audio-recovery follow-ups are recorded above.

## Follow-up: reported combat freeze and ground-wind slip

An imported F14 taking damage reproduced `Native signed 16-bit integer required`:
the new damage adapter supplied a fractional forward-speed bound to native thrust.
Integer truncation fixes that boundary without weakening native helper validation.
The earlier fallback-only desktop combat test could not exercise this path.

Ground tire support now resists this tick's wind force even at zero velocity and
has separate lateral grip. All three local aircraft hold a 15 m/s crosswind without
brakes and hold head/tailwinds with brakes. B applies wheel brakes; unbraked wheels
can still roll lengthwise. The preserved assisted source is unchanged. Detailed
checks and the separate experimental A4 envelope limitation are in phase 6 evidence.

## Latest: guns-only combat and aircraft rendering corrections

User requested damage models, cockpit transparency and flap placement fixes on all
three aircraft, followed by a full guns-only combat state. Implemented in the working
tree based on `f2d4c44`; no commit/push is part of this request.

`sim/combat/world.ts` owns player/opponent poses, teams, guns, health, visual contacts,
targets, events and outcome inside the existing 120 Hz clock. Original bounded pursuit
replaces the straight-course mock. Retail AI scripts remain unbound. Player rounds
and opponent rounds now hit, damage and destroy; imported loadout HP and JT gun damage
are consumed, with labelled original defaults for absent/legacy data. Damage affects
authority/drag; opponents also lose speed. Sparks, smoke and destruction flashes are
authored visuals. C cycles targets; Shift+Tab arms; Tab fires; Escape pauses, and the
new Debrief button reports hits, kills, damage and outcome. Reset/teleport rebuild
combat state, including opponents, while preserving the established flight controls.

Exterior 4c/6c cockpit/frame/pilot textures now preserve palette-index-255 cutouts
using alpha testing. This is not whole-canopy translucency. The F1 cockpit PNG masks
were already present and remain intact. A4 wing-root wall contamination is excluded;
F14 flap cuts follow the tapered aft quarter to the tip break; X31 elevons include
the inboard trailing edge. These are authored geometry fits, not native animation.
All three aircraft have been re-ported into local app data; previous installed
aircraft/audio/cockpit data is backed up in `extracted/aircraft-before-combat-VMgiRT/`.

Verification, reproducible commands, failures and remaining limitations are in
[phase 6 evidence](baselines/phase-6.md). The historical snapshots below saying
combat is unwired are superseded. Next: review this first playable guns-only slice,
then bind the retail AI host and extend sensor/weapon import as separately scoped work.

## Historical commit handoff: Omarchy menu revision

The user approved committing and pushing this menu pass. Current development is
on Linux/Omarchy, not the historical Mac environment below. Changes include green
menu buttons, top-bar Exit, optional title music, original-art quick mission and
loadout screens, retained-flight pause/resume, and the larger beveled page rocker
centered below its counter. Retail-derived assets/screenshots remain ignored;
only code, tests and documentation belong in this commit.

Final source checks rerun after the rocker polish: `bun run check` — 371 pass,
3 existing asset-dependent skips, 0 fail; Python menu export tests — 4 pass,
0 skips. Formatting and `git diff --check` pass. Earlier real Electron pause
smoke and visual evidence are detailed in the linked baselines below; the final
CSS changes were checked in the running development app, not a new packaged build.
Next: continue user visual review and recover remaining native widget/font details.

## Latest: mission screens and retained-flight pause

Latest visual adjustment: page labels/counter are about 20% larger and the switch
about one-third larger, with beveled highlights, a recessed counter and stronger
cast/pressed shadows. It remains below the counter and inside the panel.

Placement correction: the page rocker now sits centered below its counter, using
a two-row shared-control grid. The briefing control is inset from the panel edge
to prevent clipping. Visually verified in the running Linux app.

Reference follow-up: reusable `MenuPageRocker` in `MenuControls.tsx` now draws
the supplied OG page control: PAGE, black “1 of 2” readout, blue PREV/NEXT labels,
and a pale vertical two-way switch. Endpoint buttons disable; no wraparound.
This is CSS recreation, not imported native widget artwork.

Quick mission now uses QUIKMISS art with friendly/hostile columns; Arm plane goes
directly to loadout. Loadout places store pictures and station controls in ORD_KITT's
wells. Escape opens BRIEFSC3 over the retained, frozen viewer; Resume or Escape
continues it, while Main menu disposes it. Per user correction, briefing buttons
are on the left of the grey panel, with a working two-page rocker to their right.
The pages contain mission orders and flight status. Menu components remain effect-free.

Current verification: `bun run check` 371 pass / 3 existing skips / 0 fail;
Python menu export tests 4 pass. Fresh unpackaged Linux Electron pause smoke passed
state/input/audio freeze, both pages, same-canvas resume without catch-up, and quit.
See [mission menu evidence](baselines/mission-menu-revision.md). Exact retail fonts,
native rocker chrome and full original functionality remain open. No combat added.

## Correction: Omarchy menu pass, later on 2026-09-10

Exit is now at the right end of the grey top bar and quits the desktop application
through the platform/preload boundary. Real Electron quit and final placement
were checked; the full check remains 369 pass / 3 existing skips.

**Latest visual follow-up:** the user requested green buttons with white text.
Buttons now use authored green beveled CSS chrome instead of the beige-edged
ACTION sprites. Original background artwork remains. Visually checked in Electron;
`extracted/menu-green.png` records it. This supersedes the sprite-chrome description below.

The Mac snapshot below predates the user's rejection of the menu presentation.
Do not treat its navigation smoke passes as visual or audio acceptance. Current
work is on the Omarchy Linux box, with local changes based on `fc7f315`.
The menu wrapper and button shared `.menu-action`, applying padding and sprites
twice. Labels overflowed the screen, enabled text lacked contrast, added controls
were squeezed below the retail panel, and music had never been implemented.

The current pass fixes those defects, centers aircraft/debrief panels, restores
headings on secondary screens, and improves loadout spacing. The locally imported
`^MF.11K` title theme now loops in menus, shares mute, and stops when leaving menus.
This is the original **title** theme reused for the menu; the original activity
menu's music selection is not established. Retail font rendering remains open.

Verification: `bun run check` — 369 pass, 3 asset-dependent skips; Python menu
export tests — 4 pass. Linux Electron development screenshots and audio graph
measurements are in [the menu revision baseline](baselines/menu-revision.md).
The app is running from source; packaged Mac artifacts are not this revision.
Historical platform deferrals and acceptance statements below remain historical.

## Historical Mac handoff (superseded by the Linux revision above)

At the time of this earlier handoff, everything after `1057085` was committed locally on `main` and **unpushed**,
starting at `7b7866f`. The packaged Mac app at `build/mac/mac-arm64/USNF-ATF.app`
was built from `51298fb`; every commit after it is documentation only, so the
package was then current product code; it does not contain this Linux menu revision.
Apple Silicon, Bun 1.4.2, Node 22.14, Electron 44.2.0, Python 3.14.6.
Linux is deferred by user decision; Windows launch is a phase 9 item.

This document is the current state and the decisions worth preserving. The
history, with dates and measurements, is in [progress.md](progress.md); the
numbers are in [baselines/](baselines/). Where something is recorded elsewhere,
this file points at it rather than copying it.

## Where the project is

The app opens on a **main menu**. From it a player reaches a mocked quick fight,
a free flight, or the terrain explorer, choosing an aircraft and its loadout on
the way and returning to a debrief, with no page reload in that path. Underneath,
the terrain explorer, the 120 Hz flight model with three importable aircraft, the
retail cockpit, guns, MFD map and navigation are all as they were: the shell work
did not touch the simulation.

Combat is still not built. There are no targets, no acquisition, no damage from
rounds, no missions and no campaign.

| Area | State |
|---|---|
| Terrain pipeline and renderer | Implemented and measured on Mac; see baselines 2 and 3 |
| Flight model | Retail PT-envelope default, assisted preserved, recovered envelope opt-in |
| Game shell | All eight steps of [game-shell-plan.md](game-shell-plan.md) landed |
| Retail import | Aircraft, cockpit, gun, loadout and menu porters; in-app importer still planned |
| Combat | Parsed and unit-tested in `engine/src/sim/ai/` and `sim/combat/`, wired to nothing |

`bun run check` is 370 tests. `python3 -m unittest discover -s tools/retail/tests`
is 101, one skip. Both clean at the tip.

## Preserve these decisions

- **The retail PT-envelope fit is the default** for every imported aircraft
  (changed in `c6069fe`, 2026-09-09). Assisted remains selectable and is the
  fallback when no profile is installed. Assisted's physics is frozen and
  byte-for-byte unchanged; its handling mass stays 9,000 kg while fuel burns.
  Empty fuel cuts thrust. Two smoke scripts still assert the older default and
  fail because of it — see "Known failures" below.
- **PT-envelope fit and recovered-native-envelope are separate opt-in models**,
  not a full native integrator. Switching restarts the preset and carries fuel;
  experimental mass follows fuel and payload.
- **Retail bytes never enter the repo, `engine/public/`, or a package.**
  Conversions live in ignored `extracted/` and in user app data. The manual in
  `Docs/reference` is the user's explicit exception.
- **Keep the smaller retro HUD**, wider pitch spacing, F2/F3 cameras, live fuel
  and the minimizable helper panel. Do not disguise a force problem by rotating
  the exterior model.
- **The simulation stays at 120 Hz and independent of React timing**, and the
  terrain renderer's floating origin is preserved by anything that draws in the
  world. Both are now load-bearing for the quick fight's entities as well.
- **What is mocked stays labelled in the UI**, not only in these notes.

## Game shell

- `engine/src/sim/mission/params.ts` is the single description of a session.
  The URL is one *serializer* of it, not where session state lives. **Every legacy
  query key must keep parsing with the same clamping**, because thirteen Electron
  scripts deep-link with them; add new keys alongside, never rename one.
- **A query — any query — wins over the menu.** The menu appears only on a launch
  with an empty query string. This is why `teleport-smoke`'s explorer case, which
  passes no `mode` at all, still lands in the explorer.
- `engine/src/ui/Shell.tsx` owns `{screen, mission}` and nothing else. Menu
  components under `engine/src/ui/menu/` are **prop-driven and effect-free**,
  because `renderToStaticMarkup` is the only React test tool in the repo. Scaling
  is CSS alone — an `aspect-ratio` frame and container query units — never a
  measured window.
- Menu geometry is the recovered `CHOOSEAC.DLG` layout, not values chosen by eye.
  `RETAIL_MAIN_MENU_RECT` in `ui/menu/layout.ts` keeps the original's own rect.
- The retail artwork and sounds are an **optional** bundle ported from the user's
  own disc ([menu-porting.md](menu-porting.md)). The app must run identically
  without one; `menu-smoke` asserts both cases.
- **Menu audio exists only while a menu is on screen.** A second `AudioContext`
  sitting behind a flight took `retail-smoke`'s audio tap once already; the tap
  attaches to the first node that connects to a context destination.
- Three things are mocked and say so on screen: quick-fight opponents fly fixed
  profiles with no AI, acquisition or damage; stores are weighed but do not affect
  flight; a station offers only its own default until the hardpoint `flags`
  compatibility mask is decoded.

## Flight model findings that still matter

- **Flap camber correction (`50d2ec4`).** The experimental polar had used the
  entire native flap maximum-lift increase as zero-AoA camber, and the 1G trim
  controller then countered it with large negative AoA. It now separates modest
  camber (an authored reading of PT 51/256) from extra maximum lift, which grows
  on the positive-alpha branch. This is an improved authored hybrid, **not** a
  recovered pitching-moment law. Negative pitch with flaps is not by itself wrong.
- **Native takeoff trim is not a nose-up schedule.** `FMUpdateGearPitch` fades a
  gear angle over roughly 75–100% of takeoff speed, and the F-14's `gearPitch` is
  0; consumers add the offset to a copied orientation and no elevator force is
  established. `groundPitch` comes from terrain slope. No guessed nose-up bias was
  integrated. Formulas, addresses and caveats:
  [formats/native-gear-pitch.md](formats/native-gear-pitch.md).
- Experimental first-airborne at the raised practice strip end happens with lift
  below weight — rolling off the deck, not aerodynamic rotation. Do not read it as
  a rotation speed.

## Known failures and open items

Three Electron smoke scripts fail, and all three were reproduced identically on a
build of `092d0d6`, the parent of the shell series. They are pre-existing defects,
not regressions, and the scripts were deliberately left unedited:

1. `ground-smoke.ts:41` — "Existing assisted model is not the default".
2. `aircraft-smoke.ts:24` — "F-14 profile leaked", the same stale assumption.
   Both date from when assisted was the default, before `c6069fe`. **Deciding
   which behaviour is wanted is an open call**: either the scripts move to the
   current default, or the default moves back.
3. `smoke.ts --scenario approach` — lands (`landings: 1`, grounded) but brakes
   only to 7.07 m/s inside its 60 s budget, against a 5 m/s threshold.

`envelope-smoke.ts` could not be completed on this machine on 2026-09-10. Its
first case verifies (F-14 retail envelope, 4.63 peak g), then its second Electron
session fails inside Electron's own sandbox bootstrap — "Cannot destructure
property 'preloadScripts' of 'binding.startupData'" — before any of our renderer
code runs. The same failure occurs on the `092d0d6` build with no other Electron
process running, so it is an environment problem, not evidence about the code.
The same bootstrap error hit `flaps-neutral`, `aero-smoke` and `surface-smoke`
once each and all three passed on retry. **Run GPU/Electron sessions serially.**

Also open, and none of it claimed as done:

- Physical gamepad, human route flight and USNF feel comparison; phase 4 is not
  fully accepted.
- Linux and Windows launch verification.
- The theater renders mirrored east to west against its own manifest projection
  (2026-09-09 compass entry).
- Hardpoint `flags` bitmask and `maxWeight` units, which block real per-station
  store choice ([formats/pt.md](formats/pt.md)).
- `.MNU` submenu and flag bytes; `.XMI` music; retail menu fonts
  ([formats/mnu.md](formats/mnu.md), [menu-porting.md](menu-porting.md)).

## Reproduction

Build first and record the commit that was built; the packaged binary is what the
Electron tools drive.

```sh
bun run build
bun run check
python3 -m unittest discover -s tools/retail/tests
bun run harness
```

```sh
B=build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF
bun tools/flight/menu-smoke.ts --binary $B --build-commit 51298fb --out extracted/menu-smoke
bun tools/flight/menu-smoke.ts --binary $B --build-commit 51298fb --menu extracted/menu-ports/usnf97/<run> --out extracted/menu-smoke-retail
bun tools/flight/loadout-smoke.ts --binary $B --build-commit 51298fb --out extracted/loadout-smoke
bun tools/flight/quickfight-smoke.ts --binary $B --build-commit 51298fb --out extracted/quickfight-smoke
bun tools/flight/smoke.ts --binary $B --build-commit 51298fb --scenario ground --out extracted/flight-ground
bun tools/flight/navigation-smoke.ts --binary $B --build-commit 51298fb --out extracted/flight-navigation
bun tools/flight/teleport-smoke.ts --binary $B --build-commit 51298fb --out extracted/waypoint-teleport
```

The unpackaged scripts — `aircraft-smoke`, `envelope-smoke`, `surface-smoke`,
`cockpit-gun-smoke` — need a fresh unpackaged build first:

```sh
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
```

Porting from local media:

```sh
bun tools/flight/port-aircraft.ts --aircraft f14
bun tools/menu/port-menu.ts --install "$HOME/Library/Application Support/USNF-ATF/data"
PYTHONPATH=tools/retail python3 -m retail.mnu extracted/usnf97/USNF_2.LIB/CHOOSEAC.DLG
```

Full acceptance detail and every measured number are in
[baselines/game-shell.md](baselines/game-shell.md) and
[baselines/phase-4.md](baselines/phase-4.md). Automated windows carry an orange
label; screenshots and reports stay in ignored `extracted/`.

## Next steps

1. **Decide the default-flight-model question** and settle `ground-smoke` and
   `aircraft-smoke` one way or the other. It is two stale assertions blocking a
   clean regression run.
2. **Bind the AI host to aircraft state.** `sim/ai/` is parsed and verified
   against all 17 retail programs; `stepEntity` in `sim/world/entities.ts` is
   deliberately the single function it has to replace.
3. **Wire acquisition and damage**: `FlightLayer.setGunTarget` is still uncalled,
   `sim/combat/sensors.ts` is driven by nothing, and `hits.ts`/`damage.ts` are not
   connected to the gun. `ui/Mfd.tsx` was extracted to host a target page.
4. **Apply stores to flight.** The `.PT` `loadedDrag` family is exported and shown;
   nothing consumes it.
5. **Native longitudinal control**, if that thread is picked up again: trace
   `_FMMove` pitch control before `_CheckLanding`, the writers to pitch
   `0x4d5277` and pitch-rate `0x4d526f`, and the PT `lowAOASpeed`/`lowAOAPitch`/
   `gpullAOA` consumers. Identified as leads, not decoded. Keep oracles and new
   models separate from preserved assisted.
