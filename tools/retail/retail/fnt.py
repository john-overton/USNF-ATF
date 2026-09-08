"""``*.FNT`` bitmap font decoder (USNF'97 / ATF Gold).

A ``.FNT`` is a tiny 32-bit PE image with a Phar Lap style ``PL`` signature
and a single ``CODE`` section (plus ``.reloc``).  The section is a linked C
data structure, not resources (see Docs/formats/fnt.md):

    0      u32      line height in pixels
    4      u32[256] pointer to each glyph's routine (relocated; virtual addresses)
    0x404  u32[256] advance width per character code
    0x804  ...      glyph routines: x86 code that draws one glyph

Each glyph routine is real machine code called with ``edi`` = destination
pixel, ``al``/``ax``/``eax`` = the colour replicated 1/2/4 times, and ``ecx``
= screen pitch.  Only ``mov [edi+d], al|ax|eax``, ``add edi, ecx`` (next
row) and ``ret`` occur, so a few-line interpreter recovers the bitmap.
"""

from __future__ import annotations

import argparse
import glob
import os
import struct
import sys
from dataclasses import dataclass
from typing import List, Optional, Sequence, Set, Tuple

from .png import encode_png

SIGNATURES = (b"PE\0\0", b"PL\0\0")


class FNTError(ValueError):
    pass


@dataclass
class Glyph:
    code: int
    advance: int
    width: int                 # ink width (max x + 1), 0 if empty
    height: int                # ink height (max y + 1), 0 if empty
    pixels: Set[Tuple[int, int]]
    code_bytes: bytes


@dataclass
class Font:
    name: str
    height: int
    glyphs: List[Glyph]

    @property
    def max_advance(self) -> int:
        return max(g.advance for g in self.glyphs)

    @property
    def cell_width(self) -> int:
        return max(max(g.advance, g.width) for g in self.glyphs)


def _code_section(data: bytes, name: str) -> Tuple[bytes, int, int]:
    """Return (section bytes, virtual address, image base) of the CODE section."""
    if data[:2] != b"MZ" or len(data) < 0x40:
        raise FNTError(f"{name}: not an MZ/PE image")
    pe = struct.unpack_from("<I", data, 0x3C)[0]
    if data[pe:pe + 4] not in SIGNATURES:
        raise FNTError(f"{name}: PE signature {data[pe:pe + 4]!r} not recognised")
    machine, nsec = struct.unpack_from("<HH", data, pe + 4)
    optsz = struct.unpack_from("<H", data, pe + 20)[0]
    if machine != 0x14C:
        raise FNTError(f"{name}: machine {machine:#x} is not i386")
    image_base = struct.unpack_from("<I", data, pe + 24 + 28)[0] if optsz >= 32 else 0
    for i in range(nsec):
        s = pe + 24 + optsz + 40 * i
        sname, vsize, va, rsize, roff = struct.unpack_from("<8sIIII", data, s)
        if sname.rstrip(b"\0") == b"CODE":
            end = roff + min(vsize, rsize) if rsize else roff + vsize
            if end > len(data):
                raise FNTError(f"{name}: CODE section exceeds file")
            return data[roff:end], va, image_base
    raise FNTError(f"{name}: no CODE section")


def run_glyph(code: bytes, start: int) -> Tuple[Set[Tuple[int, int]], int]:
    """Interpret one glyph routine; returns (set of (x, y) pixels, bytes consumed)."""
    pixels: Set[Tuple[int, int]] = set()
    x = y = 0           # edi tracked as (x, y): displacement is x, ``add edi, ecx`` is y += 1
    p = start
    while True:
        if p >= len(code):
            raise FNTError(f"glyph code at {start:#x} runs off the section")
        op = code[p]
        width = 1
        if op == 0x66:                          # operand-size prefix: ax
            width = 2
            p += 1
            op = code[p]
        if op == 0xC3:                          # ret
            return pixels, p + 1 - start
        if op == 0x03 and code[p + 1] == 0xF9:  # add edi, ecx
            y += 1
            x = 0
            p += 2
            continue
        if op in (0x88, 0x89):                  # mov r/m8, r8  /  mov r/m32, r32
            if op == 0x89 and width == 1:
                width = 4
            modrm = code[p + 1]
            mod, reg, rm = modrm >> 6, (modrm >> 3) & 7, modrm & 7
            if reg != 0 or rm != 7:             # only al/ax/eax -> [edi+disp]
                raise FNTError(f"unexpected modrm {modrm:#x} at {p:#x}")
            if mod == 0:
                disp, p = 0, p + 2
            elif mod == 1:
                disp, p = struct.unpack_from("<b", code, p + 2)[0], p + 3
            elif mod == 2:
                disp, p = struct.unpack_from("<i", code, p + 2)[0], p + 6
            else:
                raise FNTError(f"register-direct mov at {p:#x}")
            for i in range(width):
                pixels.add((x + disp + i, y))
            continue
        if op == 0x83 and code[p + 1] == 0xC7:  # add edi, imm8
            x += struct.unpack_from("<b", code, p + 2)[0]
            p += 3
            continue
        if op == 0x81 and code[p + 1] == 0xC7:  # add edi, imm32
            x += struct.unpack_from("<i", code, p + 2)[0]
            p += 6
            continue
        raise FNTError(f"unknown opcode {op:#x} at {p:#x} (glyph at {start:#x})")


