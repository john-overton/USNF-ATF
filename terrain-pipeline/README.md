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
