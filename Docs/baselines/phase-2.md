# Phase 2 baseline: real Ukraine terrain

## 2026-09-09: reusable appearance weights and seasonal maps

The `color-maps` producer now writes four 1024² RGBA seasonal maps, a reusable
four-channel uint8 appearance-weight archive, editable hex palettes and provenance.
The generated Ukraine trial is installed. All 30 Python tests and the full
832-chunk/palette probe pass. Exact source identity, hashes, commands, review
corrections and desktop evidence are in the [phase 3 baseline](phase-3.md).
These are artistic appearance weights; physical terrain/water remain unchanged.

## 2026-09-09: optional coastal texture repair

Added and installed the offline `paint-coasts` pass after the direct Sentinel bake.
Source identity, full commands, pixel counts, accepted atlas hash, tests/probe and
visual limitations are recorded in the [phase 3 coastal padding baseline](phase-3.md).
All 26 Python tests and the 832-chunk probe pass. Heights and water polygons are
unchanged; the pass synthesizes only bounded coastal underlay colors.

## 2026-09-09: direct Sentinel-2 imagery pipeline

See [phase3 direct Sentinel bake](phase-3.md#2026-09-09-installed-direct-sentinel-2-bake)
for exact source snapshot, commands, provenance and quality limits. Native10m RGB
COGs /20m SCL are mosaicked into6142×6144 projected paint (~91.39m/pixel), with
native-mask aggregation, temporal-agreement fallback and bounded residual color
interpolation. All832 DEM chunks and water polygons remain unchanged. Real probe
and verified app-data installation pass. Downloaded/cached imagery remains ignored.
Machine: Mac M3/Python3.14.6; Linux deferred. This supersedes the earlier EOX source
for the installed theater, without changing old datasets' licenses.


## 2026-09-09: real four-times-pixel atlas installed

Source **9658fd8**. See [phase 3 installed imagery](phase-3.md#2026-09-09-installed-higher-detail-imagery)
for exact commands, source/checksums and packaged results. Four bounded WMS tiles
produce 6142×6144 projected imagery (~91.39 m/pixel), 82,195,217 compressed bytes.
All 832 DEM chunks and smoothed water polygons are unchanged. Pipeline tests:
16 pass, no skips; real dataset probe and verified app-data installation pass.
Mac M3/Python 3.14.6; Linux remains deferred. Source imagery remains ignored.


## 2026-09-09: imagery and bounded coastline follow-up

Same Apple M3/macOS 26.6.2, Python 3.14.6 environment and uncommitted source scope
recorded in [phase 3 baseline](phase-3.md). Base commit 4e3f226; code/test source-map
SHA-256 aaf6bb009de2a154439bd4ed6a766e35ff315f34bfb79d7547cc3d8fd76314e4.
This is a polish of the existing real Ukraine build, not a new DEM fetch/build.
All 832 original chunk metadata/bytes are retained. The preserved original is
`extracted/terrain/ukraine`; output is `extracted/terrain/ukraine-polished`.

Commands: `PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline smooth-coasts
extracted/terrain/ukraine-polished/manifest.json` starting from the original
manifest; `PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline imagery
extracted/terrain/ukraine-polished/manifest.json --cache
extracted/terrain-source/imagery --size 3072`; then the exact probe/test commands
in the phase 3 entry. Coast algorithm was revised to two bounded passes and the
final manifest regenerated from preserved original polygons; the smoothing marker
prevents accidentally applying the algorithm twice to already-smoothed polygons.

Probe passes every 832 chunks: 71,245,197 compressed height bytes, 109,051,904 raw bytes,
maximum shared-border disagreement 0.021069959933129212m within the existing
quantization tolerance. 33,731 water bodies, 492,147 total water vertices including
unchanged dry holes, within the existing 500,000 guard. Compact manifest 12,277,911 bytes
passes the 32 MiB guard; an earlier indented output failed and was corrected.

EOX Sentinel-2 cloudless 2024 atlas: 3071×3072, 182.7843×182.7725 m/pixel,
21,045,384 compressed RGBA bytes,37,736,448 raw RGBA bytes. Compressed SHA-256:
299980f77cbc38f77dd416b92f05b070e3c2f51f2000cdc1886ca549b04cdaec.
`imagery-info.json` and cached EOX JSON retain source URL, bounds, raster checksum,
license and attribution. Geography is reprojected into manifest LAEA; rows run
south-to-north. Synthetic RGB orientation and missing-coverage tests pass.

Python suite: 15 tests, no failures/skips (local Copernicus source available).
No new dependencies. WMS JPEG ingestion emits the expected missing-georeference
warning before the known WMS bounds are assigned. Rasterio emits Affine
PendingDeprecationWarnings. Original raster water classification is unchanged;
only existing sea-level exterior rings are cut. Dry holes remain unchanged.

Next step: use installed terrain for visual acceptance; rebuild/fetch finer
imagery only if the intentionally low-resolution paint is insufficient. Source
provider terms and repeatable workflow are in [terrain polish](../terrain-polish.md).
Linux baseline remains deferred.


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
