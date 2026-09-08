# USNF'97 Fan Remake: Project Plan

Working title: TBD. Non-commercial fan project in the spirit of Jane's US Navy Fighters '97, ATF, and Fighters Anthology.

Status: pre-code. This document is the starting brief for the repo and for Claude Code sessions. Sequencing, exit criteria, and findings from the retail media are in `build-plan.md`, which supersedes section 8 below.

---

## 1. Thesis

Jane's USNF'97 got the flying right and the terrain wrong. The remake keeps the game (aircraft, flight model feel, weapons, missions, campaign structure, cockpit art, audio) and replaces the terrain with real elevation data at 100 m, 30 m where it matters.

Approach modeled on the Chrono Divide lineage RA2 ports: a TypeScript engine, Three.js rendering, shipped as native desktop apps for macOS, Windows, and Linux via a thin shell, and bring-your-own-retail-copy for all original game assets. No EA or Jane's content is ever distributed from this repo.

The product is a desktop app. The browser is a development target only.

## 2. Non-negotiables

- **Bring your own copy.** The repo ships an importer that reads a user's retail USNF'97 install. Nothing derived from retail assets is committed or distributed.
- **Attribution.** EA and Jane's Combat Simulations credited everywhere. Required notice: "EA has not endorsed and does not support this product."
- **Non-commercial.** If a rights holder objects, the project comes down.
- **Original work only in the repo:** engine code, terrain pipeline, terrain data derivatives (from open sources), effects, renderer, tooling.

## 3. Non-goals (for v1)

- Global terrain. Theaters only.
- Study-sim fidelity. This is USNF, not DCS. Lookup-table flight model, arcade-leaning.
- Multiplayer. Design the sim so it can be added (fixed timestep, server-authoritative state sync), but do not build it.
- Browser as a product. It stays as a dev target for fast renderer iteration.
- Mobile. Maybe an iPad shell later if it's cheap. Not v1.
- Recreating retail assets by hand. Import them.

## 4. Architecture

### 4.1 Stack

- Runtime: Bun
- Build: Vite
- Language: TypeScript, strict
- Rendering: Three.js on WebGL2 (WebGPU later, not now)
- UI: React for menus, mission briefing, debrief. Nothing React in the sim loop.
- Native shell (phase 0): Electron, targeting macOS, Windows, and Linux. Bundled Chromium gives identical WebGL2 (and later WebGPU) behavior on all three platforms and direct control of GPU flags. Node main process owns filesystem, importer, and any native input modules.
  - Rejected: Tauri. OS webviews are fine on macOS and Windows, but WebKitGTK on Linux can silently fall back to software WebGL with no detectable error, has known NVIDIA DMABUF issues, and masks the renderer string. Tauri's small-binary advantage is irrelevant when the app ships hundreds of MB of terrain. Revisit only if Tauri gains a bundled-engine option.
- Terrain pipeline: Python (rasterio, numpy, GDAL). Offline only. Not part of the client.
- Asset importer: TypeScript, runs inside the app with real filesystem access via the shell. Reads the retail install from disk, converts to engine formats, writes to the app data directory.

