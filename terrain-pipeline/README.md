# Terrain pipeline

Offline Python tools for Copernicus GLO-30 DEM and its water body mask. On this
Mac, run from the repository root with the project virtual environment:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r terrain-pipeline/requirements.txt
PYTHONPATH=terrain-pipeline .venv/bin/python -m unittest discover -s terrain-pipeline/tests
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline fetch --config theaters/ukraine.json --output extracted/terrain-source/ukraine
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline build --config theaters/ukraine.json --source extracted/terrain-source/ukraine --output extracted/terrain/ukraine
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline probe extracted/terrain/ukraine/manifest.json
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline compare-compression extracted/terrain/ukraine/manifest.json
```

For a quick original synthetic dataset, replace fetch/build with
`PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline fixture --output extracted/terrain/synthetic`.
Generated source/chunk folders stay ignored. A build prints elapsed stage/row
progress and fails on uncovered land, corruption, seams, or runtime water limits.

See [implementation, source attribution, and limitations](../Docs/phase-2-pipeline.md)
and [terrain contract](../Docs/terrain-contract.md). The media-dependent seam
regression skips explicitly when local downloaded Copernicus inputs are absent.

## Optional satellite paint and coast polish

Builds apply bounded sea-level water exterior smoothing with dry holes retained.
Existing generated datasets can use `python -m pipeline smooth-coasts <manifest>`
once. `python -m pipeline imagery <manifest> --cache extracted/terrain-source/imagery`
now defaults to direct Sentinel-2 L2A COGs (`--provider sentinel`), selecting
summer 2024 low-cloud scenes, masking clouds/shadows, mosaicking clear pixels,
and baking a projected local atlas. `--provider eox` retains the earlier EOX
cloudless source as an explicit option. `--source <rgb.tif> --attribution <credit> --license <license>` accepts a
local raster instead. The default longer side is 3072 pixels (`--size`, cap 6144).
Manifest JSON is compact to preserve the existing 32 MiB runtime limit. Full
commands, source terms and resolution limits are in[terrain polish](../Docs/terrain-polish.md).

After baking imagery, run the optional texture cleanup on a copy of the dataset:

```sh
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline paint-coasts extracted/terrain/ukraine-sentinel-coast/manifest.json
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline probe extracted/terrain/ukraine-sentinel-coast/manifest.json
```

`paint-coasts` extends interior land colors across coastal texture mismatches.
Defaults: `--inland 200 --feather 100 --offshore 3000` (metres). The offshore
padding covers terrain exposed by coarse elevation meshes; water geometry still
covers the underlay where it can. Samples reflect into the land interior to avoid
long stretched color stripes, with nearest-interior fallback. Donors must belong
to the same connected land area as the nearest shore, excluding lakes and rivers.
Narrow islands without a 300 m interior remain unchanged. This is synthetic color
repair, not shoreline measurement: polygons, elevations and flight contact remain
unchanged. Some distant geometric coast steps and small-island fringes remain.
The pass records its input hash and parameters in `coastPaint` and imagery-info,
and rejects a repeated pass. Rebaking `imagery` clears this marker; retain the
original dataset to change cleanup settings. Texture dimensions and runtime work
are unchanged.

## Seasonal color maps

`python -m pipeline color-maps <manifest> --size 1024` creates four compact seasonal
RGBA maps plus reusable appearance weights and editable hex palettes.
`--weights <weights.npz> --palettes <palettes.json>` rebakes those values without
reading satellite pixels. The app's Ground colors selector loads one map at a
time. See [color-map workflow and shoreline proposal](../Docs/terrain-colors.md).

### Shoreline materials

`python -m pipeline shorelines <manifest.json> [--overrides <JSON>]` writes shared
landward ribbon cross-sections and approximate beach/rock/cliff/marsh/unknown
classes. It reads the existing imagery and LOD 1 heights without network access;
water and height records stay unchanged. Run on an isolated dataset copy, probe,
then install. `shorelines/overrides.json` and `provenance.json` remain authoring
files; the gzip document is runtime data. Detailed commands, material generation,
confidence and first-pass limits are in [terrain colors](../Docs/terrain-colors.md).
