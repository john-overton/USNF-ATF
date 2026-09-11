"""Jane's USNF'97 / ATF Gold ``.SH`` shape decoder (partial).

A ``.SH`` file is a tiny PE image (``MZ`` stub, ``PL`` signature, sections
``CODE``, optional ``.idata`` importing ``do_start_interp``/``_nightHazing``
from ``main.dll``, and ``.reloc``).  The CODE section holds a byte-oriented
drawing program: vertex tables, BSP-style plane tests with relative jumps,
polygon / line / point primitives, and, in shapes with an ``.idata``
section, short x86 stubs that branch on engine state (gear, wing sweep...)
before re-entering the interpreter.

This module walks that program as a control-flow graph, following every
branch, and collects the geometry it can understand.  See
``Docs/formats/sh.md`` for the byte layouts and the confidence of each field.

Standard library only.
"""

from __future__ import annotations

import os
import struct
import sys
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

Vec3 = Tuple[int, int, int]


class SHError(ValueError):
    pass


# --------------------------------------------------------------------------
# Data model


@dataclass
class VertexTable:
    addr: int            # virtual address of the ``82`` record
    verts: List[Vec3]    # int16 model units, (x, y, z) as stored


@dataclass
class Primitive:
    """A polygon (``kind == 'poly'``), line or point."""
    addr: int
    kind: str                       # 'poly' | 'line' | 'point'
    table: int                      # index into Shape.tables
    indices: List[int]              # into that table
    color: int                      # palette index; >255 or 0 with UVs = special
    subtype: int = 0                # 0x41, 0x61, 0x4c, ... for polys
    flags: int = 0
    normal: Optional[Vec3] = None   # int16, 0x7fff == 1.0
    centroid: Optional[Vec3] = None  # signed bytes, coarse
    uvs: Optional[List[Tuple[int, int]]] = None


@dataclass
class Shape:
    name: str
    source_name: str = ""           # e.g. "f14.asm"
    textures: List[str] = field(default_factory=list)
    tables: List[VertexTable] = field(default_factory=list)
    prims: List[Primitive] = field(default_factory=list)
    unknown_ops: Dict[int, int] = field(default_factory=dict)  # opcode -> count
    stops: List[Tuple[int, int]] = field(default_factory=list)  # (addr, opcode) where a walk aborted
    code_size: int = 0
    visited_bytes: int = 0

    @property
    def polys(self) -> List[Primitive]:
        return [p for p in self.prims if p.kind == 'poly']


# --------------------------------------------------------------------------
# PE container


def _sections(data: bytes) -> Dict[str, Tuple[int, int, int, int]]:
    if data[:2] != b'MZ':
        raise SHError('not an MZ/PE image')
    pe = struct.unpack_from('<I', data, 0x3c)[0]
    if data[pe:pe + 2] not in (b'PL', b'PE'):
        raise SHError('bad PE signature %r' % data[pe:pe + 4])
    nsec = struct.unpack_from('<H', data, pe + 6)[0]
    optsz = struct.unpack_from('<H', data, pe + 20)[0]
    out = {}
    for i in range(nsec):
        s = pe + 24 + optsz + 40 * i
        name = data[s:s + 8].rstrip(b'\0').decode('ascii', 'replace')
        vsize, vaddr, rsize, roff = struct.unpack_from('<IIII', data, s + 8)
        out[name] = (vaddr, vsize, roff, rsize)
    return out


def _relocs(data: bytes, secs) -> List[int]:
    """Virtual addresses patched by the .reloc section (HIGHLOW entries)."""
    if '.reloc' not in secs:
        return []
    va, vsize, roff, rsize = secs['.reloc']
    out = []
    p = roff
    end = roff + vsize
    while p + 8 <= end:
        page, size = struct.unpack_from('<II', data, p)
        if size < 8:
            break
        for q in range(p + 8, p + size, 2):
            e = struct.unpack_from('<H', data, q)[0]
            if e >> 12 == 3:
                out.append(page + (e & 0xfff))
        p += size
    return out


