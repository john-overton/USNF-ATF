"""Integration tests against the retail discs in /gameassets.

Skipped entirely when the media is absent.  Nothing here embeds retail bytes;
everything is read at run time.
"""

import hashlib
import os
import unittest

from _paths import TOOLS_RETAIL, USNF97, ATF_GOLD, SCRATCHPAD, have_disc  # noqa: F401
from retail.disc import Disc
from retail.ealib import EALib, FLAG_DCL, FLAG_STORED
from retail.esa import ESA

DISCS = [d for d in (USNF97, ATF_GOLD) if have_disc(d)]


@unittest.skipUnless(DISCS, "retail media not present in /gameassets")
class RetailMediaTest(unittest.TestCase):
    def test_esa_tiles_and_directory_is_sane(self):
        for disc in DISCS:
            with self.subTest(disc=os.path.basename(disc)):
                esa = ESA.open(os.path.join(disc, "SETUP.ESA"))
                self.assertGreater(len(esa), 0)
                self.assertTrue(esa.tiles(), "ESA entries must exactly tile the file")
                for e in esa:
                    self.assertIn(e.codec, ("PKWA", "NULL"))
                    if e.codec == "NULL":
                        self.assertEqual(e.csize, e.size)
                    if e.name.upper().endswith(".LIB") and e.codec == "NULL":
                        head = bytes(esa.buf[e.offset:e.offset + 5])
                        self.assertEqual(head, b"EALIB", f"{e.name} does not start with EALIB")

    def test_esa_pkwa_entries_explode_to_size(self):
        for disc in DISCS:
            esa = ESA.open(os.path.join(disc, "SETUP.ESA"))
            for e in esa:
                if e.codec == "PKWA":
                    with self.subTest(disc=os.path.basename(disc), name=e.name):
                        self.assertEqual(len(esa.read(e)), e.size)

    def test_every_lib_entry_decompresses_to_size_prefix(self):
        for disc in DISCS:
            d = Disc.detect(disc)
            self.assertEqual(d.kind, "disc")
            for src in d.sources():
                if not isinstance(src.archive, EALib):
                    continue
                lib = src.archive
                for e in lib:
                    self.assertIn(e.flag, (FLAG_STORED, FLAG_DCL), f"{src.name}/{e.name}")
                    data = lib.read(e)
                    self.assertEqual(len(data), lib.uncompressed_size(e), f"{src.name}/{e.name}")

    @unittest.skipUnless(SCRATCHPAD and os.path.isfile(os.path.join(SCRATCHPAD, "usnf97_USNF_1.LIB")),
                         "scratchpad slice of USNF_1.LIB not available (set USNF_SCRATCHPAD)")
    def test_esa_slice_matches_scratchpad_slice(self):
        esa = ESA.open(os.path.join(USNF97, "SETUP.ESA"))
        ours = esa.read(esa.get("USNF_1.LIB"))
        with open(os.path.join(SCRATCHPAD, "usnf97_USNF_1.LIB"), "rb") as f:
            theirs = f.read()
        self.assertEqual(len(ours), len(theirs))
        self.assertEqual(hashlib.sha256(ours).hexdigest(), hashlib.sha256(theirs).hexdigest())

    @unittest.skipUnless(have_disc(USNF97), "USNF'97 disc not present")
    def test_palette_is_768_bytes_of_6bit_vga(self):
        esa = ESA.open(os.path.join(USNF97, "SETUP.ESA"))
        e = esa.get("USNF_2.LIB")
        lib = EALib(memoryview(esa.buf)[e.offset:e.offset + e.csize], e.name)
        pal = lib.read(lib.get("PALETTE.PAL"))
        self.assertEqual(len(pal), 768)
        self.assertLessEqual(max(pal), 63)


if __name__ == "__main__":
    unittest.main()
