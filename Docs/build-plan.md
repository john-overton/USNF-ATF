# Build Plan

Companion to `usnf-atf-plan.md` (the brief). The brief says what and why. This document says in what order, what "done" means for each phase, and which decisions are already made. When the two disagree, this one wins for sequencing.

Status updated 2026-09-09: phase 0 toolkit remains partial. Phase 1 code fixes and macOS packaging are verified; Linux testing is deferred by user decision. Phase 2 pipeline and phase 3 terrain explorer are implemented, with the real Ukraine dataset and packaged Mac 1440p coast/detail runs verified; Native GPU external-memory bandwidth is captured and source transitions are polished/verified on Mac. The measurements do not isolate physical DRAM traffic; live in-app counters and fine-edge refinement remain open. Linux testing is deferred. Phase 4 now implements an original assisted aircraft, terrain contact, practice starts, controls and a passing maneuver harness; packaged acceptance is recorded in its baseline, while physical gamepad/USNF feel checks remain open. Phases 5–10 remain planned. See [progress.md](progress.md) and per-phase baselines for measured acceptance. Written 2026-09-08 after inventorying the retail media in `/gameassets`.

---

## 0. What we learned from the discs

Both `gameassets/usnf97` and `gameassets/atf-gold` are CD images (installer media), not installed games. That changes the importer design, and it resolves the "is the format cracked?" gate from the brief, section 6.2.

### 0.1 Container formats

**EALIB** (`*.LIB`). Trivial directory format, confirmed by parsing all nine archives:

- 5-byte magic `EALIB`, uint16 entry count minus one.
- Per entry, 18 bytes: 13-byte NUL-padded name, 1 flag byte, uint32 offset.
- File length is the gap to the next entry's offset.
- Flag 0: stored. Flag 4: compressed. Compressed entries begin with a uint32 uncompressed size. The codec is PKWare DCL implode, implemented in `tools/retail/retail/dcl.py`; see [formats/dcl.md](formats/dcl.md).

**ESA** (`SETUP.ESA`), the installer payload. Magic string `ELECTRONIC_ARTS_ARCHIVE_FILE`, then a table of (filename, install-label, attributes, uncompressed size, timestamp, codec tag, compressed size, offset). Codec tag `PKWA` is PKWare DCL implode; `NULL` is stored. The two data LIBs we care about are stored, so they can be sliced out by size with no decompression at all. The install script `SETUP.SSF` is plain text and documents the intended layout.

### 0.2 Where the game actually is

| Archive | Location | Contents |
|---|---|---|
| `USNF_1.LIB` | inside `SETUP.ESA`, stored | 834 `.PIC` images (cockpits, UI art), 12 `.FNT` fonts |
| `USNF_2.LIB` | inside `SETUP.ESA`, stored | everything else: 353 `.SH` shapes (3D models), 48 `.PT` plane types, 110 `.OT` object types, 90 `.JT`, 64 `.NT`, 209 `.M` missions, 177 `.MT` mission text, 11 `.T2` terrain, 16 `.HUD`, `.MNU`/`.LAY`/`.DLG` UI, 593 `.5K` + 64 `.11K` audio, 104 `.XMI` music, one `.PAL` palette |
| `USNF_3.LIB` | CD root | 494 `.PIC` (encyclopedia art), 134 `.INF` (encyclopedia text) |
| `USNF_7.LIB` | CD root | 355 `.VDO` video, 355 `.FBC`, 104 `.11K` |
| `USNF_8.LIB` | CD root | campaign end screens and speech |
| `USNF_10.LIB` | CD root | 23 `.CB8` briefing videos, 411 MB |

ATF Gold has the same layout with more of everything (1,043 shapes, 105 plane types, 247 missions). A third ATF data LIB, `ATF_4B.LIB`, is PKWare-compressed inside its ESA and needs the DCL decoder.

The main embedded archives contain core aircraft data and art, but disc-root archives also contain non-video assets. Import coverage must include both locations; the earlier “whole game minus video” size claim was too broad. The 3D models exist as `.SH` and the flight model parameters exist as `.PT`. PT field decoding is implemented; SH parsing and OBJ export remain partial. Phase 0 research findings and confidence are recorded in [formats/README.md](formats/README.md).

### 0.3 Design decisions this forces

1. **The importer reads CD media, not an install.** Primary input is the disc layout: `SETUP.ESA` plus the root `*.LIB` files. An installed Windows folder is a secondary input that just skips the ESA step. This is required because the dev machine is a Mac and cannot run `SETUP.EXE`, and it is friendlier for users with an ISO.
2. **Retail flight data feeds the flight model.** The brief planned hand-built lookup tables. The `.PT` files are USNF's own per-aircraft parameters. Once decoded, the importer converts them to our JSON schema at import time. They are never committed; the repo ships the schema and one original placeholder aircraft so the engine runs without a disc.
3. **ATF Gold is a second import target, not a fork.** Same engine family, same containers, same extensions. The importer is written against the family, tested on USNF'97 first.

