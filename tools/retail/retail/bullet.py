"""Bounded near-LOD BULLET.SH geometry import; no executable is run.

Native USNF interpreter: 7a vertex=4a4ebc, 76 quad=4a4f0c,
bc palette=4a5fa8. Plane ordering is flattened to both source windings.
Header shift8 converts native24.8 feet to integer-foot model coordinates.
LOD selection, point/line primitives and shading remain unported.
"""
from __future__ import annotations

import hashlib
import struct
from pathlib import Path

from .pal import load_pal
from .sh import SHError, _sections


def decode_near(code: bytes) -> list[tuple[list[tuple[int, int, int]], int]]:
    """Decode only the reviewed bounded near-LOD instruction vocabulary.

    Returned coordinates retain the source X/forward/up order. Synthetic fixtures
    may use this function without a retail container. Unknown records fail closed.
    """
    if len(code) > 65536 or len(code) < 14 or code[:2] != b'\xff\xff':
        raise SHError('invalid bullet CODE header or size')
    if struct.unpack_from('<h', code, 6)[0] != 8:
        raise SHError('unsupported bullet coordinate scale')
    slots = {}
    faces = []
    color = None
    off = 14
    near_end = len(code)

    def need(size):
        if off + size > near_end:
            raise SHError('truncated bullet instruction')

    while off < near_end:
        op = code[off]
        if op == 0:
            break
        if op in (0xca, 0xda, 0x48):
            size = 4
        elif op == 0xc8:
            size = 8
            need(size)
            target = off + size + struct.unpack_from('<h', code, off + 6)[0]
            if not off + size < target <= near_end:
                raise SHError('invalid bullet LOD boundary')
            near_end = target
        elif op == 0x7a:
            size = 10
            need(size)
            x, forward, up, slot = struct.unpack_from('<hhhH', code, off + 2)
            if slot % 8 or slot > 2040 or slot in slots:
                raise SHError('invalid bullet vertex slot')
            slots[slot] = (x, forward, up)
        elif op == 0xbc:
            size = 2
            need(size)
            color = code[off + 1]
        elif op == 0x76:
            size = 10
            need(size)
            refs = struct.unpack_from('<4H', code, off + 2)
            if color is None or any(slot not in slots for slot in refs):
                raise SHError('unresolved bullet quad vertices or color')
            faces.append(([slots[slot] for slot in refs], color))
            if len(faces) > 128:
                raise SHError('bullet face limit exceeded')
        elif op in (0x64, 0x66, 0x68):
            # Native plane/order tests: record is opcode + relative jump + normal.
            size = 8
            need(size)
            target = off + struct.unpack_from('<h', code, off + 2)[0] + 4
            if not off < target <= near_end:
                raise SHError('invalid bullet plane branch')
        elif op in (0x72, 0x08):
            size = 4  # 72 implicit-next-vertex line / 08 point, intentionally omitted
        elif op == 0x96:
            size = 6  # line: geometry exporter intentionally omits it
        else:
            raise SHError(f'unsupported bullet instruction {op:#x} at {off:#x}')
        need(size)
        off += size
    if not faces:
        raise SHError('bullet near model contains no quads')
    return faces


def export_geometry(source: Path, palette_path: Path) -> dict:
    if source.stat().st_size > 1024 * 1024:
        raise SHError('bullet container exceeds bound')
    data = source.read_bytes()
    try:
        _, size, offset, raw_size = _sections(data)['CODE']
    except (KeyError, IndexError, struct.error) as exc:
        raise SHError('invalid bullet container') from exc
    if size > raw_size or offset + size > len(data):
        raise SHError('truncated bullet CODE section')
    faces = decode_near(data[offset:offset + size])
    palette = load_pal(str(palette_path))
    vertices, colors, indices = [], [], []
    for quad, color in faces:
        start = len(vertices) // 3
        for x, forward, up in quad:
            vertices.extend((x * 0.3048, up * 0.3048, -forward * 0.3048))
            colors.extend(component / 255 for component in palette[color])
        indices.extend(start + i for i in (0, 1, 2, 0, 2, 3))
    return {
        'source': source.name, 'sha256': hashlib.sha256(data).hexdigest(),
        'paletteSource': palette_path.name,
        'paletteSha256': hashlib.sha256(palette_path.read_bytes()).hexdigest(),
        'vertices': vertices, 'colors': colors, 'indices': indices,
        'scaleNote': 'Source X/forward/up mapped to engine X/up/-forward. Header shift8 and native GRAddBrentObj 0x4a355c/do_drawobj000 0x4a3c30 shift24.8-foot camera/object deltas right8: one source unit is one foot (0.3048 metres). Near quads preserve both source windings; native LOD, point/line primitives and material dispatch are not reproduced.',
    }
