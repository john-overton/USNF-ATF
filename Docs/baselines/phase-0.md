# Phase 0 baseline: retail toolkit review

- Date: 2026-09-08
- Source commit: `31f733e2e73bae522b550a562e54573ec7805b79`
- Machine: Apple M3, arm64, macOS 26.6.2 (25G83)
- Python: 3.14.6; toolkit requires 3.11+, but that minimum was not rerun here.
- Inputs: both local retail disc folders and their existing extracted trees.
- Scope: tests and read-only parser/export census; no visual model acceptance.

## Tests

```sh
python3 -m unittest discover -s tools/retail/tests
```

Exit 0; **52 tests run in 63.067 s, one skipped** (51 passed).
The skipped independent byte-identity comparison needs `USNF_SCRATCHPAD` with
`usnf97_USNF_1.LIB`. Both discs were present, so retail integration tests ran.
Archive-handle `ResourceWarning`s appeared; passing tests do not resolve cleanup.

The suite validates declared decompressed lengths for every LIB entry and PKWA
ESA entry on the available discs. Length agreement is not an independent byte
oracle; the missing scratchpad comparison remains a distinct verification gap.

## Container scope correction

| Count | USNF'97 | ATF Gold |
|---|---:|---:|
| DCL streams in the two main embedded LIBs | 3,271 | 5,142 |
| DCL streams in all LIBs, including disc-root archives | 3,965 | 6,070 |
| PKWA ESA entries | 13 | 14 |
| All ESA entries (including stored) | 16 | 18 |
| PIC entries across the whole disc | 1,665 | 2,518 |

The earlier log's 8,413 LIB figure covered the main embedded LIBs only. The
all-disc compressed LIB total is **10,035**, plus 27 compressed ESA entries
(counted separately). PIC inventory is **4,183**; inventory is not itself visual
or palette-correctness validation. The integration suite covers 4,140 PICs,
excluding USNF_8 (21) and ATF_4C (22). A separate read-only `load_pic` census
successfully decoded all 4,183 with no exceptions: USNF 0.408 s, ATF 0.630 s
(warm filesystem; no PNG serialization or visual inspection). Reproduce:

```sh
PYTHONPATH=tools/retail python3 - <<'PYPIC'
from pathlib import Path
from time import perf_counter
from retail.pic import load_pic

for title in ('usnf97', 'atf-gold'):
    files = sorted((Path('extracted') / title).rglob('*.PIC'))
    if not files:
        raise SystemExit(f'No extracted PIC inputs for {title}')
    start = perf_counter()
    for path in files:
        load_pic(str(path))
    print(title, len(files), f'{perf_counter() - start:.3f}s')
PYPIC
```

## SH census

Read-only parse plus in-memory OBJ serialization, warm filesystem, one sample
per title. Timings exclude extraction and writing/viewing OBJ files.

| Measure | USNF'97 | ATF Gold |
|---|---:|---:|
| SH files | 353 | 1,043 |
| With polygons and no stops | 316 | 980 |
| No polygons, no stops | 35 | 59 |
| With stops | 2 | 4 |
| Parse exceptions | 0 | 0 |
| Parsed polygons | 5,348 | 21,693 |
| Emitted OBJ faces | 4,023 | 14,734 |
| Elapsed seconds | 0.096 | 0.419 |

USNF stops: `F8.SH` (`0x6e`), `SUN.SH` (`0x13`). ATF also has
`SMOKE.SH` and `CHAFF.SH` (`0xe8`). This is parser coverage, not model parity.

F-14: 34 tables, 533 vertices, 105 polygons, 8 emitted faces. 96 polygons have
out-of-range indices for their assigned table; one has no table. See
[SH notes](../formats/sh.md) for the indexing hypothesis and next experiment.

Reproduce the SH census from the repository root (no output assets written):

```sh
PYTHONPATH=tools/retail python3 - <<'PY'
from pathlib import Path
from time import perf_counter
from retail import sh

for title in ('usnf97', 'atf-gold'):
    files = sorted((Path('extracted') / title).rglob('*.SH'))
    if not files:
        raise SystemExit(f'No extracted SH inputs for {title}')
    counts = dict(files=len(files), complete_walk=0, zero_polys=0,
                  stopped=0, exceptions=0, polygons=0, faces=0)
    start = perf_counter()
    for path in files:
        try:
            shape = sh.load(str(path))
            obj = sh.to_obj(shape)
            counts['polygons'] += len(shape.polys)
            counts['faces'] += sum(line.startswith('f ') for line in obj.splitlines())
            category = 'stopped' if shape.stops else ('complete_walk' if shape.polys else 'zero_polys')
            counts[category] += 1
        except Exception as exc:
            counts['exceptions'] += 1
            print(path.name, type(exc).__name__)
    print(title, counts, f'{perf_counter() - start:.3f}s')
PY
```

For all-disc inventory, run `PYTHONPATH=tools/retail python3 -m retail stats gameassets/usnf97` and repeat for `gameassets/atf-gold`. Reruns should record
new timings and source commit rather than replacing this dated measurement.

## Exit status

Phase 0 remains open: no recognizable F-14 viewer result, no unified disc-to-
listing/PNG/OBJ command, and no SH regression tests. PT field identification
is documented, but runtime flight behaviour has not been validated. Linux has
not been measured. This baseline supplies evidence, not phase completion.

Documentation validation reran both embedded census snippets successfully: all
counts matched. Second warm samples were PIC 0.339 / 0.564 s and SH 0.078 /
0.370 s (USNF / ATF). These small variations are not performance regressions.
