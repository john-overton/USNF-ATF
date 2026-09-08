"""PKWare DCL decoder tests.  Contains no retail bytes: the vectors are the
public zlib contrib/blast example and synthetic streams built here."""

import unittest

from _paths import TOOLS_RETAIL  # noqa: F401  (sys.path side effect)
from retail.dcl import explode, DCLError

# From zlib contrib/blast/README: this 8-byte stream decodes to "AIAIAIAIAIAIA".
BLAST_VECTOR = bytes.fromhex("00 04 82 24 25 8f 80 7f")


class BitWriter:
    """LSB-first bit writer, used to hand-build tiny DCL streams."""

    def __init__(self):
        self.bits = []

    def put(self, value: int, nbits: int):
        for i in range(nbits):
            self.bits.append((value >> i) & 1)

    def tobytes(self) -> bytes:
        out = bytearray()
        for i in range(0, len(self.bits), 8):
            chunk = self.bits[i:i + 8]
            out.append(sum(b << j for j, b in enumerate(chunk)))
        return bytes(out)


def end_code(w: BitWriter):
    # Length symbol 15 has code length 7 and canonical code all-ones -> on the
    # wire it is inverted, i.e. seven zero bits; then 8 extra bits of 255
    # (base 264 + 255 = 519 = end of stream).
    w.put(1, 1)
    w.put(0, 7)
    w.put(255, 8)


class DCLTest(unittest.TestCase):
    def test_blast_reference_vector(self):
        self.assertEqual(explode(BLAST_VECTOR), b"AIAIAIAIAIAIA")
        self.assertEqual(explode(BLAST_VECTOR, 13), b"AIAIAIAIAIAIA")

    def test_expected_size_mismatch_raises(self):
        with self.assertRaises(DCLError):
            explode(BLAST_VECTOR, 12)
        with self.assertRaises(DCLError):
            explode(BLAST_VECTOR, 14)

    def test_raw_literals_and_end(self):
        w = BitWriter()
        for c in b"hello":
            w.put(0, 1)
            w.put(c, 8)
        end_code(w)
        stream = bytes([0, 6]) + w.tobytes()
        self.assertEqual(explode(stream), b"hello")

    def test_overlapping_copy(self):
        # "ab" then copy length 10 from distance 2 -> "ab" * 6.
        w = BitWriter()
        for c in b"ab":
            w.put(0, 1)
            w.put(c, 8)
        w.put(1, 1)
        # Length symbol 8 (base 10, 1 extra bit).  Length-code bit lengths are
        # 2,3,3,3,4,4,4,5,5,5,5,6,6,6,7,7 so symbol 8 is the second 5-bit
        # code, canonical 0b11011; on the wire it is inverted, MSB first.
        for bit in "11011":
            w.put(1 - int(bit), 1)
        w.put(0, 1)  # extra bit 0 -> length 10
        # distance 2 with dict bits 6: symbol 0 (code length 2, canonical 00,
        # wire "11"), then 6 low bits = 1 (dist = (0 << 6) + 1 + 1 = 2).
        w.put(1, 1)
        w.put(1, 1)
        w.put(1, 6)
        end_code(w)
        stream = bytes([0, 6]) + w.tobytes()
        self.assertEqual(explode(stream), b"ab" * 6)

    def test_bad_header(self):
        with self.assertRaises(DCLError):
            explode(b"\x02\x06")
        with self.assertRaises(DCLError):
            explode(b"\x00\x07")
        with self.assertRaises(DCLError):
            explode(b"\x00")

    def test_truncated_stream(self):
        with self.assertRaises(DCLError):
            explode(BLAST_VECTOR[:5], 13)

    def test_distance_too_far(self):
        w = BitWriter()
        w.put(1, 1)
        for bit in "11011":
            w.put(1 - int(bit), 1)
        w.put(0, 1)
        w.put(1, 1); w.put(1, 1); w.put(1, 6)
        end_code(w)
        with self.assertRaises(DCLError):
            explode(bytes([0, 6]) + w.tobytes())


if __name__ == "__main__":
    unittest.main()
