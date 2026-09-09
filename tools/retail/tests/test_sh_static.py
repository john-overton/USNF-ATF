"""Synthetic static SH projections; no embedded retail model bytes."""
import struct
import unittest
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from _paths import REPO, TOOLS_RETAIL  # noqa: F401
from retail.sh import SHError
from retail.sh_static import project, export, split_polygon, f14_surfaces


def image(code):
    data = bytearray(256)
    data[:2] = b'MZ'
    struct.pack_into('<I', data, 0x3c, 64)
    data[64:68] = b'PL\0\0'
    struct.pack_into('<H', data, 70, 1)
    data[88:96] = b'CODE\0\0\0\0'
    struct.pack_into('<IIII', data, 96, len(code), 4096, len(code), 256)
    return bytes(data) + bytes(code)


def table(vertices, destination=0):
    return struct.pack('<BBHH', 0x82, 0, len(vertices), destination * 8) + b''.join(struct.pack('<hhh', *v) for v in vertices)


def polygon(indices):
    return bytes([0xfc, 1, 0, 12, 0, len(indices), *indices])


TRIANGLE = [(0, 0, 0), (10, 0, 0), (0, 10, 0)]


class StaticShapeTest(unittest.TestCase):
    def test_vertex_updates_address_shared_slots_and_preserve_previous_faces(self):
        code = table(TRIANGLE) + polygon([0, 1, 2])
        code += table([(0, 0, 20)], 2) + polygon([0, 1, 2]) + b'\0'
        polys = project(image(code))['polygons']
        self.assertEqual(polys[0]['vertices'], TRIANGLE)
        self.assertEqual(polys[1]['vertices'], [TRIANGLE[0], TRIANGLE[1], (0, 0, 20)])

    def test_structured_end_does_not_skip_body_or_overlay_following_lod(self):
        face = polygon([0, 1, 2])
        # End pointer encloses two records separated by an inner end marker.
        content = face + b'\x1e' + face
        code = table(TRIANGLE) + b'\x38' + struct.pack('<h', len(content)) + content + b'\x1e'
        code += table([(99, 99, 99)] * 3) + face + b'\0'
        result = project(image(code))
        self.assertEqual(len(result['polygons']), 2)
        self.assertTrue(all(p['vertices'] == TRIANGLE for p in result['polygons']))

    def test_transformed_part_has_own_pivot_and_restores_caller_scope(self):
        # C4 renderer XYZ fields (10, 30, 20) map to vertex (10, 20, 30).
        main = table(TRIANGLE)
        call = bytes([0xc4, 0]) + struct.pack('<hhhhhhh', 10, 30, 20, 0, 0, 0, 1)
        code = main + call + b'\0' + table(TRIANGLE, 3) + polygon([3, 4, 5]) + b'\x1e'
        result = project(image(code))
        self.assertEqual(list(result['parts'].values()), [(10, 20, 30)])
        self.assertEqual(result['polygons'][0]['vertices'], [(10, 20, 30), (20, 20, 30), (10, 30, 30)])

    def test_distance_link_keeps_nearest_geometry(self):
        face = polygon([0, 1, 2])
        near = table(TRIANGLE) + face + b'\0'
        far = table([(50, 50, 50)] * 3) + face + b'\0'
        code = bytes([0xc8, 0, 1, 0, 1, 0]) + struct.pack('<h', len(near)) + near + far
        self.assertEqual(project(image(code))['polygons'][0]['vertices'], TRIANGLE)

    def test_unresolved_reference_is_an_error_not_silent_dropped_face(self):
        with self.assertRaisesRegex(SHError, 'unresolved'):
            project(image(table(TRIANGLE) + polygon([0, 1, 9]) + b'\0'))

    def test_truncated_container_and_records_raise_controlled_errors(self):
        valid = image(table(TRIANGLE) + polygon([0, 1, 2]) + b'\0')
        for length in (0, 2, 64, 100, 255, 258, len(valid) - 3):
            with self.subTest(length=length), self.assertRaises(SHError):
                project(valid[:length])

    def test_opaque_code_requires_a_recognized_reentry(self):
        with self.assertRaisesRegex(SHError, 'unsupported static reentry'):
            project(image(b'\xf0\0' + b'\x90' * 30))

    def test_untextured_export_omits_uvs_and_preserves_native_vertical_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, palette = root / 'F14.SH', root / 'PALETTE.PAL'
            source.write_bytes(image(table([(0, 0, -2), (10, 0, 5), (0, 10, 0)]) + polygon([0, 1, 2]) + b'\0'))
            palette.write_bytes(bytes(768))
            result = export(source, palette, root / 'mesh.json')
            part = result['parts'][0]
            self.assertNotIn('uvs', part)
            self.assertNotIn('texture', part)
            self.assertAlmostEqual(min(part['positions'][1::3]), -3.82)
            self.assertAlmostEqual(max(part['positions'][1::3]), 9.55)
            self.assertEqual(len(part['positions']), len(part['colors']))

    def test_special_textured_nozzle_is_separate_from_body(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, palette = root / 'F14.SH', root / 'PALETTE.PAL'
            texture_record = b'\xe2\0' + b'_f14.PIC'.ljust(14, b'\0')
            face = bytes([0xfc, 0x44, 3, 0, 0]) + bytes(9) + bytes([3, 0, 1, 2, 1, 2, 3, 4, 5, 6])
            source.write_bytes(image(texture_record + table([(-10, 0, 0), (-5, 0, 0), (-5, 10, 0)]) + face + b'\0'))
            palette.write_bytes(bytes(768))
            (root / '_F14.PIC').write_bytes(b'synthetic')
            texture = SimpleNamespace(width=32, height=64, pixels=bytes(32 * 64), palette=None)
            with patch('retail.sh_static.parse_pic', return_value=texture):
                result = export(source, palette, root / 'mesh.json')
            part = result['parts'][0]
            self.assertEqual(part['name'], 'exhaust-left-textured')
            self.assertEqual(part['uvs'][:2], [1 / 32, 1 - 2 / 64])
            self.assertEqual(len(part['texture']['rgba']), 32 * 64 * 4)

    def test_surface_split_preserves_area_uv_and_coplanar_ownership(self):
        polygon = {'vertices': [(0, 0, 0), (4, 0, 0), (4, 2, 0), (0, 2, 0)],
                   'uvs': [(0, 0), (1, 0), (1, 1), (0, 1)], 'part': 'body', 'addr': 123}
        a, b = split_polygon(polygon, (1, 0, 0, -1))
        def area(p):
            v = p['vertices']
            return abs(sum(v[i][0] * v[(i + 1) % len(v)][1] - v[(i + 1) % len(v)][0] * v[i][1] for i in range(len(v)))) / 2
        self.assertEqual(area(a), 6)
        self.assertEqual(area(b), 2)
        for part in (a, b):
            self.assertEqual(part['addr'], 123)
            for v, uv in zip(part['vertices'], part['uvs']):
                self.assertEqual(uv, (v[0] / 4, v[1] / 2))
        self.assertEqual(split_polygon(polygon, (0, 0, 1, 0)), (polygon, None))

    def test_authored_taileron_replaces_source_face_and_keeps_metadata(self):
        # Synthetic plane matching the documented classification, no retail bytes.
        face = {'vertices': [(20, -20, -2), (30, -20, -2), (30, -40, -2)],
                'uvs': None, 'part': 'body', 'color': 12}
        result = f14_surfaces({'polygons': [face], 'parts': {}})
        self.assertEqual(len(result['polygons']), 1)
        self.assertEqual(result['polygons'][0]['vertices'], face['vertices'])
        self.assertEqual(result['polygons'][0]['part'], 'taileron-right')
        self.assertEqual(result['rig']['taileron-right']['rotationAxis'], (1, 0, 0))
        self.assertEqual(face['part'], 'body')

    @unittest.skipUnless((Path(REPO) / 'extracted/usnf97/USNF_2.LIB/F14.SH').is_file(), 'local extracted F14.SH unavailable')
    def test_local_f14_partition_conserves_every_face_and_has_all_surface_groups(self):
        model = project((Path(REPO) / 'extracted/usnf97/USNF_2.LIB/F14.SH').read_bytes())
        rigged = f14_surfaces(model)
        expected = {'taileron-left', 'taileron-right', 'rudder-left', 'rudder-right',
                    'flap-left', 'flap-right', 'airbrake-upper', 'airbrake-lower'}
        self.assertEqual(set(rigged['rig']), expected)
        def area_vector(face):
            v = face['vertices']
            return [sum(v[i][(a + 1) % 3] * v[(i + 1) % len(v)][(a + 2) % 3] -
                        v[i][(a + 2) % 3] * v[(i + 1) % len(v)][(a + 1) % 3]
                        for i in range(len(v))) / 2 for a in range(3)]
        for face in model['polygons']:
            pieces = [p for p in rigged['polygons'] if p['addr'] == face['addr']]
            self.assertTrue(pieces)
            for axis in range(3):
                self.assertAlmostEqual(sum(area_vector(p)[axis] for p in pieces), area_vector(face)[axis], places=7)
        for side in ('left', 'right'):
            self.assertEqual(rigged['rig'][f'flap-{side}']['parent'], f'wing-{side}-color')

    def test_non_f14_export_identity_scale_and_no_f14_rig_claim(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, palette = root / 'OTHER.SH', root / 'PALETTE.PAL'
            source.write_bytes(image(table([(0, 0, 0), (10, 0, 0), (0, 20, 5)]) + polygon([0, 1, 2]) + b'\0'))
            palette.write_bytes(bytes(768))
            result = export(source, palette, root / 'mesh.json', 12, 'Synthetic jet')
            self.assertEqual(result['name'], 'Synthetic jet')
            self.assertEqual(result['source']['lengthMetres'], 12)
            positions = result['parts'][0]['positions']
            self.assertAlmostEqual(max(positions[2::3]) - min(positions[2::3]), 12)
            self.assertFalse(any('taileron' in text for text in result['limitations']))

    def test_out_of_range_part_target_rejected(self):
        code = bytes([0xc4, 0]) + struct.pack('<hhhhhhh', 0, 0, 0, 0, 0, 0, 500)
        with self.assertRaisesRegex(SHError, 'part target'):
            project(image(code))


if __name__ == '__main__':
    unittest.main()
