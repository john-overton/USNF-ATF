# Development handoff — 2026-09-10

Everything after `1057085` is committed locally on `main` and **unpushed**,
starting at `7b7866f`. The packaged Mac app at `build/mac/mac-arm64/USNF-ATF.app`
was built from `51298fb`; every commit after it is documentation only, so the
package is current product code. Apple Silicon, Bun 1.4.2, Node 22.14, Electron 44.2.0, Python 3.14.6.
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
