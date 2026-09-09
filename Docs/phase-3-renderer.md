# Phase 3 terrain renderer implementation

Implementation checkpoint: 2026-09-08, macOS Apple Silicon. This document records
renderer work; the measured packaged baseline belongs in `baselines/phase-3.md`.
Linux and the two-machine performance exit gate remain open.

## Running

The desktop app now opens a terrain explorer. It reads
`appData/terrains/ukraine/manifest.json` by default. The panel displays the absolute
app-data root; copy a pipeline output folder beneath it, retaining the manifest's
relative chunk paths. Choose **Development assets** only for original/open terrain
explicitly staged under the development asset root. No terrain is committed in
`engine/public`, and no retail-derived output belongs there.

URL parameters `root=appData&manifest=terrains/ukraine/manifest.json` select the
source. `view=probe` opens the earlier cube diagnostic. The terrain explorer reports
WebGL capabilities immediately, before loading data, so Electron `--probe` still
works when no terrain exists. Missing/corrupt data produces a visible error and
instructions to stage data and retry.

Click the terrain to focus it. WASD move horizontally, Q/E change altitude, arrows
or dragging turn, and Shift accelerates. The camera is constrained to theater x/z
bounds and altitude >=25 m; there is no terrain collision or flight model yet.
Rendering uses one physical drawing-buffer pixel per CSS pixel to make a 2560×1440
performance run unambiguous on a Retina Mac.

## Implementation and boundaries

- Runtime JSON validation checks schema, finite numbers, relative paths, LOD grids,
  duplicate addresses, sample size, quantization ranges, and compressed byte/hash
  metadata. Decode verifies SHA-256 before gzip and caps inflated data to exactly
  131072 bytes, then checks every decoded elevation against its declared range.
- All I/O crosses `Platform.fs`; engine code has no Node/Electron filesystem access.
  Four concurrent requests, 25 desired source tiles, 32 MiB decoded-sample LRU and
  96 MiB geometry LRU bound streaming. Requests already in flight cannot be aborted
  through the current Platform API; unmounted viewers discard their results.
- Source levels are **not a nested quadtree**: 30→100 m is not a dyadic or integer
  factor. A globally consistent visible source level is selected by altitude and
  coverage budget, keeping the old source set until the desired set is loaded.
  Required tile count within the visible radius must equal available coverage,
  so sparse LOD0 detail cannot replace a complete coarse base. Fog and far clip
  track that radius.
  That switch is discrete, not a crossfade. Camera motion can temporarily outrun
  previously loaded coverage.
- Inside source tiles, dyadic quadtree leaves have 16×16 cells, splitting by distance
  up to depth 4. Source heights are bilinearly sampled. The vertex shader morphs
  height toward parent-triangle interpolation with distance. Edge skirts hide
  mixed-depth cracks. This is a CDLOD-style patch prototype, not a claim of complete
  production CDLOD: transitions, skirt visibility, lighting normals during morph,
  and whole-source-level switches still need visual/performance acceptance.
  Surface normals come from source-height gradients, excluding skirt faces;
  the first smoke screenshot exposed bevel-shaped seams from averaged skirt
  normals, now covered by a planar-normal regression test.
- Camera position remains a JavaScript double. Mesh/camera positions subtract an
  8192 m snapped floating origin every frame. Flat manifest polygons are triangulated
  into meshes with local polygon origins to preserve floating precision. Source
  mesh vertices clip to theater extents rather than exposing padded tile area.
  Terrain uses original height-based vertex tint, not WorldCover
  surface materials or retail textures.
- Mesh buffers/materials are disposed on LRU eviction and viewer teardown. Input
  listeners, animation frames and WebGL renderer are disposed on teardown, including
  React development StrictMode remounts.

## Counters and automation

The panel displays rolling 240-frame mean/p95 frame intervals, latest CPU frame
submission time, drawing-buffer size, triangles, draw calls, chunks/loading,
source LOD, patches, estimated cache bytes, and geometry bytes created per second.
The latter is an **upload estimate**, not measured GPU DRAM bandwidth; WebGL2 does
not expose that bandwidth counter. Cache estimates count decoded samples and mesh
arrays, not driver allocation, material overhead or transient IPC/compression data.

`window.__terrainDiagnostics()` returns a read-only snapshot for local CDP smoke
scripts. Its camera/origin are copied. Stable DOM IDs: `terrain-canvas`,
`terrain-root`, `terrain-manifest`, `terrain-load`. `status` becomes `ready` only
when every desired tile has decoded; errors retain their explicit message.

## Initial verification and lessons

Source checkpoint is the implementation commit introducing this document (commit
hash recorded by the parent progress log). Before commit:

- `bunx tsc -p engine/tsconfig.json`: pass.
- `bunx eslint engine/src/data engine/src/terrain engine/src/ui/App.tsx engine/src/ui/TerrainViewer.tsx`: pass after fixing the optional cache disposal callback and React effect error callback.
- `bun test engine/src/terrain`: 12 pass, 0 fail, 4451 expectations. Synthetic
  tests cover corrupt hash/length, gzip expansion and truncation, endian decoding,
  declared elevation bounds, unsafe paths, duplicate grids, planar interpolation,
  skirt topology, quadtree coverage, floating-origin displacement, sparse-source coverage fallback,
  and byte-budget eviction/disposal. No retail or downloaded terrain fixture is
  committed.
- `git diff --check`: pass.
- Cross-language integration: parsed `extracted/terrain/synthetic/manifest.json`
  and decoded every referenced chunk with TypeScript `parseManifest`/`decodeChunk`
  through `bun -e`: all 38 pass. Scope is explicitly synthetic, all five source
  LODs; this does not establish real-theater visual correctness.

Gotchas: Uint8Array backing buffers can be typed as SharedArrayBuffer in TypeScript;
copy at Blob/WebCrypto/Bun gzip boundaries to obtain owned ArrayBuffers. Three's
shader morph changes vertex height but does not recompute normals. Source level
spacing cannot be assumed to be a factor of two or three. Gzip output must be
bounded during decompression, not checked only after an unbounded allocation.
A passing math/decoder suite does not validate the shader or a real camera flight;
packaged rendering and recorded screenshots/performance remain required.
