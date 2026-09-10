"""Cockpit transparency is a span mask, never a black color key."""
import base64
import tempfile
import unittest
from pathlib import Path
from _paths import REPO
from retail.cockpit import RECIPES, export_cockpit, extract_mirrors
from retail.pic import parse_pic
from retail.png import decode_png
from test_pic import build_spans


class CockpitSynthetic(unittest.TestCase):
    def test_black_pixels_remain_opaque_and_gap_transparent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for lib in ('USNF_1.LIB', 'USNF_2.LIB'):
                (root / 'usnf97' / lib).mkdir(parents=True)
            (root / 'usnf97/USNF_1.LIB/~F4H.PIC').write_bytes(
                build_spans(1280, 490, [(0, 0, 1, b'\x00\x01'),
                    (40, 640, 640, b'\x02'), (240, 230, 230, b'\x02'),
                    (240, 1050, 1050, b'\x02')]))
            (root / 'usnf97/USNF_2.LIB/PALETTE.PAL').write_bytes(bytes(768))
            module = root / 'usnf97/USNF_2.LIB/F4.HUD'
            module.write_bytes(b'~f4h\0')
            data = export_cockpit(root, 'a4e')
            png = decode_png(base64.b64decode(data['pngBase64']))
            self.assertEqual(data['aircraftId'], 'a4e')
            self.assertIn('shared F-4', data['label'])
            self.assertEqual(png.transparency[png.pixels[0]], 255)
            self.assertEqual(png.transparency[png.pixels[2]], 0)
            module.write_bytes(b'~f14h\0')
            with self.assertRaises(ValueError):
                export_cockpit(root, 'a4e')

    def test_exact_connected_mirror_mask_preserves_other_same_color_regions(self):
        pic = parse_pic(build_spans(20, 10, [
            (1, 1, 3, b'\x02\x02\x02'), (2, 2, 3, b'\x02\x02'),
            (8, 10, 11, b'\x02\x02'),
        ]))
        mirrors = extract_mirrors(pic, [('center', 2, 1)])
        self.assertEqual(len(mirrors), 1)
        m = mirrors[0]
        png = decode_png(base64.b64decode(m['maskPngBase64']))
        self.assertEqual((png.width, png.height, png.mode), (3, 2, 'RGBA'))
        self.assertEqual(list(png.pixels[3::4]), [255, 255, 255, 0, 255, 255])
        self.assertEqual(pic.mask[22], 0)
        self.assertEqual(pic.mask[170], 1)
        self.assertEqual((m['x'], m['y'], m['width'], m['height']), (.05, .1, .15, .2))
        with self.assertRaisesRegex(ValueError, 'outside opaque'):
            extract_mirrors(pic, [('missing', 0, 0)])


class CockpitRetail(unittest.TestCase):
    def test_reviewed_frames(self):
        root = Path(REPO) / 'extracted'
        for aircraft, (game, lib, stem, _, _) in RECIPES.items():
            with self.subTest(aircraft=aircraft):
                if not (root / game / f'{lib}_1.LIB' / f'~{stem}H.PIC').exists():
                    self.skipTest(f'{aircraft} local cockpit media unavailable')
                data = export_cockpit(root, aircraft)
                png = decode_png(base64.b64decode(data['pngBase64']))
                self.assertEqual((png.width, png.height), (1280, 490))
                self.assertIn(0, png.transparency)
                self.assertIn(255, png.transparency)

                self.assertEqual(len(data['mirrors']), 0 if aircraft == 'x31' else 3)
                for mirror in data['mirrors']:
                    mask = decode_png(base64.b64decode(mirror['maskPngBase64']))
                    self.assertEqual(mask.mode, 'RGBA')
                    self.assertGreater(sum(mask.pixels[3::4]), 1000)
