import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
from pipeline.coast_paint import extend_land_colors, paint_coasts


class CoastPaintTests(unittest.TestCase):
    def test_padding_retains_texture_variation_in_world_metres(self):
        water = np.zeros((20, 40), bool); water[:, :12] = True
        rgb = np.zeros((20, 40, 3), dtype='uint8')
        rgb[:, 12:] = np.arange(12, 40)[None, :, None]*5
        before = rgb.copy()
        extend_land_colors(rgb, water, water.copy(), (50, 100), inland=200, feather=100, offshore=300)
        # A 300 m band spans three columns even though rows are only 50 m.
        np.testing.assert_array_equal(rgb[:, :9], before[:, :9])
        self.assertTrue(np.all(rgb[:, 9:12] > 0))
        self.assertEqual(len(np.unique(rgb[10, 9:12, 0])), 3)

    def test_bounded_padding_feather_and_inland_lakes(self):
        water = np.zeros((30, 40), bool); water[:, :12] = True
        sea = water.copy(); water[12:15, 28:31] = True
        rgb = np.full((30, 40, 3), [160, 140, 80], dtype='uint8')
        rgb[:, :14] = [25, 65, 70]
        rgb[:, 14] = [40, 70, 80]
        rgb[water & ~sea] = [20, 30, 60]
        before = rgb.copy(); water_before = water.copy()
        stats = extend_land_colors(rgb, water, sea, (100, 100), inland=200, feather=200, offshore=300)
        np.testing.assert_array_equal(rgb[:, 9:14], np.broadcast_to([160, 140, 80], (30, 5, 3)))
        np.testing.assert_array_equal(rgb[0, 14], [100, 105, 80])
        np.testing.assert_array_equal(rgb[:, :9], before[:, :9])
        np.testing.assert_array_equal(rgb[:, 15:], before[:, 15:])
        np.testing.assert_array_equal(water, water_before)
        self.assertGreater(stats['changedLandPixels'], 0)
        self.assertEqual(stats['changedWaterPixels'], 90)

    def test_narrow_island_is_not_painted_from_mainland(self):
        water = np.ones((30, 50), bool); water[:, 30:] = False
        water[14:17, 24:27] = False
        rgb = np.full((30, 50, 3), [160, 140, 80], dtype='uint8')
        rgb[water] = [25, 65, 70]; rgb[14:17, 24:27] = [30, 70, 30]
        before = rgb.copy()
        stats = extend_land_colors(rgb, water, water.copy(), (100, 100), inland=200, feather=100, offshore=600)
        np.testing.assert_array_equal(rgb[14:17, 24:27], before[14:17, 24:27])
        self.assertGreater(stats['skippedComponentPixels'], 0)

    def test_island_with_interior_uses_its_own_colors(self):
        water = np.ones((30, 50), bool); water[:, 35:] = False
        water[8:22, 10:24] = False
        rgb = np.full((30, 50, 3), [160, 140, 80], dtype='uint8')
        rgb[water] = [25, 65, 70]; rgb[8:22, 10:24] = [30, 70, 30]
        extend_land_colors(rgb, water, water.copy(), (100, 100), inland=200, feather=100, offshore=600)
        np.testing.assert_array_equal(rgb[14, 9], [30, 70, 30])
        np.testing.assert_array_equal(rgb[14, 34], [160, 140, 80])

    def test_empty_masks_and_invalid_parameters(self):
        rgb = np.full((10, 10, 3), 80, dtype='uint8')
        for value in [False, True]:
            water = np.full((10, 10), value)
            self.assertEqual(extend_land_colors(rgb, water, water, (100, 100))['changedLandPixels'], 0)
        with self.assertRaises(ValueError):
            extend_land_colors(rgb, water, water, (100, 100), offshore=float('nan'))

    def test_bake_preserves_alpha_holes_geometry_and_records_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); atlas = root/'atlas.gz'; path = root/'manifest.json'
            rgba = np.full((20, 20, 4), 100, dtype='uint8'); rgba[:, :, 3] = 255
            rgba[:, :8, :3] = [25, 65, 70]
            data = gzip.compress(rgba.tobytes(), mtime=0); atlas.write_bytes(data)
            image = dict(path='atlas.gz', width=20, height=20, byteLength=len(data), sha256=hashlib.sha256(data).hexdigest())
            body = dict(elevation=0, polygon=[[0, 0], [700, 0], [700, 2000], [0, 2000], [0, 0]],
                        holes=[[[200, 800], [400, 800], [400, 1000], [200, 1000], [200, 800]]])
            m = dict(imagery=image, extents=dict(width=2000, height=2000), chunks=['unchanged'], waterBodies=[body])
            path.write_text(json.dumps(m))
            result = paint_coasts(path)
            after = json.loads(path.read_text())
            self.assertEqual(after['waterBodies'], m['waterBodies']); self.assertEqual(after['chunks'], m['chunks'])
            self.assertEqual(result['inputImagerySha256'], image['sha256'])
            self.assertEqual(after['imagery']['sha256'], hashlib.sha256(atlas.read_bytes()).hexdigest())
            pixels = np.frombuffer(gzip.decompress(atlas.read_bytes()), dtype='uint8').reshape(20, 20, 4)
            self.assertTrue(np.all(pixels[:, :, 3] == 255))
            # South-to-north rasterization keeps the dry hole in the expected rows.
            np.testing.assert_array_equal(pixels[8:10, 2:4], rgba[8:10, 2:4])
            with self.assertRaisesRegex(ValueError, 'already'):
                paint_coasts(path)
