# USNF-ATF

**Menu revision, 2026-09-10:** the current Omarchy development pass fixes button
geometry, typography/contrast and secondary-screen spacing, and adds optional
original title-theme playback in menus. See [menu revision evidence](Docs/baselines/menu-revision.md)
for Linux checks and remaining fidelity gaps; earlier Mac acceptance does not
establish visual acceptance of the menu.

A non-commercial fan remake of Jane's US Navy Fighters '97 (and, later, ATF Gold), built with TypeScript, Three.js, React, and Electron. The goal is retail aircraft and missions over real-elevation terrain, using assets imported from your own copy.

**Current status (2026-09-10):** the app now opens on a **main menu** rather than
straight into the viewer. From it you can set up a guns-only quick fight, take a free
flight, or enter the terrain explorer, choosing an aircraft and its loadout on the
way. Escape opens a two-page mission briefing and pauses the current flight;
Resume or Escape continues it, and Main menu ends it, without a page reload.
The main menu is laid out at the geometry recovered from the original's own
`CHOOSEAC.DLG`, and it will use the original's artwork and sounds if you port them
from your own disc ([menu porting](Docs/menu-porting.md)). The loadout screen shows
an aircraft's real hardpoints, stores and gross weight, though stores do not affect
flight yet and a station offers only its own default because the compatibility mask
is still undecoded. Quick fight now has visual target acquisition, original pursuit
tactics, guns, swept hits, airframe damage, destruction and a combat debrief.
Press C to cycle targets, Shift+Tab to arm, and Tab to fire. Escape pauses;
the briefing's Debrief button ends the flight. Aircraft HP and gun damage use local
imports where present, with explicitly labelled original fallback values otherwise.
The retail AI VM, radar, missiles and per-system damage remain future work.
Quick setup includes airborne/runway starts, altitude, range and encounter orientation.
Runway starts can stage enemies until a configurable safe-climb grace period ends.
Damage darkens airframes and adds smoke/fire; gun kills and ground crashes break
the loaded geometry into debris with procedural explosions and imported retail
hit/explosion/crash sounds (synthesized fallback without the local import).
Terrain tools start collapsed in quick fights.
In-flight situation music uses locally imported XMI notes; N toggles music, M mutes
all audio, and flight controls expose music volume. Recovered MUS scripts now choose
and sequence tracks; MIDI volume, expression, pan and bend are preserved. Instruments
and host situation dispatch remain approximate. Original actuator, stall, hit/fuel
speech, wind/tire and bullet-terrain sounds use verified gameplay hooks. The
[audio library recovery](Docs/formats/audio.md)
exports all identified standalone audio from both discs, including unused speech;
49 movie soundtracks are also recovered, with seven ATF movies blocked by truncated media.
An additional48s S35_S soundtrack prefix is recovered separately as incomplete.
MIDI bend sensitivity, sustain/releases and bounded finite XMIDI loops are supported;
unsupported controls are diagnosed. Offline user-bank MIDI audition is optional,
not an engine instrument-fidelity upgrade; see [remaining audio gaps](Docs/baselines/audio-gaps.md).
[music notes](Docs/formats/music.md) distinguish recovered scripts from runtime parity.
Exterior cockpit texture cutouts and flap placement have been revised on all three
aircraft; re-run the aircraft porter to update previously installed models.
See [guns-only evidence and limitations](Docs/baselines/phase-6.md).

The desktop app also has a terrain explorer with streamed elevation, floating origin,
blended LOD, water, imagery and seasonal color maps, shorelines, sky, wind and clouds.
Historical packaged Mac terrain measurements are about 60 fps at 1440p;
[GPU profiling](Docs/gpu-trace-notes.md) and phase baselines describe their scope.
Current development and guns-only checks run on Linux; full cross-platform acceptance
remains open. Practice flight supports the imported F-14, A-4E and X-31, cockpit
frames and mirrors, moving surfaces, engine audio, navigation and chase cameras.
Retail PT-envelope flight remains the imported-aircraft default; preserved assisted
flight is selectable and supplies the fallback without an imported profile.
Recovered-native-envelope remains opt-in. None is complete native game parity.
Missions, campaigns and the in-app retail importer remain planned; developer Python
porters supply the current local assets. SH texture dispatch is still partial.

Start with [progress and review findings](Docs/progress.md), the [build plan](Docs/build-plan.md) (phase order and exit criteria), and the [design brief](Docs/usnf-atf-plan.md). Contributor and agent instructions are in [AGENTS.md](AGENTS.md). The [full US Navy Fighters manual](Docs/reference/JANES_US_NAVY_FIGHTERS_djvu.txt) is available locally; [reference details](Docs/reference/README.md) record its source and checksum.

> Inspired by Jane's US Navy Fighters '97, ATF, and Fighters Anthology by Jane's Combat Simulations and Electronic Arts. This is a non-profit fan project, not affiliated with or endorsed by Electronic Arts Inc. No retail game assets are distributed. A legally owned copy of the original is required. EA has not endorsed and does not support this product. If you are a rights holder and would like anything changed or removed, open an issue and it will be handled immediately.
>
> Terrain derived from Copernicus DEM GLO-30 and its water body mask, with optional Sentinel-2 imagery. Engine built on Three.js, React, Vite, and Bun. Project approach informed by the Chrono Divide lineage RA2 community ports.

