import copy
import math
import unittest

from _paths import REPO, TOOLS_RETAIL  # noqa: F401
from retail.sh_devices import merge_brakes, merge_afterburner


def face(addr, x, z=0):
    return {'addr': addr, 'vertices': [(x, -30, z), (x, -30, z - 5), (x * 2, -34, z)],
            'part': 'body', 'texture': 'fixture.PIC', 'uvs': [(2, 3), (2, 8), (6, 3)],
            'color': 150, 'subtype': 0xee}


class NativeBrakeTests(unittest.TestCase):
    def test_skin_is_retained_and_open_panels_and_support_remain_distinct(self):
        skin, left, right, brace = face(1, 5), face(0x5a17, -5), face(0x589c, 5), face(2, 5)
        neutral = {'polygons': [skin], 'parts': {'wing': (1, 2, 3)}, 'rig': {'wing': {'test': 1}}}
        opened = {'polygons': [skin, left, right, brace]}
        original = copy.deepcopy((neutral, opened))
        result = merge_brakes(neutral, opened, 'A4')
        self.assertEqual((neutral, opened), original)
        self.assertEqual(result['polygons'][0], skin)
        self.assertEqual(result['rig']['wing'], {'test': 1})
        self.assertEqual(len(result['polygons']), 4)
        for actual, expected in zip(result['polygons'][1:], [left, right, brace]):
            self.assertEqual({**actual, 'part': 'body'}, expected)
        self.assertAlmostEqual(result['rig']['airbrake-native-right-panel']['nativeBrakeAngle'], math.atan2(8, 4))
        self.assertAlmostEqual(result['rig']['airbrake-native-left-panel']['nativeBrakeAngle'], -math.atan2(8, 4))
        self.assertEqual(result['rig']['airbrake-native-right-support']['nativeBrakeAngle'], 0)

    def test_x31_whole_panel_and_changed_address_geometry(self):
        original = face(0x47d0, 6, 2)
        opened = face(0x47d0, 6, 4)
        result = merge_brakes({'polygons': [original]}, {'polygons': [opened]}, 'x31')
        self.assertEqual(len(result['polygons']), 2)
        self.assertEqual(result['polygons'][0], original)
        self.assertEqual(result['parts']['airbrake-native-right-panel'], (6, -12, 0))
        self.assertAlmostEqual(result['rig']['airbrake-native-right-panel']['nativeBrakeAngle'], math.pi / 4)

    def test_unknown_recipe_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'no reviewed brake recipe'):
            merge_brakes({}, {}, 'unknown')

    def test_afterburner_delta_preserves_common_geometry_and_does_not_mutate(self):
        skin, left, right = face(1, 2), face(2, -10), face(3, 10)
        neutral, burning = {'polygons': [skin]}, {'polygons': [skin, left, right]}
        originals = copy.deepcopy((neutral, burning))
        result = merge_afterburner(neutral, burning, 'F14_ATF')
        self.assertEqual((neutral, burning), originals)
        self.assertEqual(result['polygons'][0], skin)
        self.assertEqual([p['part'] for p in result['polygons'][1:]], ['afterburner-left', 'afterburner-right'])
        for actual, expected in zip(result['polygons'][1:], [left, right]):
            self.assertEqual({**actual, 'part': 'body'}, expected)
        self.assertEqual(result['parts']['afterburner-left'], (-14, -57, -1))

    def test_x31_crossed_flame_sheets_share_native_nozzle_pivot(self):
        result = merge_afterburner({'polygons': []}, {'polygons': [face(1, -3), face(2, 3)]}, 'F31')
        self.assertEqual(result['parts'], {'afterburner-center': (0, -40, 0)})
        self.assertEqual({p['part'] for p in result['polygons']}, {'afterburner-center'})

    def test_atf_f14_native_brakes_preserve_open_pose_without_guessed_hinge(self):
        result = merge_brakes({'polygons': []}, {'polygons': [face(0x4c37, 8), face(0x4c65, -8)]}, 'F14_ATF')
        self.assertEqual(len(result['polygons']), 2)
        self.assertTrue(all(r['nativeBrakeAngle'] == 0 for r in result['rig'].values()))
        self.assertTrue(all(r['rotationAxis'] == (1, 0, 0) for r in result['rig'].values()))
