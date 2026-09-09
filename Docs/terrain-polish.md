# Terrain paint, coast and panel polish — 2026-09-09

This is a phase 2/3 follow-up, not a new phase. The preserved assisted flight physics is unchanged; the contact sampler now uses
an exact water index to avoid repeated full-coast scans. Measurements and source scope
are in [phase 3 baseline](baselines/phase-3.md).

## Current source: direct Sentinel-2 bake

The default imagery source is now direct Sentinel-2 L2A true-color COGs, accessed
through Element 84 Earth Search / AWS Open Data. Source RGB is 10 m; the installed
atlas target stays 6142×6144 (~91.39 m per pixel). The offline pipeline selects
June–August 2024 scenes with <5% scene-level cloud cover, ranks coverage/clarity,
then conservatively projects the native cloud/shadow/snow mask with maximum
aggregation and adds a one-output-pixel safety margin.
It fills missing clear pixels from up to six ranked scenes per MGRS tile. Persistent
mask gaps may use a separately recorded temporal-agreement fallback: at least three
distinct dates must each be within 12/255 of the per-channel median. This lower-confidence
fallback is not proof that the scene classifier was wrong. The pipeline reprojects
into the terrain CRS, and bakes a local RGBA texture. It uses COG overviews instead
of transferring every 10 m pixel only to downsample it. Acquisition-date and color
differences can remain; this is not a claim of EOX-quality seamless compositing.

Residual color gaps may be interpolated only when they total at most 0.5% of land
and every gap is within six output pixels of valid color. Larger uncovered areas
fail the build; interpolation counts and maximum radius are recorded separately. Only existing manifest water polygons may
supply flat water color where satellite coverage is missing. It never fills land
by assuming sea level. Scene IDs, URLs, acquisition dates, cache checksums and
processing choices stay in the ignored source cache/provenance. Gameplay uses
local files only, with no imagery-service calls.

```sh
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline imagery extracted/terrain/ukraine-sentinel/manifest.json --provider sentinel --cache extracted/terrain-source/sentinel-2 --size 6144
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline probe extracted/terrain/ukraine-sentinel/manifest.json
bun tools/terrain/install.ts --terrain extracted/terrain/ukraine-sentinel --data-root "$HOME/Library/Application Support/usnf-atf/data" --replace
```

Credit: **Contains modified Copernicus Sentinel data 2024**, in
[ATTRIBUTIONS.md](../ATTRIBUTIONS.md), About / Data credits and the manifest.
The direct dataset uses `attributionDisplay: "credits"`, so no permanent overlay.
[Copernicus legal notice](https://cds.climate.copernicus.eu/licences/ec-sentinel),
[ESA band resolutions](https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2/Instrument),
[public COG collection](https://registry.opendata.aws/sentinel-2-l2a-cogs/).
Elevation remains Copernicus DEM GLO-30; Sentinel-2 provides imagery, not heights.

## Earlier EOX imagery choice and scale


Optional imagery now paints terrain in projected world coordinates. One shared
atlas covers the theater, so its registration does not change with patch/source
LOD, camera movement or floating-origin rebasing. It has no map labels or road
overlays. Photographed roads remain part of satellite imagery.

The earlier offline command used the EOX Sentinel-2 cloudless 2024 mosaic. EOX permits
non-commercial use under CC BY-NC-SA 4.0, with attribution and license retained.
The app displays its source attribution even with the flight helper minimized;
full license notices are in the helper’s Data credits disclosure and root
[ATTRIBUTIONS.md](../ATTRIBUTIONS.md). Imagery
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
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline imagery extracted/terrain/ukraine/manifest.json --provider eox --cache extracted/terrain-source/imagery --size 3072
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


## View distance and fog

Current range is `clamp(worldAltitude * 16, 24000, 300000)` metres. Fog fades
from `range * 0.825` to `range`, with far clipping at `range * 1.2`. For example,
3 km world altitude selects 48 km of terrain, with fog from 39.6 to 48 km.
This doubles the former view range and halves the fade band's proportional width.
Coverage still obeys the source/chunk budget and may use coarser sources at high
altitude. Water is bounded to 1024 batches / 32 MiB to accommodate the larger range;
worker concurrency remains four.
