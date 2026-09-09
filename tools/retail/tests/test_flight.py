import unittest
from types import SimpleNamespace
from _paths import TOOLS_RETAIL  # noqa: F401
from retail.flight import convert, RAW_FIELDS, LB_KG, FT_M, LBF_N
from retail.pt import Envelope


def fixture():
    return SimpleNamespace(labeled=False, obj={'typeSize': 632}, env_min=-4, env_max=9,
                           weight=10000, max_takeoff_weight=20000, internal_fuel=4000,
                           thrust=15000, aft_thrust=25000, long_name='Synthetic test aircraft',
                           plane={k: 64 for k in RAW_FIELDS},
                           envelopes=[Envelope(g, 3, 1, 2, [(100, 0), (200, 1000), (400, 0), (999, 999)])
                                      for g in range(-4, 10)])


class FlightExportTest(unittest.TestCase):
    def test_converts_declared_units_once_preserves_every_g_and_only_used_points(self):
        result = convert(fixture(), b'synthetic fixture')
        self.assertEqual(result['emptyMassKg'], 10000 * LB_KG)
        self.assertEqual(result['fuelCapacityKg'], 4000 * LB_KG)
        self.assertEqual(result['militaryThrustN'], 15000 * LBF_N)
        self.assertEqual(result['afterburnerThrustN'], 25000 * LBF_N)
        self.assertEqual([e['g'] for e in result['envelopes']], list(range(-4, 10)))
        self.assertEqual(result['envelopes'][0]['points'][1],
                         {'speedMps': 200 * FT_M, 'altitudeM': 1000 * FT_M})
        self.assertEqual(len(result['envelopes'][0]['points']), 3)
        self.assertEqual(result['rawFields']['throttleAcc']['unit'], 'unknown')
        self.assertEqual(result['rawFields']['flapsDrag']['value'], 64)
        self.assertEqual(len(result['source']['sha256']), 64)

    def test_rejects_other_variant_or_filename(self):
        for key, value in [('labeled', True), ('env_max', 7), ('obj', {'typeSize': 636})]:
            pt = fixture()
            setattr(pt, key, value)
            with self.assertRaises(ValueError):
                convert(pt, b'synthetic')
        with self.assertRaises(ValueError):
            convert(fixture(), b'synthetic', 'F18.PT')

    def test_rejects_missing_rows_invalid_coordinates_and_mass(self):
        for mutate in [lambda p: p.envelopes.pop(),
                       lambda p: p.envelopes[0].points.__setitem__(0, (-1, 0)),
                       lambda p: setattr(p, 'weight', 30000),
                       lambda p: setattr(p.envelopes[0], 'count', 30)]:
            pt = fixture()
            mutate(pt)
            with self.assertRaises(ValueError):
                convert(pt, b'synthetic')

    def test_preserves_duplicate_points_without_inventing_shape(self):
        pt = fixture()
        pt.envelopes[0].points[1] = pt.envelopes[0].points[0]
        result = convert(pt, b'synthetic')
        self.assertEqual(result['envelopes'][0]['points'][0], result['envelopes'][0]['points'][1])
