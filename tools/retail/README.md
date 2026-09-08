# retail: phase 0 format toolkit

Pure standard-library Python (3.11+). No third-party dependencies.

Run from the repo root without installing:

    PYTHONPATH=tools/retail python3 -m retail list    gameassets/usnf97
    PYTHONPATH=tools/retail python3 -m retail stats   gameassets/usnf97
    PYTHONPATH=tools/retail python3 -m retail cat     gameassets/usnf97 PALETTE.PAL > /dev/null
    PYTHONPATH=tools/retail python3 -m retail extract gameassets/usnf97 extracted/usnf97

Or install it editable into a virtualenv (`pip install -e tools/retail`),
which also provides a `retail` console script.

`<source>` may be a disc folder (`SETUP.ESA` + root `*.LIB`), an install
folder (just LIBs), a single `.LIB`, or a single `.ESA`. `cat` accepts a bare
name or `ARCHIVE/NAME`. `extract` writes `<outdir>/<archive>/<name>`,
decompressed, and exits non-zero if any entry failed (failures are listed on
stderr, never skipped silently).

Tests:

    python3 -m unittest discover -s tools/retail/tests

Unit tests use synthetic streams only. Integration tests read `/gameassets`
and skip when it is absent; set `USNF_SCRATCHPAD` to a folder holding an
independent `usnf97_USNF_1.LIB` slice to enable the byte-identity check.

Format notes: `Docs/formats/`.
