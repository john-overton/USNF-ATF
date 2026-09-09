# Terrain paint, coast and panel polish — 2026-09-09

This is a phase 2/3 follow-up, not a new phase. The preserved assisted flight physics is unchanged; the contact sampler now uses
an exact water index to avoid repeated full-coast scans. Measurements and source scope
are in [phase 3 baseline](baselines/phase-3.md).

## Imagery choice and scale

Optional imagery now paints terrain in projected world coordinates. One shared
atlas covers the theater, so its registration does not change with patch/source
LOD, camera movement or floating-origin rebasing. It has no map labels or road
overlays. Photographed roads remain part of satellite imagery.

The offline command uses the EOX Sentinel-2 cloudless 2024 mosaic. EOX permits
non-commercial use under CC BY-NC-SA 4.0, with attribution and license retained.
The app displays its attribution even with the flight helper minimized; imagery
stays outside the application bundle. These imagery terms do not relicense the
original application source. Keep the imagery's license when sharing derived
textures. See [EOX license summary](https://cloudless.eox.at/documentation/license)
and [public map service](https://maps.eox.at/).

Google Map Tiles has [service-specific caching and attribution rules](https://developers.google.com/maps/documentation/tile/policies).
Mapbox's [satellite product](https://www.mapbox.com/imagery) supports imagery,
but its [offline SDK documentation](https://docs.mapbox.com/android/maps/guides/offline/concepts/)
prohibits redistribution of offline maps downloaded from its servers. Neither is
the default source for an independently stored game texture atlas.
[Natural Earth](https://www.naturalearthdata.com/downloads/10m-raster-data/10m-natural-earth-1/)
is another, coarser cartographic option. The pipeline also accepts a local
georeferenced RGB raster with explicit attribution and license.

The default atlas is at most 3072 pixels on its longer edge, capped at 6144.
Ukraine's initial atlas was 3071×3072, approximately 183m per pixel: about 140
pixels across a 25.5km source tile, close to the requested 100×100 starting point.
Smaller quadtree panels use the matching portion of the same atlas. This is broad
regional paint, not low-altitude aerial photography. Bilinear magnification,
mipmaps and up to 8× anisotropic filtering soften pixels and distant shimmer.
The original height tint remains the fallback for manifests without imagery.

```sh
# Work on a separate copy if preserving an existing generated theater.
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline imagery extracted/terrain/ukraine/manifest.json --cache extracted/terrain-source/imagery --size 3072
# Or reproject a local 0..255 RGB raster with complete theater coverage:
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline imagery extracted/terrain/ukraine/manifest.json --source extracted/terrain-source/imagery/rgb.tif --attribution 'Source credit' --license 'Source license'
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline probe extracted/terrain/ukraine/manifest.json
bun tools/terrain/install.ts --terrain extracted/terrain/ukraine --data-root "$HOME/Library/Application Support/usnf-atf/data" --replace
```

The WMS fetch caches requests of at most 3072×3072 with URL, bounding box and checksum;
larger atlases stitch pixel-aligned geographic tiles before reprojection.
the runtime uses only local files through Platform.fs. Imagery is reprojected
into the manifest CRS, rather than stretching a latitude/longitude rectangle.
Missing RGB coverage fails explicitly. Fetching a WMS JPEG emits rasterio's
expected missing-georeference warning before the requested WMS bounds are applied.

## Coastlines

Pipeline builds now apply bounded Chaikin corner-cut passes to the exteriors
of existing sea-level water polygons. The first cut is at most 25m; exteriors with at least 16 original vertices
get a second pass capped at 12.5 m. Each cut is at most one quarter of its edge. Theater clipping edges and repeated point-touch junctions
stay fixed. Interior rings remain unchanged, preserving every dry island hole;
inland river elevation-band joins remain unchanged. Water existence still comes
from the source mask, never from height. This softens 100m raster stairs without
claiming to recover a more accurate shoreline. Small islands can retain angular
edges; the image and mask come from different source dates/resolutions.

Existing unsmoothed generated manifests can be upgraded once:

```sh
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline smooth-coasts extracted/terrain/ukraine/manifest.json
```

Generated manifests use compact JSON to stay within the existing 32 MiB runtime
limit; the runtime vertex budgets are unchanged.

The marker prevents applying repeated cuts to an already-smoothed manifest.
The original generated Ukraine dataset is preserved locally; this pass uses
`extracted/terrain/ukraine-polished` for validation and installation.

## Panel boundaries and refinement

A shared boundary graph now makes fine edges follow the actual neighboring coarse
polyline. Equal-resolution vertices average shared heights and normals, including
independently quantized source chunks. Skirt tops follow the corrected surface.
Each source hierarchy has its own graph during a source fade. Graphs are rebuilt
when selected topology changes; boundary values settle over 250ms from the prior
graph where a prior boundary exists. Newly introduced points on an old edge sample
that old edge's interpolated values. This limits ownership pops while retaining
matching edges. Coarsening cannot preserve arbitrary old fine-edge curvature with
fewer vertices; this is not a claim of perfect temporal continuity at every switch.

The distance morph interval is widened from 2.0–2.8 to 1.4–2.8 patch spans,
retaining parent/child agreement at the mathematical split boundary. The existing
800ms screen-door source fade remains; differing source silhouettes can still
stipple during that fade. These source grids are not nested.

A controlled Odesa comparison reproduced the remaining ocean dashes with MSAA
and removed them with MSAA disabled. The renderer now uses a Three.js FXAA
post-process after the output-color pass, retaining antialiasing without the
multisample/logarithmic-depth interaction. The two post-process draws are counted.

Cache estimates include the atlas CPU pixels, estimated GPU mip chain and two
post-process color/depth targets (approximately 16 bytes per viewport pixel). Upload
estimates now include dynamic shared-edge buffers each frame, in addition to
new geometry and imagery. This changes the counter's scope: do not compare the
old geometry-creation-only number as if it included the same traffic. Neither
counter measures GPU DRAM bandwidth. Texture mip/driver allocation and transient
load/graph allocations remain estimates, not native memory measurements.

## Waypoint flight performance correction

The original paint/coast acceptance exercised the explorer. Practice-flight
teleports exposed a separate bottleneck: repeated collision queries scanned a
large fraction of the smoothed water polygon vertices at 120 Hz. GroundSampler
now uses bounded scanline indices over the original rings. It retains the exact
crossing expression, water elevations and dry-island holes. Index construction is
part of flight-layer initialization, not the first query after each jump.

Shared-edge buffers are now recomputed/uploaded only while ownership is settling
or a morph factor changes. A topology change constructs a new graph and resumes
updates. The upload estimate can therefore fall to zero while stationary; that
is expected rather than a frozen renderer. See the phase 3 baseline for repeated
waypoint performance and the before/after CPU profile scope.

Cold visits also exposed several hundred milliseconds of main-thread shoreline
triangulation. Water mesh triangulation now runs in one module worker, with at
most four outstanding batches. Completed arrays are transferred to the renderer;
obsolete destination results are discarded, teardown terminates the worker,
and selected failures remain explicit errors. Water remains pending until its
live geometry is ready. This preserves the same polygon triangulation and water
budgets without blocking flight input on the expensive polygon work.


## Higher-detail installed atlas

The 4× texture follow-up uses `--size 6144` and a separate theater copy at
`extracted/terrain/ukraine-4x`. It fetches four new 3072×3072 source tiles;
this is real additional imagery detail, unlike the earlier allocation experiment.
The installed atlas is 6142×6144 at 91.39 m/pixel, 82,195,217 compressed bytes.
It replaces the app-data theater; the earlier 3071×3072 copy is preserved under
`extracted/terrain/ukraine-polished`.
The default CLI size stays 3072 for smaller builds. Runtime and producer limits
now allow 6144 per axis and 152 MiB compressed; the renderer explicitly rejects
an atlas exceeding the current GPU's maximum texture size. The installed theater
is replaced only after all transport and height checks pass.
