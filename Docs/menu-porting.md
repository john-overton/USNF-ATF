# Menu port helper

Brings the original menu artwork, layouts and sounds from a locally owned disc
into the game shell. It is optional in the strongest sense: with no bundle
installed the menus draw their own chrome and every screen works identically.
That is the normal case, and the tests cover both.

The layouts are not redrawn by eye. They come from the `.DLG` widget tables that
[formats/mnu.md](formats/mnu.md) documents, so a button lands where
`CHOOSEAC.DLG` says it lands.

## Port and install

```sh
bun tools/menu/port-menu.ts --dry-run
bun tools/menu/port-menu.ts
bun tools/menu/port-menu.ts --install "$HOME/Library/Application Support/USNF-ATF/data"
```

Run from the checkout. `--source-root` defaults to repo-relative `extracted/`
and must contain `usnf97/USNF_1.LIB/`, `usnf97/USNF_2.LIB/` (or the ATF
equivalents, with `--game atf-gold`). Python 3.11+ and Bun are required; the
toolkit is standard-library only. See [retail extraction](../tools/retail/README.md)
for disc handling.

Each successful run creates:

```text
extracted/menu-ports/<game>/<timestamp-and-id>/
  screens.json      # layouts, background art and button chrome, base64 PNG
  sounds.json       # the menu sound bank as unsigned 8-bit mono PCM
  port-report.json  # screens, widget counts, sprites, sounds, hashes and limits
```

`--install <app-data-root>` writes `menu/screens.json` and `menu/sounds.json`
under that root, after validating both. Nothing is installed into normal app data
unless you ask for it, and nothing retail is ever committed or packaged.

## What is in the bundle

| Part | Source | Notes |
|---|---|---|
| Main menu layout | `CHOOSEAC.DLG` | rect `(379, 80, 238, 361)`, eight buttons at x=31, width 180 |
| Main menu art | `CHOOSEAC.PIC` | 640x480; the panel edges match the recovered rect to the pixel |
| Loadout layout | `LOADORD.DLG` | rect `(115, 356, 470, 102)`, two dials, two rockers, Fly and Select Plane |
| Loadout art | `ORD_KITT.PIC` | 640x480 |
| Debrief art | `DEBSC1.PIC` | background only; there is no debrief dialog to recover |
| Button chrome | `ACTION0L/M/R`, `ACTIOD0L/M/R` | nine-slice: a left cap, a middle the browser repeats, a right cap |
| Sounds | `&CLICK`, `&BUTTON`, `&TOGGLE1`, `&SQACK1`, `&ARMWPN`, `&ARMBLLT`, `&ARMDRIP` | our names map onto the `&` menu bank in the second LIB |

The engine validates all of it before drawing a pixel or playing a sample:
`engine/src/data/retail-menu.ts` caps image sizes, PCM length, widget counts and
the bundle's total bytes, and checks that each PNG's own `IHDR` agrees with the
size the manifest declares. A bundle that fails leaves the app on its own chrome
with the reason recorded, rather than taking the menu down.

## What this port does not do

- **No retail fonts.** `MENUFONT`, `LRGFONT` and the rest are glyph strips with a
  256-entry table, and drawing them means compositing text glyph by glyph, which
  a prop-driven effect-free React component cannot do. Menu text is the app's own
  font. This is the largest visible difference from the original.
- **No hover or pressed art.** `ACTION0..3` and `ACTIOD0..3` are four variants of
  the same button. Measured on the local media they draw 30, 18, 16 and 14 opaque
  rows inside boxes 30, 30, 28 and 26 tall, which reads as a size set rather than
  as states. Only the enabled button and its disabled twin are exported; hover and
  pressed are a brightness filter in CSS. Which of the pair is the disabled one is
  read from mean colour against the button well drawn into the background art —
  the well averages (172, 188, 144), `ACTIOD0M` (147, 155, 108) blends into it and
  `ACTION0M` (212, 196, 163) stands proud of it — not from anything decoded.
- **No dials, rockers, list boxes or check boxes.** Their sprites exist on the
  disc and their records decode, but the `x`/`y` pair is only confirmed for widget
  classes carrying a text label (see [formats/mnu.md](formats/mnu.md)), so the
  loadout screen's own controls wait for step 6 of
  [game-shell-plan.md](game-shell-plan.md).
- **No menu music.** `.XMI` is still undecoded.

## Acceptance

```sh
bun run build
bun tools/flight/menu-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit <built-commit> --out extracted/menu-smoke
bun tools/flight/menu-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit <built-commit> --menu extracted/menu-ports/usnf97/<run> --out extracted/menu-smoke-retail
```

The first run is the no-bundle case and asserts the screen reports
`data-menu-art="original"`; the second installs the ported bundle into the
isolated profile and asserts `retail`. Both then walk the same transitions, so a
bundle can never change what the menu does — only how it looks. Sound is not
asserted: a real `AudioContext` needs a trusted gesture, and the unit tests in
`engine/src/ui/menu/ui-audio.test.ts` cover the mapping and the mute path.
