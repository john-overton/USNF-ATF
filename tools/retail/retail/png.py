"""Minimal PNG writer (and a reader for our own output) using only ``zlib``.

Supported colour types: ``L`` (8-bit grey), ``P`` (8-bit indexed with a PLTE
and optional tRNS), ``RGB`` and ``RGBA`` (8 bits per sample).  Every row is
written with filter type 0; no interlacing.  The reader accepts exactly what
the writer produces (filter 0 rows) and exists so tests can round-trip.
"""

from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

RGB = Tuple[int, int, int]

_SIGNATURE = b"\x89PNG\r\n\x1a\n"
_COLOR_TYPE = {"L": 0, "RGB": 2, "P": 3, "RGBA": 6}
_CHANNELS = {"L": 1, "RGB": 3, "P": 1, "RGBA": 4}


class PNGError(ValueError):
    pass


def _chunk(tag: bytes, body: bytes) -> bytes:
    return (struct.pack(">I", len(body)) + tag + body
            + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF))


def encode_png(width: int, height: int, pixels: bytes, mode: str = "P", *,
               palette: Optional[Sequence[RGB]] = None,
               transparency: Optional[Sequence[int]] = None,
               compresslevel: int = 6) -> bytes:
    """Encode ``pixels`` (row-major, tightly packed, ``channels`` bytes per pixel).

    ``palette``: list of (r, g, b) for mode ``P`` (1..256 entries).
    ``transparency``: for mode ``P``, per-index alpha bytes (shorter than the
    palette is fine; missing entries are opaque).
    """
    if mode not in _COLOR_TYPE:
        raise PNGError(f"unsupported mode {mode!r}")
    if width <= 0 or height <= 0:
        raise PNGError(f"bad dimensions {width}x{height}")
    ch = _CHANNELS[mode]
    stride = width * ch
    if len(pixels) != stride * height:
        raise PNGError(f"pixel buffer is {len(pixels)} bytes, expected {stride * height}")
    out = bytearray(_SIGNATURE)
    out += _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, _COLOR_TYPE[mode], 0, 0, 0))
    if mode == "P":
        if not palette or not 1 <= len(palette) <= 256:
            raise PNGError("mode P needs a palette of 1..256 entries")
        out += _chunk(b"PLTE", b"".join(bytes(c) for c in palette))
        if transparency:
            if len(transparency) > len(palette):
                raise PNGError("tRNS longer than palette")
            out += _chunk(b"tRNS", bytes(transparency))
    elif palette is not None or transparency is not None:
        raise PNGError(f"palette/transparency only apply to mode P, not {mode}")
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += pixels[y * stride:(y + 1) * stride]
    out += _chunk(b"IDAT", zlib.compress(bytes(raw), compresslevel))
    out += _chunk(b"IEND", b"")
    return bytes(out)


def write_png(path: str, width: int, height: int, pixels: bytes, mode: str = "P", **kw) -> None:
    with open(path, "wb") as f:
        f.write(encode_png(width, height, pixels, mode, **kw))


@dataclass
class PNGImage:
    width: int
    height: int
    mode: str
    pixels: bytes
    palette: Optional[List[RGB]] = None
    transparency: Optional[bytes] = None


def decode_png(data: bytes) -> PNGImage:
    """Decode a PNG written by :func:`encode_png` (8-bit, filter 0, non-interlaced)."""
    if data[:8] != _SIGNATURE:
        raise PNGError("not a PNG")
    pos = 8
    width = height = 0
    mode = ""
    palette = None
    trns = None
    idat = bytearray()
    while pos < len(data):
        length, tag = struct.unpack_from(">I4s", data, pos)
        body = data[pos + 8:pos + 8 + length]
        crc = struct.unpack_from(">I", data, pos + 8 + length)[0]
        if crc != zlib.crc32(tag + body) & 0xFFFFFFFF:
            raise PNGError(f"bad CRC in {tag!r}")
        pos += 12 + length
        if tag == b"IHDR":
            width, height, depth, ctype, comp, filt, interlace = struct.unpack(">IIBBBBB", body)
            if depth != 8 or comp or filt or interlace:
                raise PNGError("reader only handles 8-bit, non-interlaced PNGs")
            mode = {v: k for k, v in _COLOR_TYPE.items()}[ctype]
        elif tag == b"PLTE":
            palette = [(body[i], body[i + 1], body[i + 2]) for i in range(0, len(body), 3)]
        elif tag == b"tRNS":
            trns = bytes(body)
        elif tag == b"IDAT":
            idat += body
        elif tag == b"IEND":
            break
    raw = zlib.decompress(bytes(idat))
    stride = width * _CHANNELS[mode]
    if len(raw) != (stride + 1) * height:
        raise PNGError("IDAT size mismatch")
    pixels = bytearray()
    for y in range(height):
        if raw[y * (stride + 1)] != 0:
            raise PNGError("reader only handles filter type 0")
        pixels += raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)]
    return PNGImage(width, height, mode, bytes(pixels), palette, trns)
