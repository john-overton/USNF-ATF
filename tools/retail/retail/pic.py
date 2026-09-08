"""``*.PIC`` image decoder (USNF'97 / ATF Gold).

Layout (little-endian, 64-byte header; see Docs/formats/pic.md):

    0   u16  kind: 0 = raw rows, 1 = span list (sprite with transparency)
    2   u32  width
    6   u32  height
    10  u32  pixels offset (always 64)
    14  u32  pixels size (kind 0: width*height; kind 1: sum of span lengths)
    18  u32  palette offset (0 = none)
    22  u32  palette size in bytes (6-bit RGB triplets, overlays entries 0..)
    26  u32  span table offset      (kind 1)
    30  u32  span table size        (kind 1; kind 0 leaves a stale value here)
    34  u32  row table offset       (kind 0; height * u32 absolute row offsets)
    38  u32  row table size         (kind 0)
    42  u32  glyph table offset     (kind 0 font strips; 256 * (u16 x, u16 w, u16 h))
    46..63   zero

Span record (10 bytes): u16 y, u16 x0, u16 x1 (inclusive), u32 offset into
the pixel block; terminated by y == 0xFFFF.  Pixels are 8-bit palette indices.
"""

from __future__ import annotations

import argparse
import collections
import glob
import os
import struct
import sys
from dataclasses import dataclass, field
from typing import List, Optional, Sequence, Tuple

from .pal import RGB, grayscale, load_pal, overlay, triplets6
from .png import encode_png

HEADER_SIZE = 64
KIND_RAW = 0
KIND_SPANS = 1
_HEADER = struct.Struct("<H2I10I")      # kind, w, h, 10 offset/size words -> 50 bytes
_SPAN = struct.Struct("<HHHI")
_GLYPH = struct.Struct("<HHH")
SPAN_END = 0xFFFF


class PICError(ValueError):
    pass


@dataclass
class Span:
    y: int
    x0: int
    x1: int          # inclusive
    offset: int      # into the pixel block

    @property
    def length(self) -> int:
        return self.x1 - self.x0 + 1


@dataclass
class Pic:
    name: str
    kind: int
    width: int
    height: int
    pixels: bytes                      # width*height indices, row-major
    mask: Optional[bytes] = None       # kind 1: width*height, 1 = opaque
    palette: Optional[List[RGB]] = None   # embedded, 8-bit, overlays index 0..
    spans: List[Span] = field(default_factory=list)
    glyphs: Optional[List[Tuple[int, int, int]]] = None   # 256 * (x, w, h)
    fields: Tuple[int, ...] = ()       # the 10 raw offset/size words

    @property
    def variant(self) -> str:
        v = "raw" if self.kind == KIND_RAW else "spans"
        if self.palette is not None:
            v += f"+pal{len(self.palette)}"
        if self.glyphs is not None:
            v += "+glyphs"
        return v

    def used_indices(self) -> collections.Counter:
        if self.mask is None:
            return collections.Counter(self.pixels)
        return collections.Counter(p for p, m in zip(self.pixels, self.mask) if m)


