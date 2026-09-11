# Salt Lake review — 2026-09-11

## Utah orientation correction — 2026-09-11

Same Linux/source identity below plus working changes. Runtime input now reflects
Salt Lake about its width, consistently across imagery/palettes, DEM, water holes,
shoreline points, practice deck/contact and navigation/teleport waypoints. Physics,
compass and sun directions are unchanged. Ukraine remains on the previous path.
Synthetic tests verify reversible map raster placement, reflected contact heights
and normals, dry islands, partial-edge mesh clipping, source LOD selection and
Denver's eastward bearing. The new world X of SLC is 642227.4857 m; Denver is
45284.4857 m. Smaller world X means east. CLI/camera X overrides now refer to this
runtime frame, so earlier source-X camera links should use width minus old X.

```sh
bun run check
bun run harness
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
systemd-run --user --unit=usnf-utah-orientation-review2 --same-dir /home/john/.bun/bin/bun tools/flight/salt-lake-smoke.ts
```

Checks: 458 passed, 3 existing local-import skips, 0 failed. Flight harness and
fresh build passed. Desktop script additionally asserts reflected waypoint X
positions before exercising all starts, paints, teleports and flight models.
Evidence: `extracted/salt-lake-review/`. No source data or installed atlases were
rewritten. Earlier baseline statements that Utah remains mirrored are superseded
by this section; the equivalent Ukraine migration is still outstanding.
Final desktop run exited 0 at 11:03:48 local, including satellite plus all four
seasonal textures, three waypoint teleports, all starts and all flight models.
No renderer errors. Inspected runway and Denver captures from the first run:
north-up geography and waypoint positions are corrected, and terrain remains
aligned with the flight deck and water. This is short launch/teleport evidence,
not a full terrain-edge traverse or sustained GPU benchmark.

## Satellite date cycle and white snow — 2026-09-11

Same source HEAD below plus working changes, Linux/Bun 1.4.2/Python 3.14.7.
Added viewer-local seasonal satellite uniforms, smooth calendar tint/snowline
interpolation and pure-white snow albedo. Shared snow JSON is used by Python
and the renderer; fixed seasonal maps were rebaked and verified-installed again.
Runtime snow is Salt Lake-specific; date tint also applies to other satellite
theaters. Satellite bytes, water and physical terrain are unchanged.

Verification commands:

```sh
bun run check
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
PYTHONPATH=terrain-pipeline .venv/bin/python -m unittest discover -s terrain-pipeline/tests
# Repeat the elevation-snow bake/install commands below with the updated white JSON.
systemd-run --user --unit=usnf-seasonal-satellite-review4 --same-dir /home/john/.bun/bin/bun tools/flight/seasonal-satellite-smoke.ts
```

The fixed-camera test uses satellite mode over mountain terrain, sets four dates
through the real date input and asserts the resulting calendar/paint diagnostics.
Evidence lives in `extracted/seasonal-satellite-review/`. The initial test failed
because its URL used unsupported YYYY-MM-DD rather than MM-DD. The second exposed
the test's Gregorian day count mismatch with the environment's deliberately
366-day authoring calendar; the test and seasonal wrap now use that convention.
Neither failed run is claimed as visual acceptance.

The third live run passed and its winter/summer screenshots were inspected.
It revealed too much beige in winter's lit snow despite white albedo; a snow-only
90% white balance and 1.4 brightness multiplier now run before fog/tone mapping.
This preserves relative relief and does not add an emissive minimum.

Final checks: `bun run check` 451 passed / 3 existing local-import skips / 0 failed;
Python 36 passed / 1 existing source-dependent skip. Fresh build succeeded. Fourth
desktop run exited 0 at 10:02:21 local with all four date assertions and no renderer
errors. Inspected updated winter/spring captures: snow now reads bright white,
with darker shaded relief, and retreats to higher terrain in spring. This short
fixed-camera run is not a sustained GPU benchmark or a full flight regression.

Snow remains normally lit (not emissive); pre-existing satellite shadows and
source-date snow below the authored snowline are not removed. RGB-based vegetation
masking and annual tint anchors are artistic, not measured phenology. Seasonal
bake selectors remain fixed rather than double-applying the satellite shader.

## Elevation snow follow-up — 2026-09-11