Terrain/data source notices are in [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

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

The [terrain polish guide](Docs/terrain-polish.md) covers optional label-free satellite
paint, bounded coastline smoothing and shared panel edges.

See the [pipeline guide](Docs/phase-2-pipeline.md), [renderer guide](Docs/phase-3-renderer.md),
and [packaged smoke/installation tools](tools/terrain/README.md) for full commands
and limits. Terrain outputs and source rasters remain ignored under `extracted/`.

## Practice flight

Run `bun run dev:electron`, then choose **Practice runway** or **Final approach**.
These are practice starts over the installed Ukraine terrain and a fictional runway.
The **Aircraft** dropdown selects the locally converted F-14, A-4E or X-31;
missing imports use an explicitly identified original placeholder.
[Full aircraft-port helper and checklist](Docs/aircraft-porting.md) covers repeatable
conversion, scale, flight profiles, animation and acceptance for future aircraft.
[A-4E/X-31 setup and flight profiles](Docs/phase-4-aircraft.md) documents ATF-GOLD
exteriors and the separate experimental per-aircraft flight-data mode. [F-14 setup](Docs/phase-4-f14.md) keeps retail assets outside the app bundle.

- **1–5** select **0/25/50/75/100%** throttle; **6** engages afterburner.
- Hold **W/S** for incremental throttle; the setting stays when released.
- **T** toggles engine, **G** gear, **H** hook, **F** flaps and **M** sound mute.
- **B** toggles speed brakes and wheel braking on the ground.
  Apply it when parked: tire grip resists sideways wind slip, but unbraked wheels can roll.
- Cockpit view is the default; **F1** returns to the enlarged imported cockpit with a HUD fitted to its glass.
  F-14/A-4E mirrors show live rear views. **Shift + arrows**
  look around or orbit externally; **Shift + /** centers the view.
- Hold **Tab** to fire; **Shift + Tab** toggles safety (starts safe). Guns use
  matching imported samples and individual rounds with aircraft velocity plus
  muzzle speed. Bright tracers appear every fifth round. See
  [cockpit and gun setup](Docs/phase-4-cockpit-guns.md). The gun reticle uses nearer
  terrain or a 1,000 m base range, including aircraft velocity and gravity. Its thick
  lower arc appears below 1,000 m and fills from left through bottom (500 m) to
  right (zero) as range closes. The base-range fallback shows no bar. The reticle
  appears only with the gun armed and ammunition available.
- **F2** locks chase view to aircraft attitude; **F3** keeps the camera upright.
  Both external views hide the flight HUD and gun reticle.
- **ArrowDown** pulls up, **ArrowUp** pushes down; left/right arrows bank.
- **Q/E** controls rudder; **R** resets the practice start.
- **[ / ]** select the previous/next waypoint: practice strip, mountains, coastline.
- The top-right MFD map is available in the explorer and every flight model. Bezel
  buttons provide **−/+** zoom (1×–16×), **N-UP / HDG** orientation and **waypoint
  teleport**. Its square 20-button bezel includes two decorative dials, a compass, a segmented
  nautical-mile scale and fixed elevation colors.
  Teleport preserves fuel/model settings and places flight safely airborne above the
  destination; the map stays visible when the helper is minimized.
- Standard gamepads use the left stick for pitch/roll, right-stick X for rudder,
  triggers for throttle and B for brakes.

## Environment

Both the explorer and practice flight share an **Environment** section in the
helper panel: a time-of-day slider showing HH:MM and sun elevation, and Weather,
Wind and Cloud quality selectors. The clock runs in real time; time acceleration
is deferred. The same settings can be given on the URL as `time=14.5`,
`date=07-15`, `weather=`, `wind=`, `clouds=off|quarter|half|full` and
`cloudSteps=`; an invalid value fails the load with an explicit message rather
than silently defaulting.

Wind is the only environment input the flight model reads. It shows on the HUD as
`WIND ddd/ss` in knots, shortens or lengthens the takeoff roll, and produces the
expected drift angle in a crosswind; the preserved assisted model is byte-for-byte
unchanged at zero wind. Time of day, shadows and clouds are not flight-affecting.
Volumetric clouds default to half resolution, which costs about 3.4 ms a frame on
this Mac; see the [phase 3 baseline](Docs/baselines/phase-3.md) for the numbers at
every quality.

The free terrain explorer keeps its existing controls. Flight physics run at
120 Hz with render interpolation. The automated pilot exists only in test tools;
the app is flown manually. Physical gamepad testing and USNF feel comparison
remain human acceptance work.

```sh
bun run harness --output extracted/flight-harness/report.json
```

See [practice flight](Docs/phase-4-flight.md), the [maneuver harness](Docs/phase-4-harness.md),
[navigation and map](Docs/phase-4-navigation.md), and [desktop flight tests](tools/flight/README.md) for implementation and validation.

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

The terrain helper’s **Ground colors** selector compares satellite imagery with
compact summer/spring/autumn/winter color maps when installed. See the
[color-map and shoreline material workflow](Docs/terrain-colors.md).
