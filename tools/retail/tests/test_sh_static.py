"""Synthetic static SH projections; no embedded retail model bytes."""
import struct
import math
import unittest
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from _paths import REPO, TOOLS_RETAIL  # noqa: F401
from retail.sh import SHError
from retail.sh_static import project, export, split_polygon, f14_surfaces, fixed_wing_surfaces, texture_rgba


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


class CutoutTest(unittest.TestCase):
    def test_only_masked_index_255_is_transparent_not_white_rgb(self):
        palette = [(255, 255, 255)] * 256
        self.assertEqual(texture_rgba([175, 255], palette, True), [255, 255, 255, 255, 255, 255, 255, 0])
        self.assertEqual(texture_rgba([175, 255], palette, False)[3::4], [255, 255])

    def test_narrow_root_wall_is_not_a_flap(self):
        face = {'vertices': [(6, 3, -4), (5, -20, -7), (7, -19, -5)],
                'uvs': None, 'part': 'body', 'color': 12}
        rig = fixed_wing_surfaces({'polygons': [face], 'parts': {}}, 'A4')
        self.assertTrue(all(not p['part'].startswith('flap') for p in rig['polygons']))

    def test_x31_inboard_wing_stays_fixed_ahead_of_tab_seam(self):
        face = {'vertices': [(8, -10, -5), (18, -10, -5), (18, -17, -5), (8, -17, -5)],
                'uvs': None, 'part': 'body', 'color': 12}
        rig = fixed_wing_surfaces({'polygons': [face], 'parts': {}}, 'F31')
        moving = [p for p in rig['polygons'] if p['part'].startswith('elevon')]
        self.assertFalse(moving)

    def test_a4_forward_wing_skin_is_not_part_of_flap(self):
        face = {'vertices': [(8, -11, -6), (19, -11, -6), (19, -14, -6), (8, -14, -6)],
                'uvs': None, 'part': 'body', 'color': 12}
        rig = fixed_wing_surfaces({'polygons': [face], 'parts': {}}, 'A4')
        self.assertTrue(all(not p['part'].startswith('flap') for p in rig['polygons']))


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
            self.assertEqual(part['uvs'][:2], [1.5 / 32, (64 - 2.5) / 64])
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
                    'flap-left-inner', 'flap-left-outer', 'flap-right-inner', 'flap-right-outer', 'airbrake-upper', 'airbrake-lower'}
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
            self.assertEqual(rigged['rig'][f'flap-{side}-inner']['parent'], f'wing-{side}-color')

    def test_local_fixed_wing_rigs_preserve_neutral_faces_and_uvs(self):
        sources = ['A4', 'F31']
        root = Path(REPO) / 'extracted/atf-gold/ATF_2.LIB'
        if not all((root / f'{name}.SH').is_file() for name in sources):
            self.skipTest('local ATF-GOLD A4/F31 shapes unavailable')
        expected = {
            'A4': {'elevator-left', 'elevator-right', 'aileron-left', 'aileron-right',
                   'flap-left', 'flap-right', 'rudder-center'},
            'F31': {'canard-left', 'canard-right', 'elevon-left-inner', 'elevon-left-outer', 'elevon-right-inner', 'elevon-right-outer', 'rudder-center'},
        }
        def area_vector(face, field):
            points = face[field]
            if field == 'uvs':
                return [sum(points[i][0] * points[(i + 1) % len(points)][1] -
                            points[i][1] * points[(i + 1) % len(points)][0]
                            for i in range(len(points))) / 2]
            return [sum(points[i][(a + 1) % 3] * points[(i + 1) % len(points)][(a + 2) % 3] -
                        points[i][(a + 2) % 3] * points[(i + 1) % len(points)][(a + 1) % 3]
                        for i in range(len(points))) / 2 for a in range(3)]
        def mesh_area(face):
            vertices = face['vertices']
            total = 0
            for i in range(1, len(vertices) - 1):
                a = [vertices[i][j] - vertices[0][j] for j in range(3)]
                b = [vertices[i + 1][j] - vertices[0][j] for j in range(3)]
                total += math.hypot(*(a[(j+1)%3]*b[(j+2)%3] - a[(j+2)%3]*b[(j+1)%3] for j in range(3))) / 2
            return total
        for name in sources:
            original = project((root / f'{name}.SH').read_bytes())
            rigged = fixed_wing_surfaces(original, name)
            self.assertEqual(set(rigged['rig']), expected[name])
            for face in original['polygons']:
                pieces = [p for p in rigged['polygons'] if p['addr'] == face['addr']]
                self.assertTrue(pieces)
                self.assertAlmostEqual(sum(mesh_area(p) for p in pieces), mesh_area(face), places=6)
                for field in ('vertices', 'uvs') if face['uvs'] else ('vertices',):
                    for axis, area in enumerate(area_vector(face, field)):
                        self.assertAlmostEqual(sum(area_vector(p, field)[axis] for p in pieces), area, places=6)
                for piece in pieces:
                    self.assertEqual(piece['texture'], face['texture'])
                    self.assertEqual(piece['color'], face['color'])
            for axis in range(3):
                for fn in (min, max):
                    self.assertEqual(fn(v[axis] for p in original['polygons'] for v in p['vertices']),
                                     fn(v[axis] for p in rigged['polygons'] for v in p['vertices']))

    def test_local_neutral_flap_calls_fill_gaps_and_are_rigged(self):
        # Read actual subroutine faces from local media, never embed assets.
        cases = [('A4', 'atf-gold/ATF_2.LIB', 'flap-', {0x4fde, 0x5007, 0x51c6, 0x51ef}),
                 ('F31', 'atf-gold/ATF_2.LIB', 'elevon-', {0x4773, 0x4792, 0x468c, 0x46ab}),
                 ('F14', 'usnf97/USNF_2.LIB', 'flap-', {0x37b7, 0x37ce, 0x389e, 0x38b5, 0x33cc, 0x33df, 0x34a3, 0x34ba})]
        for name, directory, prefix, addresses in cases:
            path = Path(REPO) / 'extracted' / directory / f'{name}.SH'
            if not path.is_file():
                self.skipTest(f'local {name} unavailable')
            source = project(path.read_bytes())
            recovered = [p for p in source['polygons'] if p['addr'] in addresses]
            self.assertEqual({p['addr'] for p in recovered}, addresses)
            rig = f14_surfaces(source) if name == 'F14' else fixed_wing_surfaces(source, name)
            moving = [p for p in rig['polygons'] if p['part'].startswith(prefix)]
            self.assertTrue(all(p['part'].startswith(prefix) for p in rig['polygons'] if p['addr'] in addresses))
            self.assertEqual({p['addr'] for p in moving if p['addr'] in addresses}, addresses)
            if name in ('A4', 'F14'):
                self.assertEqual({p['addr'] for p in moving}, addresses)
            for p in moving:
                for x, y, z in p['vertices']:
                    if name == 'A4':
                        self.assertLessEqual(y, -18 + 1e-8)
                    elif name == 'F31':
                        self.assertLessEqual(y, -17 + 1e-8)
                        self.assertGreaterEqual(y, -21 - 1e-8)
                    else:
                        self.assertLessEqual(y + abs(x) * 5 / 28, 3.36)
            for part, info in rig['rig'].items():
                if part.startswith(prefix):
                    self.assertGreater(info['rotationAxis'][0], 0)

    def test_shape_call_uses_end_relative_target_and_returns_to_caller(self):
        # An out-of-line vertex/polygon subroutine was previously skipped.
        main = table(TRIANGLE) + bytes([0x12, 0]) + struct.pack('<h', 1) + bytes([0])
        child = table([(0, 0, 3), (6, 0, 3), (0, 6, 3)], 3) + polygon([3, 4, 5]) + bytes([0x1e])
        result = project(image(main + child))
        self.assertEqual(len(result['polygons']), 1)
        self.assertEqual(result['polygons'][0]['vertices'], [(0, 0, 3), (6, 0, 3), (0, 6, 3)])

    def test_shape_call_keeps_shared_vertex_and_texture_writes(self):
        face = polygon([0, 1, 2])
        main = table(TRIANGLE) + bytes([0x12, 0]) + struct.pack('<h', len(face) + 1) + face + bytes([0])
        updated = [(0, 0, 9), (8, 0, 9), (0, 8, 9)]
        child = table(updated) + bytes([0xe2, 0]) + b'CHILD.PIC'.ljust(14, bytes([0])) + bytes([0x1e])
        result = project(image(main + child))
        self.assertEqual(result['polygons'][0]['vertices'], updated)
        self.assertEqual(result['polygons'][0]['texture'], 'CHILD.PIC')

    def test_dynamic_decal_binding_does_not_reuse_the_skin_atlas(self):
        skin = bytes([0xe2, 0]) + b'SKIN.PIC'.ljust(14, bytes([0]))
        code = table(TRIANGLE) + skin + polygon([0, 1, 2])
        code += bytes([0xe0, 0, 1, 0]) + polygon([0, 1, 2])
        code += skin + polygon([0, 1, 2]) + bytes([0])
        result = project(image(code))
        self.assertEqual([p['texture'] for p in result['polygons']], ['SKIN.PIC', '@decal-1', 'SKIN.PIC'])

    def test_vertex_palette_records_are_captured_per_emitted_face(self):
        color = lambda slot, index: bytes([0xf6]) + struct.pack('<H', slot) + bytes([index, 0, 127, 0])
        code = table(TRIANGLE) + color(0, 144) + color(1, 145) + color(2, 146) + polygon([0, 1, 2])
        code += color(1, 155) + polygon([0, 1, 2]) + bytes([0])
        faces = project(image(code))['polygons']
        self.assertEqual(faces[0]['vertexColors'], [144, 145, 146])
        self.assertEqual(faces[1]['vertexColors'], [144, 155, 146])

    def test_export_composes_keyed_skin_over_vertex_palette_and_omits_blank_decals(self):
        face = {'vertices': [(0, 0, 0), (2, 0, 0), (0, 2, 0)], 'uvs': [(0, 0), (1, 0), (0, 0)],
                'part': 'body', 'texture': 'TEST.PIC', 'color': 7, 'subtype': 0xee,
                'normal': (0, -32767, 0), 'vertexColors': [1, 2, 3], 'addr': 1}
        model = {'polygons': [face, {**face, 'texture': '@decal-1', 'addr': 2}],
                 'parts': {}, 'instructions': 1}
        palette = [(i, i, i) for i in range(256)]
        pic = SimpleNamespace(width=2, height=1, pixels=bytes([255, 4]), palette=None)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'SYNTH.SH').write_bytes(b'synthetic')
            (root / 'PALETTE.PAL').write_bytes(bytes(768))
            (root / 'TEST.PIC').write_bytes(b'synthetic')
            with patch('retail.sh_static.project', return_value=model), patch('retail.sh_static.load_pal', return_value=palette), patch('retail.sh_static.parse_pic', return_value=pic):
                result = export(root / 'SYNTH.SH', root / 'PALETTE.PAL', root / 'out.json', 2)
        self.assertEqual(len(result['parts']), 1)
        part = result['parts'][0]
        self.assertTrue(part['textureBase'])
        self.assertTrue(part['cullBackfaces'])
        self.assertFalse(part['decal'])
        self.assertEqual(part['texture']['rgba'][3::4], [0, 255])
        # Winding/UV/palette order is reversed together to match native facing.
        self.assertEqual(part['colors'][::3], [1/255, 3/255, 2/255])
        self.assertEqual(part['uvs'], [0.25, 0.5, 0.25, 0.5, 0.75, 0.5])

    def test_bad_or_recursive_shape_calls_fail_with_controlled_error(self):
        for code in (bytes([0x12, 0, 0xff, 0x7f]), bytes([0x12, 0, 0xfc, 0xff])):
            with self.assertRaises(SHError):
                project(image(code))

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
            scaled = export(source, palette, root / 'span.json', name='Synthetic jet', wingspan_metres=5)
            self.assertEqual(scaled['source']['wingspanMetres'], 5)
            self.assertEqual(scaled['source']['lengthMetres'], 10)
            self.assertEqual(scaled['source']['scaleReference'], 'wingspan')

    def test_out_of_range_part_target_rejected(self):
        code = bytes([0xc4, 0]) + struct.pack('<hhhhhhh', 0, 0, 0, 0, 0, 0, 500)
        with self.assertRaisesRegex(SHError, 'part target'):
            project(image(code))


if __name__ == '__main__':
    unittest.main()