Same source HEAD below plus working changes; Linux, Python 3.14.7, Bun 1.4.2.
Added optional `--snow` color-bake rules and installed four updated 1024×409 maps
(2,361,781 compressed bytes total). Existing base weights are unchanged; terrain,
water, satellite atlas and flight code are unchanged by this follow-up.

```sh
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline color-maps extracted/terrain/salt-lake/manifest.json --weights extracted/terrain/salt-lake/color-maps/weights.npz --palettes extracted/terrain/salt-lake/color-maps/palettes.json --snow theaters/salt-lake-snow.json
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline probe extracted/terrain/salt-lake/manifest.json
bun tools/terrain/install.ts --terrain extracted/terrain/salt-lake --data-root /home/john/.config/USNF-ATF/data --replace
PYTHONPATH=terrain-pipeline .venv/bin/python -m unittest discover -s terrain-pipeline/tests
systemd-run --user --unit=usnf-salt-lake-snow-review --same-dir /home/john/.bun/bin/bun tools/flight/salt-lake-smoke.ts
```

Python: 36 passed, 1 existing source-dependent skip. Tests cover seasonal ordering,
smooth transitions, permanent override, bad bands, DEM registration/missing coverage,
unchanged geometry/water and identical snow rebakes without satellite pixels.
Probe and verified install passed; desktop smoke exited 0 at 09:46:34 local,
loading every seasonal map and exercising starts, teleports and all flight models.
Existing unpackaged renderer reused: this change only modifies offline data/Python.
The smoke captures are load/flight evidence, not a mountain snowline visual survey.
See the color authoring guide for current bands and resolution/realism limits.

## Earlier palette-only review

Linux/Omarchy, Bun 1.4.2, Python 3.14, Electron 44.2.0; source HEAD
`aa530d0c0cfada24d27594dbe345d2a2bcde5895` plus the current uncommitted changes.
Fresh unpackaged renderer at 2560×1440; F-14 local PT profile, calm wind, clouds off.

Commands:

```sh
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline color-maps extracted/terrain/salt-lake/manifest.json --size 1024
PYTHONPATH=terrain-pipeline .venv/bin/python -m pipeline probe extracted/terrain/salt-lake/manifest.json
bun tools/terrain/install.ts --terrain extracted/terrain/salt-lake --data-root /home/john/.config/USNF-ATF/data --replace
bun tools/flight/salt-lake-ground.ts
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
bun tools/flight/salt-lake-smoke.ts
bun run check
bun run harness
PYTHONPATH=terrain-pipeline .venv/bin/python -m unittest discover -s terrain-pipeline/tests
```

Four seasonal atlases are 1024×409, total compressed size about 2.15 MB. Source is
the direct Sentinel atlas SHA-256 `74c2e6bfd79e86845a952cbb2acc6ae79189260ceb27265ebcfbe10436e4878e`.
DEM probe: 4,666 chunks, 12,747 water bodies, maximum shared edge error 0.03936 m.
Runtime transport validation passed for the installed imagery and every palette.

The previous runway failed actual water classification on six of 370 samples.
The accepted strip at (221030,179304) has no wet samples and heights
1285.114–1287.505 m under a 1288 m deck. It is an authored north/south practice
strip, not a surveyed reconstruction of airport runway markings/alignment.

Desktop checks cover runway, approach, airborne links, all seasonal paint loads,
three waypoint teleports, all three flight-model selections retaining the theater,
and initial 400-mile range. Settled captures and complete
diagnostics are in `extracted/salt-lake-review/`. The renderer reported no uncaught
errors and no omitted water batches. Short settled waypoint diagnostic averages
were about 17–19 ms per frame; this is not a sustained performance benchmark.

`bun run check`: 448 pass, 3 existing local-import-dependent skips. Python:
34 pass, 1 existing source-dependent skip. Flight harness passed.

Known limits: shared world coordinates still mirror geographic east/west, as
documented in environment-plan.md (Denver appears left of Salt Lake in north-up).
Correcting that requires coordinated renderer, contact and navigation conversion;
it is not repaired by this terrain/color/zoom pass. The theater is 863×345 km;
a 400-mile square display consequently includes uncovered space north/south.
Seasonal maps are artistic RGB class palettes, not seasonal satellite observations
or physical snow simulation. No complete cross-theater sortie/landing certification
or sustained GPU performance claim is made by the short desktop checks.
