# Wing surface placement — 2026-09-11

## Corrected acceptance: native flap geometry recovery

The earlier entry below is superseded. The user supplied a retail screenshot
showing the A-4's continuous inboard trailing edge. The prior explanation of a
stepped source wing was incorrect: our projection omitted neutral flap subcalls.
Conservation tests and successful screenshots of that incomplete projection
could not establish silhouette correctness.

Native ATF disassembly confirms opcode `0x12` is a signed end-relative subroutine
call (+4 base) that saves only PC. The projector now follows calls and preserves
shared vertex/texture writes; the graph walker also uses the corrected target.
Evidence/commands: `extracted/flap-recovery/native-call.txt`. No full native
renderer execution/parity is claimed.

The corrected projection adds 6 A4, 6 F31 and 8 F14 source faces without changing
any previously emitted face vertices. Four A4 and four F31 faces fill missing
inboard flap panels; eight F14 faces supply missing inner/outer flaps. Two other
A4/F31 faces restore a static hook/rudder respectively. Rigs now use the original
panels/UVs, not substitute fixed-wing strips. F14 has separate exact panel hinge
edges; X31 uses separate inner/outer hinges. Review caught a too-broad X31 inner
region including three aft fuselage faces; an aft wing bound and regression now
exclude them. A4/F14 moving flap source membership is asserted exactly.

Machine/base: same Linux/Python/Bun and source base as below, with this turn's
working-tree changes. Verification:

- `python3 -m unittest discover -s tools/retail/tests -p 'test_sh*.py'`: 23 passed,
  no skips. Covers return/relative target, persistent slots/textures, malformed
  and recursive calls, actual previously omitted face membership, correct
  trailing bounds, and per-face geometry/UV conservation. The initial run failed
  three old rig assertions, which expected the obsolete substitute groups;
  these were replaced by recovered-panel regression assertions.
- `bun run check`: 458 passed, 3 optional imported gun-mount tests skipped;
  typecheck, lint, formatting passed. `extracted/flap-recovery/check.log`.
- Rebuilt/validated all three complete port bundles using
  `bun tools/flight/port-aircraft.ts --aircraft <id>`; logs and model copies under
  `extracted/flap-recovery/`. X31 was regenerated after the fuselage exclusion.
- `bun tools/flight/flap-placement-smoke.ts /home/john/.config/USNF-ATF/data/aircraft extracted/flap-recovery/installed-views`:
  final installed models rendered in neutral/deployed top, side, front-oblique
  and rear-oblique views. A4 top-neutral now fills both rectangular gaps and
  rear-down shows full panels attached at the seam. F14/X31 recovered panels
  likewise occupy their trailing regions. Controls are assigned directly for
  repeatable inspection; this is not a key-input or native-actuator acceptance.
- `git diff --check`: passed.

Installed only the exterior JSONs by per-file atomic replacement. Backups:
`extracted/flap-recovery/before-installed/`; installed SHA256 values:
`extracted/flap-recovery/installed-hashes.json`. Runtime deflection/mixing remains
authored, and static native hook geometry does not establish working native
hook animation. Reload installed models in a fresh flight/app session.

## Superseded initial attempt — preserved for audit


Machine: Linux/Omarchy, Python 3.14.7, Bun 1.4.2. Source base:
`aa530d0c0cfada24d27594dbe345d2a2bcde5895` plus the working-tree flap changes;
the checkout already contained unrelated uncommitted work. Runtime renderer code
was unchanged; the inspection tool bundles current `RetailAircraft` and control
mixing into the existing development Electron host.

This corrects earlier acceptance of the broad trailing-wing cuts. Inspection of
local source faces confirms the A-4's inboard trailing edge is stepped forward
of its outboard aileron, the X-31 has explicit outboard tabs, and the F-14's
previous full-chord fraction pushed the root hinge forward. The revised A-4
flap has half its previous depth and a hinge on the upper trailing skin. F-14
uses a narrow parallel trailing strip. X-31 uses the outboard tabs and a hinge
following their spanwise height change. These remain authored geometry fits,
not recovered retail actuator definitions or real-aircraft engineering data.

Commands/results:

- `python3 -m unittest discover -s tools/retail/tests -p test_sh_static.py`:
  20 passed, no skips. Local tests conserve per-face geometry/UVs and check
  moving-region bounds; synthetic regressions reject forward A-4 and fixed
  inboard X-31 wing skin.
- `bun test engine/src/flight/control-surfaces.test.ts`: 3 passed.
- `bun run check`: typecheck/lint/format passed; 458 tests passed, 3 skipped
  (optional imported gun-mount cases), zero failures. Log:
  `extracted/flap-placement/check.log`.
- `bun tools/flight/port-aircraft.ts --aircraft <id>` for a4e/f14/x31:
  all three complete bundles validated; output under
  `extracted/aircraft-ports/<id>/2026-09-11T16-16-*`.
- `bun tools/flight/flap-placement-smoke.ts`: all three installed models
  rendered neutral/deployed top, side, front-oblique and rear-oblique views
  through production `RetailAircraft`, with no renderer errors. Captures under
  `extracted/flap-placement/after/<id>/`; pre-change captures/models retained
  under `before-views/` and `before/`. Reviewed top and oblique deployment
  captures: moving panels lie on trailing regions; X-31 fixed inboard skin
  remains intact. This tool assigns controls directly for reproducible views;
  it does not establish key-input, swept-wing-flight or native animation parity.
- `python3 -m unittest discover -s tools/retail/tests`: 150 run, 148 passed,
  1 skipped, 1 error in the unrelated full-media decompression audit:
  `ATF_10.LIB` has an invalid/truncated `S35_S.CB8` extent. This is the existing
  incomplete movie-media boundary, not a surface export failure. Log:
  `extracted/flap-placement/python-tests.log` (also emits file ResourceWarnings).
- `git diff --check`: passed.

Only the three exterior JSONs were atomically replaced in
`/home/john/.config/USNF-ATF/data/aircraft`. Installed hashes are recorded in
`extracted/flap-placement/installed-hashes.json`; old models are retained in
`extracted/flap-placement/before`. Flight/audio/loadout profiles were preserved.
Retail-derived output remains ignored and unbundled.

Repeat using the updated [porting guide](../aircraft-porting.md). Reload the
application or begin a new flight to read the installed geometry. Exact hinge
mechanics for thick/nonplanar skin and original game deflection schedules remain
outside this authored rig's acceptance.
