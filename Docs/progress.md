# Progress

Current status and append-only engineering log against [build-plan.md](build-plan.md).
Newest entry first. Update the snapshot and add an entry for meaningful port work;
keep commands, evidence, uncertainty, and a concrete next step. Baselines live in
[baselines/](baselines/). The design brief describes the intended product.

## Current snapshot — development 2026-09-09

| Phase | Implemented | Acceptance / remaining work |
|---|---|---|
| 0: retail toolkit | Containers, images/fonts and data readers; partial SH | F-14 export and integrated deliverable remain open; unchanged this development pass |
| 1: scaffold and shell | Dev lifecycle/asset fixes, platform contract tests, fresh probe, Mac packaging | macOS tested including DMG launch; Linux hardware/build/checks deferred by user |
| 2: terrain pipeline | Copernicus DEM/WBM fetch, LAEA warp, roughness-selected 30m detail, filtered 100–2700m chunks, quantization, checksums, probe and codec comparison | Real Ukraine build and every-chunk probe pass; installed locally. Linux baseline deferred |
| 3: terrain renderer | Streaming, quadtree height/normal/tint morph, complete-coverage source fades, floating origin, free camera, bounded water, diagnostics | Packaged coast/detail ~60 fps at 1440p; 0↔1 and 1↔2 fades plus 24km fast lateral flights pass. Native GPU memory counters captured; physical-DRAM-only traffic is not established. Live counters and fine edges remain open. Linux deferred |
| 4: flight model | Original 120 Hz assisted aircraft, terrain contact, practice runway/approach, HUD, chase camera, keyboard/gamepad adapter and 11-case harness | Packaged ground/takeoff/landing pass at ~60 FPS on Mac. Physical gamepad and human USNF feel comparison remain open; Linux deferred |
| 5–10 | Plans and importer contracts only | Combat, missions, in-app retail import and release work not implemented |

## 2026-09-09: native measurement checkpoint pushed; phase 4 implemented

The completed GPU measurement/terrain-polish checkpoint **`7d19abd` was pushed
to `origin/main`** before phase 4 development. This supersedes the earlier
entry's local-only status. Native GPU external-memory totals were 20.946 GB/s
coast and 13.653 GB/s detail; scope remains sampled GPU-wide traffic, not an
app-exclusive physical DRAM measurement. Linux stays tabled.

Phase 4 source commits `400bdf9`, `cb038c6`, `0110ba7`, `636f80a` and `49a3123`
implement the original coefficient contract/model, safe gear contact, real
terrain integration, controls and deterministic maneuver harness. Independent
subagent review covered model/integration boundaries and packaged visuals.
See [phase 4 baseline](baselines/phase-4.md), [flight guide](phase-4-flight.md)
and [harness guide](phase-4-harness.md).

- **53 tests / 4642 expectations** pass; types, lint and formatting pass.
- All **11 headless scenarios** pass: level/turn/loop/stall/energy, takeoff,
  approach, hard/water impact, render-rate determinism and missing terrain.
- Fresh Mac package from `49a3123` builds in **22.5 s**. Real 1440p arm64
  ground/takeoff/approach samples achieve **60.035 / 60.013 / 60.007 FPS**.
  Takeoff ends at 149.01 m/s and 227.55 m AGL; approach lands and stops inside
  the runway. No renderer exceptions or console errors; visual review passes.
  Approach records one clamped frame, retained in the baseline.
- An additional default terrain-only coast check timed out during CDP frame
  collection. No new explorer timing result is claimed; the cause remains open
  and the phase 3 baseline retains its original source provenance.
- Original procedural aircraft and fictional practice runway require no retail
  assets. Flight contact uses an independent bounded cache and pauses for
  missing data; visual LOD does not determine collision height.
- Reusable packaged acceptance drives ordinary gamepad inputs and preserves
  source provenance, per-frame evidence and screenshots in ignored outputs.

Lessons: clear held controls when a form receives focus; publish diagnostics
only after an asynchronous scene load is accepted; ground initialization is not
a landing; verify velocity trajectories rather than quaternion rotation for
loops. Model determinism, packaged behavior, physical gamepad compatibility and
human flight feel are separate kinds of evidence. Short 60 FPS samples do not
establish long-duration performance or erase isolated clamped frames.

