# ESA (`SETUP.ESA`, Electronic Arts installer archive)

Status: **decoded**. Reader: `tools/retail/retail/esa.py`.

The installer payload on both CDs. It holds the game executable, DLLs, text
files, and, most importantly, the core data LIBs (`USNF_1/2.LIB`,
`ATF_1/2/4B.LIB`) that the installer copies to the hard disk. The root LIBs
stay on the CD and are not in the ESA. The plain-text `SETUP.SSF` next to it
lists what gets installed where (`INSTALL_FILES "USNF_1.LIB", "USNF95_LIBS",
"[INSTALL_PATH]"`), and its labels match the ESA `label` field.

## Layout

All integers little-endian.

| Offset | Size | Field |
|---|---|---|
| 0 | 29 | Magic `ELECTRONIC_ARTS_ARCHIVE_FILE` followed by a NUL |
| 29 | … | Directory: variable-length entries, back to back |
| — | 1 | Directory terminator: a single `00` byte (an empty name) |
| — | … | Entry data, in directory order, tightly packed to end of file |

There is no entry count. The directory is read until a name of zero length.
The first data offset is exactly the byte after that terminator.

### Directory entry (variable length, 25 bytes + two strings)

| Offset | Size | Field |
|---|---|---|
| 0 | n+1 | File name, NUL terminated (may contain spaces and apostrophes, e.g. `JANE'S HOME PAGE.URL`; no path separators seen) |
| — | m+1 | Install label, NUL terminated (`USNF95_LIBS`, `ATF_EXECUTABLE_FILES`, …); keys into the SSF script |
| — | 4 | uint32 attributes. `0x211` for everything except the uninstaller (`0x221`) |
| — | 4 | uint32 uncompressed size |
| — | 4 | uint32 timestamp, seconds since 1970-01-01 (values decode to Oct 1996 / Mar 1997, matching the products) |
| — | 5 | Codec tag, 4 ASCII chars + NUL: `PKWA` or `NULL` |
| — | 4 | uint32 compressed size (bytes occupied in the archive) |
| — | 4 | uint32 absolute offset of the data |

The earlier probe that appeared off by one byte was reading the fixed fields
without accounting for the NUL after the codec tag; with that 5th byte the
sizes tile the file exactly (`ESA.tiles()`), and every `NULL`-coded `.LIB`
entry's offset points at an `EALIB` magic.

### Codecs

- `NULL`: stored. Compressed size equals uncompressed size.
- `PKWA`: PKWare DCL implode (see `dcl.md`). No size prefix inside the data;
  the directory's uncompressed size is authoritative and is enforced.
  `ATF_4B.LIB` (33.2 MB compressed, 34.8 MB uncompressed) is the largest
  single stream and decodes cleanly; it is a normal EALIB inside.

## Verified

- USNF'97: 16 entries, directory ends at byte 900, entries tile the file.
- ATF Gold: 18 entries, directory ends at byte 970, entries tile the file.
- All 27 `PKWA` entries across both discs explode to their stated size.

## Quirks

- `PKCOMP.IDKDECODLL` (label `SETUP_SPECIAL_FILES`) is the installer's own
  DCL decoder DLL, stored uncompressed, which is consistent with `PKWA` being
  PKWare's library.
- Two loose `.MT` / `.TXT` files (`EXAMPLE.MT`, `BRIEFING.TXT`) live in the
  ESA rather than a LIB; they are user-editable mission text samples.
