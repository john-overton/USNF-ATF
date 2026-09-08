"""FNT decoder: hand-assembled glyph routines in a synthetic PE, plus the retail fonts."""

import glob
import os
import struct
import unittest

from _paths import REPO, TOOLS_RETAIL  # noqa: F401
from retail.fnt import FNTError, load_fnt, parse_fnt, render_sheet, run_glyph
from retail.png import decode_png
from retail.fnt import sheet_png

EXTRACTED = os.environ.get("USNF_EXTRACTED", os.path.join(REPO, "extracted"))

MOV_AL = lambda d: b"\x88\x07" if d == 0 else b"\x88\x47" + struct.pack("<b", d)      # noqa: E731
MOV_AX = lambda d: b"\x66\x89\x07" if d == 0 else b"\x66\x89\x47" + struct.pack("<b", d)  # noqa: E731
MOV_EAX = lambda d: b"\x89\x07" if d == 0 else b"\x89\x47" + struct.pack("<b", d)     # noqa: E731
NEXT_ROW = b"\x03\xf9"
RET = b"\xc3"


def build_fnt(height, routines, advances, va=0x1000, image_base=0x400000, sig=b"PL\0\0"):
    """A minimal i386 PE with one CODE section laid out like the retail fonts."""
    code = bytearray(struct.pack("<I", height)) + bytearray(4 * 256)
    code += b"".join(struct.pack("<I", a) for a in advances)
    assert len(code) == 0x804
    ptrs = []
    for r in routines:
        ptrs.append(image_base + va + len(code))
        code += r
    for i, p in enumerate(ptrs):
        struct.pack_into("<I", code, 4 + 4 * i, p)
    pe_off = 0x80
    opt = bytearray(224)
    struct.pack_into("<H", opt, 0, 0x10B)
    struct.pack_into("<I", opt, 28, image_base)
    coff = struct.pack("<HHIIIHH", 0x14C, 1, 0, 0, 0, len(opt), 0x210)
    raw_off = 0x200
    sec = struct.pack("<8sIIII", b"CODE", len(code), va, len(code), raw_off) + b"\0" * 16
    mz = bytearray(b"MZ" + b"\0" * 0x3E)
    struct.pack_into("<I", mz, 0x3C, pe_off)
    img = mz + b"\0" * (pe_off - len(mz)) + sig + coff + opt + sec
    img += b"\0" * (raw_off - len(img)) + code
    return bytes(img)


class FNTSynthetic(unittest.TestCase):
    def test_run_glyph_interprets_moves(self):
        # 3x3 'C' drawn with one 2-pixel store, two single stores, and a 4-pixel store.
        code = MOV_AX(0) + NEXT_ROW + MOV_AL(0) + NEXT_ROW + MOV_EAX(0) + RET
        pixels, n = run_glyph(code, 0)
        self.assertEqual(n, len(code))
        self.assertEqual(pixels, {(0, 0), (1, 0), (0, 1), (0, 2), (1, 2), (2, 2), (3, 2)})
        pixels, _ = run_glyph(b"\x83\xc7\x02" + MOV_AL(1) + RET, 0)   # add edi, 2 then [edi+1]
        self.assertEqual(pixels, {(3, 0)})

    def test_run_glyph_rejects_unknown_code(self):
        with self.assertRaises(FNTError):
            run_glyph(b"\x90" + RET, 0)                        # nop is not in the subset
        with self.assertRaises(FNTError):
            run_glyph(MOV_AL(0), 0)                            # no ret: runs off the end

    def test_parse_synthetic_font(self):
        routines = [RET] * 256
        routines[ord("I")] = MOV_AL(1) + NEXT_ROW + MOV_AL(1) + NEXT_ROW + MOV_AX(0) + RET
        routines[ord("!")] = MOV_AL(0) + RET
        advances = [1] * 256
        advances[ord("I")] = 3
        font = parse_fnt(build_fnt(3, routines, advances), "syn.fnt")
        self.assertEqual(font.height, 3)
        g = font.glyphs[ord("I")]
        self.assertEqual((g.advance, g.width, g.height), (3, 2, 3))
        self.assertEqual(g.pixels, {(1, 0), (1, 1), (0, 2), (1, 2)})
        self.assertEqual(font.glyphs[0].pixels, set())
        self.assertEqual(font.cell_width, 3)
        w, h, buf = render_sheet(font)
        self.assertEqual((w, h), (16 * 4 + 1, 16 * 4 + 1))
        img = decode_png(sheet_png(font))
        self.assertEqual((img.width, img.height), (w, h))
        # 'I' is code 73: column 9, row 4; its (1, 0) pixel lands at sheet (9*4+1+1, 4*4+1).
        self.assertEqual(img.pixels[(4 * 4 + 1) * w + 9 * 4 + 2], 1)

    def test_parse_accepts_pe_signature_and_rejects_others(self):
        parse_fnt(build_fnt(1, [RET] * 256, [1] * 256, sig=b"PE\0\0"))
        with self.assertRaises(FNTError):
            parse_fnt(build_fnt(1, [RET] * 256, [1] * 256, sig=b"NE\0\0"))
        with self.assertRaises(FNTError):
            parse_fnt(b"MZ" + b"\0" * 100)
        bad = [RET] * 256
        bad[5] = MOV_AL(0) + NEXT_ROW + MOV_AL(0) + RET         # 2 rows tall in a 1-row font
        with self.assertRaises(FNTError):
            parse_fnt(build_fnt(1, bad, [1] * 256))


@unittest.skipUnless(os.path.isdir(EXTRACTED), "no extracted retail media")
class FNTRetail(unittest.TestCase):
    def test_every_font_decodes(self):
        paths = []
        for title, arc in (("usnf97", "USNF_1.LIB"), ("atf-gold", "ATF_1.LIB")):
            paths += glob.glob(os.path.join(EXTRACTED, title, arc, "*.FNT"))
        if not paths:
            self.skipTest("no FNT files extracted")
        for path in paths:
            font = load_fnt(path)
            with self.subTest(font=path):
                self.assertGreater(font.height, 0)
                self.assertEqual(len(font.glyphs), 256)
                inked = [g for g in font.glyphs if g.pixels]
                self.assertGreaterEqual(len(inked), 48)
                for g in font.glyphs:
                    self.assertLessEqual(g.height, font.height)
                    self.assertGreaterEqual(g.advance, 1)
                if "SYM" not in font.name.upper():
                    self.assertTrue(all(font.glyphs[c].pixels for c in range(ord("A"), ord("Z") + 1)))
                    self.assertTrue(all(font.glyphs[c].pixels for c in range(ord("0"), ord("9") + 1)))
                    self.assertEqual(font.glyphs[ord(" ")].pixels, set())


if __name__ == "__main__":
    unittest.main()
