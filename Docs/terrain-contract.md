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
- waterBodies: array of {id, elevation, polygon: array of [x,z] pairs}

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
