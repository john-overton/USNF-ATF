"""PAL reader: synthetic unit tests plus a check of the retail PALETTE.PAL when extracted."""

import os
import unittest

from _paths import REPO, TOOLS_RETAIL  # noqa: F401
from retail.pal import PALError, expand6, load_pal, overlay, parse_pal, placeholder_indices

EXTRACTED = os.environ.get("USNF_EXTRACTED", os.path.join(REPO, "extracted"))


class PALUnit(unittest.TestCase):
    def test_expand6_endpoints_and_monotonic(self):
        self.assertEqual(expand6(0), 0)
        self.assertEqual(expand6(63), 255)
        self.assertEqual(expand6(32), 130)
        vals = [expand6(v) for v in range(64)]
        self.assertEqual(vals, sorted(vals))
        self.assertEqual(len(set(vals)), 64)
        with self.assertRaises(PALError):
            expand6(64)

    def test_parse_pal(self):
        raw = bytes(v % 64 for v in range(768))
        pal = parse_pal(raw)
        self.assertEqual(len(pal), 256)
        self.assertEqual(pal[0], (0, expand6(1), expand6(2)))
        self.assertEqual(pal[21], (expand6(63), 0, expand6(1)))
        with self.assertRaises(PALError):
            parse_pal(raw[:-1])
        with self.assertRaises(PALError):
            parse_pal(b"\x40" + raw[1:])

    def test_overlay(self):
        base = [(0, 0, 0)] * 256
        out = overlay(base, [(1, 2, 3), (4, 5, 6)], 10)
        self.assertEqual(out[10:12], [(1, 2, 3), (4, 5, 6)])
        self.assertEqual(out[9], (0, 0, 0))
        self.assertEqual(base[10], (0, 0, 0))                # base untouched
        with self.assertRaises(PALError):
            overlay(base, [(0, 0, 0)] * 2, 255)


@unittest.skipUnless(os.path.isdir(EXTRACTED), "no extracted retail media")
class PALRetail(unittest.TestCase):
    def test_palette_pal(self):
        for title, arc in (("usnf97", "USNF_2.LIB"), ("atf-gold", "ATF_2.LIB")):
            path = os.path.join(EXTRACTED, title, arc, "PALETTE.PAL")
            if not os.path.isfile(path):
                self.skipTest(f"{path} not extracted")
            pal = load_pal(path)
            self.assertEqual(len(pal), 256)
            self.assertEqual(pal[0], (0, 0, 0))
            self.assertEqual(pal[1:16], [(255, 0, 255)] * 15)
            self.assertIn(254, placeholder_indices(pal))      # 192..254 are placeholders too
            self.assertEqual(pal[255], (255, 255, 255))
            self.assertTrue(all(0 <= c <= 255 for rgb in pal for c in rgb))


if __name__ == "__main__":
    unittest.main()
