# Offline terrain pipeline

Implemented 2026-09-08. Phase numbering and acceptance remain owned by
[build-plan.md](build-plan.md). This implementation creates local open-data
terrain artifacts; synthetic validation does not close the real-theater or Linux gates.

## Reproduce on the Mac

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r terrain-pipeline/requirements.txt
PYTHONPATH=terrain-pipeline .venv/bin/python -m unittest discover -s terrain-pipeline/tests
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline fixture --output extracted/terrain/synthetic
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline fetch --config theaters/ukraine.json --output extracted/terrain-source/ukraine
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline build --config theaters/ukraine.json --source extracted/terrain-source/ukraine --output extracted/terrain/ukraine
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline probe extracted/terrain/ukraine/manifest.json
```

Python 3.14.6 on Apple Silicon successfully installed rasterio 1.5.1 / bundled
GDAL, numpy 2.5.3 and scipy 1.18.1 wheels. No system Python modifications,
Homebrew GDAL, uv, or new JavaScript dependencies were required. Exact resolved
versions are pinned in `terrain-pipeline/requirements.txt`.

`theaters/ukraine.json` defines an explicitly provisional bounding box
28–35°E, 44–49°N. This is not a georeferenced retail map; mission alignment
remains future work. Local LAEA is centered on that box. The output rectangle
bounds the projected box; source fetching includes 0.5° padding to cover
curved projected edges. Chunks outside the theater rectangle repeat boundary
heights and are clipped by the renderer.

## Sources and provenance

[Copernicus public AWS documentation](https://copernicus-dem-30m.s3.amazonaws.com/readme.html)
describes COG tile naming and absent ocean cells. DEM and AUXFILES/WBM TIFFs
are fetched anonymously from the official bucket. Example independently
verified WBM: [N46E030 mask](https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N46_00_E030_00_DEM/AUXFILES/Copernicus_DSM_COG_10_N46_00_E030_00_WBM.tif).
The [product handbook](https://dataspace.copernicus.eu/sites/default/files/media/files/2024-06/geo1988-copernicusdem-spe-002_producthandbook_i5.0.pdf)
defines mask categories: 0 land, 1 ocean, 2 lake, 3 river.

Correction from implementation research: the public bucket **does** contain
WBM under each tile's AUXFILES subdirectory, even though the short readme
focuses on DEM. An initial assumption that another water dataset was needed
was wrong; WorldCover is not required by this pipeline.

`fetch` caches only source windows at approximately 30 m angular resolution,
using nearest resampling to retain WBM classes. `sources.json` records URLs,
local SHA256 hashes and configuration. Existing cache bytes are verified by
`build`; an interrupted fetch writes a `.tmp` and cannot leave a partial TIFF
under its final name. A stale cache with a changed bbox requires a new source
folder. Local hashes establish reproducibility, not upstream authenticity.

Unlisted geocells are interpreted as ocean only for the Ukraine configuration,
where public DEM coverage is available; provenance explicitly marks those
cells and references `tileList.txt`. Other theater identifiers reject absent
cells pending review of ocean versus restricted coverage. Network failures for
listed cells abort. Arbitrary DEM voids fail unless the independent WBM says
ocean. Water class 0 is valid land, not nodata.

## Build decisions and remaining limits

- Chunks follow [terrain-contract.md](terrain-contract.md): 256 samples,
  255 intervals, shared borders, south-to-north rows, little-endian uint16,
  per-chunk offset/scale and SHA256 of gzip bytes.
- Base sampling is 100 m. The 300/900/2700 m grids are box-averaged and sampled from that base.
  Thirty-meter detail promotion uses standard deviation of source heights
  over each 25.5 km base tile and the configured threshold (80 m initially).
  A detail tile intersecting any promoted region is retained. This is tile
  roughness, not a slope detector; large smooth hills can promote too.
- Source warps are bounded to requested grids. The 100 m theater base and WBM
  stay in memory, but the entire 30 m theater is never materialized. Source
  rasters close deterministically. The probe retains only chunk borders.
- WBM is sampled at 100 m for polygon extraction. Ocean is flat at 0 m,
  lakes at the connected component's median DEM elevation. Rivers are split
  into 5 m elevation bands before component polygonization; the result is
  stepped flat segments, not a hydrologically modeled river surface.
  Heights are not destructively flattened into the terrain grid: water is
  a separate renderer surface. Narrow rivers below the mask grid can disappear.
- Polygon holes (islands) are preserved by decomposing a component into row
  rectangles because v1's polygon schema lacks interior rings. This can make
  large manifests and is a known optimization opportunity.
- Gzip level 9 with timestamp 0 is deterministic. The probe measures compressed
  and raw byte counts rather than claiming the design's 300–400 MB budget.
  Compression is lossless **after** height quantization; height error is at
  most half a quantization step. Adjacent chunks can differ by their combined
  half-step errors. Renderer skirts handle that tiny difference.
- Airbases/objectives require geographic source data and are not fabricated.
  CDN publication is intentionally absent; generated folders are local ignored
  data. Land-cover texturing and bathymetry remain unimplemented.

## Verification evidence

Initial synthetic fixture: 51×51 km analytic hills, an ocean inlet and a
240 m lake; 38 chunks (31/4/1/1/1 at LOD 0–4), 3,674,582 compressed bytes
versus 4,980,736 raw bytes, ratio 0.73775884. Maximum shared-border difference
0.0125691 m. Two water surfaces. This fixture does not estimate real Ukraine
compression or visual fidelity. Exact source revision and real-theater
measurements belong in `Docs/baselines/phase-2.md` after the source commit.

Eleven tests pass: deterministic encoding, quantization error, constant heights,
void rejection, compressed corruption, a deliberately mismatched seam with
valid internal metadata, path traversal, flat water elevations, missing base coverage, dry-island preservation, and actual
rasterio reprojection including valid mask-zero land and missing land DEM.
`rasterio.transform.from_origin` emits an upstream affine multiplication
PendingDeprecationWarning in the test fixture; it does not affect results.

Follow-up: coarse box filtering changes the synthetic compressed size to
3,674,863 bytes (ratio 0.73781525); the initial measurement above remains a
historical pre-filter baseline. Non-ocean water retains negative source
elevations; mask semantics take precedence over inferring ocean from height.

## Codec comparison

```sh
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline compare-compression extracted/terrain/ukraine/manifest.json
```

This measures gzip, lossless 16-bit PNG, and horizontal uint16 modular delta
followed by gzip over exactly the same quantized samples; outputs remain gzip
and the results are written to `compression.json`. The synthetic fixture gives
3,674,863 / 1,814,220 / 1,019,375 bytes respectively. Smooth analytic hills
favor prediction strongly, so this is not a real-theater compression decision.
Gzip remains the v1 contract for built-in browser decoding and checksum support;
changing transport requires a coordinated schema/decoder change. Record the
real-theater comparison before deciding whether that simplicity is worth its
measured size overhead.

## Real-data corrections (2026-09-08)

The first full build exposed two bugs synthetic hills could not reveal:

1. An absent ocean tile initially used whole-degree bounds, but the public COG
   pixel footprint is shifted west/north by half an arc-second. This left narrow
   water-mask gaps. The fetcher now synthesizes absent ocean tiles with the same
   shifted footprint; arbitrary source voids still fail. Existing tiny ocean
   cache files are regenerated on fetch, with new hashes.
2. Separate GDAL bilinear warps estimated slightly different resampling scales
   for neighbouring requests, causing an 8.49 mm raw shared-edge difference at
   Ukraine LOD0 tiles (60,5)/(60,6). Fixed `XSCALE=YSCALE=1` makes the source
   interpolation kernel independent of request extent. Coarse downsampling
   remains the explicit box filter on the base grid. A local Copernicus
   regression asserts exact raw shared-edge equality; it skips without inputs.

The first real mask produced 80,660 scanline rectangles, exceeding the runtime
limit. This invalidated the initial v1 rectangle strategy described above.
The coordinated contract now permits `waterBodies[].holes`: polygonization
preserves interior rings directly. Probe validation includes holes and matches
runtime limits (50,000 bodies, 100,000 points per body, 500,000 total points).
Original rings contain 33,731 real components, so the original 10,000-body cap
was also too small; increasing it preserves small water bodies without dropping
source geometry. Renderer spatial batching bounds active GPU work.
A synthetic ring test verifies the island remains a hole. Builds now print
elapsed progress for base, mask, polygonization, roughness, and chunk rows.
`build-info.json` records producer commit, whether pipeline source was dirty,
and elapsed generation time; a dirty build must not be attributed solely to HEAD.
