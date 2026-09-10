"""Local-media hardpoint and store export tests; no retail bytes committed."""
import tempfile
import unittest
from pathlib import Path

from _paths import TOOLS_RETAIL  # noqa: F401
from retail.loadout import export, load_store

ROOT = Path(__file__).resolve().parents[3]


class LoadoutExportTests(unittest.TestCase):
    def _export(self, relative: str, all_stores: bool = False) -> dict:
        pt = ROOT / 'extracted' / relative
        if not pt.exists():
            self.skipTest(f'local media missing: {relative}')
        with tempfile.TemporaryDirectory(dir=ROOT / 'extracted') as tmp:
            return export(pt, Path(tmp) / 'loadout.json', all_stores)

    def test_station_counts_and_classification(self):
        # Station counts and their selectable subset, measured from the local
        # media. Sensor and ECM slots and the internal cannon are excluded from
        # the selectable set.
        cases = [('usnf97/USNF_2.LIB/F14.PT', 8, 4, 15741),
                 ('usnf97/USNF_2.LIB/A4E.PT', 7, 3, 4434),
                 ('atf-gold/ATF_2.LIB/F31.PT', 9, 3, 9975)]
        for relative, stations, selectable, fuel in cases:
            with self.subTest(aircraft=relative):
                result = self._export(relative)
                self.assertEqual(len(result['stations']), stations)
                self.assertEqual(sum(1 for s in result['stations'] if s['selectable']), selectable)
                self.assertEqual(result['internalFuelLb'], fuel)
                self.assertEqual(result['missingStores'], [])
                for station in result['stations']:
                    if station['kind'] in ('sensor', 'ecm') or station['internalGun']:
                        self.assertFalse(station['selectable'])

    def test_f14_stores_carry_weapon_detail(self):
        result = self._export('usnf97/USNF_2.LIB/F14.PT')
        phoenix = result['stores']['AIM54C.JT']
        self.assertEqual(phoenix['kind'], 'weapon')
        self.assertEqual(phoenix['displayName'], 'AIM-54C Phoenix')
        self.assertEqual(phoenix['weightLb'], 975)
        self.assertEqual(phoenix['guidance'], 'radar')
        self.assertEqual(len(phoenix['damage']), 5)
        gun = result['stores']['M61.JT']
        self.assertTrue(gun['internalGun'])
        # 250 US gallons at 6.6 lb/gal; the unit is confirmed by this identity.
        tank = result['stores']['F250.GAS']
        self.assertEqual(tank['kind'], 'tank')
        self.assertEqual(tank['fuelLb'], 1650)
        self.assertEqual(tank['weightLb'], 198)

    def test_all_stores_is_a_superset(self):
        named = self._export('usnf97/USNF_2.LIB/F14.PT')
        every = self._export('usnf97/USNF_2.LIB/F14.PT', all_stores=True)
        self.assertLessEqual(set(named['stores']), set(every['stores']))
        self.assertGreater(len(every['stores']), len(named['stores']))

    def test_compatibility_stays_unresolved(self):
        result = self._export('usnf97/USNF_2.LIB/F14.PT')
        # The flags word is reported raw and no compatibility is asserted from
        # it. If that ever changes, this test and Docs/formats/pt.md change too.
        self.assertTrue(any('flags' in note for note in result['unresolved']))
        self.assertEqual(result['units']['maxWeight'], 'raw PT byte; not pounds, unit unknown')

    def test_rejects_files_that_are_not_stores(self):
        pt = ROOT / 'extracted' / 'usnf97/USNF_2.LIB/F14.PT'
        if not pt.exists():
            self.skipTest('local media missing')
        with self.assertRaises(ValueError):
            load_store(pt)


if __name__ == '__main__':
    unittest.main()