def parse_pic(data: bytes, name: str = "<pic>") -> Pic:
    if len(data) < HEADER_SIZE:
        raise PICError(f"{name}: {len(data)} bytes is shorter than the 64-byte header")
    kind, width, height, *f = _HEADER.unpack_from(data, 0)
    if data[50:64] != b"\0" * 14:
        raise PICError(f"{name}: header bytes 50..63 are not zero")
    if kind not in (KIND_RAW, KIND_SPANS):
        raise PICError(f"{name}: unknown kind {kind}")
    if width <= 0 or height <= 0 or width > 8192 or height > 8192:
        raise PICError(f"{name}: implausible size {width}x{height}")
    pix_off, pix_size, pal_off, pal_size, span_off, span_size, row_off, row_size, glyph_off, _ = f
    if pix_off != HEADER_SIZE:
        raise PICError(f"{name}: pixel block at {pix_off}, expected {HEADER_SIZE}")
    if pix_off + pix_size > len(data):
        raise PICError(f"{name}: pixel block {pix_off}+{pix_size} exceeds file ({len(data)})")

    palette = None
    if pal_off or pal_size:
        if pal_off + pal_size > len(data) or pal_size % 3 or pal_size > 768:
            raise PICError(f"{name}: bad palette chunk {pal_off}+{pal_size}")
        palette = triplets6(data[pal_off:pal_off + pal_size])

    spans: List[Span] = []
    mask = None
    if kind == KIND_RAW:
        if pix_size != width * height:
            raise PICError(f"{name}: raw pixel size {pix_size} != {width}x{height}")
        pixels = bytes(data[pix_off:pix_off + pix_size])
        if row_off or row_size:
            if row_size != 4 * height or row_off + row_size > len(data):
                raise PICError(f"{name}: row table {row_off}+{row_size} not {height} u32s")
            rows = struct.unpack_from(f"<{height}I", data, row_off)
            for y, r in enumerate(rows):
                if r != pix_off + y * width:
                    raise PICError(f"{name}: row {y} offset {r} != {pix_off + y * width}")
    else:
        if not span_off or span_off + 10 > len(data):
            raise PICError(f"{name}: kind 1 without a span table")
        canvas = bytearray(width * height)
        m = bytearray(width * height)
        pos = span_off
        total = 0
        while True:
            if pos + 10 > len(data):
                raise PICError(f"{name}: span table runs past end of file")
            y, x0, x1, off = _SPAN.unpack_from(data, pos)
            pos += 10
            if y == SPAN_END:
                break
            if y >= height or x0 > x1 or x1 >= width:
                raise PICError(f"{name}: span y={y} x={x0}..{x1} outside {width}x{height}")
            n = x1 - x0 + 1
            if off + n > pix_size:
                raise PICError(f"{name}: span data {off}+{n} exceeds pixel block {pix_size}")
            row = y * width
            canvas[row + x0:row + x1 + 1] = data[pix_off + off:pix_off + off + n]
            m[row + x0:row + x1 + 1] = b"\1" * n
            spans.append(Span(y, x0, x1, off))
            total += n
        if pos - span_off != span_size:
            raise PICError(f"{name}: span table is {pos - span_off} bytes, header says {span_size}")
        if total != pix_size:
            raise PICError(f"{name}: spans cover {total} pixels, pixel block is {pix_size}")
        pixels = bytes(canvas)
        mask = bytes(m)

    glyphs = None
    if glyph_off:
        if glyph_off + 256 * 6 > len(data):
            raise PICError(f"{name}: glyph table {glyph_off} needs 1536 bytes")
        glyphs = [_GLYPH.unpack_from(data, glyph_off + 6 * i) for i in range(256)]
        for x, w, h in glyphs:
            if x + w > width or h > height:
                raise PICError(f"{name}: glyph x={x} w={w} h={h} outside strip {width}x{height}")

    return Pic(name, kind, width, height, pixels, mask, palette, spans, glyphs, tuple(f))


def load_pic(path: str) -> Pic:
    with open(path, "rb") as fh:
        return parse_pic(fh.read(), os.path.basename(path))


def resolve_palette(pic: Pic, base: Optional[Sequence[RGB]] = None) -> List[RGB]:
    """256 entries: ``base`` (or a grey ramp) with the embedded palette overlaid at 0."""
    pal = list(base) if base is not None else grayscale()
    if len(pal) != 256:
        raise PICError(f"base palette has {len(pal)} entries, need 256")
    if pic.palette:
        pal = overlay(pal, pic.palette, 0)
    return pal


