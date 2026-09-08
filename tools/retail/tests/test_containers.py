"""EALIB / ESA parser tests on synthetic archives (no retail bytes)."""

import struct
import unittest

from _paths import TOOLS_RETAIL  # noqa: F401
from retail.ealib import EALib, EALibError
from retail.esa import ESA, ESAError
from test_dcl import BLAST_VECTOR


def build_lib(entries):
    """entries: list of (name, flag, payload bytes)."""
    n = len(entries)
    dir_end = 7 + 18 * n
    out = bytearray(b"EALIB" + struct.pack("<H", n - 1))
    body = bytearray()
    for name, flag, payload in entries:
        off = dir_end + len(body)
        out += struct.pack("<13sBI", name.encode("ascii"), flag, off)
        body += payload
    return bytes(out + body)


def build_esa(entries):
    """entries: list of (name, label, codec, usize, payload)."""
    magic = b"ELECTRONIC_ARTS_ARCHIVE_FILE\0"
    fixed = 0
    for name, label, *_ in entries:
        fixed += len(name) + 1 + len(label) + 1 + 12 + 5 + 8
    data_start = len(magic) + fixed + 1
    directory = bytearray()
    body = bytearray()
    for name, label, codec, usize, payload in entries:
        directory += name.encode() + b"\0" + label.encode() + b"\0"
        directory += struct.pack("<III", 0x211, usize, 0x325185F8)
        directory += codec.encode() + b"\0"
        directory += struct.pack("<II", len(payload), data_start + len(body))
        body += payload
    return bytes(magic + directory + b"\0" + body)


class EALibTest(unittest.TestCase):
    def test_stored_and_compressed(self):
        comp = struct.pack("<I", 13) + BLAST_VECTOR
        lib = EALib(build_lib([("A.TXT", 0, b"stored!"), ("B.BIN", 4, comp), ("C", 0, b"")]))
        self.assertEqual([e.name for e in lib], ["A.TXT", "B.BIN", "C"])
        self.assertEqual([e.size for e in lib], [7, len(comp), 0])
        self.assertEqual(lib.read(lib.get("a.txt")), b"stored!")
        self.assertEqual(lib.read(lib.get("B.BIN")), b"AIAIAIAIAIAIA")
        self.assertEqual(lib.uncompressed_size(lib.get("B.BIN")), 13)
        self.assertEqual(lib.read(lib.get("C")), b"")
        self.assertEqual(lib.get("B.BIN").extension, "BIN")

    def test_size_prefix_enforced(self):
        comp = struct.pack("<I", 12) + BLAST_VECTOR
        lib = EALib(build_lib([("B.BIN", 4, comp)]))
        with self.assertRaises(EALibError):
            lib.read(lib.get("B.BIN"))

    def test_bad_magic(self):
        with self.assertRaises(EALibError):
            EALib(b"NOTLIB\0\0")


class ESATest(unittest.TestCase):
    def test_parse_and_read(self):
        esa = ESA(build_esa([
            ("X.EXE", "EXE_FILES", "PKWA", 13, BLAST_VECTOR),
            ("D.LIB", "LIBS", "NULL", 5, b"EALIB"),
        ]))
        self.assertEqual(len(esa), 2)
        self.assertTrue(esa.tiles())
        x = esa.get("x.exe")
        self.assertEqual((x.label, x.attr, x.codec, x.csize, x.size), ("EXE_FILES", 0x211, "PKWA", 8, 13))
        self.assertEqual(esa.read(x), b"AIAIAIAIAIAIA")
        self.assertEqual(esa.read(esa.get("D.LIB")), b"EALIB")
        self.assertEqual(esa.get("D.LIB").offset, x.offset + x.csize)

    def test_bad_magic(self):
        with self.assertRaises(ESAError):
            ESA(b"EALIB\0\0")


if __name__ == "__main__":
    unittest.main()
