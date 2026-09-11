"""ATF rig regressions; retail geometry is read only from local user media."""
import copy
import math
import unittest
from collections import defaultdict
from pathlib import Path

from _paths import REPO  # noqa: F401
from retail.sh_f14_atf import f14_atf_surfaces
from retail.sh_static import project


def area(polygon, attribute='vertices'):
    points = polygon[attribute]
    if not points:
        return 0
    result = 0
    for i in range(1, len(points) - 1):
        a = [points[i][j] - points[0][j] for j in range(len(points[0]))]
        b = [points[i + 1][j] - points[0][j] for j in range(len(points[0]))]
        if len(a) == 2:
            result += abs(a[0] * b[1] - a[1] * b[0]) / 2
        else:
            cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
                     a[0] * b[1] - a[1] * b[0]]
            result += math.sqrt(sum(v * v for v in cross)) / 2
    return result


class ATFF14RigTest(unittest.TestCase):
    def test_unrelated_articulated_parts_and_fuselage_stay_intact(self):
        face = {'part': 'part-unrelated', 'addr': 1, 'vertices': [(2, -20, 0),
                (7, -25, 0), (3, -30, 0)], 'uvs': None, 'color': 15}
        body = {**face, 'part': 'body', 'addr': 2}
        model = {'parts': {'part-unrelated': (2, -20, 0)}, 'polygons': [face, body],
                 'rig': {'part-unrelated': {'gearPose': 'deployed'}}}
        before = copy.deepcopy(model)
        result = f14_atf_surfaces(model)
        self.assertEqual(result['polygons'], model['polygons'])
        self.assertEqual(result['rig'], model['rig'])
        self.assertEqual(model, before)

    def test_local_atf_surfaces_preserve_geometry_and_actual_wing_anchors(self):
        path = Path(REPO) / 'extracted/atf-gold/ATF_2.LIB/F14.SH'
        if not path.exists():
            self.skipTest('local ATF F14 media unavailable')
        model = project(path.read_bytes())
        for polygon in model['polygons']:
            polygon['baseColors'] = [(32, 64, 96)] * len(polygon['vertices'])
        before = copy.deepcopy(model)
        result = f14_atf_surfaces(model)
        self.assertEqual(model, before)
        self.assertEqual(set(result['rig']), {'flap-left', 'flap-right',
                         'taileron-left', 'taileron-right', 'rudder-left', 'rudder-right'})
        grouped = defaultdict(list)
        for polygon in result['polygons']:
            grouped[polygon['addr']].append(polygon)
            self.assertEqual(len(polygon['vertices']), len(polygon['baseColors']))
            if polygon['uvs']:
                self.assertEqual(len(polygon['vertices']), len(polygon['uvs']))
        for polygon in model['polygons']:
            pieces = grouped[polygon['addr']]
            self.assertAlmostEqual(area(polygon), sum(area(p) for p in pieces), places=7)
            self.assertAlmostEqual(area(polygon, 'uvs'), sum(area(p, 'uvs') for p in pieces), places=7)
            self.assertTrue(all(p['texture'] == polygon['texture'] and
                                p['subtype'] == polygon['subtype'] and
                                p['normal'] == polygon['normal'] for p in pieces))
        for side, source_part in [('right', 'part-4ca2'), ('left', 'part-503d')]:
            self.assertEqual(result['rig'][f'flap-{side}']['parent'],
                             f'wing-{side}-textured-cutout')
            anchors = [p for p in result['polygons'] if p['part'] == source_part]
            self.assertTrue(anchors)
            self.assertTrue(all(p['uvs'] and p['subtype'] & 8 for p in anchors))
            moving = [p for p in result['polygons'] if p['part'] == f'flap-{side}']
            self.assertTrue(moving)
            source_faces = {p['addr']: p for p in model['polygons'] if p['part'] == source_part}
            self.assertTrue(all(p['vertices'] == source_faces[p['addr']]['vertices'] and
                                p['uvs'] == source_faces[p['addr']]['uvs'] for p in moving))
        self.assertFalse(any(p['part'].startswith('airbrake') for p in result['polygons']))


if __name__ == '__main__':
    unittest.main()