def to_png(pic: Pic, base: Optional[Sequence[RGB]] = None,
           transparent: Optional[int] = None) -> bytes:
    """Encode as an indexed PNG.  Kind-1 masks become a transparent palette entry;
    ``transparent`` additionally makes one index (e.g. 0 or 255) transparent."""
    pal = resolve_palette(pic, base)
    pixels = pic.pixels
    trns = None
    if pic.mask is not None:
        used = set(pic.used_indices())
        free = [i for i in (255, 0) if i not in used] or [i for i in range(256) if i not in used]
        if not free:
            # Every index is in use under the mask; fall back to RGBA.
            rgba = bytearray()
            for p, m in zip(pixels, pic.mask):
                rgba += bytes(pal[p]) + (b"\xff" if m and p != transparent else b"\0")
            return encode_png(pic.width, pic.height, bytes(rgba), "RGBA")
        key = free[0]
        pixels = bytes(key if not m else p for p, m in zip(pixels, pic.mask))
        trns = bytearray(b"\xff" * 256)
        trns[key] = 0
    if transparent is not None:
        trns = trns or bytearray(b"\xff" * 256)
        trns[transparent] = 0
    return encode_png(pic.width, pic.height, pixels, "P", palette=pal,
                      transparency=bytes(trns) if trns else None)


def load_base_palette(path: str) -> List[RGB]:
    """A 256-entry palette from a ``.PAL`` or from a ``.PIC`` that embeds a full one
    (UI screens such as the briefing backgrounds carry their own palette)."""
    if path.upper().endswith(".PIC"):
        pic = load_pic(path)
        if not pic.palette or len(pic.palette) != 256:
            raise PICError(f"{path}: no 256-entry embedded palette to use as a base")
        return pic.palette
    return load_pal(path)


def describe(pic: Pic) -> str:
    used = pic.used_indices()
    lo, hi = (min(used), max(used)) if used else (0, 0)
    s = (f"{pic.name:14s} kind={pic.kind} {pic.width}x{pic.height} {pic.variant:14s} "
         f"indices {lo}..{hi} ({len(used)} used)")
    if pic.spans:
        s += f" spans={len(pic.spans)}"
    return s


def _iter_pics(dirpath: str) -> List[str]:
    files = [p for p in glob.glob(os.path.join(dirpath, "*")) if p.upper().endswith(".PIC")]
    return sorted(files)


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="python3 -m retail.pic",
                                 description="Decode USNF'97 / ATF Gold .PIC images to PNG.")
    ap.add_argument("source", help="a .PIC file, or a directory of them with --all")
    ap.add_argument("--all", action="store_true", help="decode every .PIC in the source directory")
    ap.add_argument("--pal", help="PALETTE.PAL to use for indices the PIC does not define")
    ap.add_argument("-o", "--out", help="output .png (single) or directory (--all)")
    ap.add_argument("--transparent", type=int, help="also make this palette index transparent")
    ap.add_argument("--info", action="store_true", help="print header info instead of writing")
    args = ap.parse_args(argv)

    base = load_base_palette(args.pal) if args.pal else None
    paths = _iter_pics(args.source) if args.all else [args.source]
    if args.all and not paths:
        print(f"no .PIC files in {args.source}", file=sys.stderr)
        return 2
    if not args.info and not args.out:
        ap.error("-o/--out is required unless --info")
    if args.all and args.out:
        os.makedirs(args.out, exist_ok=True)

    counts: collections.Counter = collections.Counter()
    failures = 0
    for path in paths:
        try:
            pic = load_pic(path)
            if args.info:
                print(describe(pic))
            else:
                target = (os.path.join(args.out, os.path.splitext(os.path.basename(path))[0] + ".png")
                          if args.all else args.out)
                with open(target, "wb") as fh:
                    fh.write(to_png(pic, base, args.transparent))
            counts[pic.variant] += 1
        except Exception as ex:      # report and continue; never skip silently
            failures += 1
            print(f"FAIL {path}: {ex}", file=sys.stderr)
    if args.all:
        for variant, n in sorted(counts.items()):
            print(f"{variant:20s} {n}")
        print(f"decoded {sum(counts.values())}, failed {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