def parse_fnt(data: bytes, name: str = "<fnt>") -> Font:
    code, va, image_base = _code_section(data, name)
    if len(code) < 0x804:
        raise FNTError(f"{name}: CODE section too small for the tables ({len(code)} bytes)")
    height = struct.unpack_from("<I", code, 0)[0]
    if not 1 <= height <= 256:
        raise FNTError(f"{name}: implausible line height {height}")
    ptrs = struct.unpack_from("<256I", code, 4)
    advances = struct.unpack_from("<256I", code, 0x404)
    base = image_base + va
    glyphs = []
    for c in range(256):
        start = ptrs[c] - base
        if not 0x804 <= start < len(code):
            raise FNTError(f"{name}: glyph {c} pointer {ptrs[c]:#x} outside CODE")
        pixels, n = run_glyph(code, start)
        w = max(px for px, _ in pixels) + 1 if pixels else 0
        h = max(py for _, py in pixels) + 1 if pixels else 0
        if pixels and (min(px for px, _ in pixels) < 0 or h > height):
            raise FNTError(f"{name}: glyph {c} draws outside its cell (w={w} h={h} height={height})")
        if advances[c] > 4096:
            raise FNTError(f"{name}: glyph {c} advance {advances[c]} implausible")
        glyphs.append(Glyph(c, advances[c], w, h, pixels, code[start:start + n]))
    return Font(name, height, glyphs)


def load_fnt(path: str) -> Font:
    with open(path, "rb") as fh:
        return parse_fnt(fh.read(), os.path.basename(path))


SHEET_PALETTE = [(0, 0, 0), (255, 255, 255), (64, 64, 64), (128, 0, 0)]


def render_sheet(font: Font, columns: int = 16) -> Tuple[int, int, bytes]:
    """16x16 grid of glyph cells: 0 = background, 1 = ink, 2 = grid line, 3 = advance mark."""
    cw = font.cell_width + 1
    chh = font.height + 1
    rows = (256 + columns - 1) // columns
    width, height = columns * cw + 1, rows * chh + 1
    buf = bytearray(width * height)
    for yy in range(height):
        for xx in range(width):
            if xx % cw == 0 or yy % chh == 0:
                buf[yy * width + xx] = 2
    for g in font.glyphs:
        ox = (g.code % columns) * cw + 1
        oy = (g.code // columns) * chh + 1
        for dy in range(font.height):
            if 0 <= g.advance - 1 < cw - 1:
                buf[(oy + dy) * width + ox + g.advance - 1] = max(buf[(oy + dy) * width + ox + g.advance - 1], 0) or 3
        for px, py in g.pixels:
            buf[(oy + py) * width + ox + px] = 1
    return width, height, bytes(buf)


def sheet_png(font: Font) -> bytes:
    w, h, buf = render_sheet(font)
    return encode_png(w, h, buf, "P", palette=SHEET_PALETTE)


def describe(font: Font) -> str:
    inked = [g for g in font.glyphs if g.pixels]
    return (f"{font.name:14s} height={font.height:2d} cell={font.cell_width:2d} "
            f"glyphs with ink={len(inked):3d} codes {min(g.code for g in inked) if inked else 0}"
            f"..{max(g.code for g in inked) if inked else 0} "
            f"advance 1..{font.max_advance}")


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="python3 -m retail.fnt",
                                 description="Render USNF'97 / ATF Gold .FNT fonts to a PNG glyph sheet.")
    ap.add_argument("source", help="a .FNT file, or a directory with --all")
    ap.add_argument("--all", action="store_true", help="render every .FNT in the directory")
    ap.add_argument("-o", "--out", help="output .png (single) or directory (--all)")
    ap.add_argument("--info", action="store_true", help="print font info instead of writing")
    args = ap.parse_args(argv)
    if args.all:
        paths = sorted(p for p in glob.glob(os.path.join(args.source, "*")) if p.upper().endswith(".FNT"))
        if args.out:
            os.makedirs(args.out, exist_ok=True)
    else:
        paths = [args.source]
    if not args.info and not args.out:
        ap.error("-o/--out is required unless --info")
    ok = failures = 0
    for path in paths:
        try:
            font = load_fnt(path)
            if args.info:
                print(describe(font))
            else:
                target = (os.path.join(args.out, os.path.splitext(os.path.basename(path))[0] + ".png")
                          if args.all else args.out)
                with open(target, "wb") as fh:
                    fh.write(sheet_png(font))
            ok += 1
        except Exception as ex:
            failures += 1
            print(f"FAIL {path}: {ex}", file=sys.stderr)
    if args.all:
        print(f"rendered {ok}, failed {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
