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

## 2026-09-08 follow-up: reproducible cameras and bounded water

The first fresh packaged fixture rerun after `e0615fa` was reported by the parent
smoke runner at 60.08 fps / 2560×1440; the bevel grid was absent in
`extracted/terrain-smoke-fixture-fixed/terrain.png`. This is a synthetic smoke,
not real Ukraine or Linux acceptance.

Camera URL parameters `x`, `y`, `z`, `yaw`, `pitch` now accept finite projected
meters/radians. Omitted values retain the default pose. x/z clamp to theater
extents, altitude to 25–100000 m, pitch to ±1.5 radians; yaw wraps at 2π. Example:
`?root=appData&manifest=terrains/ukraine/manifest.json&x=25000&z=25000&y=2500&yaw=3.14&pitch=-0.4`.
These parameters let the smoke tool repeat coast and mountain viewpoints without
measuring a long transit first. Invalid/nonfinite values show an explicit error.

Water geometry is now created lazily by visible horizon, rather than allocating
all theater polygons on manifest load. Spatial batches combine up to 64 nearby
bodies per draw, normally <=1 MiB estimated geometry per batch (a single large
body can exceed that). Selection has a 16 MiB water-buffer budget and 128-batch
draw cap. Four missing batches are triangulated per selection tick; departed
coverage is disposed. Cache and geometry-upload estimates include water. The
panel and automation report omitted batches explicitly rather than silently
claiming complete water coverage; `waterBatchesPending` distinguishes not-yet-built
selected batches, and startup `ready` waits for those as well as chunks.

The v1 development contract accepts optional `holes` arrays of coordinate rings.
Three.js triangulates exterior plus holes, preserving dry islands. Runtime bounds
are 10000 bodies, 100000 points per body including holes, and 500000 total water
points. Spatial culling uses exterior bounds; a very long connected coast can
therefore remain resident over a broad region. Future work can tile large bodies
if measured complexity or memory demands it. The source-LOD switch remains
discrete; independent 30/100 m source grids need a coverage-aware resampling or
transition design rather than assuming nested vertices.

Verification for this follow-up: `bunx tsc -p engine/tsconfig.json` and scoped
ESLint pass; `bun test engine/src/terrain`: 15 pass, 0 fail, 4467 expectations.
New tests validate query rejection/clamping, a water polygon with a dry hole
(triangle area 7500 of 10000 m²), and spatial batching, culling, allocation bounds
and disposal. Packaged smoke must rebuild after this follow-up commit.


## 2026-09-08 measured water component limit

The full Ukraine source mask produced 33731 disconnected water bodies after
preserving original exterior/interior rings; the rectangle decomposition had
produced approximately 80660 separate polygons. The largest measured exterior
has 16695 points. Raise the runtime body-count guard from 10000 to 50000 to
accommodate this measured dataset. The 100000-point per-body and 500000-point
total bounds and 16 MiB/128-batch GPU working-set budgets remain unchanged.
This is a measured input allowance, not permission to eagerly instantiate one
mesh per source component. A regression accepts 10001 small bodies and rejects
50001 bodies and 600000 total vertices. The earlier 10000-body limit above is
historical, superseded by this entry.

Verification: engine TypeScript and scoped ESLint pass; `bun test
engine/src/terrain` passes 16 tests / 4470 expectations; `git diff --check` passes.

## 2026-09-08 real-data integration and camera evidence

Runtime `parseManifest` and `decodeChunk` now independently accept every one of
832 chunks in `extracted/terrain/ukraine/manifest.json`. The manifest contains
33731 water bodies and 347838 exterior/interior-ring points. Building every water
batch in a headless Three.js integration pass produced 666 spatial batches,
242313 triangles and 8913414 total geometry-buffer bytes (all-theater sum, not
simultaneously rendered). Triangulated area was 97908903488.86719 m² versus
97908904057.51038 m² from exterior-minus-hole shoelace areas: relative difference
about 5.8e-9 from converting local vertices to Float32. This validates area
preservation independently of a screenshot, not every polygon's topology.

Real Crimea screenshots exposed interference from physical mouse/keyboard input
on the shared Mac during CDP automation. A down-looking frame did not establish
flat data: TypeScript source sampling near x=483271/z=64876 returned about 799 m
and its LOD1 tile spans 71–1316 m elevation. The isolated screenshot shows rolling
relief and horizon. Diagnostics now include actual yaw/pitch radians, allowing a
benchmark to compare requested and observed poses. The smoke harness should
isolate physical input; product camera controls remain unchanged. Terrain tint
and bright ambient lighting are deliberately rudimentary and can make relief
subtle. A 60 fps timing alone is not visual acceptance.

Validation of the diagnostics addition: engine TypeScript and scoped ESLint pass;
no simulation or input behavior changed. The independent integration loops used
`bun -e` imports of `parseManifest`, `decodeChunk`, `waterBatches`, and
`waterGeometry`, local manifest-relative files, and disposed each generated
geometry after counting buffers/triangle areas. No generated bytes were committed.

## 2026-09-08 ocean depth-buffer correction

