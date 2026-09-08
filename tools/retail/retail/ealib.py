"""EALIB (``*.LIB``) container reader.

Layout (little-endian, see Docs/formats/ealib.md):

    0   5   magic ``EALIB``
    5   2   uint16  entry count minus one
    7   18*N directory entries:
            0   13  name, NUL padded (8.3 DOS name)
            13  1   flag: 0 = stored, 4 = DCL-compressed
            14  4   uint32 absolute offset of the entry's data

An entry's length is the gap to the next entry's offset.  The final
directory entry is a sentinel (empty name, flag 0, offset == file size) that
delimits the last real entry; it is parsed but not exposed in ``entries``.
Flag-4 data is a uint32 uncompressed size followed by a PKWare DCL implode
stream.
"""

from __future__ import annotations

import mmap
import os
import struct
from dataclasses import dataclass
from typing import Iterator, Sequence

from .dcl import explode, DCLError

MAGIC = b"EALIB"
FLAG_STORED = 0
FLAG_DCL = 4
_ENTRY = struct.Struct("<13sBI")


class EALibError(ValueError):
    pass


@dataclass(frozen=True)
class LibEntry:
    name: str
    flag: int
    offset: int
    size: int            # bytes occupied in the archive
    index: int

    @property
    def compressed(self) -> bool:
        return self.flag == FLAG_DCL

    @property
    def extension(self) -> str:
        return self.name.rsplit(".", 1)[-1].upper() if "." in self.name else ""


class EALib:
    """An EALIB archive over any sliceable byte buffer (bytes, memoryview, mmap)."""

    def __init__(self, buf, name: str = "<lib>"):
        self.buf = buf
        self.name = name
        size = len(buf)
        if size < 7 or bytes(buf[:5]) != MAGIC:
            raise EALibError(f"{name}: not an EALIB archive")
        count = struct.unpack_from("<H", buf, 5)[0] + 1
        dir_end = 7 + 18 * count
        if dir_end > size:
            raise EALibError(f"{name}: directory ({count} entries) exceeds file")
        raw = []
        for i in range(count):
            rname, flag, off = _ENTRY.unpack_from(buf, 7 + 18 * i)
            raw.append((rname.split(b"\0", 1)[0].decode("latin-1"), flag, off))
        entries = []
        self.sentinel = False
        for i, (ename, flag, off) in enumerate(raw):
            end = raw[i + 1][2] if i + 1 < count else size
            if off < dir_end or end < off or end > size:
                raise EALibError(f"{name}: entry {i} {ename!r} has bad offset {off}..{end}")
            if i == count - 1 and ename == "" and off == size:
                self.sentinel = True      # terminator, not a file
                continue
            entries.append(LibEntry(ename, flag, off, end - off, i))
        self.entries: Sequence[LibEntry] = tuple(entries)
        self._by_name = {e.name.upper(): e for e in self.entries}

    # -- construction helpers -------------------------------------------------

    @classmethod
    def open(cls, path: str | os.PathLike) -> "EALib":
        """Memory-map a LIB file (large root LIBs are hundreds of MB)."""
        f = open(path, "rb")
        try:
            mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        except ValueError:
            f.close()
            raise EALibError(f"{path}: empty file")
        lib = cls(mm, os.path.basename(str(path)))
        lib._file = f  # keep alive with the mapping
        return lib

    # -- access ---------------------------------------------------------------

    def __iter__(self) -> Iterator[LibEntry]:
        return iter(self.entries)

    def __len__(self) -> int:
        return len(self.entries)

    def get(self, name: str) -> LibEntry:
        try:
            return self._by_name[name.upper()]
        except KeyError:
            raise KeyError(f"{self.name}: no entry {name!r}") from None

    def raw(self, entry: LibEntry) -> bytes:
        """The entry's bytes exactly as stored (size prefix + stream if flag 4)."""
        return bytes(self.buf[entry.offset:entry.offset + entry.size])

    def uncompressed_size(self, entry: LibEntry) -> int:
        if entry.flag == FLAG_DCL:
            return struct.unpack_from("<I", self.buf, entry.offset)[0]
        return entry.size

    def read(self, entry: LibEntry) -> bytes:
        """Entry contents, transparently decompressed and size-checked."""
        data = self.raw(entry)
        if entry.flag == FLAG_STORED:
            return data
        if entry.flag != FLAG_DCL:
            raise EALibError(f"{self.name}/{entry.name}: unknown flag {entry.flag}")
        if len(data) < 4:
            raise EALibError(f"{self.name}/{entry.name}: truncated size prefix")
        expected = struct.unpack_from("<I", data)[0]
        try:
            return explode(data[4:], expected)
        except DCLError as ex:
            raise EALibError(f"{self.name}/{entry.name}: {ex}") from ex
