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

Synthetic tests require no media. Integration tests read repo-relative
`gameassets/` and `extracted/`, and skip when their inputs are absent.
`USNF_GAMEASSETS` and `USNF_EXTRACTED` override those roots. Set
`USNF_SCRATCHPAD` to a folder holding an independent `usnf97_USNF_1.LIB`
slice to enable the byte-identity check. This suite runs separately from
`bun run check`; report skips explicitly.

Format notes: `Docs/formats/`.

## Decoder entry points

The unified `retail` CLI currently exposes only `list`, `extract`, `cat`, and
`stats`. Image, font, shape and data tools are separate modules. After extraction:

```sh
PYTHONPATH=tools/retail python3 -m retail.pic extracted/usnf97/USNF_1.LIB --all --pal extracted/usnf97/USNF_2.LIB/PALETTE.PAL -o extracted/png/usnf97
PYTHONPATH=tools/retail python3 -m retail.fnt extracted/usnf97/USNF_1.LIB --all -o extracted/png/fonts
PYTHONPATH=tools/retail python3 -m retail.pt extracted/usnf97/USNF_2.LIB/F14.PT
PYTHONPATH=tools/retail python3 -m retail.mission --theaters extracted/usnf97/USNF_2.LIB
mkdir -p extracted/obj
PYTHONPATH=tools/retail python3 -m retail.sh extracted/usnf97/USNF_2.LIB/F14.SH -o extracted/obj/F14.obj
```

SH is experimental: F-14 currently emits only eight faces from 105 parsed
polygons. A successful single-file exit does not mean the model is complete.
The batch SH command returns nonzero for stopped or zero-polygon shapes.
See [SH notes](../../Docs/formats/sh.md), the [review log](../../Docs/progress.md),
and [phase 0 baseline](../../Docs/baselines/phase-0.md) for coverage and next steps.
Keep all converted assets and previews under ignored `extracted/`.

### Neutral F-14 flight-test mesh

The bounded static SH projection restores the full nearest-detail USNF97 F-14
body and translated wings, with palette colors and its texture atlas:

```sh
PYTHONPATH=tools/retail python3 -m retail.sh_static extracted/usnf97/USNF_2.LIB/F14.SH --pal extracted/usnf97/USNF_2.LIB/PALETTE.PAL --out extracted/flight/f14.json
```

The output stays ignored and must be installed separately into local app data;
never copy it into `engine/public/` or package it. The export contains neutral
static geometry, not imported flight dynamics or recovered gear/hook animation.
See [SH notes](../../Docs/formats/sh.md) for the shared-buffer fix, structured
scope interpretation, JSON contract and remaining limits. The older OBJ/census
walker is still partial; use the static JSON route for this flight-test model.
