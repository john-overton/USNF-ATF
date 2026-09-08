"""PNG writer/reader round trips on synthetic data."""

import unittest
import zlib

from _paths import TOOLS_RETAIL  # noqa: F401
from retail.png import PNGError, decode_png, encode_png


class PNGRoundTrip(unittest.TestCase):
    def test_indexed_with_transparency(self):
        w, h = 5, 3
        pixels = bytes(range(w * h))
        pal = [(i, 255 - i, i * 2) for i in range(16)]
        png = encode_png(w, h, pixels, "P", palette=pal, transparency=[0, 255, 128])
        self.assertTrue(png.startswith(b"\x89PNG\r\n\x1a\n"))
        img = decode_png(png)
        self.assertEqual((img.width, img.height, img.mode), (w, h, "P"))
        self.assertEqual(img.pixels, pixels)
        self.assertEqual(img.palette, pal)
        self.assertEqual(img.transparency, bytes([0, 255, 128]))

    def test_grey_rgb_rgba(self):
        for mode, ch in (("L", 1), ("RGB", 3), ("RGBA", 4)):
            w, h = 7, 4
            pixels = bytes((i * 37) & 0xFF for i in range(w * h * ch))
            img = decode_png(encode_png(w, h, pixels, mode))
            self.assertEqual((img.width, img.height, img.mode), (w, h, mode))
            self.assertEqual(img.pixels, pixels)
            self.assertIsNone(img.palette)

    def test_size_and_mode_errors(self):
        with self.assertRaises(PNGError):
            encode_png(2, 2, b"\0" * 3, "L")
        with self.assertRaises(PNGError):
            encode_png(2, 2, b"\0" * 4, "P")                 # no palette
        with self.assertRaises(PNGError):
            encode_png(2, 2, b"\0" * 4, "P", palette=[(0, 0, 0)], transparency=[0, 0])
        with self.assertRaises(PNGError):
            encode_png(2, 2, b"\0" * 12, "RGB", palette=[(0, 0, 0)])
        with self.assertRaises(PNGError):
            encode_png(0, 2, b"", "L")

    def test_crc_checked(self):
        png = bytearray(encode_png(2, 2, b"\1\2\3\4", "L"))
        png[-5] ^= 0xFF                                       # corrupt the IEND CRC
        with self.assertRaises(PNGError):
            decode_png(bytes(png))

    def test_idat_is_valid_zlib(self):
        png = encode_png(3, 2, b"\0\1\2\3\4\5", "L")
        idat = png.index(b"IDAT")
        length = int.from_bytes(png[idat - 4:idat], "big")
        raw = zlib.decompress(png[idat + 4:idat + 4 + length])
        self.assertEqual(raw, b"\0\0\1\2\0\3\4\5")           # filter byte 0 per row


if __name__ == "__main__":
    unittest.main()
