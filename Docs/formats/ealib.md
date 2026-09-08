# EALIB (`*.LIB`)

Status: **decoded**. Reader: `tools/retail/retail/ealib.py`.

The primary asset container for USNF'97 and ATF Gold. Every `.LIB` on both
discs (root LIBs and the ones embedded in `SETUP.ESA`) uses it. There are no
sub-directories, no per-entry sizes, and no checksums; it is a flat table of
names and offsets.

## Layout

All integers little-endian.

| Offset | Size | Field |
|---|---|---|
| 0 | 5 | Magic `EALIB` (ASCII, no terminator) |
| 5 | 2 | uint16 `N`: number of directory entries **minus one** |
| 7 | 18 × (N+1) | Directory entries |
| 7 + 18(N+1) | … | Entry data, in directory order, tightly packed |

### Directory entry (18 bytes)

| Offset | Size | Field |
|---|---|---|
| 0 | 13 | Name, NUL padded. 8.3 DOS names (`PALETTE.PAL`, `F14.SH`). Names may start with punctuation (`~~`, `&`) |
| 13 | 1 | Flag: `0` = stored, `4` = compressed (see below) |
| 14 | 4 | uint32 absolute file offset of the entry's data |

### Deriving sizes

There is no size field. An entry's stored length is the distance to the next
entry's offset. Offsets are monotonically increasing in every archive we have.

### Sentinel entry

The last directory entry is always a terminator, not a file: empty name,
flag 0, and its offset equals the file size. It exists so the last real entry
can be measured the same way as the others. Consequently the header's `N`
equals the number of *real* files, and the sentinel makes N+1 entries. The
reader parses it, records `EALib.sentinel = True`, and hides it from
`entries`. All 12 archives on both discs have it.

### Compressed entries (flag 4)

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | uint32 uncompressed size |
| 4 | … | PKWare DCL implode stream (see `dcl.md`) |

Every flag-4 stream on both discs starts with header bytes `00 06`: raw 8-bit
literals and a 4 KiB dictionary. The decoder validates that the stream
produces exactly the prefixed size and that the end-of-stream code is reached.

Flag 0 entries are raw bytes. Only flags 0 and 4 occur (140 stored, 8,413
compressed across the four core LIBs; the big root LIBs are mostly stored
video and audio).

## Verified

- All 12 LIBs (4 core, 8 root, both titles) parse; every entry lies inside
  the file and past the directory.
- Every flag-4 entry decodes to exactly its size prefix (test
  `test_every_lib_entry_decompresses_to_size_prefix`).
- Extracting `USNF_1.LIB` from the ESA is byte-identical to an independent
  slice of the same file.

## Quirks

- Six of the entries reported by a naive lister are the sentinels above; the
  build plan's counts (834 PIC + 12 FNT = 846 in `USNF_1.LIB`) match once the
  sentinel is dropped.
- Names are not guaranteed unique: `USNF_2.LIB` lists 52 `.XMI` music files
  twice each, as adjacent directory entries with byte-identical content (so
  the archive carries about 250 KB of redundant data). No other archive has
  duplicates. `EALib.get(name)` returns the last occurrence and is
  case-insensitive; `extract` overwrites and reports the count.
- One large stored root LIB (`ATF_10.LIB`, 516 MB) is memory-mapped rather
  than read; the directory is only a few KB.
