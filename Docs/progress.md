# Progress

Current status and append-only engineering log against [build-plan.md](build-plan.md).
Newest entry first. Update the snapshot and add an entry for meaningful port work;
keep commands, evidence, uncertainty, and a concrete next step. Baselines live in
[baselines/](baselines/). The design brief describes the intended product.

## Current snapshot — development 2026-09-08

| Phase | Implemented | Acceptance / remaining work |
|---|---|---|
| 0: retail toolkit | Containers, images/fonts and data readers; partial SH | F-14 export and integrated deliverable remain open; unchanged this development pass |
| 1: scaffold and shell | Dev lifecycle/asset fixes, platform contract tests, fresh probe, Mac packaging | macOS tested including DMG launch; Linux hardware/build/checks pending |
| 2: terrain pipeline | Copernicus DEM/WBM fetch, LAEA warp, roughness-selected 30m detail, filtered 100–2700m chunks, quantization, checksums, probe and codec comparison | Real Ukraine build and every-chunk probe pass; installed locally. Linux baseline pending |
| 3: terrain renderer | Streaming, quadtree patches with height morph, floating origin, free camera, water cache/holes, diagnostics | Packaged real coast and 30m mountain-detail runs ~60 fps at 1440p on Mac. Linux, real DRAM counters and transition polish remain open |
| 4–10 | Plans and importer contracts only | Flight model, gameplay, in-app retail import and release work not implemented |

## 2026-09-08: real Ukraine installed; packaged terrain verified

Final implementation checkpoint `0407365`; full pipeline implementation
`f229ad7`. Evidence is in [phase 2](baselines/phase-2.md),
[phase 3](baselines/phase-3.md), and [GPU trace notes](gpu-trace-notes.md).

- All 832 real chunks pass the Python probe and TypeScript decoder/installer.
  Build: 86.196 s, 71,245,197 gzip bytes + 24,907,069 manifest bytes.
  Water: 33,731 components with 347,838 exterior/interior ring points.
- Installed the validated theater into this Mac's normal app data. Run
  `bun run dev:electron` or open `build/mac/mac-arm64/USNF-ATF.app`; the default
  terrain panel loads `terrains/ukraine/manifest.json`. Nothing was published.
- Final logarithmic-depth package: Odesa coast 60.057 mean fps, 17.6 ms p95;
  Crimean 30m detail 60.039 mean fps, 17.6 ms p95, both at 2560×1440.
  Movement loads detail chunks, screenshots show relief and water, no omitted
  water batches or runtime errors. Measurements are short warm samples.
- `bun run check` passes 37 tests / 4,543 expectations; typecheck/lint/format
  clean. Final `bun run build` passes in 23.7 s, Mac arm64+x64 artifacts.
  Terrain Python suite passes 13 tests in 1.901 s. GPU XML summary has two
  passing synthetic tests. Retail code was unchanged during this development
  pass; the previous 52-test retail result is historical, not rerun here.
- Native Metal tracing and export succeed, but the default counter set has no
  DRAM-bandwidth samples. Added a summary tool that reports unavailable rather
  than zero; follow-up needs a correctly configured Instruments template.

Additional lessons: fix shared GDAL border queries rather than loosening seam
checks; preserve water holes rather than exploding polygons into scanline
rectangles; check actual rendered depth over the sea; isolate automated input
on a shared desktop; separate cold shader startup stalls from warm FPS.

**Next work:** record Linux phase 1–3 checks on real GPU hardware; configure and
measure native DRAM counters; agree a frame-time regression margin; improve
source-LOD transitions, fine edge artifacts, shoreline detail and longer flight
stress coverage. Phase 4 flight-model work remains separate. Phase 0 SH gaps
remain unchanged; no claim of retail gameplay parity or complete phase 3 exit.

## 2026-09-08: phase 1 fixes and first terrain milestones

Work is split across independent shell, pipeline and renderer agents, with root
integration and an independent audit. Local commits are authorized; no push.

- `fe08a61`, `5ae06d5`: fix deliberate child exits shutting down Vite, live dev
  asset reads, and browser read-only asset semantics. Five new tests plus actual
  two-restart Electron/preload smoke pass. [Details](phase-1-followup.md).
- `26bdd18`: shared terrain contract established before parallel implementation.
- `41da203`, `81fb094`, `88041fb`: pipeline, coverage/aliasing corrections,
  reproducible codec comparison. [Pipeline commands and limits](phase-2-pipeline.md).
