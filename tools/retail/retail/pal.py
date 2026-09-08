"""VGA palette (``*.PAL``) reader.

A ``.PAL`` is 768 bytes: 256 entries of R, G, B, each a 6-bit DAC value
(0..63).  See Docs/formats/pal.md.  The same 6-bit triplets appear embedded
inside ``.PIC`` files (full 256-entry tables or partial tables that overlay
entries starting at index 0), so the helpers here are shared with ``pic.py``.
"""

from __future__ import annotations

from typing import Iterable, List, Sequence, Tuple

RGB = Tuple[int, int, int]

PAL_SIZE = 768


class PALError(ValueError):
    pass


def expand6(v: int) -> int:
    """Expand a 6-bit DAC value (0..63) to 8 bits (0..255), 63 -> 255 exactly."""
    if not 0 <= v <= 63:
        raise PALError(f"6-bit value out of range: {v}")
    return (v * 255 + 31) // 63


def triplets6(data: bytes) -> List[RGB]:
    """Decode a run of 6-bit RGB triplets to 8-bit tuples.  Length must be a multiple of 3."""
    if len(data) % 3:
        raise PALError(f"palette data length {len(data)} is not a multiple of 3")
    bad = [b for b in data if b > 63]
    if bad:
        raise PALError(f"{len(bad)} palette bytes exceed 63 (not a 6-bit VGA palette)")
    return [(expand6(data[i]), expand6(data[i + 1]), expand6(data[i + 2]))
            for i in range(0, len(data), 3)]


def parse_pal(data: bytes) -> List[RGB]:
    """Parse a 768-byte ``.PAL`` into a list of 256 8-bit ``(r, g, b)`` tuples."""
    if len(data) != PAL_SIZE:
        raise PALError(f"expected {PAL_SIZE} bytes, got {len(data)}")
    return triplets6(data)


def load_pal(path: str) -> List[RGB]:
    with open(path, "rb") as f:
        return parse_pal(f.read())


def overlay(base: Sequence[RGB], partial: Iterable[RGB], start: int = 0) -> List[RGB]:
    """Return a copy of ``base`` with ``partial`` written over entries ``start..``."""
    out = list(base)
    for i, rgb in enumerate(partial):
        if start + i >= len(out):
            raise PALError(f"overlay of {i + 1}+ entries at {start} exceeds {len(out)} entries")
        out[start + i] = rgb
    return out


def grayscale() -> List[RGB]:
    """A 256-entry identity ramp, used when no palette is available."""
    return [(i, i, i) for i in range(256)]


def placeholder_indices(pal: Sequence[RGB]) -> List[int]:
    """Indices holding the (255, 0, 255) magenta placeholder colour."""
    return [i for i, c in enumerate(pal) if c == (255, 0, 255)]
