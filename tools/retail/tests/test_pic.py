"""PIC decoder: synthetic images built by hand, plus every retail PIC when extracted."""

import collections
import glob
import os
import struct
import unittest

from _paths import REPO, TOOLS_RETAIL  # noqa: F401
from retail.pic import (HEADER_SIZE, KIND_RAW, KIND_SPANS, PICError, load_pic, parse_pic,
                        resolve_palette, to_png)
from retail.png import decode_png

EXTRACTED = os.environ.get("USNF_EXTRACTED", os.path.join(REPO, "extracted"))
ARCHIVES = [("usnf97", "USNF_1.LIB"), ("usnf97", "USNF_2.LIB"), ("usnf97", "USNF_3.LIB"),
            ("atf-gold", "ATF_1.LIB"), ("atf-gold", "ATF_2.LIB"), ("atf-gold", "ATF_3.LIB")]


def _align16(n):
    return (n + 15) & ~15


def build_raw(width, height, pixels, palette6=b"", glyphs=None):
    """Kind-0 PIC: header, pixels, [palette], row table, [glyph table]."""
    assert len(pixels) == width * height
    pos = HEADER_SIZE + len(pixels)
    pal_off = pal_size = 0
    body = bytearray(pixels)
    if palette6:
        pal_off, pal_size = pos, len(palette6)
        body += palette6
        pos += len(palette6)
    body += b"\0" * (_align16(pos) - pos)
    pos = _align16(pos)
    row_off, row_size = pos, 4 * height
    body += b"".join(struct.pack("<I", HEADER_SIZE + y * width) for y in range(height))
    pos += row_size
    glyph_off = 0
    if glyphs:
        body += b"\0" * (_align16(pos) - pos)
        pos = _align16(pos)
        glyph_off = pos
        body += b"".join(struct.pack("<HHH", *g) for g in glyphs)
    hdr = struct.pack("<H2I10I", KIND_RAW, width, height, HEADER_SIZE, len(pixels),
                      pal_off, pal_size, 0, 10 * (height + 1), row_off, row_size, glyph_off, 0)
    return hdr + b"\0" * (HEADER_SIZE - len(hdr)) + bytes(body)


def build_spans(width, height, spans, palette6=b""):
    """Kind-1 PIC from [(y, x0, x1, bytes)]: header, pixel block, [span table], [palette]."""
    pix = bytearray()
    table = bytearray()
    for y, x0, x1, data in spans:
        assert len(data) == x1 - x0 + 1
        table += struct.pack("<HHHI", y, x0, x1, len(pix))
        pix += data
    table += struct.pack("<HHHI", 0xFFFF, 0, 0, 0)
    pos = HEADER_SIZE + len(pix)
    body = bytearray(pix) + b"\0" * (_align16(pos) - pos)
    span_off = _align16(pos)
    body += table
    pos = span_off + len(table)
    pal_off = pal_size = 0
    if palette6:
        body += b"\0" * (_align16(pos) - pos)
        pal_off, pal_size = _align16(pos), len(palette6)
        body += palette6
    hdr = struct.pack("<H2I10I", KIND_SPANS, width, height, HEADER_SIZE, len(pix),
                      pal_off, pal_size, span_off, len(table), 0, 0, 0, 0)
    return hdr + b"\0" * (HEADER_SIZE - len(hdr)) + bytes(body)