- `e0615fa`, `aaeba65`: renderer plus sparse-detail fallback, continuous source
  normals, bounded water rendering, hole rings and reproducible camera poses.
  [Renderer commands and limits](phase-3-renderer.md).
- `4c14ff7`: ignore `.venv` in ESLint and Prettier. A Python dependency's vendored
  JavaScript otherwise made the full workspace check fail.
- `ae82289`: CDP packaged terrain smoke with isolated app profile, screenshot,
  1440p frame sampling and input checks. `eef3119`: atomic verified local terrain
  installation; four tests exercise successful staging and failure preservation.

Integrated validation at this checkpoint: `bun run check` passes 36 tests /
4,540 expectations; `bun run build` produces both Mac architectures' DMG/ZIP
in 27.8 s on a warm build. Earlier in this pass a read-only mounted arm64 DMG
launched with hardware probe exit 0; see [phase 1 baseline](baselines/phase-1.md).
A packaged 51km synthetic fixture runs around 60 fps at 2560×1440, camera moves
and the origin rebases. This is integration evidence, not real-terrain acceptance.

Lessons recorded during implementation:

- Original WBM is available under AWS AUXFILES; do not infer its absence from
  a short dataset README. Water class 0 means land, not missing data.
- COG pixel footprints differ from integer-degree cells after border removal.
  Synthesized ocean cells initially left a 15m gap; the builder correctly failed.
- A no-error export can still fail the seam probe: the first real build emitted
  832 chunks but failed a detail border. Keep the probe as an acceptance gate.
- Sparse 30m source coverage must not displace complete 100m ground. Mesh LOD
  is dyadic inside source tiles; source grids themselves do not nest at 30→100m.
- Skirt triangles sharing normals with top-surface vertices caused a visible
  bevel grid. Source-height normals fixed it; screenshots caught what numeric
  transport/mesh tests did not.
- Water islands decomposed into scanline rectangles produced 80,660 surfaces
  in the real theater. Explicit hole rings and a spatial water cache address
  this scale problem; synthetic fixtures had only two water bodies.
- Smooth synthetic terrain exaggerated delta compression's benefit. Measure
  actual quantized source chunks before choosing the transport.
- Animation-frame intervals, CPU submission, uploaded geometry and actual GPU
  DRAM traffic measure different things. The viewer labels each accurately;
  native bandwidth profiling is not implemented by WebGL2 counters.

The previous review below is historical: its claims that implementation code
was unchanged and its three open phase 1 defects describe that earlier review,
not this development checkpoint. Final real-data baselines follow when verified.

## 2026-09-08: repository review and logging baseline

### Verified in this review

- `bun run check`: exit 0, 12 tests pass (41 expectations); typecheck, lint,
  formatting pass. Scope is clock and renderer-name heuristic tests, not gameplay.
- `python3 -m unittest discover -s tools/retail/tests`: exit 0, 52 tests run in
  63.067 s, 51 pass and one skips for missing `USNF_SCRATCHPAD` independent slice.
  Both retail discs are available; archive-handle ResourceWarnings remain.
- Rebuilt current unpackaged renderer/main/preload, then ran
  `bun run probe --unpackaged`: exit 0, Apple M3 via ANGLE Metal,
  `unmaskedInfo: true`, `softwareRenderer: false`. Installer packaging was not
  rerun. Exact commands and machine details: [phase 1 baseline](baselines/phase-1.md).
- Read-only SH and PIC censuses used local extracted media; exported OBJ strings
  were inspected in memory. No viewer acceptance was claimed. Counts, timings,
  scope and reproduction commands: [phase 0 baseline](baselines/phase-0.md).
- No tracked files under `gameassets/`, `extracted/`, or `build/` at review start.
  This is a tracked-path check, not the planned retail-signature release scan.

### Corrections to the previous entry

1. SH was committed in `8af84a5`; it is not untracked. There is no pending
   superseded x86 decoder removal identified in the current file. Treat old
   session intentions as historical until checked against source.
2. Phase 1 is not fully complete under the build plan: Linux checks, build,
   hardware launch and baseline are still outstanding. macOS progress continues.
3. The 8,413 compressed LIB entries counted the two main embedded LIBs per title.
   All-disc coverage is 10,035 compressed LIB entries plus 27 PKWA ESA entries.
4. The earlier 4,140 PIC count matches the integration test's archive list. It
   excludes 21 USNF_8 and 22 ATF_4C images. A broader census now decodes all 4,183
   without exceptions; this does not validate every image visually or fix palettes.
5. SH batch conversion returns 1 for the reported zero-polygon/stopped shapes;
   the earlier exit-0 claim is inconsistent with committed code. A single-file
   exit 0 also does not guarantee usable geometry.
