# Repository guidance

## Start here

- Read [README.md](README.md), the current snapshot in [Docs/progress.md](Docs/progress.md), and [Docs/build-plan.md](Docs/build-plan.md) before planning work.
- `Docs/build-plan.md` owns phase numbering, sequencing, decisions, and exit criteria. `Docs/usnf-atf-plan.md` is the original design brief; its older build order is superseded.
- This is an early fan remake: the runnable app has a main menu, guns-only quick fight, terrain explorer, practice flight, loadout screen and renderer probe. `sim/combat/world.ts` owns combat state; its pursuit/visual detection is authored, not the retail AI host. Python retail research is ahead of the TypeScript importer. Radar/RWR, missiles, native AI, subsystem damage and campaigns remain planned; see the current progress snapshot for acceptance status.

## Development machine and commands

Current development is Linux/Omarchy as of 2026-09-10. Guns-only combat and aircraft
visual checks run here; historical Mac/platform deferrals below do not override the
current user-requested Linux work or establish full cross-platform acceptance.

This checkout is on a macOS Apple Silicon dev box, using zsh. Homebrew is normally at `/opt/homebrew`. Use Bun for workspace scripts and the existing `bun.lock`; Node 22+ supports the build tooling. The retail Python toolkit requires 3.11+ and uses the standard library. The terrain pipeline uses pinned rasterio/numpy/scipy dependencies in `terrain-pipeline/requirements.txt`; Python 3.14 wheels are verified on this Mac. Use a project `.venv` when installing Python dependencies; do not change system Python.

From the repository root:

```sh
bun install
bun run dev:electron
bun run check
bun run harness
python3 -m unittest discover -s tools/retail/tests
PYTHONPATH=terrain-pipeline .venv/bin/python -m unittest discover -s terrain-pipeline/tests
```

- `bun run dev` starts the browser development target. Desktop Electron is the product target.
- `bun run build` packages only the host OS; on this Mac it builds arm64 and x64 DMG/ZIP artifacts in `build/mac/`. A built x64 artifact is not evidence of an x64 launch test.
- `bun run probe` prefers an existing packaged app. `--unpackaged` also reuses existing bundles. For evidence about current source, rebuild first. `bun run probe --fresh` is the convenient fresh-source check; the equivalent explicit commands are:

```sh
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
bun run probe --unpackaged
```

- `bun run check` covers TypeScript checks, lint, formatting, and Bun tests. It does **not** run Python tests, launch Electron, or package installers. Prettier excludes `Docs/` and `tools/`; inspect changed Markdown and Python separately.
- Retail integration tests skip unavailable media. Record skips explicitly; synthetic tests alone do not prove retail compatibility.
- Linux testing is explicitly deferred by the user as of 2026-09-08. Continue development and Mac acceptance without waiting for Linux; record it as deferred, never as tested. Windows launch verification is scheduled for phase 9.

## Code boundaries

- `engine/src/sim/mission/params.ts` is the single description of a session; the URL is one serializer of it, and every legacy query key must keep parsing so the Electron scripts keep deep-linking. `engine/src/ui/Shell.tsx` owns the screen and the mission; menu components under `engine/src/ui/menu/` must stay prop-driven and effect-free, because `renderToStaticMarkup` is the only React test tool here.
- `engine/`: simulation, rendering, React UI, data contracts, and platform adapters. Keep Electron and Node filesystem calls out of engine code; use `engine/src/platform/Platform.ts`.
- `shell/`: Electron main/preload, IPC, native filesystem/window/power access, development and packaging scripts. Preserve context isolation, sandboxing, and disabled renderer Node integration.
- `importer/`: TypeScript import contracts now; decoder port and first-run workflow in phase 5. Python tools in `tools/retail/` are the research reference.
- `terrain-pipeline/` owns source fetching/reprojection/chunks. Keep [Docs/terrain-contract.md](Docs/terrain-contract.md) synchronized with Python producers and engine validators. Never infer water from elevation alone; shared-border probes and dry-island tests are acceptance gates.
- `engine/src/sim/flight/` is pure flight physics; `engine/src/flight/` adapts input, rendering and contact data. The preserved assisted comparison model uses original placeholder flight tables. Optional `appData/aircraft/f14-flight.json` supplies PT mass/thrust/envelopes to the default retail-envelope backend and selectable recovered-envelope backend; recovered envelope helpers are only part of the native flight system. The optional F-14 static geometry/textures load only from appData/aircraft/f14.json; gear/hook geometry, surface hinges, force coefficients and animation timings are original approximations. Optional appData/audio/f14.json contains PT-selected retail engine samples; gains/rates/mixing remain partly inferred. The HUD is original SVG informed by local executable references and the manual; native HUD routines are not run. Contact sampling must remain independent of visual LOD and must never invent zero ground for missing data.
- Preserve `engine/src/sim/flight/assisted-flight.ts` as the unchanged comparison model (f70e10c). Per the user's 2026-09-09 decision, retail PT-envelope flight is now the default for every imported aircraft; assisted remains selectable and is the fallback without a profile. Recovered-native envelope routines remain opt-in; do not overwrite the preserved assisted feel. Native helper parity must be established against actual local x86 execution, and isolated routine parity is not complete game-flight parity. See `Docs/formats/native-flight-code.md` and `native-power.md`.
- Keep the simulation fixed at 120 Hz and independent of React/render timing. Preserve the terrain renderer’s floating origin when adding aircraft rendering.
- Maintain strict TypeScript and existing conventions. Prefer focused changes; do not add CI before phase 9 or new dependencies without a concrete need.

## Retail files

Keep discs and installs in `gameassets/`, and all extracted or converted retail output (including previews, OBJ, PNG, JSON, and debug dumps) in `extracted/`. Both are ignored. Never commit or package retail-derived bytes. Tests committed to the repo use synthetic fixtures or read locally supplied media at runtime. Format documentation may describe structures and aggregate measurements, not reproduce assets. The future in-app importer writes attributed outputs to user app data.

Do not put retail assets in `engine/public/`: Vite copies public files into production output. Ignore rules are not a retail-signature release scan; that scan is still planned for phase 5.

## Progress and handoff

For each meaningful port change:

1. Update the current phase snapshot in `Docs/progress.md` and prepend a dated log entry. Preserve earlier entries, labeling corrections rather than silently treating old measurements as current.
2. Record implementation evidence, exact verification commands/results (including failures and skips), remaining gaps, decisions, and the next reproducible step. Distinguish observed facts from hypotheses.
3. Put repeatable measurements in `Docs/baselines/phase-N.md` with date, machine, tool versions, source commit, and scope. Reference the source commit tested; a documentation-only follow-up can name its parent without claiming it was tested before it existed.
4. Update `Docs/formats/` when decoder understanding changes, including unknown fields and confidence. Parser success, valid export, visual recognition, and game parity are separate milestones.
5. Keep README claims aligned with the runnable code. Do not call a phase complete until its documented exit criteria are met on the required machines.

For reviews, log confirmed defects with source locations and a way to reproduce them; do not turn every hypothesis into a fix. Use subagents for independent, bounded reviews when appropriate, give each a clear scope, and coordinate edits to shared docs. Run checks relevant to the change, inspect `git diff --check` and staged files, and commit locally when authorized. Do not push or publish without authorization.
