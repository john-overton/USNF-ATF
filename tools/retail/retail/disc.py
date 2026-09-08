"""Enumerate every logical file on a disc image folder or an install folder.

A *disc* folder (CD image) holds ``SETUP.ESA`` plus root ``*.LIB`` files.
Inside the ESA are more LIBs (the core data archives) and loose files (the
executable, DLLs, text).  An *install* folder is just LIBs on disk, so the
ESA step is skipped.

``Disc.sources()`` yields ``Source`` objects (one per archive) and
``Disc.files()`` yields ``(source, entry)`` pairs for every logical file.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Iterator, Union

from .ealib import EALib, LibEntry
from .esa import ESA, ESAEntry

Entry = Union[LibEntry, ESAEntry]


@dataclass
class Source:
    """One archive: a root LIB, a LIB embedded in the ESA, or the ESA's loose files."""

    name: str                      # archive name used as the output folder
    archive: Union[EALib, ESA]
    origin: str                    # "root", "esa", or "esa-loose"
    parent: str | None = None      # ESA file name for embedded LIBs

    def entries(self) -> Iterator[Entry]:
        if self.origin == "esa-loose":
            for e in self.archive:
                if not e.name.upper().endswith(".LIB"):
                    yield e
        else:
            yield from self.archive

    def read(self, entry: Entry) -> bytes:
        return self.archive.read(entry)

    def uncompressed_size(self, entry: Entry) -> int:
        if isinstance(self.archive, EALib):
            return self.archive.uncompressed_size(entry)
        return entry.size


@dataclass
class Disc:
    path: str
    kind: str                                  # "disc" or "install"
    esa_path: str | None = None
    lib_paths: list[str] = field(default_factory=list)

    @classmethod
    def detect(cls, path: str | os.PathLike) -> "Disc":
        path = os.fspath(path)
        if not os.path.isdir(path):
            raise NotADirectoryError(path)
        names = sorted(os.listdir(path))
        esa = next((n for n in names if n.upper() == "SETUP.ESA"), None)
        libs = [os.path.join(path, n) for n in names if n.upper().endswith(".LIB")]
        if esa is None and not libs:
            raise FileNotFoundError(f"{path}: no SETUP.ESA and no *.LIB files")
        return cls(path, "disc" if esa else "install",
                   os.path.join(path, esa) if esa else None, libs)

    def sources(self) -> Iterator[Source]:
        if self.esa_path:
            esa = ESA.open(self.esa_path)
            base = os.path.basename(self.esa_path)
            for e in esa:
                if e.name.upper().endswith(".LIB"):
                    lib = EALib(esa.read(e) if e.compressed
                                else memoryview(esa.buf)[e.offset:e.offset + e.csize],
                                e.name)
                    yield Source(e.name, lib, "esa", base)
            yield Source(base, esa, "esa-loose")
        for p in self.lib_paths:
            yield Source(os.path.basename(p), EALib.open(p), "root")

    def files(self) -> Iterator[tuple[Source, Entry]]:
        for src in self.sources():
            for e in src.entries():
                yield src, e


def iter_sources(path: str | os.PathLike) -> Iterator[Source]:
    """Open anything: a disc/install folder, a .LIB, or a .ESA."""
    path = os.fspath(path)
    if os.path.isdir(path):
        yield from Disc.detect(path).sources()
        return
    base = os.path.basename(path)
    with open(path, "rb") as f:
        head = f.read(8)
    if head.startswith(b"EALIB"):
        yield Source(base, EALib.open(path), "root")
    elif head.startswith(b"ELECTRON"):
        # A bare ESA: expose its LIBs as archives and its loose files too.
        yield from Disc(os.path.dirname(path) or ".", "disc", path, []).sources()
    else:
        raise ValueError(f"{path}: not a LIB, ESA, or folder")
