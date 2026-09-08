# FNT (`*.FNT`)

Status: **decoded** (all 24 files on both discs render), medium-high
confidence. Decoder: `tools/retail/retail/fnt.py`; batch:
`python3 -m retail.fnt --all <dir> -o <outdir>` writes a 16x16 glyph sheet
PNG per font.

The `.FNT` files are not bitmaps in the usual sense: each is a tiny 32-bit
i386 PE image whose single `CODE` section is a linked C data structure
containing one **compiled drawing routine per character**. The game calls
the routine with the destination pointer in `edi`, the colour replicated in
`al`/`ax`/`eax`, and the screen pitch in `ecx`; the routine stores pixels and
returns. Decoding means interpreting that small instruction subset.

Twelve fonts per title: `4X6`, `4X12`, `HUD00`, `HUD01`, `HUD11`,
`HUDSYM00`, `HUDSYM01`, `HUDSYM11`, `MAPFONT`, `WIN00`, `WIN01`, `WIN11`.
The `00`/`01`/`11` suffixes are resolution variants (320x200 double-height
pixels, 640x400, 640x480): `HUD00` is 5 px high, `HUD01` 10 px, `HUD11`
10 px but twice as wide. `HUDSYM*` hold the HUD symbology (target boxes,
diamonds, carets, ticks) in codes 1..58 (ATF: 1..70), not text.

## Container

Standard MZ stub, `e_lfanew` at 0x3C, then a PE header whose signature is
`PL\0\0` instead of `PE\0\0` (the Phar Lap TNT DOS-extender flavour; ATF's
files also carry a `$$DOSX` section). COFF: machine 0x14C, 2 or 3 sections,
optional header magic 0x10B, `ImageBase` 0. Sections:

| Name | Content |
|---|---|
| `CODE` | the font (VA 0x1000, raw offset 0x200) |
| `.reloc` | 256 base relocations, one per glyph pointer |
| `$$DOSX` | ATF only, 512 bytes, extender stub data; ignored |

The decoder reads only the `CODE` section and subtracts `ImageBase + VA`
from the pointers (equivalent to applying the relocations for base 0).

## CODE section

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | uint32 line height in pixels |
| 4 | 4 x 256 | uint32 virtual address of each character's routine |
| 0x404 | 4 x 256 | uint32 advance width of each character |
| 0x804 | ... | routines, in character order, variable length, back to back |

Codes without a glyph point at a routine that is just `ret` (1 byte) and
have advance 1.

## Glyph routine instruction subset

Everything seen on both discs (checked: every routine of all 24 fonts
decodes with no unknown opcode):

| Bytes | Meaning | Effect |
|---|---|---|
| `88 07` | `mov [edi], al` | 1 pixel at x = 0 |
| `88 47 d8` | `mov [edi+d8], al` | 1 pixel at x = d8 |
| `66 89 07` / `66 89 47 d8` | `mov [edi(+d8)], ax` | 2 pixels |
| `89 07` / `89 47 d8` | `mov [edi(+d8)], eax` | 4 pixels |
| `03 F9` | `add edi, ecx` | next row (x resets to 0) |
| `C3` | `ret` | end of glyph |

The interpreter also accepts `mod=2` (disp32) forms and `add edi, imm8/imm32`
(`83 C7`, `81 C7`) in case a larger font uses them, but none does. The
bitmap is 1-bit: a pixel is either written with the caller's colour or left
alone (glyphs are drawn over the existing background, no box).

Glyph width is not stored separately: the ink width is the largest x
written plus one, and the advance table gives the spacing. Glyph height is
bounded by the line height in every file.

## Rendered sheets

`render_sheet` lays the 256 codes in a 16x16 grid of `(cell_width+1) x
(height+1)` cells: index 0 background, 1 ink, 2 grid, 3 a one-pixel mark at
the advance column. `HUD00.png` reads as a clean 5-pixel HUD font;
`HUDSYM00.png` shows the target/waypoint symbols.

## Unknowns

- No per-font baseline, colour, or kerning data is present; colour comes
  from the caller (`eax`), so HUD colour lives elsewhere (`.HUD` files or code).
- Why the resource is compiled to code rather than stored as bits: presumably
  speed on 1996 CPUs. It means a port must rasterise these once at import
  time rather than executing anything.
