# Aircraft loadout switch — 2026-09-11

Linux/Omarchy, Bun 1.4.2, Electron 44.2.0; HEAD
`aa530d0c0cfada24d27594dbe345d2a2bcde5895` plus working changes.

Reproduction: launch menu with installed aircraft loadouts, select F-14, then
Select Plane → A-4E or X-31. `nextMission` previously changed aircraft without
clearing station selections. The shell only seeds defaults when stations are
empty, so Fly was blocked by the F-14's incompatible stores/counts. Applying
the installed F-14 defaults to A-4E reproduced unknown AIM54C/AIM120, sensor,
cannon and station errors; both target aircraft's own defaults validate cleanly.

The change clears station selections only when aircraft identity changes. It
preserves fuel and theater and leaves all genuine loadout validation intact.
The async default callback also checks aircraft identity before updating state.

```sh
bun run check
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
systemd-run --user --unit=usnf-aircraft-loadout-switch --same-dir /home/john/.bun/bin/bun tools/flight/aircraft-loadout-switch-smoke.ts
```

Checks: 452 passed, 3 existing local-import skips, 0 failed. Fresh build passed.
The desktop script starts at the real main menu and exercises F-14 → Select Plane
→ each target loadout → Fly over Salt Lake using installed aircraft assets.
Screenshots and diagnostics are in `extracted/aircraft-loadout-switch/`.
Live result: both A-4E and X-31 passed, service exit 0 at 10:08:48 local,
with enabled Fly buttons, correct aircraft diagnostics and no renderer errors.
Scope is menu-to-flight launch, not a new aircraft flight-envelope certification
or missile implementation.
