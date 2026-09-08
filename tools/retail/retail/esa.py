"""Electronic Arts installer archive (``SETUP.ESA``) reader.

Layout (little-endian, see Docs/formats/esa.md):

    0   29  magic ``ELECTRONIC_ARTS_ARCHIVE_FILE\\0``
    29  ..  directory: variable-length entries, no count; terminated by a
            single NUL byte (an empty name), after which the first entry's
            data begins immediately.

    entry:  name\\0  label\\0  uint32 attr  uint32 uncompressed size
            uint32 timestamp  tag[4]\\0  uint32 compressed size  uint32 offset

Tag ``PKWA`` = PKWare DCL implode (no size prefix; the uncompressed size field
is authoritative), ``NULL`` = stored.
"""

from __future__ import annotations

import mmap
import os
import struct
from dataclasses import dataclass
from typing import Iterator, Sequence

from .dcl import explode, DCLError

MAGIC = b"ELECTRONIC_ARTS_ARCHIVE_FILE\0"
_FIXED_A = struct.Struct("<III")   # attr, usize, timestamp
_FIXED_B = struct.Struct("<II")    # csize, offset


class ESAError(ValueError):
    pass


@dataclass(frozen=True)
class ESAEntry:
    name: str
    label: str
    attr: int
    size: int            # uncompressed
    timestamp: int       # seconds since 1970 (matches the discs' 1996-97 dates)
    codec: str           # "PKWA" or "NULL"
    csize: int           # bytes occupied in the archive
    offset: int
    index: int

    @property
    def compressed(self) -> bool:
        return self.codec != "NULL"

    @property
    def extension(self) -> str:
        return self.name.rsplit(".", 1)[-1].upper() if "." in self.name else ""


def _cstr(buf, pos: int, limit: int) -> tuple[str, int]:
    end = pos
    while end < limit and buf[end] != 0:
        end += 1
    if end >= limit:
        raise ESAError("unterminated string in directory")
    return bytes(buf[pos:end]).decode("latin-1"), end + 1


class ESA:
    def __init__(self, buf, name: str = "SETUP.ESA"):
        self.buf = buf
        self.name = name
        size = len(buf)
        if bytes(buf[:len(MAGIC)]) != MAGIC:
            raise ESAError(f"{name}: bad magic")
        pos = len(MAGIC)
        data_start = size
        entries = []
        while pos < data_start:
            if buf[pos] == 0:            # empty name = directory terminator
                pos += 1
                break
            ename, pos = _cstr(buf, pos, data_start)
            label, pos = _cstr(buf, pos, data_start)
            if pos + 12 + 5 + 8 > size:
                raise ESAError(f"{name}: directory runs past end of file")
            attr, usize, ts = _FIXED_A.unpack_from(buf, pos)
            pos += 12
            tag = bytes(buf[pos:pos + 5])
            if tag[4] != 0:
                raise ESAError(f"{name}: codec tag {tag!r} not NUL terminated")
            pos += 5
            csize, off = _FIXED_B.unpack_from(buf, pos)
            pos += 8
            if off < pos or off + csize > size:
                raise ESAError(f"{name}: entry {ename!r} data {off}+{csize} out of range")
            data_start = min(data_start, off)
            entries.append(ESAEntry(ename, label, attr, usize, ts,
                                    tag[:4].decode("ascii"), csize, off, len(entries)))
        if pos != data_start:
            raise ESAError(f"{name}: directory ends at {pos}, data starts at {data_start}")
        self.entries: Sequence[ESAEntry] = tuple(entries)
        self._by_name = {e.name.upper(): e for e in self.entries}

    @classmethod
    def open(cls, path: str | os.PathLike) -> "ESA":
        f = open(path, "rb")
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        esa = cls(mm, os.path.basename(str(path)))
        esa._file = f
        return esa

    def __iter__(self) -> Iterator[ESAEntry]:
        return iter(self.entries)

    def __len__(self) -> int:
        return len(self.entries)

    def get(self, name: str) -> ESAEntry:
        try:
            return self._by_name[name.upper()]
        except KeyError:
            raise KeyError(f"{self.name}: no entry {name!r}") from None

    def raw(self, entry: ESAEntry) -> bytes:
        return bytes(self.buf[entry.offset:entry.offset + entry.csize])

    def read(self, entry: ESAEntry) -> bytes:
        if entry.codec == "NULL":
            data = self.raw(entry)
            if len(data) != entry.size:
                raise ESAError(f"{self.name}/{entry.name}: stored size mismatch")
            return data
        if entry.codec == "PKWA":
            try:
                return explode(self.raw(entry), entry.size)
            except DCLError as ex:
                raise ESAError(f"{self.name}/{entry.name}: {ex}") from ex
        raise ESAError(f"{self.name}/{entry.name}: unknown codec {entry.codec!r}")

    def tiles(self) -> bool:
        """True if the entries' data regions exactly cover the file after the directory."""
        ents = sorted(self.entries, key=lambda e: e.offset)
        pos = min(e.offset for e in ents)
        for e in ents:
            if e.offset != pos:
                return False
            pos += e.csize
        return pos == len(self.buf)
