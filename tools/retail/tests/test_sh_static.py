"""Synthetic static SH projections; no embedded retail model bytes."""
import struct
import unittest
import tempfile
from pathlib import Path

from _paths import TOOLS_RETAIL  # noqa: F401
from retail.sh import SHError
from retail.sh_static import project, export


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

    def test_out_of_range_part_target_rejected(self):
        code = bytes([0xc4, 0]) + struct.pack('<hhhhhhh', 0, 0, 0, 0, 0, 0, 500)
        with self.assertRaisesRegex(SHError, 'part target'):
            project(image(code))


if __name__ == '__main__':
    unittest.main()
