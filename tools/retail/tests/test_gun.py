"""Local-media gun linkage tests; no retail bytes committed."""
import tempfile
import unittest
from pathlib import Path
from retail.gun import export

ROOT = Path(__file__).resolve().parents[3]


class GunExportTests(unittest.TestCase):
    def test_local_aircraft_guns(self):
        cases = [('usnf97/USNF_2.LIB/F14.PT', 'm61', 675, 'red'),
                 ('usnf97/USNF_2.LIB/A4E.PT', 'mk12-pair', 400, 'red'),
                 ('atf-gold/ATF_2.LIB/F31.PT', 'm61', 740, 'green')]
        for relative, kind, capacity, color in cases:
            with self.subTest(aircraft=relative):
                pt = ROOT / 'extracted' / relative
                if not pt.exists():
                    self.skipTest(f'local media missing: {relative}')
                with tempfile.TemporaryDirectory(dir=ROOT / 'extracted') as tmp:
                    result = export(pt, Path(tmp) / 'gun.json')
                    self.assertEqual(result['type'], kind)
                    self.assertEqual(result['capacity'], capacity)
                    self.assertEqual(result['tracerColor'], color)
                    self.assertEqual(len(result['damage']), 5)
                    self.assertTrue(all(isinstance(n, int) and n >= 0 for n in result['damage']))
                    self.assertGreater(len(result['clip']['pcm']), 2)
                    self.assertEqual(result['source']['rawProjectile']['actualRoundsPerGame'], 2)
                    override = export(pt, Path(tmp) / 'override.json', 'green')
                    self.assertEqual(override['tracerColor'], 'green')
