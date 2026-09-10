"""Menu bundle export: reads local media and skips when it is absent."""

import unittest
from pathlib import Path

from _paths import TOOLS_RETAIL  # noqa: F401
from retail.menu import SOUNDS, export

ROOT = Path(__file__).resolve().parents[3]
EXTRACTED = ROOT / 'extracted'


class MenuExportTests(unittest.TestCase):
    def bundle(self, game='usnf97'):
        if not (EXTRACTED / game).is_dir():
            self.skipTest(f'local media missing: {game}')
        return export(EXTRACTED, game)

    def test_main_menu_carries_the_recovered_layout_and_its_background(self):
        bundle, _ = self.bundle()
        screen = bundle['screens']['main-menu']
        self.assertEqual(screen['source'], 'CHOOSEAC.DLG')
        self.assertEqual(screen['rect'], {'x': 379, 'y': 80, 'width': 238, 'height': 361})
        self.assertEqual(len(screen['widgets']), 8)
        self.assertEqual([w['y'] for w in screen['widgets']], [24, 56, 88, 120, 170, 202, 234, 285])
        self.assertEqual(screen['widgets'][0]['label'], 'Play Single Mission')
        self.assertEqual((screen['background']['width'], screen['background']['height']), (640, 480))
        self.assertEqual(screen['background']['source'], 'CHOOSEAC.PIC')

    def test_button_chrome_is_exported_as_nine_slice_parts(self):
        bundle, _ = self.bundle()
        self.assertEqual(
            sorted(bundle['sprites']), ['action-left', 'action-middle', 'action-right']
        )
        for states in bundle['sprites'].values():
            # Only what the file names pin: the enabled button and its disabled twin.
            self.assertEqual([entry['state'] for entry in states], ['normal', 'disabled'])
            # The original composites these at run time; the background art has no
            # buttons drawn into it, so each piece is small.
            for entry in states:
                self.assertLessEqual(entry['image']['height'], 64)
                self.assertLessEqual(entry['image']['width'], 64)

    def test_the_menu_sound_bank_maps_our_names_to_the_ampersand_set(self):
        _, sounds = self.bundle()
        self.assertEqual(sorted(sounds['sounds']), sorted(SOUNDS))
        for name, clip in sounds['sounds'].items():
            self.assertEqual(clip['source'], SOUNDS[name])
            self.assertEqual(clip['encoding'], 'unsigned8-mono')
            self.assertIn(clip['sampleRate'], (5512, 8000, 11025))
            self.assertTrue(0 < len(clip['pcm']) <= 1_000_000)

    def test_every_source_file_is_hashed_and_the_limits_are_stated(self):
        bundle, _ = self.bundle()
        self.assertTrue(bundle['source']['sha256'])
        for digest in bundle['source']['sha256'].values():
            self.assertEqual(len(digest), 64)
        self.assertTrue(any('verified x/y pair' in note for note in bundle['limitations']))
        self.assertTrue(any('size set' in note for note in bundle['limitations']))


if __name__ == '__main__':
    unittest.main()
