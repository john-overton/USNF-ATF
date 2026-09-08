# SH: partial shape decoder

Reviewed 2026-09-08 against `31f733e` and locally extracted media. Implementation:
[`tools/retail/retail/sh.py`](../../tools/retail/retail/sh.py). This describes the
current decoder and its limits, not a complete format specification.

## Container and implemented records

The parser reads an MZ stub, the header pointer at file offset `0x3c`, and a
`PL` or `PE` signature. It reads standard 40-byte section-table entries for
`CODE`, optional `.idata`, and `.reloc`. The drawing program is in `CODE`.
The relocation parser collects HIGHLOW entries; the walker uses them to find
interpreter re-entry targets in opaque x86 blocks. It does not execute retail code.

| Record | Current interpretation | Confidence / limitation |
|---|---|---|
| `0x82` | 6-byte header, uint16 count at +2, followed by count signed int16 XYZ triples | Vertex payload reproduces aircraft-shaped bounds. Header uint16 at +4 is currently ignored; likely significant for indexing. |
| `0xfc` | Polygon subtype, flags, palette value, optional normal/centroid, indices, optional UVs | Parses records, but vertex references are not reliably resolved. UVs are not exported to OBJ. |
| `0xbc` | Selected point/line subtypes | Only a subset emits primitives. |
| `0x42` | NUL-terminated source name starting at +2 | Used for diagnostics. |
| `0xe2` | Texture name in a 14-byte field starting at +2 | Names collected; textures are not applied. |
| Relative jumps / state tests | Traverse both branches; collect reachable records | No selected animation state or single LOD is reconstructed. |
| `0xf0` | Opaque x86 stub; locate push/push/ret patterns using relocations | Heuristic; resets current table to -1. |

Other opcodes are skipped using inferred sizes in `FIXED`, `BC_SIZES`, and
jump tables. A traversal with no stops does not establish those semantics.

## Reproduced F-14 export failure

Current output: 34 vertex tables, 533 vertices, 105 parsed polygons, **8 OBJ
faces**, no unknown-opcode stops. Of the 97 omitted polygons, 96 have indices
outside the assigned table and one has no assigned table (`table == -1`).
`to_obj` already computes an OBJ offset for every table; the earlier progress
log's suggestion that it only exports one table was a hypothesis, not the cause.

A concrete lead: table 0 has 189 vertices. Table 1's ignored header field is
1512 (`189 * 8`), its payload contains six vertices, and polygon references
include 189 through 194. Table 2's field is 1560 (`195 * 8`), with references
starting at 195. These observations suggest addressing into a shared vertex
buffer in eight-byte slots. This has **not** been implemented or validated as
the full indexing rule; branch-local updates and animation may also matter.

Additional unresolved issues:

- The walker tracks visited byte offsets without including incoming vertex
  state. A shared block reached with different state may need revisiting.
- x86 re-entry discards the current table. Determine which state actually survives.
- OBJ swaps stored `(x, y, z)` to `(x, z, y)`. The source claims this makes Y
  vertical, while F-14 stored bounds are thinnest in Y. Axis orientation, scale,
  winding, and normals still need visual validation.
- `all_tables` is an unused exporter argument. Materials are palette colours;
  exported geometry does not yet preserve texture mapping or animation.
- Some bounds checks happen after indexed reads; malformed data can raise
  `IndexError`/`struct.error` rather than a controlled `SHError`.
- No SH unit tests exist. No recognizable F-14 viewer result has been verified.

## Coverage and next experiment

See [phase 0 baseline](../baselines/phase-0.md) for reproducible census commands.
All 353 USNF shapes and 1,043 ATF shapes parse without exceptions in this census,
but only 316 / 980 respectively have polygons and no stops. USNF stops at `0x6e`
and `0x13`; ATF also stops at `0xe8`. Zero-polygon results are unclassified,
not confirmed successful billboard conversions.

Next: model the `0x82` destination offset explicitly, test shared vertex-buffer
updates with synthetic records, and report resolved/dropped primitives. Validate
F-14 geometry visually from several angles with outputs in `extracted/`, then
repeat across both titles. Do not close phase 0 on polygon counts alone.

The batch CLI returns 1 when any shape lacks polygons or has stops; single-file
conversion can return 0 despite incomplete geometry. Always inspect exported
face counts and diagnostics as well as the exit status.