# --------------------------------------------------------------------------
# Record sizes.  Fixed-size opcodes (size includes the opcode byte).

FIXED = {
    0xf2: 4, 0xce: 40, 0x7a: 10, 0x78: 12, 0xb8: 4, 0xe2: 16,
    0x06: 14, 0x0c: 10, 0x0e: 10, 0x10: 10, 
    0x2e: 8, 0x4d: 4, 0x50: 8, 0xd0: 4, 0xe0: 4,
    0xca: 4, 0xda: 4, 0x1e: 1,
    0xf6: 7, 0x46: 2, 0x66: 10, 0xb2: 2, 0x4e: 2, 0x68: 8, 0xc4: 16,
    0xee: 2, 0xe4: 20, 0xe6: 10, 0xea: 8, 0x76: 10, 0x08: 10,
}
BC_SIZES = {0x72: 6, 0x96: 8, 0x08: 6, 0x3a: 8, 0x68: 10}
COND_JUMPS = {0x05, 0x14, 0x18, 0x4a}
JB = {0x38: 3, 0x05: 3, 0x48: 4, 0xc8: 8, 0xa6: 6, 0xac: 4}


class _Walker:
    def __init__(self, code: bytes, base: int, shape: Shape, relocs=()):
        self.code = code
        self.base = base
        self.relocs = sorted(r - base for r in relocs if 0 <= r - base < len(code))
        self.shape = shape
        self.seen = bytearray(len(code))
        self.table_at: Dict[int, int] = {}   # vertex table addr -> index

    def u8(self, o): return self.code[o]
    def s8(self, o): return struct.unpack_from('<b', self.code, o)[0]
    def u16(self, o): return struct.unpack_from('<H', self.code, o)[0]
    def s16(self, o): return struct.unpack_from('<h', self.code, o)[0]
    def u32(self, o): return struct.unpack_from('<I', self.code, o)[0]

    def run(self, entry: int, table: int = -1):
        # worklist of (offset, current vertex table index)
        work = [(entry, table)]
        while work:
            off, table = work.pop()
            while 0 <= off < len(self.code):
                if self.seen[off]:
                    break
                res = self.step(off, table)
                if res is None:
                    break
                size, table, branches, fallthrough = res
                self.seen[off:off + size] = b'\1' * size
                for b in branches:
                    work.append((b, table))
                if not fallthrough:
                    break
                off += size

    def stop(self, off, op):
        self.shape.stops.append((self.base + off, op))
        return None

    def step(self, off: int, table: int):
        """Decode one record.  Returns (size, table, branch_offsets, fallthrough)."""
        c = self.code
        op = c[off]
        sh = self.shape
        if op == 0x00:                      # end of program
            return 1, table, [], False
        if op == 0x01 and c[off + 1:off + 5] == b'\x02\x03\x02\x01':   # trailer table
            return 1, table, [], False
        if op == 0x40:                      # 4 + 2n
            return 4 + 2 * self.u16(off + 2), table, [], True
        if op == 0x44:                      # 8 + 2n (WAVE*)
            return 8 + 2 * self.u16(off + 6), table, [], True
        if op in (0xa6, 0xac):              # pointer to another block (LOD / far model); follow it
            tgt = off + JB[op] + self.s16(off + 2)
            return 4 if op == 0xac else 6, table, [tgt], True
        if op == 0xff and off + 1 < len(c) and c[off + 1] == 0xff:
            return 14, table, [], True
        if op == 0x42:                      # source file name, NUL terminated
            e = c.find(b'\0', off + 2)
            if e < 0:
                return self.stop(off, op)
            sh.source_name = c[off + 2:e].decode('latin-1')
            return e + 1 - off, table, [], True
        if op == 0xe2:                      # texture name, 14-byte field
            name = c[off + 2:off + 16].split(b'\0')[0].decode('latin-1')
            if name and name not in sh.textures:
                sh.textures.append(name)
            return 16, table, [], True
        if op == 0x82:                      # vertex table
            cnt = self.u16(off + 2)
            size = 6 + 6 * cnt
            if off + size > len(c):
                return self.stop(off, op)
            addr = self.base + off
            if addr not in self.table_at:
                verts = [(self.s16(off + 6 + 6 * k), self.s16(off + 8 + 6 * k), self.s16(off + 10 + 6 * k))
                         for k in range(cnt)]
                self.table_at[addr] = len(sh.tables)
                sh.tables.append(VertexTable(addr, verts))
            return size, self.table_at[addr], [], True
        if op == 0xfc:                      # polygon
            return self.poly(off, table)
        if op == 0xbc:                      # point / line
            kind = c[off + 2]
            if kind not in BC_SIZES:
                return self.stop(off, op)
            size = BC_SIZES[kind]
            if kind == 0x72:
                sh.prims.append(Primitive(self.base + off, 'point', table, [self.u16(off + 4) // 8], c[off + 1]))
            elif kind == 0x96:
                sh.prims.append(Primitive(self.base + off, 'line', table,
                                          [self.u16(off + 4) // 8, self.u16(off + 6) // 8], c[off + 1]))
            return size, table, [], True
        if op == 0x38:                      # jump rel16
            tgt = off + JB[0x38] + self.s16(off + 1)
            return 3, table, [tgt], False
        if op == 0x12:                      # relative subroutine call; native saves return PC
            tgt = off + 4 + self.s16(off + 2)
            return 4, table, [tgt], True
        if op in COND_JUMPS:                # conditional jump rel16 (05 after plane tests; 14/18/4a state tests)
            tgt = off + JB[0x05] + self.s16(off + 2)
            return 4, table, [tgt], True
        if op == 0x6c:                      # state test: 6 bytes + embedded [N 00 rel16] conditional jump
            tgt = off + 6 + JB[0x05] + self.s16(off + 8)
            return 10, table, [tgt], True
        if op == 0x48:                      # jump rel16 (LOD block end)
            tgt = off + JB[0x48] + self.s16(off + 2)
            return 4, table, [tgt], False
        if op == 0xc8:                      # distance test with jump
            tgt = off + JB[0xc8] + self.s16(off + 6)
            return 8, table, [tgt], True
        if op == 0xf0:                      # x86 stub follows
            return self.x86_block(off)
        if op in FIXED:
            return FIXED[op], table, [], True
        sh.unknown_ops[op] = sh.unknown_ops.get(op, 0) + 1
        return self.stop(off, op)

    def poly(self, off: int, table: int):
        c = self.code
        sub = c[off + 1]
        flags = c[off + 2]
        color = self.u16(off + 3)
        p = off + 5
        normal = cen = None
        if sub & 0x40:
            normal = (self.s16(p), self.s16(p + 2), self.s16(p + 4))
            p += 6
            if flags & 0x02:
                cen = (self.s8(p), self.s8(p + 1), self.s8(p + 2))
                p += 3
            else:
                cen = (self.s16(p), self.s16(p + 2), self.s16(p + 4))
                p += 6
        if p >= len(c):
            return self.stop(off, 0xfc)
        cnt = c[p]
        p += 1
        if cnt == 0 or cnt > 64 or p + cnt > len(c):
            return self.stop(off, 0xfc)
        if flags & 0x04:                    # 16-bit vertex indices
            idx = [self.u16(p + 2 * k) for k in range(cnt)]
            p += 2 * cnt
        else:
            idx = list(c[p:p + cnt])
            p += cnt
        uvs = None
        if sub & 0x04:
            if flags & 0x01:                # 8-bit UVs
                uvs = [(c[p + 2 * k], c[p + 2 * k + 1]) for k in range(cnt)]
                p += 2 * cnt
            else:
                uvs = [(self.u16(p + 4 * k), self.u16(p + 4 * k + 2)) for k in range(cnt)]
                p += 4 * cnt
        if p > len(c):
            return self.stop(off, 0xfc)
        self.shape.prims.append(Primitive(self.base + off, 'poly', table, idx, color, sub, flags, normal, cen, uvs))
        return p - off, table, [], True

    def x86_block(self, off: int):
        """An ``f0`` record: opaque x86 until the last relocation of this run.
        The interpreter is re-entered only through ``push A; push thunk; ret``
        (each ``push`` operand has a .reloc entry), so the branch targets are
        every such A inside the block; nothing falls through."""
        rel = [r for r in self.relocs if r >= off + 2]
        end = off + 2
        last = off + 2
        for r in rel:
            if r - last > 48:
                break
            last = r
            end = r + 4
        # extend to the ret that closes the last push pair
        e = self.code.find(b'\xc3', end, end + 16)
        if e >= 0:
            end = e + 1
        branches = []
        for r in rel:
            if r >= end:
                break
            if self.code[r - 1] == 0x68 and self.code[r + 4] == 0x68 and self.code[r + 9] == 0xc3:
                a = self.u32(r) - self.base
                if 0 <= a < len(self.code):
                    branches.append(a)
        return end - off, -1, branches, False


# --------------------------------------------------------------------------
# Public API


def parse(data: bytes, name: str = '') -> Shape:
    secs = _sections(data)
    if 'CODE' not in secs:
        raise SHError('no CODE section')
    va, vsize, roff, rsize = secs['CODE']
    code = data[roff:roff + vsize]
    shape = Shape(name=name, code_size=len(code))
    w = _Walker(code, va, shape, _relocs(data, secs))
    w.run(0)
    shape.visited_bytes = sum(w.seen)
    return shape


def load(path: str) -> Shape:
    with open(path, 'rb') as f:
        return parse(f.read(), os.path.splitext(os.path.basename(path))[0])


def read_palette(path: str) -> List[Tuple[int, int, int]]:
    with open(path, 'rb') as f:
        raw = f.read()
    if len(raw) != 768:
        raise SHError('palette must be 768 bytes')
    return [(raw[i] * 255 // 63, raw[i + 1] * 255 // 63, raw[i + 2] * 255 // 63) for i in range(0, 768, 3)]


def to_obj(shape: Shape, mtl_name: Optional[str] = None, all_tables: bool = True) -> str:
    """Wavefront OBJ.  Model axes: stored (x, y, z) written as (x, z, y) so that
    the game's vertical axis is OBJ's +Y (see sh.md, axis convention).
    Faces are grouped per palette color as ``usemtl c<idx>``."""
    out = ['# %s  tables=%d polys=%d' % (shape.name, len(shape.tables), len(shape.polys))]
    if mtl_name:
        out.append('mtllib %s' % mtl_name)
    offsets = []
    n = 0
    for ti, t in enumerate(shape.tables):
        out.append('g table%d' % ti)
        offsets.append(n)
        for x, y, z in t.verts:
            out.append('v %d %d %d' % (x, z, y))
        n += len(t.verts)
    cur = None
    for p in shape.prims:
        if p.table < 0 or p.table >= len(shape.tables):
            continue
        nv = len(shape.tables[p.table].verts)
        if any(i >= nv for i in p.indices):
            continue
        if p.color != cur:
            out.append('usemtl c%d' % p.color)
            cur = p.color
        base = offsets[p.table] + 1
        if p.kind == 'poly' and len(p.indices) >= 3:
            out.append('f ' + ' '.join(str(base + i) for i in p.indices))
        elif p.kind == 'line':
            out.append('l ' + ' '.join(str(base + i) for i in p.indices))
        elif p.kind == 'point':
            out.append('p %d' % (base + p.indices[0]))
    return '\n'.join(out) + '\n'


def to_mtl(shape: Shape, palette: List[Tuple[int, int, int]]) -> str:
    out = []
    for c in sorted({p.color for p in shape.prims}):
        r, g, b = palette[c] if 0 <= c < len(palette) else (255, 0, 255)
        out.append('newmtl c%d\nKd %.4f %.4f %.4f\n' % (c, r / 255, g / 255, b / 255))
    return '\n'.join(out)


def listing(data: bytes) -> str:
    """Debug: linear dump of records as the walker sees them from the entry."""
    secs = _sections(data)
    va, vsize, roff, rsize = secs['CODE']
    code = data[roff:roff + vsize]
    shape = Shape(name='')
    w = _Walker(code, va, shape, _relocs(data, secs))
    lines = []
    orig = w.step

    def step(off, table):
        r = orig(off, table)
        if r:
            lines.append('%04x %02x %s' % (va + off, code[off], code[off:off + min(r[0], 24)].hex(' ')))
        else:
            lines.append('%04x %02x STOP %s' % (va + off, code[off], code[off:off + 24].hex(' ')))
        return r
    w.step = step
    w.run(0)
    lines.sort()
    return '\n'.join(lines)


def _main(argv):
    import argparse
    ap = argparse.ArgumentParser(prog='retail.sh', description='USNF/ATF .SH shape to OBJ')
    ap.add_argument('src', help='.SH file, or (with --all) a directory of extracted files')
    ap.add_argument('-o', '--out', required=True, help='output .obj, or output dir with --all')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--pal', help='PALETTE.PAL for an MTL file')
    ap.add_argument('--list', action='store_true', help='print a record listing instead')
    a = ap.parse_args(argv)
    pal = read_palette(a.pal) if a.pal else None
    if a.list:
        with open(a.src, 'rb') as f:
            print(listing(f.read()))
        return 0
    if not a.all:
        sh = load(a.src)
        mtl = os.path.splitext(os.path.basename(a.out))[0] + '.mtl' if pal else None
        with open(a.out, 'w') as f:
            f.write(to_obj(sh, mtl))
        if pal:
            with open(os.path.join(os.path.dirname(a.out) or '.', mtl), 'w') as f:
                f.write(to_mtl(sh, pal))
        print('%s: %d tables, %d verts, %d polys, %d lines/points, unknown=%s stops=%d' % (
            sh.name, len(sh.tables), sum(len(t.verts) for t in sh.tables), len(sh.polys),
            len(sh.prims) - len(sh.polys), {hex(k): v for k, v in sh.unknown_ops.items()}, len(sh.stops)))
        return 0
    os.makedirs(a.out, exist_ok=True)
    names = sorted(n for n in os.listdir(a.src) if n.upper().endswith('.SH'))
    ok = 0
    bad = []
    unknown: Dict[int, int] = {}
    for n in names:
        try:
            sh = load(os.path.join(a.src, n))
        except Exception as e:  # noqa: BLE001
            bad.append((n, repr(e)))
            continue
        for k, v in sh.unknown_ops.items():
            unknown[k] = unknown.get(k, 0) + v
        stem = os.path.splitext(n)[0]
        mtl = stem + '.mtl' if pal else None
        with open(os.path.join(a.out, stem + '.obj'), 'w') as f:
            f.write(to_obj(sh, mtl))
        if pal:
            with open(os.path.join(a.out, mtl), 'w') as f:
                f.write(to_mtl(sh, pal))
        if sh.polys and not sh.stops:
            ok += 1
        else:
            bad.append((n, 'polys=%d stops=%s unknown=%s' % (
                len(sh.polys), [(hex(x), hex(y)) for x, y in sh.stops[:3]], {hex(k): v for k, v in sh.unknown_ops.items()})))
    print('%d/%d shapes fully walked with polygons' % (ok, len(names)))
    for n, why in bad:
        print('  %-14s %s' % (n, why))
    if unknown:
        print('unhandled opcodes (0xfcNN = polygon subtype, 0x1NNNN = x86 byte):')
        for k, v in sorted(unknown.items(), key=lambda kv: -kv[1]):
            print('  %06x  x%d' % (k, v))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(_main(sys.argv[1:]))
