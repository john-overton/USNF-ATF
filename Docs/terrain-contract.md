# Terrain v1 integration contract

Working contract for phase 2/3 implementation, 2026-09-08. Pipeline and engine
must agree; changes require coordination between their owners.

Coordinates are local projected meters: x east, z north, y elevation. Manifest
projection contains a PROJ CRS plus originX/originY in that CRS. Chunk rows run
south to north; columns west to east. Each tile has 256×256 samples, spans 255
sample intervals, and shares its border samples with neighbours. LOD spacings
are 30, 100, 300, 900, 2700 meters; 30→100 is not a factor of three.

Manifest JSON schemaVersion 1:

- id, name: strings
- projection: {crs, originX, originY}
- extents: {width, height} meters from local origin (0,0)
- lods: array of numeric levels present (0..4)
- attribution: array of strings; source: string (explicitly identifies synthetic fixtures)
- chunks: array of {lod, x, y, path, originX, originZ, spacing, size, offset, scale,
  minElevation, maxElevation, byteLength, sha256}
- imagery?: {path, width, height, byteLength, sha256, attribution, license}
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
