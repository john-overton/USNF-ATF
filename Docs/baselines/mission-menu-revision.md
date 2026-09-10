# Mission menus — 2026-09-10, Omarchy

Commit preparation: reran `bun run check` after all CSS refinements — 371 pass,
3 existing fixture skips, 0 fail, with typecheck/lint/format passing. Repeated
the Python menu command below — 4 pass, 0 skips. `git diff --check` passes.
These final source checks supersede the “not rerun” notes on incremental CSS
edits below; the earlier production pause smoke was not repeated for CSS polish.

Latest size/depth polish (same source base): labels/counter approximately 20%
larger, rocker approximately one-third larger, gradient bevels and recessed/cast
shadows. `extracted/rocker-raised.png` inspected in live Linux Electron; control
remains below the counter with panel clearance. Formatting/diff checks pass;
no full regression rerun for this CSS-only follow-up.

Latest CSS-only correction on the same working-tree base: the rocker now occupies
a second row centered below the black counter, with more panel-edge clearance.
Live Electron screenshot `extracted/rocker-below-counter.png` inspected; DOM bounds
confirm switch top is below counter bottom and horizontal centers agree within
one pixel. Prettier and diff whitespace checks pass. Full suite not rerun for this
placement-only correction. This supersedes the side-by-side placement below.

Later user-reference correction: the briefing now uses shared `MenuPageRocker`,
with the black counter and vertical pale PREV/NEXT switch from the supplied image.
Endpoint navigation is bounded instead of wrapping. Development screenshot:
`extracted/page-rocker-reference.png`. This supersedes the green horizontal rocker
in the earlier production pause-smoke images. The new control was checked in the
running development app; the simulation smoke below predates only this UI change.

Source: uncommitted working tree based on `fc7f315`. Linux 7.1.9-arch1-2,
Bun 1.4.2, Node 26.8.1, Electron 44.2.0. This is a fresh unpackaged Linux build,
not a packaged release or full flight-model acceptance.

Implemented: original QUIKMISS and BRIEFSC3 backgrounds, authored quick-mission
controls, ORD_KITT-aligned stores/stations/weight/fuel, optional ordnance pictures,
and an actual retained-flight pause. Briefing actions are left of the page rocker
within the same grey panel, per user direction. Page 1 holds orders; page 2 status.

Verification:

```sh
bun run check
PYTHONPATH=tools/retail python3 -m unittest discover -s tools/retail/tests -p test_menu.py
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
bun tools/flight/pause-smoke.ts --binary node_modules/.bun/electron@44.2.0+759ce506b1ed1a42/node_modules/electron/dist/electron --app shell --aircraft /home/john/.config/USNF-ATF/data/aircraft/f14.json --flight-profile /home/john/.config/USNF-ATF/data/aircraft/f14-flight.json --audio /home/john/.config/USNF-ATF/data/audio/f14.json --gun /home/john/.config/USNF-ATF/data/aircraft/f14-gun.json --menu extracted/menu-ports/usnf97/2026-09-10T18-03-42-243Z-751fe32c
git diff --check
```

Results: check 371 pass, 3 existing imported-mount fixture skips, 0 fail;
typecheck/lint/format pass. Four Python menu tests pass without skips.
Desktop smoke passed: aircraft/opponents/environment/fuel/ammo frozen for three
seconds, inputs blocked, audio contexts suspended, page rocker working, repeated
Escape ignored, Resume retains the canvas and advances without elapsed-time
catch-up, Escape also resumes, Main menu disposes the viewer.
The first smoke attempt timed out unlocking audio because the shared harness
blocks trusted keys by default. Enabling its interactive-test option fixed the
test; the subsequent run passed. No renderer errors in the passing report.

Evidence (ignored, retail-derived): `extracted/pause-smoke/report.json`,
`paused.png`, `paused-status.png` in that directory, plus
`extracted/quick-final.png` and `extracted/loadout-final.png`. Images were inspected.
The loadout fuel/store totals were subsequently moved up into the metal panel;
that CSS-only correction is not in the earlier loadout image or production bundle.

Limits: original bitmap fonts and native rocker styling are not recovered.
Quick fight remains a fixed-course mock; no AI or damage added. Loadout uses
station arrows, not original drag/drop, and stores still do not affect flight
performance. User visual review remains the next acceptance step.