Considered and deferred: Rust + Bevy (the RTS project's stack). Native GPU access and no webview variance, but loses the reference architecture and the Three.js ecosystem. The shell boundary below is kept explicit so a Bevy port later is a port, not a rescue.

### 4.2 Core engine rules

- **Fixed-timestep simulation decoupled from render.** Flight model at 120 Hz. Renderer runs whatever the display allows and interpolates. The sim never knows the frame rate.
- **Floating origin from day one.** Float32 loses precision past ~10 km. World is rebased around the player every few km. Retrofitting this is miserable; it goes in before the first aircraft is drawn.
- **Flat theaters.** No earth curvature. Each theater is a local projected grid in meters. USNF didn't curve the earth either.
- **Data-driven everything.** Aircraft, weapons, sensors, and missions defined in JSON. The engine is generic; the content is data.
- **Explicit shell boundary.** The engine talks to the platform through one small interface: filesystem read/write, app data paths, window control, power and thermal state, and input devices if the gamepad API falls short. Nothing else in the engine knows what shell it's running in. The browser dev target implements the same interface against a local dev server and a folder.
- **Liveness is asserted, not assumed.** Headless harnesses that fly canned maneuvers and assert on energy state, weapon behavior, and AI activity. The RA2 port's lesson: error-free is not the same as working.

### 4.3 Repo layout (proposed)

```
/engine            TypeScript client: sim, renderer, terrain streamer, UI
  /src/sim         flight model, weapons, sensors, damage, AI
  /src/render      Three.js scene, terrain LOD, effects, cockpit
  /src/terrain     chunk loading, LOD selection, cache
  /src/data        JSON schemas for aircraft, weapons, missions
  /src/ui          React menus, briefing, debrief
  /src/platform    shell interface + browser dev implementation
/shell             Electron project: main process, preload bridge, platform API impl, packaging, signing
/importer          retail asset importer (models, textures, audio, cockpit art)
/terrain-pipeline  Python: DEM download, reprojection, LOD pyramid, chunking, water mask
/theaters          manifests only (chunk data lives on a CDN, not in git)
/tools             headless probes, flight model harness, asset inspectors
/docs              engineering log, format notes, decisions
```

## 5. Terrain

### 5.1 Source data

- Elevation: Copernicus GLO-30 (30 m, global, free, AWS Open Data). Includes a water body mask layer.
- Land cover: ESA WorldCover (10 m classification) for texture splatting by class. Optional in v1; a flat tinted terrain with detail textures is acceptable to start.
- Imagery: none in v1. Revisit later.

No Mapbox or any per-request tile API. Raw DEM tiles are downloaded once, processed offline.

### 5.2 Resolution policy

- Base: 100 m across the whole theater.
- Detail: 30 m tiles, promoted automatically. Compute roughness (std dev of 30 m source elevation within each 100 m tile). Tiles above a tunable threshold get a 30 m version. Canyons, ridges, and coastal cliffs self-select. One threshold number to tune, no hand-drawn polygons.
- Coarser LODs generated from the base: 300 m, 900 m, 2,700 m for distant rendering.
- Water: from the mask, not from elevation.
  - Mask says water and elevation ≤ 0: ocean, rendered as flat sea level.
  - Mask says water and elevation > 0: lake, flat at that elevation.
  - Rivers: flatten if wide enough to appear in the mask, otherwise ignore.

### 5.3 Pipeline steps (Python)

1. Define theater bounding box and a local projection (transverse Mercator or LAEA centered on the theater). Never Web Mercator.
2. Download GLO-30 DEM and water mask tiles covering the box.
3. Mosaic, reproject to the local grid at 30 m.
4. Compute roughness map. Flag detail tiles.
5. Build LOD pyramid: 30 m (flagged tiles only), 100 m, 300 m, 900 m, 2,700 m.
6. Chunk each level into 256 × 256 tiles. 16-bit integer elevation, per-chunk offset and scale in the header.
7. Compress: 16-bit lossless PNG or WebP to start. Revisit with delta encoding if size matters.
8. Emit a theater manifest: projection, origin, extents, chunk index per LOD, water bodies (polygon + elevation), airbase and objective locations.
9. Publish chunks to a CDN. Commit only the manifest.

### 5.4 Budget (1,500 × 1,500 km theater)

| Layer | Points | Raw (16-bit) | Compressed (est.) |
|---|---|---|---|
| 100 m base | 225 M | 450 MB | 120 to 200 MB |
| 30 m detail (10% of area) | 250 M | 500 MB | 150 to 200 MB |
| Coarser LODs | small | ~60 MB | ~20 MB |
| **Total per theater** | | | **300 to 400 MB** |

A mission pulls 30 to 60 MB of chunks. Chunks are cached on disk in the app data directory with per-file hash verification. Optionally ship a theater as a single download the user installs once, since a desktop app has no reason to stream from a CDN mid-mission.

### 5.5 Renderer

- Quadtree chunked LOD (CDLOD) with geomorphing so LOD transitions don't pop.
- Frustum and distance-based chunk selection, driven from the sim position, not the camera.
- Budget GPU bandwidth explicitly. Measure bytes through DRAM, not CPU frame time. Terrain streaming will dominate power on integrated GPUs and it won't show in a `performance.now()` delta.
- Water as a separate flat mesh per body, not baked into the heightmap.

This is the hardest single piece of the project. Budget accordingly.

## 6. Retail asset import

### 6.1 Scope

Import from a user's USNF'97 install: aircraft models, ground and naval models, textures, cockpit art, HUD elements, audio (engines, weapons, comms), and mission and campaign definitions if they're parseable.

### 6.2 Unknowns (resolve first)

- File formats for models, textures, and audio are proprietary Jane's/Origin formats. **Resolved 2026-09-08:** the containers (EALIB and the ESA installer payload) are parsed and inventoried; see `build-plan.md` section 0. Models are `.SH`, flight parameters are `.PT`, terrain is `.T2`, missions are `.M`. Decoding those is phase 0 of the build plan.
- Where USNF'97 can be legally purchased today. "Bring your own copy" is friendlier when the copy is a cheap digital download rather than an eBay CD.

### 6.3 Rules

- The importer reads only from the user's install path, which the user picks in the app on first launch.
- Converted output goes to the app data directory. Never to the repo, never to the CDN.
- Every importer output carries EA and Jane's attribution metadata.

## 7. Flight model

- Lookup tables per aircraft: lift and drag coefficients vs. alpha and Mach, thrust vs. altitude and Mach. Same shape as what USNF actually did.
- Simplified 6DOF with stability augmentation so it feels like USNF, not like a bare-airframe sim.
- Energy state is the truth: the headless harness asserts on it.
- Tables are JSON per aircraft. Tune by flying and by harness, not by guessing.

## 8. Build order

Each phase ends with something you can run.

0. **Shell and packaging.** Electron app that opens a window, exposes the platform interface through a preload bridge, and builds signed installers for macOS, Windows, and Linux in CI (electron-builder or Forge). Deliverable: an empty app anyone can install on all three platforms. Do this first so every later phase ships as an app, not a dev server.
1. **Terrain pipeline.** Python. One theater end to end: download, reproject, roughness, LOD pyramid, chunks, manifest. Deliverable: a folder of chunks and a manifest.
2. **Terrain renderer.** Empty Three.js scene, floating origin, CDLOD terrain streaming from the chunk folder, free camera. Deliverable: fly a camera over real terrain at 60 fps in the app on all three platforms, including a Linux NVIDIA machine.
3. **Flight model.** Fixed-timestep sim, one placeholder aircraft, keyboard and joystick input, headless harness. Deliverable: take off, fly, land on the real terrain.
4. **Asset importer.** Read the retail install, convert one aircraft and its cockpit. Deliverable: the F-14 from the retail disc flying over real terrain.
5. **Weapons and sensors.** Radar, RWR, missiles, guns, damage model. Deliverable: shoot something down.
6. **AI.** Wingmen, enemy aircraft, SAM sites, ships. Deliverable: a dogfight.
7. **Missions and campaign.** Mission format, briefing and debrief UI, campaign progression. Deliverable: one playable campaign mission.
8. **Polish the app.** Thermal and power-aware renderer throttling, settings, first-run flow for picking the retail install, auto-update. Deliverable: something you'd hand to a stranger.
9. Second theater. Multiplayer if the itch is still there.

## 9. Testing and process

- Headless flight model harness runs in CI. Canned maneuvers (level flight, sustained turn, loop, stall) with assertions on airspeed, altitude, and g.
- AI liveness probe: a headless mission where bots must move, engage, and fire. Fails the build if any bot goes inert.
- Terrain probe: load every chunk in a manifest, assert dimensions, elevation ranges, and water body consistency.
- And the non-tool habit from the RA2 port: fly it. Screenshot it. Judge it as a player. Counters miss what eyes catch.
- Engineering log in `/docs` for every failure mode, root cause, and fix.

## 10. Open questions

- Which theater first? Candidates from the original: Vietnam, Kuril Islands, Ukraine, Persian Gulf. Pick the one with the most interesting terrain to prove the pipeline. Kurils or Vietnam.
- Land cover in v1 or not?
- Model format research outcome (see 6.2). This is the gate on phase 4.
- Chunk compression format after the first real size measurement.
- Working title and repo name.

## 11. Credits and disclaimer (to carry into README)

Inspired by Jane's US Navy Fighters '97, ATF, and Fighters Anthology by Jane's Combat Simulations and Electronic Arts. This is a non-profit fan project, not affiliated with or endorsed by Electronic Arts Inc. No retail game assets are distributed. A legally owned copy of the original is required. EA has not endorsed and does not support this product. If you are a rights holder and would like anything changed or removed, open an issue and it will be handled immediately.

Terrain derived from Copernicus DEM GLO-30 (ESA) and ESA WorldCover. Engine built on Three.js, React, Vite, and Bun. Project approach informed by the Chrono Divide lineage RA2 community ports.
