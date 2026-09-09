# Phase 2 baseline: real Ukraine terrain

Recorded 2026-09-08 on Apple M3, arm64, macOS 26.6.2 (25G83).
Python 3.14.6, rasterio 1.5.1, numpy 2.5.3, scipy 1.18.1; pinned environment in
`terrain-pipeline/requirements.txt`. Producer commit recorded by the build:
`48b01b8dfe0a4c15cbd71857fbe4c242001f992c`, pipeline clean; implementation
checkpoint `f229ad7`. This is public source terrain, not a synthetic fixture or
retail-derived map. Linux measurements remain pending.

## Reproduction and source

See [pipeline guide](../phase-2-pipeline.md) for venv creation and fetch commands.
Inputs are the official Copernicus GLO-30 2021 DEM and WBM TIFFs, fetched as
local windows into ignored `extracted/terrain-source/ukraine` (about 1.3 GiB).
`sources.json` records URLs and hashes. The configuration is committed in
`theaters/ukraine.json`: bbox 28–35°E, 44–49°N, 0.5° source padding, roughness
threshold 80 m. Local LAEA is centered at 31.5°E / 46.5°N.

```sh
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline build --config theaters/ukraine.json --source extracted/terrain-source/ukraine --output extracted/terrain/ukraine
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline probe extracted/terrain/ukraine/manifest.json
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline compare-compression extracted/terrain/ukraine/manifest.json
```

## Successful full build

Thirteen terrain pipeline tests pass, including source voids, integrity failures,
coverage gaps, dry-island holes and both observed real shared-edge regressions.

Build exit 0, 86.196 s with cached sources, including its final probe.
Every referenced chunk was subsequently checked by the TypeScript runtime
validator/decoder during installation, including SHA256, compressed/decompressed
size, metadata and elevation bounds. Installation exit 0 into this Mac's
`~/Library/Application Support/usnf-atf/data/terrains/ukraine`.

| Measurement | Result |
|---|---:|
| Projected width | 561,330.695 m |
| Projected height | 561,477.021 m |
| Total chunks | 832 |
| LOD 0 / 30 m | 229 |
| LOD 1 / 100 m | 529 |
| LOD 2 / 300 m | 64 |
| LOD 3 / 900 m | 9 |
| LOD 4 / 2700 m | 1 |
| Promoted base regions | 18 |
| Compressed height bytes | 71,245,197 |
| Raw quantized bytes | 109,051,904 |
| Compressed/raw ratio | 0.65331456 |
| Maximum shared-edge height difference | 0.02106996 m |
| Water components | 33,731 |
| Total exterior/interior ring points | 347,838 |
| Manifest JSON bytes | 24,907,069 |
| Referenced heights plus manifest | 96,152,266 bytes |

The maximum edge difference is below each pair's combined half-quantization
steps; the probe checks per-pair limits, not an arbitrary global allowance.
The 229 detail chunks cover roughly 4.2% of the possible fine grid, not the
brief's hypothetical 10%. The bounding box is a provisional development
extent; retail terrain/missions have not been geographically registered.

## Size decision

Keep deterministic gzip/u16 for v1: it supports direct browser decompression,
fixed output-size checks and simple integrity verification. The real-data
codec comparison is recorded in `extracted/terrain/ukraine/compression.json`;
see the pipeline guide for the comparison method. Final totals: **71,245,197 bytes
gzip, 61,493,257 PNG, 63,218,871 delta+gzip**. PNG saves about 14%, very different
from the smooth synthetic fixture's >3× delta advantage. Keep the simpler gzip
transport for this v1 artifact; the final totals are the regression reference.

The 96.2 MB combined artifact is below the brief's absolute 300–400 MB example,
but this theater is about 315,000 km² rather than 2,250,000 km². Scaling that
example by area alone suggests 42–56 MB, which this artifact exceeds. The
original budget was an estimate with different detail coverage; it is not a
measured size gate that this result automatically satisfies. Manifest encoding,
quantization precision and alternate codecs remain optimization options.

## Failures that changed the implementation

1. Synthesized ocean-cell bounds initially used integer-degree footprints;
   actual COG footprints are shifted after shared-border removal. A 15 m gap
   caused the source coverage check to fail. Correct footprints and provenance
   fixed it; download errors are never silently made ocean.
2. Independent GDAL warps produced different heights at identical shared
   coordinates. Fixed resampling scales resolved one pair, but the full probe
   found another. Detail borders and corners now use shared canonical queries,
   so partition-dependent interpolation cannot disagree across chunks. Tests
   retain both real regression pairs when local media are present.
3. Scanline water rectangles expanded to 80,660 bodies and a 34 MB manifest.
   Explicit interior rings reduced both while preserving islands. Runtime and
   Python limits now agree: 50,000 bodies, 100,000 points per body, 500,000 total.

Mac deliverable and every-chunk checks are verified. Remaining limits: 100 m
water-mask vectorization can omit narrow rivers; rivers use stepped elevation
bands; no airbase/objective registration or land-cover textures; Linux baseline
not recorded. These limits are separate from transport correctness.