6. F-14's dropped faces are not explained by a writer that handles only one
   table. It offsets every table. Observed causes: 96 polygon references exceed
   their assigned table's size; one has no assigned table. Shared vertex-buffer
   addressing is the next hypothesis to test, detailed in [SH notes](formats/sh.md).
7. PT field layout and mass/thrust evidence are useful, but coefficient meaning
   and runtime flight behaviour are not fully proven. Corrected an erroneous
   Su-27 arithmetic comparison and the “every field named” claim in [PT notes](formats/pt.md).

### Open code review findings

These are follow-up work, not fixes delivered by this documentation review.

| Priority / finding | Evidence and impact | Next verification |
|---|---|---|
| High: SH vertex addressing | `tools/retail/retail/sh.py`, `_Walker.step`, `to_obj`: ignores the `0x82` header word at +4; F-14 drops 97 polygons. Values such as 1512 = 189×8 suggest destination slots. | Synthetic buffer-update tests; record dropped primitives; view F-14 from multiple angles; repeat both-title census. |
| High: Electron shell restart can shut down dev session | `shell/scripts/dev.ts:46` attaches shutdown to every child exit; watcher intentionally kills that child at :69. A killed Bun child returns numeric 143, satisfying shutdown's condition. | Distinguish deliberate restart from user exit; make two shell edits and verify Vite stays alive and Electron relaunches. Full UI restart test still needed. |
| Medium: Electron dev asset reads can be missing/stale | `shell/src/main.ts:36` resolves assets in copied production output; `shell/scripts/dev.ts:33` bundles shell without refreshing renderer assets. | Read `hello.txt` through platform FS from a clean dev checkout and after changing the source asset. |
| Medium: browser accepts writes to read-only assets | `engine/src/platform/browser.ts:67` accepts `assets` writes, contrary to `Platform.ts:10` and Electron rejection. Agent reproduction wrote and read back an overridden asset. | Shared contract checks: asset writes reject, appData/cache writes round-trip. |
| Medium: retail coverage and resource cleanup | `test_pic.py` omits two archives; ESA/EALIB retain open handles and tests emit ResourceWarnings. No SH tests. | Expand media coverage, retain absent-media skips, and add explicit archive lifetimes plus focused malformed-input tests. |

Other SH limitations: state-insensitive visitation, x86 table reset, incomplete
bounds validation, unresolved axes/scale and no texture export. Zero-polygon
shapes remain unclassified. T2 elevation/tile semantics, runtime palette slots,
JT timers and PT damage semantics remain open. The phase 5 retail scan is absent.

### Lessons learned

- Track four milestones separately: record decoded, export structurally valid,
  asset visually recognizable, behaviour matches retail. Eight valid OBJ faces
  from 105 parsed polygons show why “no exception” is too weak an exit gate.
- Count the actual input set. Embedded archives, all disc archives, extracted
  files, and hand-selected test lists have different totals; record which one
  a measurement covers and whether the files were regenerated.
- ATF's surviving field comments help recover USNF schemas; names transfer more
  confidently than units or runtime semantics. Keep unknowns explicit.
- Archive boundaries matter: EALIB sentinel entries, duplicate names, and the
  ESA codec tag's trailing NUL were useful earlier findings. Keep those lessons
  with format notes and synthetic regression fixtures when changing parsers.
- A green unit suite does not exercise shell restarts, IPC or packaging. Test
  those flows directly when they change; preserve provenance for GPU probes.
- Probe scripts reuse outputs. Rebuild before claiming current-source evidence,
  and distinguish an unpackaged launch from an installer installation.
- Commit research checkpoints with limitations. A durable checkpoint is useful;
  describing it as complete hides the next task. Historical logs need corrections
  when later measurements change the explanation.

### Next work, in order

1. Resolve and test SH vertex-buffer indexing; inspect an F-14 preview stored in
   `extracted/`. Keep the phase 0 two-week time box (through 2026-09-22); phase 5
   can use a placeholder if SH remains unresolved.
2. Fix the dev restart and asset-root/contract issues before relying on the
   shell for frequent terrain iteration. Use the verification steps above.
3. Integrate the phase 0 commands into the disc-to-listing/PNG/OBJ deliverable,
   expand regression coverage, and refresh the baseline after implementation.
4. Record Linux evidence when the GPU box is available; phase 1 stays open.
   The phase 2 entry gate only requires the scaffold, so Linux pending does not
   prevent beginning the Ukraine terrain pipeline.