---

## 1. Development environment

- **Current acceptance platform: macOS.** Use Apple Silicon (Homebrew at `/opt/homebrew`, Node 22, Bun 1.4, Python 3). On 2026-09-08 the user explicitly tabled Linux testing so development can proceed on this Mac. The original Linux GPU exit criteria below are retained as deferred work, not current blockers or claims of verification. Windows is a packaging target only until phase 9.
- **No emulation needed.** No Wine, DOSBox, or 7-Zip on either machine. Every retail format is handled by our own code.
- **Python:** the terrain pipeline and the phase 0 format tools use a project virtualenv (`uv` or `python -m venv`). `rasterio` and GDAL come from wheels or the system package manager, decided in phase 2.
- **Local first, CI last.** All tests, harnesses, and probes are plain scripts runnable from a checkout (`bun test`, `bun run harness`, `python -m pipeline probe`). GitHub Actions is not set up until phase 9, and when it is, it runs only on release tags, never on push. Until then, "green" means the recorded local checks pass; Linux evidence is deferred by the current platform decision.
- **Baselines are recorded, not remembered.** Each phase writes its measured numbers (frame time, GPU bandwidth, chunk sizes, harness results) to `Docs/baselines/<phase>.md` with the machine, date, and commit. Later phases compare against these.
- **Retail media** stays in `/gameassets`, which is gitignored. Anything extracted from it goes to the scratchpad or an ignored `/extracted` folder, never into `Docs/` or the repo. Format notes describing structure are original work and are committed.

---

## 2. Phases

Each phase has an entry gate, a deliverable you can run, and exit criteria that are checked, not assumed. Phase numbers replace the brief's section 8.

### Phase 0: Retail format toolkit (Python, throwaway-grade)

Goal: know exactly what we can import before writing engine code that depends on it.

