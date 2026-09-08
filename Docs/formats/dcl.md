# PKWare DCL "implode" (flag-4 LIB entries, `PKWA` ESA entries)

Status: **decoded**. Decoder: `tools/retail/retail/dcl.py`.

## Identification

The build plan left the flag-4 codec unidentified. The tell was the two-byte
header that begins every compressed LIB entry after its size prefix (`00 06`)
and every `PKWA` ESA entry (`00 06` and `00 04`): the PKWare Data Compression
Library's `implode()` writes exactly a literal-mode byte (0 or 1) followed by
a dictionary-size byte (4, 5, or 6). The installer even ships PKWare's decoder
as `PKCOMP.IDKDECODLL`. A faithful port of the public reference decoder
decodes all 8,413 flag-4 entries in the four core LIBs and all 27 `PKWA` ESA
entries to exactly their declared sizes, which settles it.

## Reference

Mark Adler's `blast.c` / `blast.h` in zlib, `contrib/blast/` (zlib licence),
is a complete, public description of the format in code form, including the
fixed Huffman code lengths. Our decoder ports its logic; the tables are copied
from it unchanged. Its README supplies the reference vector used in
`tests/test_dcl.py`: the stream `00 04 82 24 25 8f 80 7f` decodes to
`AIAIAIAIAIAIA`.

## Format summary

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | Literal mode: `0` = literals are raw 8-bit values, `1` = literals use the fixed literal Huffman code |
| 1 | 1 | Dictionary size code `d` in 4..6; window is `1 << (d + 6)` bytes (1, 2, or 4 KiB) |
| 2 | … | Bit stream, LSB first within each byte |

Bit stream, repeated until the end code:

- `0` bit: a literal follows (8 raw bits, or one literal code).
- `1` bit: a length code, then a distance code.
  - Length: one of 16 fixed-Huffman symbols; symbol `s` gives
    `base[s] + extra bits`, with `base = 3,2,4,5,6,7,8,9,10,12,16,24,40,72,136,264`
    and `extra = 0,0,0,0,0,0,0,0,1,2,3,4,5,6,7,8` bits. Length 519
    (symbol 15 with extra value 255) is end of stream.
  - Distance: one of 64 fixed-Huffman symbols `h`, then `k` low bits, where
    `k = 2` if the length is 2, else `k = d`; `distance = (h << k) + low + 1`.
  - Copy `length` bytes from `distance` back; overlapping copies repeat.

Huffman codes are canonical over the fixed length tables in `blast.c`, and are
transmitted MSB first with every bit inverted (so the shortest code of a set
is all ones on the wire and the longest all zeros).

## Implementation notes

The Python port trades `blast.c`'s bit-at-a-time decoding for three flat
lookup tables of 2^13 entries (13 is the maximum code length), each entry
packing `symbol << 4 | code length`, indexed by the next 13 bits of the
stream. A 32-bit accumulator is refilled a byte at a time only when it drops
below 24 bits, so a whole flag/code/extra step never touches the input. On an
Apple Silicon Mac, all flag-4 entries of the four core LIBs (225 MB output)
decode in about 12 s; `ATF_4B.LIB` (34.8 MB) in about 2 s.

Reads past the end of input are treated as zero bits and then rejected if the
decoder actually consumed them, so a truncated stream raises rather than
returning garbage. `explode(data, expected_size)` also rejects any stream that
produces more or fewer bytes than expected.

## Quirks observed

- All LIB streams use literal mode 0 and a 4 KiB dictionary. ESA streams use
  literal mode 0 with dictionary code 4 or 6.
- Neither container stores the compressed length explicitly for LIBs (it is
  the gap to the next entry) and trailing bytes after the end code, if any,
  are ignored.
