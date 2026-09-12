# Dev kit build

One command that turns your own retail media into a complete, installed
development setup: extraction, aircraft, audio, music, menus and terrain.

```sh
bun run devkit                       # everything, into this platform's app data
bun run devkit --list                # what each stage does
bun run devkit --dry-run             # print the plan, write nothing
```

It orchestrates the existing helpers rather than replacing them, so each stage
keeps its own parsers, guards and provenance. The per-stage documents remain the
detailed references: [aircraft porting](aircraft-porting.md),
[menu porting](menu-porting.md), [audio](formats/audio.md),
[music](formats/music.md), [terrain pipeline](../terrain-pipeline/README.md).

Discs stay on your machine. Conversions land in ignored `extracted/`, and nothing
is installed anywhere except the app data root you name. No retail bytes are ever
committed or packaged.

## Source media

`--source` defaults to repo-relative `gameassets` and expects one subfolder per
game: `usnf97/` and/or `atf-gold/`. Each may be a mounted disc, a disc folder
(`SETUP.ESA` plus root `*.LIB`) or an install folder. Whichever games are present
are the ones built; `--games usnf97` narrows that.

```sh
bun run devkit --source /Volumes/USNF97 --games usnf97
```

## Stages

| Stage | What it produces |
|---|---|
| `extract` | `extracted/<game>/<archive>/` — every logical file, decompressed |
| `aircraft` | A validated bundle per aircraft: geometry, flight profile, audio, cockpit, gun, loadout |
| `audio` | Music scores and notes, combat and ambient sound, and the full sound catalog |
| `music` | Tracks rendered with a real instrument bank |
| `menu` | Menu artwork, ordnance icons, button chrome, sounds and the title theme |
| `terrain` | Selects a built terrain dataset, or rebuilds it from public sources |
| `install` | Installs every validated bundle into an app data root |

`--only` and `--skip` take comma-separated stage names and always run in the order
above, however you list them.

```sh
bun run devkit --only extract,aircraft
bun run devkit --skip music,terrain
```

## Existing work is reused

Every stage checks for its own output first and skips the work when it is already
there, so a repeat run costs seconds rather than minutes. A partial aircraft or
menu bundle does not count as present: if any file the installer needs is missing,
that bundle is rebuilt rather than trusted. Music is checked against the bank that
produced it, so selecting a different SoundFont re-renders rather than reusing
timbres from the old one.

`--overwrite` redoes every selected stage regardless. Use it after changing a
converter, or when you suspect an output is stale.

The `install` stage always runs, because it is cheap, atomic per file, and is what
refreshes the app's copies from the validated bundles.

## Music needs an instrument bank

Without one, the stage is skipped and the game falls back to synthesized tones.
The kit looks for `FluidR3_GM.sf2` in the usual per-platform locations; point at a
different bank with `--soundfont <file>`, or skip the render with `--no-music`.
Any uncompressed General MIDI `.sf2` works — the converter records its fingerprint
for provenance rather than requiring one specific bank. Compressed `.sf3` files are
rejected. See [music](formats/music.md) for what is and is not reproduced.

Both games are rendered. Only the USNF manifests are installed, because the
installed score library is authored against USNF's situation assignments; the ATF
renders stay staged rather than inventing score dispatch for them. For the same
reason `retail.music` itself runs only for USNF — its five situational selections
name USNF's two-digit `AIR` tracks, so it has nothing to resolve on an ATF disc.

## Terrain does not come from the discs

This is the one part of the kit that is not retail-derived. The shipping datasets
are built from public Copernicus GLO-30 elevation data and Sentinel-2 imagery over
the network, through a six-stage chain: fetch, build, imagery, paint-coasts,
color-maps, shorelines.

By default the kit reuses an already-built dataset. It considers the folder named
for the theater and any `<theater>-<variant>` beside it, then picks the **most
complete** one — the one carrying the most optional passes (`imagery`,
`coastPaint`, `colorMaps`, `shorelines`). Equally complete candidates prefer the
exactly named folder.

That rule exists because a bare elevation build is a perfectly valid dataset, and
installing one over a polished dataset would silently throw away the imagery,
coast repair, seasonal colors and shoreline materials already in place. The kit
prints which dataset it chose and which passes it carries.

`--rebuild-terrain` runs the whole chain, which needs network access and the
project virtual environment described in the
[terrain pipeline README](../terrain-pipeline/README.md). `--dataset` installs
one specific folder and skips the selection entirely.

```sh
bun run devkit --theater ukraine                      # most complete built dataset
bun run devkit --theater ukraine --rebuild-terrain    # rebuild from public sources
bun run devkit --dataset extracted/terrain/ukraine    # this exact folder
```

## Where it installs

`--install` defaults to this platform's app data root:

| Platform | Default |
|---|---|
| macOS | `~/Library/Application Support/USNF-ATF/data` |
| Linux | `~/.config/USNF-ATF/data` |
| Windows | `%APPDATA%/USNF-ATF/data` |

`--no-install` converts without installing anything.

## The report

Each run writes `extracted/devkit/devkit-<timestamp>.json` recording the source
commit and working-tree state, machine and tool versions, the options used, the
instrument bank's fingerprint, and every stage with its status and the exact
commands executed. Status is `built`, `reused` or `skipped`.

A run reports conversion and installation only. **It does not establish
acceptance.** How the kit looks, flies and sounds is a separate check: see the live
scripts under `tools/flight/` and the evidence notes in `Docs/baselines/`.

## Options

```text
--source <dir>        retail media root (default: gameassets)
--games <list>        default: every game found under --source
--extracted <dir>     conversion output root (default: extracted)
--install <dir>       app data root to install into (default: this platform's)
--no-install          convert only; install nothing
--aircraft <list>     default: f14,a4e,x31
--menu-game <game>    which game supplies menu art (default: usnf97)
--theater <name>      terrain theater (default: ukraine)
--dataset <dir>       install this built terrain folder instead of the default
--rebuild-terrain     run the full public elevation and imagery chain
--soundfont <file>    instrument bank for music (default: auto-detected)
--no-music            skip the render; music falls back to synthesized tones
--only <stages>       run only these stages
--skip <stages>       run everything except these
--overwrite           redo stages whose output already exists
--python <path>       Python 3.11+ (default: python3)
--dry-run             print the plan and exit
--list                describe the stages and exit
```
