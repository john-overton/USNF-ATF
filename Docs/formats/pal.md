# PAL (`PALETTE.PAL`)

Status: **decoded**, high confidence. Reader: `tools/retail/retail/pal.py`.

One file per title (`USNF_2.LIB` / `ATF_2.LIB`), 768 bytes: the flight-time
VGA DAC palette. UI screens, the encyclopedia, and many sprites do not use
it; they carry their own palette inside the `.PIC` (see [pic.md](pic.md)),
encoded the same way.

## Layout

| Offset | Size | Field |
|---|---|---|
| 0 + 3*i | 3 | Entry `i` (0..255): R, G, B, one byte each, 6-bit (0..63) |

No header, no count, no trailer. Every byte on both discs is in 0..63.

## 8-bit expansion

`expand6(v) = (v * 255 + 31) // 63`, so 0 -> 0 and 63 -> 255 exactly and
the ramp is monotonic. (Plain `v << 2` would top out at 252.)

## What the flight palette holds

Observed in both titles (values are indices, not colours):

| Range | Content |
|---|---|
| 0 | black |
| 1..46 | magenta placeholder (255, 0, 255): filled per cockpit by the cockpit PIC's 64-entry embedded palette |
| 47..60 | 14-step white-to-black grey ramp |
| 61..69 | magenta placeholder |
| 70..159 | terrain / object shades: several 16-entry ramps (browns, greens, tans, blues, greys) |
| 160..175 | mixed: black, warning reds/oranges/yellows, greens, sky blues, a few placeholders |
| 176..191 | fire / afterburner ramp (dark red to yellow-white) |
| 192..254 | magenta placeholder: filled at run time (sky gradients use 229..239, see `SKY*.PIC`) |
| 255 | white |

So a flight-time `.PIC` decoded against `PALETTE.PAL` alone shows magenta
wherever it relies on a range that the engine fills later. The decoder
overlays a PIC's embedded palette starting at index 0, which is enough for
the cockpits; sky and some HUD/flight sprites still need the run-time
ranges, which we have not located yet (candidates: `.T2` terrain files, the
`.HUD` files, the executable).

## Quirks

- 6-bit RGB triplets also appear inside `.PIC` files in sizes of 32, 64,
  125, 128 and 256 entries; the same `triplets6` helper decodes them.
- The magenta placeholder is not a transparency key in `PALETTE.PAL`; it just
  marks slots the engine overwrites. Transparency in sprites comes from the
  PIC span table, not from a colour.