- Entry: now.
- Work:
  - `tools/retail/`: ESA table parser and slicer, EALIB lister and extractor, flag-4 decompressor, PKWare DCL decoder (port of zlib's `blast.c`, needed for `ATF_4B.LIB` and for reading the executable if we ever need constants out of it).
  - Decode `.PAL` and `.PIC` to PNG. Cockpit art and HUD elements become viewable.
  - Decode `.SH` well enough to dump an OBJ of the F-14. Decode `.PT` into a labeled field list. Take notes on `.T2`, `.M`, `.OT`, `.JT`, `.NT`, `.HUD`.
  - Write `Docs/formats/*.md` for each format, one file per format, with byte layouts. Original work, committed.
- Deliverable: a command that takes a disc folder and produces a listing plus PNG cockpits and an OBJ aircraft.
- Exit criteria: F-14 OBJ opens in any viewer and is recognizably an F-14. `.PT` fields for thrust, mass, and at least one aero coefficient are identified with confidence.
- Time box: two weeks. If `.SH` is not decoded by then, phase 5 uses a placeholder model and the project proceeds. Nothing else blocks on it.

### Phase 1: Repo scaffold, shell, packaging

- Entry: phase 0 started (they can overlap; this phase needs no retail data).
- Work: monorepo layout from the brief section 4.3. Bun workspaces, Vite, strict TypeScript, ESLint. Electron main process, preload bridge exposing the platform interface from the brief section 4.2, React shell with one empty screen. electron-builder configured for macOS arm64 and x64, Windows x64, Linux AppImage and deb, but only the local platform is built routinely. One `bun run check` script that runs typecheck, lint, and unit tests.
- Deliverable: a locally built, unsigned app on the Mac and on the Linux box that opens a window and prints the renderer string and WebGL2 capabilities.
- Exit criteria: `bun run check` clean on both machines. App launches on both. The Linux build reports a hardware renderer string, not a software fallback. Baseline recorded.

### Phase 2: Terrain pipeline (Python, offline)

- Entry: phase 1 scaffold exists so the manifest schema has a home in `engine/src/data`.
- Work: exactly the brief section 5.3, for one theater. Theater: **Ukraine**, decided 2026-09-08 from the phase 0 census (103 retail missions, 77% land, 26x25 tile grid, roughly 520x500 km). Kuril Islands (41 missions, 95% sea) is the planned second theater in phase 10.
- Deliverable: chunk folder and manifest for one theater on local disk.
- Exit criteria: terrain probe from the brief section 9 passes on every chunk, run locally. Size measured and recorded in the baseline against the budget in the brief section 5.4. Compression format decided from the measurement.

### Phase 3: Terrain renderer

- Entry: phase 2 chunks exist.
- Work: Three.js scene inside the Electron app, floating origin, CDLOD quadtree with geomorphing, chunk streaming from the local folder through the platform interface, free camera, flat water bodies from the manifest.
- Deliverable: fly a free camera over the theater in the packaged app.
- Exit criteria: 60 fps at 1440p on both the Mac and the Linux GPU box. Frame-time and GPU-bandwidth counters on screen. Both recorded as the phase 3 baseline; every later phase must not regress them by more than an agreed margin.
- This is the hardest phase. Plan for it to take as long as phases 0 to 2 combined.

### Phase 4: Flight model and sim loop

- Entry: phase 3 renders terrain.
- Work: fixed 120 Hz sim step decoupled from render. Aircraft JSON schema. One original placeholder aircraft with hand-made tables. Keyboard and gamepad input. Headless harness in `tools/harness` running level flight, sustained turn, loop, and stall with assertions, runnable with one command.
- Deliverable: take off, fly, land on real terrain in the app.
- Exit criteria: harness green locally on both machines and its numbers recorded as the baseline. A person who has played USNF says the feel is in the right family.

### Phase 5: In-app importer

- Entry: phase 0 format notes exist for at least PIC, PAL, SH, and PT. Phase 4 defines the target JSON.
- Work: port the phase 0 Python decoders to TypeScript in `/importer`. First-run flow: pick the disc folder or install folder, validate it, convert, write to app data with attribution metadata. Convert one aircraft (F-14), its cockpit art, HUD fonts, and its `.PT` into the phase 4 schema.
- Deliverable: the retail F-14 with its retail cockpit flying over real terrain.
- Exit criteria: import runs on the Mac and the Linux box from a plain disc folder. No retail-derived bytes in the repo or build output, checked by a local script that scans for the EALIB and PIC signatures. That script becomes a release gate in phase 9.

### Phase 6: Weapons and sensors

- Entry: phase 5.
- Work: radar, RWR, missiles, guns, damage. Weapon and sensor JSON schemas. Importer extended to `.OT`/`.JT`/`.NT` once decoded. Harness extended with a weapon liveness probe.
- Deliverable: shoot something down.

### Phase 7: AI

- Wingmen, enemy aircraft, SAM sites, ships. AI liveness probe from the brief section 9, runnable locally with one command.
- Deliverable: a dogfight where every bot moves, engages, and fires.

### Phase 8: Missions and campaign

- Decode `.M` and `.MT`. Mission JSON schema. Briefing and debrief UI in React. Campaign progression.
- Deliverable: one retail campaign mission, imported, playable start to debrief.

### Phase 9: Ship it to a stranger

- Settings, thermal and power-aware throttling, attribution and disclaimer screens, first-run polish.
- GitHub Actions, introduced here and not before: one workflow, triggered only by a release tag, that runs `bun run check`, the harness, the probes, the retail-signature scan, then builds all three platforms and attaches installers to the GitHub release. No push or PR triggers.
- Windows signing when a certificate is in hand. Auto-update once signed builds exist.
- macOS signing and notarization is the last item in the phase. Unsigned Mac builds with a documented right-click-to-open note are acceptable for every release before that.
- Deliverable: a tagged release someone who is not us installs and plays without help.

### Phase 10: Second theater, ATF Gold import, multiplayer if wanted.

---

## 3. Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Native shell | Electron | Bundled Chromium, identical WebGL2 everywhere, see brief 4.1 |
| Importer input | Disc layout first, install folder second | Dev machine is a Mac; ESA and LIB are both parseable |
| Flight data | Retail `.PT` via importer, placeholder aircraft in repo | Engine must run without a disc; feel must match retail |
| Format tools | Python first, TypeScript port later | Faster to reverse-engineer in a notebook than in the app |
| Phase 0 before shell | Yes, overlapping | The asset gate is cheap to resolve and reshapes phases 4 to 8 |
| Retail data in repo | Never, enforced by a local scan, later a release gate | Brief section 2 |
| Dev and test platforms | Mac now; Linux GPU testing deferred by user on 2026-09-08 | Continue Mac development; retain Linux criteria for later verification |
| CI | Phase 9 only, release tags only | Baselines and tests are local first; CI is a release gate, not a dev loop |
| Notarization | Last item of phase 9 | Costs money and time; adds nothing until strangers install it |
| First theater | Ukraine | Most retail missions (103) and mostly land; Kurils second |

---

## 4. Open questions and where they get answered

| Question | Answered in |
|---|---|
| Flag-4 LIB codec identity | Resolved in phase 0: PKWare DCL implode |
| `.SH` model layout | Phase 0 |
| `.PT` field meanings | Phase 0, cross-checked against phase 4 harness |
| Land cover in v1 | Phase 2, after the flat-tint version is seen |
| Chunk compression | Phase 2 measured: deterministic gzip/u16 v1; real codec comparison in phase 2 baseline |
| macOS signing identity | End of phase 9 |
| Windows signing certificate | Phase 9 |
| Regression margin for baselines | Phase 3, when the first render baseline exists |
| Working title and repo name | Whenever; the repo is `USNF-ATF` until then |
| Where USNF'97 can be legally bought today | Phase 9, for the README |