**Next work:** human practice-flight/USNF feel assessment and physical gamepad
checks remain phase 4 acceptance items. Combat and mission work remain phase 5+
plans; Linux testing remains explicitly deferred. Phase 4 changes are committed
locally after validation; the pushed checkpoint above predates them.

## 2026-09-08: verified Mac source transitions and native memory profiling

Packaged source `12851d8`, including renderer fixes `05d0ecd`, `7442ac7` and
`3f7a6b2`. Local commits only; no push. See the updated
[phase 3 baseline](baselines/phase-3.md) for exact measurements and artifacts,
and [GPU notes](gpu-trace-notes.md) for the native measurement's scope/units.

- Source changes now wait for complete coverage and 400 ms stable selection,
  then fade for 800 ms using complementary opaque pixel masks. Both hierarchies
  remain bounded by the existing geometry budget. Mesh selection runs each frame.
- Independent review reproduced and fixed a 5.31 m split-threshold jump and an
  8.96 m clipped-theater-edge jump. Parent height, normals and clamped tint now
  interpolate consistently; four new regressions cover the fixes/state lifecycle.
- Fresh 1440p packaged warm runs: **60.036 fps** detail and **60.014 fps** coast.
  Altitude 30↔100 m and 100↔300 m source transitions pass. Fast Shift flight
  travels ~24.1 km out/back, crosses detail coverage and floating-origin grids,
  and completes both fades without errors or omitted water.
- Six-second moving/settling legs have p95 ≤17.6 ms. Outward legs include real
  49–67 ms maximum stalls; the average is not a claim of hitch-free streaming.
  Fast-flight geometry cache peaks at 31,639,104 bytes, within 96 MiB.
- Mid-fade and settled screenshots were inspected independently. Expected
  silhouette/lake-edge stipple disappears after the fade. Thin dashed patch
  edges and blocky 100 m shorelines persist and remain documented refinement work.
- Native Instruments Performance Limiters configuration captures hardware GPU
  read/write/external-memory bandwidth. The tool preserves the difference from
  the absent legacy `DRAM Bandwidth` counter, GPU upload estimates, and live
  in-app counters. Measurements are GPU-wide sampled intervals, not exclusive
  physical-DRAM traffic attributable to the app. Sample-weighted totals: **20.946 GB/s coast**, **13.653 GB/s detail** in native exported units; sample coverage differs, so these are not wall-time means. Exact read/write figures and scope are in GPU notes.
- `bun run check`: **41 pass / 4580 expectations**, strict types/lint/format pass.
  GPU Python tooling: **6 pass**. Explicit smoke-tool TypeScript check passes.
  Mac arm64/x64 DMG/ZIP build passes in **26.7 s**; only arm64 was launched.
  Pipeline/retail sources are unchanged, so earlier Python results are historical.

Lessons from failed validation are retained: a shader vec3/vec4 mismatch made
land disappear while triangle counters looked healthy; smoke now fails browser
console errors. A descent check ran before debounce, and diagnostic `frameMs`
overwrote raw samples; the harness now waits for completed fades and records
`rafFrameMs`. Two early sampling runs timed out; isolated background/focus
controls made subsequent runs complete, without proving occlusion as the sole
cause. Instruments can exit 0 with an unsupported counter profile; inspect
actual exported samples and native units rather than trusting the exit status.
Full native counter exports expanded to multi-GiB XML and took minutes; an
optional display-label sentinel required a parser regression while preserving
the valid numeric value. Use shorter counter captures for routine profiling.

**Next work:** keep Linux tabled per user decision. Remaining Mac refinement is
fine patch/shoreline edges, isolated streaming stalls and longer thermal runs;
a live native on-screen memory counter and agreed regression margin remain
separate acceptance work. Phase 4 entry (terrain renders) is met on this Mac;
no aircraft, gameplay, retail import or completed Linux gate is implied.

## 2026-09-08: Linux testing tabled; Mac terrain follow-up

User decision: defer Linux testing for now and continue GPU DRAM bandwidth
measurement and terrain transition polish on this Mac. Original cross-platform
criteria remain documented for later; they no longer block this development
pass. AGENTS, README and the build plan now reflect this scope. Historical
entries below retain their original pending-Linux wording.

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
| 1. Scaffold, shell, packaging | done on Mac; Linux baseline deferred | `3be679f` |
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
