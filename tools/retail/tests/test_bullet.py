"""Synthetic fixtures for the bounded native near-model instruction subset."""
import struct
import unittest
import tempfile
import hashlib
from pathlib import Path

from retail.bullet import decode_near, export_geometry
from retail.sh import SHError


def fixture():
    data = bytearray(b'\xff\xff' + bytes(12))
    struct.pack_into('<h', data, 6, 8)
    for i, xyz in enumerate(((1, 3, 0), (0, 3, 1), (-1, 3, 0), (0, 3, -1))):
        data.extend(struct.pack('<BBhhhH', 0x7a, 0, *xyz, i * 8))
    data.extend(bytes((0xbc, 7)))
    data.extend(struct.pack('<BB4H', 0x76, 0, 0, 8, 16, 24))
    data.extend(bytes(2))
    return data


class BulletTests(unittest.TestCase):
    def test_export_conversion_palette_and_provenance(self):
        code = fixture()
        container = bytearray(256)
        container[:2] = b'MZ'
        struct.pack_into('<I', container, 60, 64)
        container[64:68] = b'PL\0\0'
        struct.pack_into('<H', container, 70, 1)
        container[88:96] = b'CODE\0\0\0\0'
        struct.pack_into('<IIII', container, 96, len(code), 4096, len(code), 256)
        container.extend(code)
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'synthetic.SH'
            source.write_bytes(container)
            palette = Path(tmp) / 'synthetic.PAL'
            rgb = bytearray(768)
            rgb[21:24] = bytes((63, 0, 0))
            palette.write_bytes(rgb)
            geometry = export_geometry(source, palette)
            self.assertAlmostEqual(geometry['vertices'][0], 0.3048)
            self.assertAlmostEqual(geometry['vertices'][2], -0.9144)
            self.assertEqual(geometry['colors'][:3], [1, 0, 0])
            self.assertEqual(geometry['indices'], [0, 1, 2, 0, 2, 3])
            self.assertEqual(geometry['sha256'], hashlib.sha256(container).hexdigest())
            self.assertEqual(geometry['paletteSha256'], hashlib.sha256(rgb).hexdigest())
            source.write_bytes(container[:-10])
            with self.assertRaisesRegex(SHError, 'truncated'):
                export_geometry(source, palette)

    def test_vertices_and_palette_not_hardcoded(self):
        faces = decode_near(bytes(fixture()))
        self.assertEqual(faces, [([(1, 3, 0), (0, 3, 1), (-1, 3, 0), (0, 3, -1)], 7)])

    def test_unknown_instruction_fails_closed(self):
        data = fixture()
        data[14] = 0xf0
        with self.assertRaisesRegex(SHError, 'unsupported'):
            decode_near(bytes(data))

    def test_bad_slot_and_unresolved_reference(self):
        data = fixture()
        struct.pack_into('<H', data, 22, 1)
        with self.assertRaisesRegex(SHError, 'slot'):
            decode_near(bytes(data))
        data = fixture()
        struct.pack_into('<H', data, 58, 256)
        with self.assertRaisesRegex(SHError, 'unresolved'):
            decode_near(bytes(data))

    def test_truncated_quad(self):
        with self.assertRaisesRegex(SHError, 'truncated'):
            decode_near(bytes(fixture()[:-5]))

    def test_lod_boundary_and_size_limits(self):
        data = bytearray(b'\xff\xff' + bytes(12))
        struct.pack_into('<h', data, 6, 8)
        data.extend(struct.pack('<BBhhh', 0xc8, 0, 2, 3, 32767))
        with self.assertRaisesRegex(SHError, 'LOD boundary'):
            decode_near(bytes(data))
        with self.assertRaisesRegex(SHError, 'size'):
            decode_near(bytes(65537))
        data = fixture()
        struct.pack_into('<h', data, 6, 7)
        with self.assertRaisesRegex(SHError, 'scale'):
            decode_near(bytes(data))
