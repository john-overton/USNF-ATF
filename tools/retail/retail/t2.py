"""``.T2`` terrain (theater) reader.  Partial decode; see Docs/formats/t2.md.

Layout (little-endian):

    0x00   4    magic ``BIT2``
    0x04   80   theater display name, NUL padded ("Kuril Islands")
    0x54   16   briefing-map picture name, NUL padded ("kuril.PIC")
    0x64   u32  tiles wide?   (25 or 32; equals 0x6c in every file seen)
    0x68   u32  0
    0x6c   u32  tiles high?
    0x70   u32  0
    0x74   u32  0
    0x78   u32  2048  == 8 << 8: cells per tile edge, 24.8 fixed point
    0x7c   u32  width  << 8 (tiles)
    0x80   u32  height << 8 (tiles)
    0x84   16   unknown
    0x94   (width*8) * (height*8) * 3   cell grid, row-major, 3 bytes per cell
    then   width * height * 3           tile table, 3 bytes per tile
    then   1                            trailing byte

Every retail file satisfies ``size == 0x94 + cells*3 + tiles*3 + 1`` with
width/height read from 0x7c/0x80 (0x64/0x6c disagree with 0x7c for Ukraine,
which is 26 x 25; 0x7c/0x80 are the ones that fit the file size and the row
stride of the cell grid).

Cell bytes: ``[0]`` is 0 at sea and rises inland (elevation class, units not
yet known); ``[1]`` is 0xFF at sea and an index in 0xC0..0xDF on land
(texture / tile-set id); ``[2]`` is a small land-class code (0..12).  Sea is
``(0, 0xFF, 1)``.  Rendered as ASCII the grid shows the Kuril arc and the
Vietnamese coast, which is the evidence for the layout.

    python3 -m retail.t2 --list extracted/usnf97/USNF_2.LIB
    python3 -m retail.t2 extracted/usnf97/USNF_2.LIB/KURILE.T2     # ASCII map
"""

from __future__ import annotations

import os
import struct
import sys
from dataclasses import dataclass

MAGIC = b"BIT2"
HEADER = 0x94
CELLS_PER_TILE = 8
SEA = (0, 0xFF, 1)


class T2Error(ValueError):
    pass


@dataclass
class Terrain:
    path: str
    name: str
    pic: str
    width: int           # tiles
    height: int          # tiles
    cells: bytes         # (width*8)*(height*8)*3, row-major
    tiles: bytes         # width*height*3
    header_unknown: bytes  # 16 bytes at 0x84

    @property
    def cols(self) -> int:
        return self.width * CELLS_PER_TILE

    @property
    def rows(self) -> int:
        return self.height * CELLS_PER_TILE

    def cell(self, x: int, y: int) -> tuple[int, int, int]:
        i = (y * self.cols + x) * 3
        return self.cells[i], self.cells[i + 1], self.cells[i + 2]

    def is_sea(self, x: int, y: int) -> bool:
        """Texture byte 0xFF marks water in every theater checked except The Baltics (see t2.md)."""
        return self.cells[(y * self.cols + x) * 3 + 1] == SEA[1]

    def land_fraction(self) -> float:
        n = self.cols * self.rows
        sea = sum(1 for b in self.cells[1::3] if b == SEA[1])
        return 1.0 - sea / n

    def ascii(self, step: int = 4) -> str:
        """Downsampled map: '.' sea, '+' low land, '#' high land."""
        out = []
        for y in range(0, self.rows, step):
            row = []
            for x in range(0, self.cols, step):
                e, _, _ = self.cell(x, y)
                row.append("." if self.is_sea(x, y) else ("+" if e < 8 else "#"))
            out.append("".join(row))
        return "\n".join(out)


def loads(data: bytes, path: str = "") -> Terrain:
    if data[:4] != MAGIC:
        raise T2Error(f"{path}: bad magic {data[:4]!r}")
    name = data[4:0x54].split(b"\0", 1)[0].decode("latin-1")
    pic = data[0x54:0x64].split(b"\0", 1)[0].decode("latin-1")
    a, _, b, _, _, cpt, w8, h8 = struct.unpack_from("<8I", data, 0x64)
    if cpt != CELLS_PER_TILE << 8 or w8 & 0xFF or h8 & 0xFF:
        raise T2Error(f"{path}: unexpected header words {(a, b, cpt, w8, h8)}")
    width, height = w8 >> 8, h8 >> 8
    ncell = width * height * CELLS_PER_TILE * CELLS_PER_TILE
    expect = HEADER + ncell * 3 + width * height * 3 + 1
    if len(data) != expect:
        raise T2Error(f"{path}: size {len(data)} != expected {expect} for {width}x{height} tiles")
    cells = data[HEADER:HEADER + ncell * 3]
    tiles = data[HEADER + ncell * 3:HEADER + ncell * 3 + width * height * 3]
    return Terrain(path, name, pic, width, height, cells, tiles, data[0x84:0x94])


def load(path: str) -> Terrain:
    with open(path, "rb") as f:
        return loads(f.read(), path)


def list_dir(directory: str) -> list[Terrain]:
    return [load(os.path.join(directory, n)) for n in sorted(os.listdir(directory)) if n.upper().endswith(".T2")]


def base_name(t2_name: str) -> str:
    """'~ukr6.t2' / '$bal2.T2' / 'kurile.t2' -> 'UKR' / 'BAL' / 'KURILE' (the base terrain file stem)."""
    stem = os.path.splitext(os.path.basename(t2_name))[0].upper().lstrip("~$")
    return stem.rstrip("0123456789") or stem


def main(argv: list[str]) -> int:
    if len(argv) == 2 and argv[0] == "--list":
        for t in list_dir(argv[1]):
            print(f"{os.path.basename(t.path):12s} {t.name:18s} pic {t.pic:12s} {t.width}x{t.height} tiles "
                  f"{t.cols}x{t.rows} cells  land {t.land_fraction():.0%}")
        return 0
    if len(argv) == 1:
        t = load(argv[0])
        print(f"{t.name} ({t.pic}) {t.width}x{t.height} tiles, {t.cols}x{t.rows} cells, land {t.land_fraction():.0%}")
        print(t.ascii())
        return 0
    print("usage: python3 -m retail.t2 <file.T2> | --list <dir>", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