class PICSynthetic(unittest.TestCase):
    def test_raw_with_palette_and_glyphs(self):
        w, h = 6, 3
        pixels = bytes(range(w * h))
        pal6 = bytes([63, 0, 63] * 4)
        glyphs = [(0, 0, 0)] * 65 + [(2, 3, 3)] + [(0, 0, 0)] * 190
        pic = parse_pic(build_raw(w, h, pixels, pal6, glyphs), "t.pic")
        self.assertEqual((pic.kind, pic.width, pic.height), (0, w, h))
        self.assertEqual(pic.pixels, pixels)
        self.assertIsNone(pic.mask)
        self.assertEqual(pic.palette, [(255, 0, 255)] * 4)
        self.assertEqual(pic.glyphs[65], (2, 3, 3))
        self.assertEqual(pic.variant, "raw+pal4+glyphs")
        full = resolve_palette(pic, [(1, 1, 1)] * 256)
        self.assertEqual(full[3], (255, 0, 255))
        self.assertEqual(full[4], (1, 1, 1))
        img = decode_png(to_png(pic, [(1, 1, 1)] * 256))
        self.assertEqual(img.pixels, pixels)
        self.assertEqual(img.palette[:5], [(255, 0, 255)] * 4 + [(1, 1, 1)])
        self.assertIsNone(img.transparency)

    def test_raw_rejects_inconsistent_sizes(self):
        good = build_raw(4, 2, bytes(8))
        bad = bytearray(good)
        struct.pack_into("<I", bad, 14, 7)                   # pixel size != w*h
        with self.assertRaises(PICError):
            parse_pic(bytes(bad))
        bad = bytearray(good)
        struct.pack_into("<I", bad, 34 + 4, 9999)             # row table wrong
        bad[HEADER_SIZE + 8 + 4:HEADER_SIZE + 8 + 8] = struct.pack("<I", 9999)
        with self.assertRaises(PICError):
            parse_pic(bytes(bad))
        with self.assertRaises(PICError):
            parse_pic(good[:40])
        bad = bytearray(good)
        struct.pack_into("<H", bad, 0, 2)                    # unknown kind
        with self.assertRaises(PICError):
            parse_pic(bytes(bad))

    def test_spans_mask_and_png(self):
        w, h = 5, 3
        spans = [(0, 1, 3, b"\x0a\x0b\x0c"), (2, 0, 0, b"\x0d"), (2, 4, 4, b"\x00")]
        pic = parse_pic(build_spans(w, h, spans, bytes([0, 0, 0, 63, 63, 63])), "s.pic")
        self.assertEqual(pic.kind, 1)
        self.assertEqual(len(pic.spans), 3)
        self.assertEqual(pic.pixels, bytes([0, 10, 11, 12, 0, 0, 0, 0, 0, 0, 13, 0, 0, 0, 0]))
        self.assertEqual(pic.mask, bytes([0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1]))
        self.assertEqual(pic.used_indices(), collections.Counter({10: 1, 11: 1, 12: 1, 13: 1, 0: 1}))
        img = decode_png(to_png(pic))
        self.assertEqual(img.mode, "P")
        self.assertEqual(img.transparency[255], 0)           # 255 is free, so it is the key
        self.assertEqual(img.pixels[0], 255)
        self.assertEqual(img.pixels[1], 10)
        self.assertEqual(img.pixels[14], 0)                  # opaque index 0 stays 0
        self.assertEqual(img.transparency[0], 255)
        self.assertEqual(img.palette[1], (255, 255, 255))    # embedded palette overlaid at 0

    def test_spans_rejects_bad_geometry(self):
        good = build_spans(4, 2, [(0, 0, 3, b"abcd")])
        bad = bytearray(good)
        span_off = struct.unpack_from("<I", bad, 26)[0]
        struct.pack_into("<H", bad, span_off, 5)              # y outside image
        with self.assertRaises(PICError):
            parse_pic(bytes(bad))
        bad = bytearray(good)
        struct.pack_into("<I", bad, 14, 3)                    # spans cover 4, block says 3
        with self.assertRaises(PICError):
            parse_pic(bytes(bad))


@unittest.skipUnless(os.path.isdir(EXTRACTED), "no extracted retail media")
class PICRetail(unittest.TestCase):
    def test_every_pic_decodes_consistently(self):
        seen = collections.Counter()
        checked = 0
        for title, arc in ARCHIVES:
            d = os.path.join(EXTRACTED, title, arc)
            paths = [p for p in glob.glob(os.path.join(d, "*")) if p.upper().endswith(".PIC")]
            for path in paths:
                pic = load_pic(path)
                with self.subTest(pic=f"{title}/{arc}/{pic.name}"):
                    self.assertGreater(pic.width, 0)
                    self.assertGreater(pic.height, 0)
                    self.assertEqual(len(pic.pixels), pic.width * pic.height)
                    size = os.path.getsize(path)
                    if pic.kind == KIND_RAW:
                        self.assertIsNone(pic.mask)
                        self.assertEqual(pic.fields[1], pic.width * pic.height)
                        self.assertEqual(pic.fields[7], 4 * pic.height)   # row table
                    else:
                        self.assertEqual(sum(s.length for s in pic.spans), pic.fields[1])
                        self.assertEqual(pic.fields[5], 10 * (len(pic.spans) + 1))
                    self.assertLessEqual(HEADER_SIZE + pic.fields[1], size)
                    if pic.palette is not None:
                        self.assertIn(len(pic.palette), (32, 64, 125, 128, 256))
                seen[(title, pic.variant)] += 1
                checked += 1
        if not checked:
            self.skipTest("no PIC files extracted")
        self.assertEqual({v for _, v in seen},
                         {"raw", "raw+glyphs", "raw+pal125", "raw+pal128", "raw+pal256",
                          "spans", "spans+pal128", "spans+pal32", "spans+pal64"})

    def test_f14_cockpit_shape(self):
        path = os.path.join(EXTRACTED, "usnf97", "USNF_1.LIB", "~F14H.PIC")
        if not os.path.isfile(path):
            self.skipTest("~F14H.PIC not extracted")
        pic = load_pic(path)
        self.assertEqual((pic.kind, pic.width, pic.height), (KIND_SPANS, 1280, 490))
        self.assertEqual(len(pic.palette), 64)
        # Canopy frame: opaque along the bottom edge, transparent in the middle of the top.
        bottom = pic.mask[489 * 1280:]
        self.assertGreater(sum(bottom), 300)
        self.assertEqual(pic.mask[250 * 1280 + 640], 0)


if __name__ == "__main__":
    unittest.main()