5. Begin phase 2: define theater projection/bounds and manifest contract, build
   the offline terrain pipeline, run the chunk probe and measure size before
   choosing compression. No new theater or compression decision made here.

### Documentation delivered

Added root `AGENTS.md` for this macOS checkout; updated the existing `README.md`
with runnable capabilities and commands; aligned plan status; added phase 0
baseline and provisional SH notes; refreshed format counts and phase 1 evidence.
No runtime or decoder code changed. Final validation: Markdown relative links,
`bun run format:check`, and `git diff --check` pass; the embedded baseline
census snippets rerun successfully with matching counts. Local commit is
authorized; no push requested.

## Earlier log (historical)

The entry below is preserved as originally recorded. Its completion, repository
state, scope, and root-cause claims are superseded by the review above.

---

## 2026-09-08: phase 1 complete, phase 0 nearly complete

### Summary

| Phase | Status | Commit |
|---|---|---|
| Repo hygiene | done | `46074cf` |
| 1. Scaffold, shell, packaging | done on Mac; Linux baseline pending | `3be679f` |
| 0. Containers (EALIB, ESA, DCL) | done | `c83967a` |
| 0. PAL, PIC, FNT to PNG | done | `77762b1` |
| 0. PT, JT, OT, NT, T2, M, MT | done (T2 and M partial) | `3e770d0` |
| 0. SH shapes to OBJ | **in progress, uncommitted** | see below |
| 0. CLI integration and baseline | not started | |

Phase 0's exit criteria: `.PT` thrust, mass, and an aero coefficient are
identified with confidence (met). F-14 OBJ recognizable in a viewer (not
yet met; see the SH section).

### Phase 1: scaffold (done)

Bun workspaces (`engine`, `shell`, `importer`), strict TypeScript, ESLint 9,
Prettier, Vite, React 19, Three.js, Electron 44. Main and preload are
bundled with `Bun.build`; the engine never imports `electron`. Platform
interface in `engine/src/platform/Platform.ts` with browser and Electron
implementations. `FixedStepClock` (120 Hz accumulator) is unit-tested.

Scripts: `bun run check` (typecheck, lint, format check, tests),
`bun run dev`, `bun run dev:electron`, `bun run build` (products land in
`build/`), `bun run probe` (launches the app with `--probe`, prints the
WebGL2 capability JSON, exit 0 hardware / 2 software / 3 timeout).

Verified on the Mac: `bun run check` clean with 12 tests; `bun run build`
produced arm64 and x64 dmg and zip under `build/mac/` in about 49 s; the
probe reports the Apple M3 through ANGLE Metal, not a software renderer.
Details in `Docs/baselines/phase-1.md`. The Linux GPU box section of that
baseline is empty until that machine exists.

### Phase 0: containers (done)

