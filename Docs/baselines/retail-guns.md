# Retail-derived guns baseline — 2026-09-10

Linux x64, Bun 1.4.2, Python 3.14.7. Source main
`1805187300a067bfc2130e0a7c48f0c7034693d8` plus this gun follow-up.
Music deferred; unrelated `Docs/synths.md` preserved. User subsequently authorized
commit/push; confirmed Git results are reported after execution.

- `bun run check`: 429 pass, 3 existing imported-mount skips, zero failures;
  typecheck, ESLint and formatting pass. Optional extracted flight fixtures for
  F-14/A-4E/X-31 are absent; synthetic checks do not erase these skips.
- `PYTHONPATH=tools/retail:tools/retail/tests python3 -m unittest test_gun test_bullet test_sh_static test_containers`:
  30 pass, no skips, including corrected scale and fail-closed decoder tests.
- `bun run harness`: all 16 cases pass; flight regression, not native gun parity.
- Fresh desktop build via
  `bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'`:
  renderer `index-C6DORhLU.js`, stylesheet `index-aMWtEZMy.css`.
- `bun tools/flight/retail-guns-smoke.ts /home/john/.config/USNF-ATF/data`:
  desktop selector persistence, native firing/ammo/art, live switch without canvas
  replacement or combat reset, safety, pause/resume and reset all pass on the final
  fresh build. Explicit visible-pipper assertion passes. Inspected menu, cockpit
  pipper and external bullet screenshots; geometry is visible without pixel inflation.
- `bun tools/flight/destruction-smoke.ts /home/john/.config/USNF-ATF/data`:
  main-menu combat and ground-crash checks pass again on the final fresh build:
  breakup, sound, camera, pause and reset. Both desktop scripts report no renderer
  errors. Runs were serial, not concurrent GPU acceptance.
- Final `git diff --check` passes; assisted-flight diff is empty. Generated reports
  and gun exports are confirmed ignored. The unrelated, untouched `Docs/synths.md`
  is excluded from the follow-up commit.

Earlier verification caught and fixed a required mission fixture field, a type-only
import, and a smoke-script quoting error at its final selector check. Desktop smoke
then passed; final rebuild additionally checks visible pipper and corrected art scale.
Captures/reports stay ignored in `extracted/retail-guns-live/`.

Locally installed F-14/A-4E/X-31 gun JSON received only new native/art metadata;
original fields were preserved and backups remain under ignored
`extracted/retail-bullets-followup/`. No assisted-flight comparison edits or retail
bytes in tracked source. No Windows/macOS launch or native x86 execution comparison
is claimed. See [evidence and remaining boundaries](../formats/native-guns.md).
