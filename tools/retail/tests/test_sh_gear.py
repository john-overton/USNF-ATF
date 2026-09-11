import copy
import unittest
from types import SimpleNamespace

from _paths import REPO, TOOLS_RETAIL  # noqa: F401
from retail.sh_gear import merge_gear, gear_support_height


def polygon(addr, x, y, z):
    return {'addr': addr, 'part': 'body', 'vertices': [(x, y, z), (x + 1, y, z), (x, y + 1, z)],
            'texture': 'skin.PIC', 'uvs': [(1, 2), (3, 4), (5, 6)], 'color': 0, 'subtype': 0x4c}


class GearMergeTests(unittest.TestCase):
    def test_state_delta_preserves_skin_and_materials_without_mutating_inputs(self):
        skin = polygon(1, -20, 0, 0)
        stowed = polygon(2, -9, -7, -8)
        extended = polygon(2, -9, -7, -24)  # Same address, different state geometry.
        nose = polygon(3, 0, 26, -26)
        neutral = {'polygons': [skin, stowed], 'parts': {}, 'rig': {}}
        deployed = {'polygons': [skin, extended, nose], 'parts': {}}
        originals = copy.deepcopy((neutral, deployed))
        merged = merge_gear(neutral, deployed, 'a4e')
        self.assertEqual((neutral, deployed), originals)
        self.assertEqual(len(merged['polygons']), 4)
        self.assertEqual(merged['polygons'][0], skin)
        for actual, expected in zip(merged['polygons'][1:], [stowed, extended, nose]):
            self.assertEqual({**actual, 'part': 'body'}, expected)
        self.assertEqual(merged['rig']['gear-stowed-left']['gearPose'], 'stowed')
        self.assertEqual(merged['rig']['gear-left']['gearPose'], 'deployed')
        self.assertEqual(merged['parts']['gear-nose'], (0, 26, -10))
        self.assertEqual(merged['rig']['gear-left']['rotationAxis'], (0, 0, 1))
        self.assertEqual(merged['rig']['gear-nose']['rotationAxis'], (-1, 0, 0))

    def test_centerline_main_door_belongs_to_left_and_retraction_folds_inward(self):
        door = polygon(1, 0, -10, -10)
        door['vertices'] = [(0, -10, -10), (0, -5, -10), (0, -10, -5)]
        right = polygon(2, 9, -10, -10)
        result = merge_gear({'polygons': [], 'parts': {}},
                            {'polygons': [door, right]}, 'x31')
        self.assertEqual([p['part'] for p in result['polygons']], ['gear-left', 'gear-right'])
        self.assertEqual(result['rig']['gear-left']['rotationAxis'], (0, 0, 1))
        self.assertEqual(result['rig']['gear-right']['rotationAxis'], (0, 0, -1))

    def test_matching_state_does_not_duplicate_or_tag_airframe(self):
        model = {'polygons': [polygon(1, 0, 0, 0)], 'parts': {'wing': (1, 2, 3)}}
        result = merge_gear(model, model, 'F14')
        self.assertEqual(result['polygons'], model['polygons'])
        self.assertEqual(result['parts'], model['parts'])
        self.assertEqual(result['rig'], {})

    def test_unknown_aircraft_requires_reviewed_recipe(self):
        with self.assertRaisesRegex(ValueError, 'no reviewed gear recipe'):
            merge_gear({}, {}, 'unknown')

    def test_atf_f14_preserves_distinct_native_mounts(self):
        neutral = {'polygons': [], 'parts': {}}
        deployed = {'polygons': [polygon(1, -26, 5, -24), polygon(2, 27, 5, -24),
                                 polygon(3, 0, 69, -22)]}
        atf = merge_gear(neutral, deployed, 'F14_ATF')
        usnf = merge_gear(neutral, deployed, 'F14')
        self.assertEqual(atf['parts'], {'gear-left': (-26, 5, 1),
                                      'gear-right': (27, 5, 1), 'gear-nose': (0, 69, -6)})
        self.assertEqual(usnf['parts']['gear-left'], (-18, 6, -4))


class GearSupportTests(unittest.TestCase):
    def test_transparent_lower_border_and_texel_centres(self):
        face = {'part': 'gear-nose', 'subtype': 0x4c, 'texture': 'gear.PIC',
                'vertices': [(0, 0, -4), (1, 0, -4), (1, 0, -2), (0, 0, -2)],
                'uvs': [(0, 0), (1, 0), (1, 2), (0, 2)]}
        # Bottom-up UV row 0 is transparent; the first visible cell starts at V=.5.
        pic = SimpleNamespace(width=2, height=3, pixels=bytes([1, 1, 1, 1, 255, 255]))
        model = {'polygons': [face], 'rig': {'gear-nose': {'gearPose': 'deployed'}}}
        self.assertAlmostEqual(gear_support_height(model, lambda _: pic), 3.5)

    def test_colored_gear_and_ignored_stowed_and_dynamic_pages(self):
        face = polygon(1, 0, 0, -3)
        face.update(part='gear-left', uvs=None, subtype=0x61)
        model = {'polygons': [face, {**face, 'part': 'stowed', 'vertices': [(0, 0, -99)]},
                              {**face, 'texture': '@decal', 'vertices': [(0, 0, -88)]}],
                 'rig': {'gear-left': {'gearPose': 'deployed'}, 'stowed': {'gearPose': 'stowed'}}}
        def unexpected_texture(_):
            self.fail('colored geometry must not request texture loading')
        self.assertEqual(gear_support_height(model, unexpected_texture), 3)
