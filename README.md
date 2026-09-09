# USNF-ATF

A non-commercial fan remake of Jane's US Navy Fighters '97 (and, later, ATF Gold), built with TypeScript, Three.js, React, and Electron. The goal is retail aircraft and missions over real-elevation terrain, using assets imported from your own copy.

**Current status (2026-09-08):** the desktop app is a terrain explorer with a free camera, streamed elevation chunks, floating origin, water, and performance diagnostics. The Python pipeline fetches Copernicus DEM and water masks and generates the Ukraine development theater. Phase 1 code fixes and macOS packaging are verified; Linux acceptance is deferred for now. Flight gameplay and the in-app retail importer are not implemented. Python retail research tools remain available; SH model export is partial.

Start with [progress and review findings](Docs/progress.md), the [build plan](Docs/build-plan.md) (phase order and exit criteria), and the [design brief](Docs/usnf-atf-plan.md). Contributor and agent instructions are in [AGENTS.md](AGENTS.md).

> Inspired by Jane's US Navy Fighters '97, ATF, and Fighters Anthology by Jane's Combat Simulations and Electronic Arts. This is a non-profit fan project, not affiliated with or endorsed by Electronic Arts Inc. No retail game assets are distributed. A legally owned copy of the original is required. EA has not endorsed and does not support this product. If you are a rights holder and would like anything changed or removed, open an issue and it will be handled immediately.
>
> Terrain derived from Copernicus DEM GLO-30 (ESA) and ESA WorldCover. Engine built on Three.js, React, Vite, and Bun. Project approach informed by the Chrono Divide lineage RA2 community ports.

## macOS development setup

This development box is macOS on Apple Silicon (Apple M3); Linux GPU verification is deferred for now. Run commands from the repo root.

- Bun 1.4 or newer (runs scripts, tests, and the workspace install).
- Node 22 or newer (Vite and electron-builder run on it).
- Python 3.11 or newer for the standard-library retail toolkit.
- A GPU with WebGL2. The app refuses software rendering in probe mode.
- No Wine, DOSBox, or 7-Zip needed for the implemented retail toolkit.

```sh
bun install
bun run dev:electron
```

`bun install` downloads the Electron binary (its postinstall is trusted in `package.json`). If `shell/node_modules/electron/dist` is missing afterwards, run `node shell/node_modules/electron/install.js`.

## Scripts

| Command                | What it does                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `bun run check`        | Typecheck all packages, ESLint, Prettier check, `bun test`. Must be clean before a phase is called done.                  |
| `bun run dev`          | Vite dev server for the engine in a browser at http://localhost:5173.                                                     |
| `bun run dev:electron` | Vite dev server plus Electron pointed at it. Renderer hot-reloads; edits under `shell/src` rebundle and restart Electron. |
| `bun run build`        | Production Vite build, bundle main/preload, electron-builder for the current platform only, into `build/<platform>/`.     |
| `bun run probe`        | Runs the packaged app (or the unpackaged bundle, building it if needed) with `--probe` and prints the WebGL2 report.      |

The browser target (`bun run dev`) is for development. Its writes use memory/localStorage; Electron owns persistent app data.

`--probe` exits 0 when the renderer string passes the software-fallback heuristic, 2 when the renderer string looks like a software fallback (SwiftShader, llvmpipe, softpipe, "Software"), 3 when no result arrived. Pass `--unpackaged` to `bun run probe` to skip a packaged app that exists.

Probe commands reuse existing builds, which may be stale. `bun run probe --fresh` rebuilds and checks current unpackaged source without rebuilding installers.

## Generate and fly terrain

The terrain dataset is generated locally and installed separately from the app:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r terrain-pipeline/requirements.txt
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline fetch --config theaters/ukraine.json --output extracted/terrain-source/ukraine
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline build --config theaters/ukraine.json --source extracted/terrain-source/ukraine --output extracted/terrain/ukraine
bun tools/terrain/install.ts --terrain extracted/terrain/ukraine --data-root "$HOME/Library/Application Support/usnf-atf/data"
bun run dev:electron
```

The last data-root path is this Mac's default; the app displays its actual root.
The terrain panel defaults to `terrains/ukraine/manifest.json`. Click the terrain:
WASD moves, Q/E changes altitude, drag or arrow keys turn, Shift accelerates.
The camera is free flight without terrain collision. The Ukraine box is a
provisional development area; retail mission geography is not yet aligned.

For a quick offline fixture, replace fetch/build with
`PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline fixture --output extracted/terrain/synthetic`.
Fixtures are explicitly labeled synthetic; install only the dataset you intend
to view. Existing installed theaters require the installer's `--replace` option.

See the [pipeline guide](Docs/phase-2-pipeline.md), [renderer guide](Docs/phase-3-renderer.md),
and [packaged smoke/installation tools](tools/terrain/README.md) for full commands
and limits. Terrain outputs and source rasters remain ignored under `extracted/`.

## Validation and retail tools

```sh
bun run check
python3 -m unittest discover -s tools/retail/tests
PYTHONPATH=terrain-pipeline .venv/bin/python -m unittest discover -s terrain-pipeline/tests
PYTHONPATH=tools/retail python3 -m retail stats gameassets/usnf97
```

Python tests run separately from `bun run check`; media-dependent tests skip when their local inputs are absent. See the [retail toolkit README](tools/retail/README.md) for extraction and decoder commands, [format notes](Docs/formats/README.md) for confidence and gaps, and the [phase 0](Docs/baselines/phase-0.md) and [phase 1](Docs/baselines/phase-1.md) baselines for measured results.

## Repo layout

```
engine/       TypeScript engine + Vite app (sim, render, terrain, data, ui, platform)
shell/        Electron main process, preload bridge, packaging (electron-builder)
importer/     import source contracts and stub (decoder port planned for phase 5)
terrain-pipeline/ Python offline DEM/water-mask fetch, chunk build and probe
theaters/     theater configuration (generated data stays outside git)
tools/        retail format tools, terrain installer and desktop smoke
Docs/         plans, progress log, review findings, format notes, per-phase baselines
build/        packaged apps, per platform (ignored)
```

The engine talks to its host only through `engine/src/platform/Platform.ts`. `browser.ts` implements it against the dev server; `electron.ts` implements it over the preload bridge. Nothing else in the engine knows which shell it runs in.

## Retail media

Retail discs, ISOs, installs, and anything extracted or converted from them stay in repo-relative `gameassets/` and `extracted/`, which are git-ignored. Nothing derived from retail assets is ever committed, packaged, or published; the planned in-app importer will write only to the user's app data directory. See `Docs/build-plan.md` section 1.
