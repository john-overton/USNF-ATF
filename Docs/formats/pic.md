# PIC (`*.PIC`)

Status: **decoded**, high confidence for the container, pixel data, span
table, embedded palettes and font-strip glyph table (all 4,140 files on both
discs decode with every size relation verified). Medium confidence on the
meaning of a few header words that are stale or redundant. Decoder:
`tools/retail/retail/pic.py`; batch: `python3 -m retail.pic --all <dir>
--pal <PALETTE.PAL|screen.PIC> -o <outdir>`.

8-bit indexed images. Two kinds share one 64-byte header: kind 0 is a plain
raster (backgrounds, textures, encyclopedia photos, font strips), kind 1 is a
sprite stored as a list of horizontal spans, which is how transparency is
expressed (there is no colour key).

## Header (64 bytes, little-endian)

| Offset | Size | Field | Notes |
|---|---|---|---|
| 0 | 2 | `kind` | 0 = raw rows, 1 = span list. No other values occur |
| 2 | 4 | `width` | pixels |
| 6 | 4 | `height` | pixels |
| 10 | 4 | `pixels_off` | always 64 |
| 14 | 4 | `pixels_size` | kind 0: `width*height`; kind 1: total pixels covered by spans |
| 18 | 4 | `palette_off` | 0 if none |
| 22 | 4 | `palette_size` | bytes; 6-bit RGB triplets, see below |
| 26 | 4 | `spans_off` | kind 1 only; 0 in kind 0 |
| 30 | 4 | `spans_size` | kind 1: bytes of span table incl. terminator. Kind 0: **stale** (see quirks) |
| 34 | 4 | `rows_off` | kind 0 only: row offset table |
| 38 | 4 | `rows_size` | kind 0: `4*height` |
| 42 | 4 | `glyphs_off` | kind 0 font strips only, else 0 |
| 46 | 4 | 0 | (a size for the glyph table would go here; always 0, table runs to EOF) |
| 50 | 14 | 0 | always zero |

Chunks follow the header in this order: pixels, palette (if any), span or
row table, glyph table (if any). Each chunk after the pixel block starts on a
16-byte boundary (the gap is zero padded), which is why `spans_off` is
usually not `64 + pixels_size`.

## Pixel block

Kind 0: `width*height` bytes, row-major, top row first, no padding. Every
kind-0 file also has a row table of `height` uint32 absolute file offsets;
in every file it is exactly `64 + y*width`, so it is redundant (the decoder
verifies it).

Kind 1: the pixel block holds only the opaque runs, back to back, in span
order. Everything not covered by a span is transparent.

### Span record (10 bytes)

| Offset | Size | Field |
|---|---|---|
| 0 | 2 | `y` row; `0xFFFF` terminates the table |
| 2 | 2 | `x0` first column |
| 4 | 2 | `x1` last column, **inclusive** |
| 6 | 4 | offset of the run inside the pixel block |

Spans are sorted by `y` then `x0`; a row may have several. The run offsets
are cumulative (`offset[i+1] = offset[i] + length[i]`) and the sum of all
lengths equals `pixels_size` in all 821 kind-1 files. A span may contain
index 0 (the mouse pointer draws a black outline with it), so index 0 is an
ordinary colour inside a span.

## Embedded palette

