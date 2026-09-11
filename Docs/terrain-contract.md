# Terrain v1 integration contract

Working contract for phase 2/3 implementation, 2026-09-08. Pipeline and engine
must agree; changes require coordination between their owners.

Coordinates are local projected meters: x east, z north, y elevation. Manifest
projection contains a PROJ CRS plus originX/originY in that CRS. Chunk rows run
south to north; columns west to east. Each tile has 256×256 samples, spans 255
sample intervals, and shares its border samples with neighbours. LOD spacings
are 30, 100, 300, 900, 2700 meters; 30→100 is not a factor of three.

Runtime Utah adapter (2026-09-11): the stored v1 contract above is unchanged.
Salt Lake is reflected on input to the flight world's west-positive X using
`worldX = width - sourceX`. Runtime chunk origins can consequently be negative
at the partial eastern edge; source tile indices and compressed hashes remain
the original values. Only the tagged runtime chunk objects reverse decoded
columns. Viewer/navigation loaders opt in; installer/parser validation remains
over raw source metadata. Runtime objects must not be serialized as source
manifests. Authored theater positions are source coordinates converted on use.

Manifest JSON schemaVersion 1:

- id, name: strings
- projection: {crs, originX, originY}
- extents: {width, height} meters from local origin (0,0)
- lods: array of numeric levels present (0..4)
- attribution: array of strings; source: string (explicitly identifies synthetic fixtures)
- chunks: array of {lod, x, y, path, originX, originZ, spacing, size, offset, scale,
  minElevation, maxElevation, byteLength, sha256}
- imagery?: {path, width, height, byteLength, sha256, attribution, license}
- colorMaps?: partial object keyed by summer/spring/autumn/winter, each using the imagery record including attributionDisplay; all paths are distinct from chunks, manifest and other images
- coastPaint?: producer-only texture repair provenance (method, metre distances, input atlas hash, changed/skipped pixel counts; runtime ignores this metadata)
- coastSmoothing?: producer provenance (method, passes, cut distances; runtime ignores this metadata)
- waterBodies: array of {id, elevation, polygon: array of [x,z] pairs,
  holes?: array of interior rings (each an array of [x,z] pairs)}

Chunk x/y are integer tile coordinates within each LOD; originX/originZ are
local southwest sample coordinates. size=256. path is relative to manifest
folder. Files are gzip-compressed unsigned 16-bit little-endian samples in row
order. Elevation = offset + sample*scale. Each chunk's offset/scale are in the
manifest, which serves as its header/index. sha256 is of compressed bytes.
No embedded retail data. Void source pixels must fail building, never silently
turn into zero-height land. Water derives from source mask, not height alone.

The pipeline owns Python build/fetch/probe commands and source-data provenance.
The engine owns runtime JSON validation, chunk validation/loading and display.
Gzip is a provisional transport to measure against alternatives; record size
before finalizing its use. Browser loading uses Platform.fs assets by default;
Electron may use appData for externally staged terrain. Renderer can select a
manifest path/root via its UI or URL without filesystem access outside Platform.

Water rings preserve dry islands explicitly. The initial row-rectangle
decomposition created 80,660 surfaces in the first Ukraine run; hole rings
avoid duplicating a water body into thousands of drawables. The renderer loads
water geometry within the visible horizon and accounts for its memory budget.

## Optional paint atlas (2026-09-09)

Imagery is gzip-compressed, interleaved RGBA8 (sRGB color, opaque alpha), with
width×height×4 inflated bytes. Dimensions are integers 2..6144; compressed length
is bounded to 152MiB and verified with SHA-256. Rows run south to north, columns
west to east. Pixels are area cells: pixel centres map to ((i+0.5)/width,
(j+0.5)/height) of the full projected theater extents. Render UV=(worldX/widthMeters,
worldZ/heightMeters); all LODs use this same registration. Edge sampling clamps.
No implicit latitude/longitude stretching or per-panel texture origin.

The path is safe and manifest-relative, cannot conflict with the manifest or a
chunk, and is copied/revalidated by the terrain installer. Missing imagery files,
corrupt transport or invalid inflated dimensions fail a declared imagery load.
Absent imagery retains original elevation colors. Producers require full RGB
coverage and explicit source attribution/license; runtime displays these credits.

Coast smoothing cuts only existing sea-level polygon exteriors. Dry interior
rings, clipped theater edges and repeated point-touch junctions are fixed. A
25m pass is followed by a 12.5m pass on exteriors with at least 16 original points;
each cut is also limited to one quarter of its adjacent edge. Existing runtime
body/point budgets remain enforced. This is mask-derived visualization polish,
not a claim of newly surveyed shoreline accuracy.


Imagery may declare `attributionDisplay: "overlay" | "credits"`. Omission defaults
to `overlay` for existing datasets. `credits` retains full source/license notices
in About / Data credits and the manifest while omitting the permanent imagery line.
The producer chooses this according to source terms; it is not a runtime license
waiver. Direct Sentinel composites use `credits`; EOX datasets keep `overlay`.

Seasonal color maps use the same RGBA transport, projection, checksums and credit
validation as imagery. The producer defaults to 1024-axis maps (cap 2048); runtime
uses the existing 6144 image limit. Only the selected image is loaded. Authoring
weights/palettes/provenance are offline files, not renderer inputs. Missing or
corrupt declared palette files fail installer validation. See [color maps](terrain-colors.md).

Optional elevation-based snow is baked into the same seasonal RGBA bytes; it
adds no runtime contract fields or changes to heights/water/contact. Its seasonal
and permanent elevation rules and DEM digest are offline provenance only.


## Optional shoreline ribbons (v1)

`shorelines` is an optional object with `path`, compressed `byteLength`,
`decodedBytes`, and lowercase `sha256`. The safe relative path must not conflict
with chunks, imagery, palettes or the manifest. Compressed bytes are capped at
32 MiB and inflated JSON at 64 MiB. Installer and renderer validate transport;
the Python probe also checks the shoreline document. Legacy manifests omit it.

The JSON has `version: 1`, `kinds: ["unknown","beach","rock","cliff","marsh"]`,
and `rings: [{id, points}]`. IDs are unique; at most 50,000 rings and 300,000 total
points are accepted. Each point is `[x,z,inlandX,inlandZ,distanceMeters,kind,confidence]`.
Coordinates are finite, within theater extents, and cross-sections at most 200 m.
Distance starts at zero, is nondecreasing and at most 100,000,000 m; kind is an
integer 0–4 and confidence is 0–1. Rings have at least four points and close with
the same coordinates/class/confidence and a final cumulative distance. Generated
coast coordinates retain source precision. The shorelines contain appearance data,
not physical elevation or a replacement water classification.

Authoring provenance and overrides stay in the generated source dataset. Only the
referenced gzip runtime document is installed. See [terrain colors](terrain-colors.md)
for width rules, confidence, original material swatches, visual bank faces and
conservative local coverage masks.