`tools/retail/retail/{dcl,ealib,esa,disc}.py`, CLI `python3 -m retail
{list,extract,cat,stats}`. The flag-4 LIB codec is PKWare DCL implode
(port of zlib's `blast.c`). Every compressed entry on both discs decodes to
its declared size: 8,413 LIB entries and 27 ESA entries, zero failures.
Both discs are extracted to `extracted/usnf97/` and `extracted/atf-gold/`
(gitignored, 1.5 GB). Notes: `Docs/formats/{ealib,esa,dcl}.md`.

Quirks recorded: EALIB directories end in a sentinel entry; `USNF_2.LIB`
lists 52 `.XMI` files twice; the earlier ESA off-by-one was the NUL after
the codec tag.

### Phase 0: images, palette, fonts (done)

`retail/{pal,pic,fnt,png}.py`. PIC is a 64-byte header followed by raw
rows or a span-list sprite, optionally with an embedded 6-bit palette that
overlays hardware slots from index 0. All 4,140 PIC files across both
titles decode. FNT files are Phar Lap PE images with one compiled x86
routine per glyph; a small interpreter recovers the bitmaps, 24 of 24
render. The F-14 canopy frame (`~F14H.PIC`, 1280x490) and HUD fonts were
checked by eye. PNGs are under `extracted/png/` (gitignored).

Open: runtime palette ranges 192..254 (sky and some flight sprites) come
from a source not yet located; whether index 255 in `_*.PIC` textures is a
key colour waits on SH texturing.

### Phase 0: plane types, weapons, terrain, missions (done, some partial)

`retail/{brf,pt,jt,t2,mission}.py`. `.PT`, `.JT`, `.OT`, `.NT` are CRLF
text in an assembler-like data language; ATF Gold's copies carry the
original C field names as trailing comments, and USNF'97's are the same
statement sequence without comments, so names transfer by position. `.M`
and `.MT` are plain text. `.HUD` and `.PTS` are small Win32 PE plug-ins.

Identified with evidence: `weight` (F-14 40,104 lb, Jane's empty weight),
`maxTakeoffWeight` (74,349 lb), `thrust` and `aftThrust` (41,800 lbf, two
TF30s in afterburner), `internalFuel`, drag and lift coefficients in 8.8
fixed point, and per-G flight envelope polygons in ft/s and ft. Angles are
1/65536 of a turn. Notes: `Docs/formats/{pt,jt,t2,mission,object-types}.md`.

Theater census (missions referencing each map): Ukraine 103, Kuril 41,
North Vietnam 36 in USNF'97; Vladivostok 58, Egypt 51, Baltics 50, France
25 in ATF Gold. T2 grids are 25x25 to 32x32 tiles of 8x8 cells, 8,192
world units (ft) per cell, so a theater is roughly 500 to 640 km on a side.

**Decided 2026-09-08:** Ukraine is the first theater (most missions, 77%
land); Kurils second. Recorded in `build-plan.md` phase 2 and section 3.

Open: T2 elevation byte units and tile table, Baltic sea encoding, JT
timer units, PT `structure` and `systemDamage` semantics.

### Phase 0: SH shapes (in progress, stopped by a spend limit)

State: `tools/retail/retail/sh.py` exists (473 lines) and is **untracked**.
`Docs/formats/sh.md` was **never written**, although the module docstring
references it. No tests. The agent's last stated intent was to remove a
superseded idiom-based x86 decoder from the module, save its opcode survey
as a reusable script, and re-run it.

What the module does: treats a `.SH` as a tiny PE image (`MZ` stub, `PL`
signature, `CODE`, optional `.idata` importing `do_start_interp` and
`_nightHazing` from `main.dll`, `.reloc`). The CODE section is a
byte-oriented drawing program: vertex tables (opcode `0x82`, int16 XYZ),
BSP-style plane tests with relative jumps, polygon, line, and point
primitives with palette colours, normals, and optional UVs, plus short x86
stubs that branch on engine state (gear, wing sweep) before re-entering
the interpreter. The parser walks the program as a control-flow graph,
following every branch, and collects the geometry it understands.

Measured on 2026-09-08 (`python3 -m retail.sh --all
extracted/usnf97/USNF_2.LIB -o extracted/obj/usnf97`, exit 0):

| Measure | Value |
|---|---|
| Shapes fully walked with polygons | 316 of 353 |
| Shapes walked with zero polygons | 35 (effects, trees, buildings, clouds, weapons) |
| Shapes that hit an unknown opcode | 2 (`F8.SH` opcode `0x6e`, `SUN.SH` opcode `0x13`) |
| `F14.SH` | 34 vertex tables, 533 vertices, 105 polygons, no stops |
| `F14.obj` as written | 533 vertices, **8 faces** |
| F-14 vertex bounds | x -91..93, y -15..29, z -86..113 (model units) |

The bounds are aircraft-shaped (wide in x and z, thin in y), so vertex
decoding looks right. The gap is between the 105 polygons the parser
reports and the 8 faces `to_obj` emits; likely the OBJ writer only
resolves faces against one vertex table or drops polygons whose indices
refer to tables other than the current one. Until that is fixed the
exit criterion (recognizable F-14 in a viewer) is not met and no preview
image has been rendered.

The 35 zero-polygon shapes are probably billboard sprites and particle
emitters that use primitives the walker does not yet classify, not
parse failures.

To resume: read `sh.py`'s `_Walker` and `to_obj`; fix face emission
across tables; render an orthographic wireframe of `F14.obj` and look at
it; write `Docs/formats/sh.md`; add `tests/test_sh.py`; then commit. Time
box from the plan: if this is not done within two weeks of 2026-09-08,
phase 5 uses a placeholder model.

### Not started

- Integrate `pic`, `fnt`, `sh`, `pt`, `jt`, `t2`, `mission` as
  subcommands of `python3 -m retail` (each currently runs as its own
  module, `python3 -m retail.pic ...`).
- `Docs/baselines/phase-0.md`: decode counts and timings above, recorded
  with machine and commit.
- Phase 1 exit on the Linux GPU box.

### Repo state

Working tree after this entry: one untracked file, `tools/retail/retail/sh.py`.
Nothing under `extracted/`, `gameassets/`, or `build/` is tracked.
Nothing has been pushed.