`palette_size / 3` entries of 6-bit R, G, B (same encoding as
[pal.md](pal.md)). Sizes seen: 32, 64, 125, 128, 256. The table always
overlays the hardware palette **starting at index 0**: the cockpit PICs'
64-entry tables reproduce `PALETTE.PAL` entries 47..60 (the grey ramp) at the
same positions, and the 128-entry map/mouse palettes and 256-entry screen
palettes start with black at 0. Files without a palette rely on whatever
is loaded: `PALETTE.PAL` in flight, or the palette of the UI screen they are
drawn on (e.g. `$AIM9M.PIC` looks right against `AR_BACK.PIC`'s palette).

## Glyph table (font strips)

25 kind-0 files per title named `*FONT*.PIC`, `FNT*.PIC`, `PANLFNT*.PIC`
etc. are one-row strips (e.g. 1291x16) with `glyphs_off` set. The table is
256 records of `(uint16 x, uint16 width, uint16 height)`, one per character
code, giving the glyph's column range in the strip. Unused codes have
width 1 and share `x` with their neighbours. This is a separate, simpler
mechanism from the `.FNT` fonts ([fnt.md](fnt.md)).

## Variants and counts

| Variant | USNF'97 | ATF Gold | Typical content |
|---|---|---|---|
| raw | 493 + 316 | 450 + 962 | UI parts, textures (`USNF_2`/`ATF_2` `_*.PIC` object textures, all 256 wide) |
| raw + glyph table | 25 | 25 | proportional font strips |
| raw + 256-entry palette | 45 + 494 | 50 + 587 | full screens (640x480, 512x384), encyclopedia photos (`USNF_3`/`ATF_3`, all 512x384) |
| raw + 128-entry palette | 3 | 5 | theatre maps (`KURIL`, `UKR`, `VIET`; 600..800 px square) |
| raw + 125-entry palette | 1 | 1 | `SLIDEMID.PIC` (34x8 slider piece) |
| spans | 235 | 338 | weapon icons (`$*`, 105x19), buttons, cockpit side-view masks |
| spans + 64-entry palette | 30 | 76 | cockpit frames (`~<AC>.PIC` and `~<AC>H.PIC`, 1280x490) |
| spans + 128 / 32 palette | 1 + 1 | 1 + 1 | `MOUSEPTR.PIC`, `MOUSE320.PIC` |

Totals: USNF'97 1,644 (834 + 316 + 494), ATF Gold 2,496 (947 + 962 + 587), all decoded, none failed.

## Naming conventions observed

- `~<AC>.PIC` / `~<AC>H.PIC` / ATF `~<AC>S.PIC`: cockpit canopy frame at
  three resolutions. `~F14.PIC` draws only in the top-left 640x240 of its
  1280x490 canvas (320x200 mode, doubled), `~F14H.PIC` fills the canvas.
- `~<AC>_L`, `_R`, `_C` (+`H`/`S`): left/right/centre look-view frames.
  They are single-index silhouettes (index 46 or 39 only), i.e. stencils
  drawn in the cockpit's own palette, not artwork.
- `~<AC>_P.PIC`: small 81x80 kind-0 icon (padlock/rear view indicator).
- `$<weapon>.PIC`: 105x19 loadout icons, UI palette.
- `_<object>.PIC` in `USNF_2`/`ATF_2`: 3D-object texture pages, 256 wide,
  flight palette; every one uses index 255, probably as the unused/keyed
  colour (unverified until `.SH` texturing is understood).
- `K<lat><lon>.PIC` (e.g. `K012016`): 128x128 map tiles of the Kurils.
- `PANEL.PIC` 640x480: instrument-panel background texture.
- `SKY0..8`, `OCEAN*`, `CLOUDS`: 256-wide gradient/texture strips using the
  run-time palette ranges (render magenta against `PALETTE.PAL`).
- `HUD*.FNT` / `HUDSYM*.FNT` (not PIC) are the HUD text and symbols.

## Quirks

- In kind-0 files, `spans_size` (offset 30) holds a value of the form
  `10*(n+1)` that does not correspond to any chunk (e.g. 4810 for every
  640x480 screen, i.e. one span per row plus terminator). It looks like a
  leftover from the tool that converted sprites to rasters; ignored.
- `~F14_C.PIC` and friends have `pixels_size < width*height` only because
  the span list skips the transparent parts; four ATF files (`IFM*.PIC`)
  are kind 1 with spans covering every pixel.
- No PIC on either disc is compressed inside the PIC; compression is only at
  the EALIB level.
- The PNG batch maps kind-1 transparency to a free palette index with a
  tRNS entry (255 is normally free in sprites), falling back to RGBA if all
  256 indices are in use. Kind-0 output is a straight indexed PNG.
