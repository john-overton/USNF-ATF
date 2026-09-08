# USNF-ATF

A non-commercial fan remake of Jane's US Navy Fighters '97 (and, later, ATF Gold): a TypeScript engine with a Three.js WebGL2 renderer, React menus, real-elevation terrain, and a thin Electron shell for macOS, Windows, and Linux. You bring your own retail copy; the app imports its assets on first run. The plan lives in `Docs/usnf-atf-plan.md` (what and why) and `Docs/build-plan.md` (in what order, what "done" means).

> Inspired by Jane's US Navy Fighters '97, ATF, and Fighters Anthology by Jane's Combat Simulations and Electronic Arts. This is a non-profit fan project, not affiliated with or endorsed by Electronic Arts Inc. No retail game assets are distributed. A legally owned copy of the original is required. EA has not endorsed and does not support this product. If you are a rights holder and would like anything changed or removed, open an issue and it will be handled immediately.
>
> Terrain derived from Copernicus DEM GLO-30 (ESA) and ESA WorldCover. Engine built on Three.js, React, Vite, and Bun. Project approach informed by the Chrono Divide lineage RA2 community ports.

## Prerequisites

- Bun 1.4 or newer (runs scripts, tests, and the workspace install).
- Node 22 or newer (Vite and electron-builder run on it).
- A GPU with WebGL2. The app refuses software rendering in probe mode.
- No Wine, DOSBox, or 7-Zip needed; every retail format is handled by our own code.

```sh
bun install
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

`--probe` exits 0 for a hardware renderer, 2 when the renderer string looks like a software fallback (SwiftShader, llvmpipe, softpipe, "Software"), 3 when no result arrived. Pass `--unpackaged` to `bun run probe` to skip a packaged app that exists.

## Repo layout

```
engine/       TypeScript engine + Vite app (sim, render, terrain, data, ui, platform)
shell/        Electron main process, preload bridge, packaging (electron-builder)
importer/     retail asset importer (disc folder or install folder -> engine formats)
tools/        format tools and headless probes (Python, phase 0)
Docs/         plans, format notes, per-phase baselines
build/        packaged apps, per platform (ignored)
```

The engine talks to its host only through `engine/src/platform/Platform.ts`. `browser.ts` implements it against the dev server; `electron.ts` implements it over the preload bridge. Nothing else in the engine knows which shell it runs in.

## Retail media

Retail discs, ISOs, installs, and anything extracted or converted from them stay in `/gameassets` and `/extracted`, which are git-ignored. Nothing derived from retail assets is ever committed, packaged, or published; the importer writes only to the user's app data directory. See `Docs/build-plan.md` section 1.