The controlled Odesa screenshot
`extracted/terrain-smoke-ukraine-odesa-controlled/terrain.png` confirms severe
blue/green striping across ocean water and its nearly coincident DEM surface.
The standard perspective depth buffer with a 5 m near plane cannot reliably
separate the existing 0.2 m water display offset across a kilometer-scale view.
Enable Three.js `logarithmicDepthBuffer` for the terrain viewer. This changes
raster depth precision, not manifest water levels or terrain elevations.
Diagnostics identify the depth mode explicitly.

The installed Three.js 0.185.1 shader source computes `project_vertex` and then
`logdepthbuf_vertex` after our `begin_vertex` geomorph injection, so logarithmic
depth receives the morphed position. Its fragment chunk writes `gl_FragDepth`;
that can affect early-depth optimization and must be remeasured on real hardware.
Do not infer Linux performance or complete ocean visual acceptance from the
configuration change. Extreme distances and grazing angles remain an explicit
visual test case. No additional elevation bias or polygon-offset workaround was
introduced.

Before commit: engine TypeScript, scoped ESLint, `git diff --check` pass;
`bun test engine/src/terrain` passes 16 tests / 4470 expectations. Those checks do
not prove depth precision. The next required step is a fresh packaged Odesa smoke,
compare the controlled screenshot for striping, and record its frame times.

Final packaged depth-fix verification: broad sea striping is removed in the
Odesa screenshot, while coast and 30m detail runs remain ~60fps at1440p. See
[phase 3 baseline](baselines/phase-3.md) for exact results, startup stalls,
remaining fine edge artifacts and formal acceptance gaps.

## 2026-09-09 source transitions and mesh boundary polish

Linux verification is deferred at the user's request. This change addresses the
Mac renderer; packaged visual/performance evidence is recorded separately in the
phase 3 baseline after rebuilding.

Independent 30/100m source levels now use an 800ms smoothstep screen-door fade.
Selection must stay on the candidate level for 400ms and every incoming chunk
must decode before the fade starts. The 400ms is temporal debounce, **not spatial
hysteresis**. Only one fade runs at a time; both patch hierarchies stay resident
and their topology stays fixed during the fade. Camera position, floating origin,
and per-patch height morphs continue updating. Complementary deterministic
screen-space masks write opaque depth, avoiding conventional alpha-blending
ordering and coincident-depth interference. Transitional stipple and silhouette
coverage differences still require screenshot acceptance; this is not geometric
resampling of the independent source grids.

Each hierarchy is capped at 1000 patches by reducing its maximum quadtree depth
when necessary. Both complete hierarchies fit inside the unchanged 96MiB geometry
LRU, including the added parent-normal/color attributes. Retained outgoing entries
are refreshed before incoming allocation so inactive entries are evicted first.
Source data stays under the existing 32MiB cache; at most two 25-chunk sets are
needed by a fade. Once the fade finishes outgoing geometry becomes inactive LRU
storage. This is bounded residency, not a claim about native driver allocations.

A confirmed mesh pop came from using distance to each vertex in the shader but
distance to the patch square for CPU selection: a far parent corner had already
morphed toward the grandparent while a newly selected child only matched the
unmorphed parent. A synthetic sinusoid reproduced a 5.31253m jump. `patchMorph`
now uses exactly the square-distance/altitude metric used by `selectPatches`;
at the mathematical split boundary the parent is unmorphed and all children
fully match its triangle heights. Morph normals and tint now interpolate parent
triangle attributes as well, including nonlinear tint clamping at each parent
vertex. Normal normalization/raster interpolation can still differ slightly
between triangulations. Skirts continue bridging neighboring patch morph levels.
The selection timer remains 200ms; this does not promise continuous topology or
eliminate all transient errors when a fast camera crosses thresholds between ticks.

The same regression review found a separate 8.95776m jump at clipped theater
boundaries: parent samples used unclipped grid corners while rendered vertices
clamped to the theater. Parent triangle sampling now clamps both its corners and
interpolation widths to the actual theater boundary, for height, normal and tint.
Never loosen seam tolerances to hide a topology/interpolation mismatch.

Diagnostics add `transitionActive`, `transitionProgress`, `transitionFrom`,
`transitionTo`, `transitionsCompleted`, `outgoingPatches`, and
`geometryCacheBytes`. The panel shows the transition and completion count. A real
Ukraine route starts x470475/y1293.3447/z49725/yawπ/pitch−0.2, holds E for about
4 seconds, settles, then Q for about 4 seconds and settles: it crosses 0→1→0.
The packaged smoke tool owns automated flight/capture reproduction. Geometry
residency and the transient frame cost must be sampled during the fade, not only
once it settles. Fast lateral motion can outrun retained coverage, especially
while hierarchies are frozen; source boundaries and silhouettes remain explicit
visual stress cases.

Before implementation commit: `bunx tsc -p engine/tsconfig.json`,
`bunx eslint engine/src/terrain engine/src/ui/TerrainViewer.tsx`, and
`bun test engine/src/terrain` pass: **20 tests / 4507 expectations**. New
regressions cover incomplete coverage, candidate debounce, bidirectional fade
completion, parent triangle normals, bounded full-tile fallback, and both
numerically reproduced parent/child height defects. These tests do not compile
GPU shaders or establish screenshot/performance acceptance.
