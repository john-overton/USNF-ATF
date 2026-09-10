from pathlib import Path
import struct
import tempfile
import unittest
from retail.media_audit import audit, recover_partial_audio
from test_video_audio import movie


class MediaAuditTests(unittest.TestCase):
    def test_missing_ranges_and_verified_replacement(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            full = b'EALIB' + struct.pack('<H', 2) + b''.join(
                struct.pack('<13sBI', *row) for row in [(b'A.5K', 0, 61), (b'B.5K', 0, 64), (b'', 0, 70)]) + b'abcdefghi'
            partial = root / 'partial.LIB'; replacement = root / 'full.LIB'
            partial.write_bytes(full[:65]); replacement.write_bytes(full)
            report = audit(partial, replacement)
            self.assertEqual(report['missingTailBytes'], 5)
            self.assertEqual(report['unavailableEntries'][0]['availableBytes'], 1)
            self.assertEqual(report['unavailableEntries'][0]['missingBytes'], 5)
            self.assertEqual(report['replacement']['status'], 'compatible-complete')
            replacement.write_bytes(full[:64] + b'X' + full[65:])
            self.assertEqual(audit(partial, replacement)['replacement']['status'], 'rejected')
            replacement.write_bytes(full[:66])
            self.assertEqual(audit(partial, replacement)['replacement']['status'], 'rejected')
            replacement.write_bytes(full + b'not part of the archive')
            self.assertEqual(audit(partial, replacement)['replacement']['status'], 'rejected')
            self.assertEqual(audit(replacement)['status'], 'invalid')
            replacement.write_bytes(full)
            self.assertEqual(audit(replacement)['status'], 'complete')
            self.assertEqual(partial.read_bytes(), full[:65])

    def test_bad_directory_is_not_reported_complete(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'bad.LIB'; path.write_bytes(b'EALIB')
            with self.assertRaises(ValueError): audit(path)
            path.write_bytes(b'EALIB' + struct.pack('<H', 0) + struct.pack('<13sBI', b'A', 0, 25) + b'x')
            with self.assertRaisesRegex(ValueError, 'sentinel'): audit(path)

    def test_partial_soundtrack_is_separate_from_complete_recovery(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'media').mkdir()
            payload = movie()
            full = b'EALIB' + struct.pack('<H', 1) + struct.pack('<13sBI', b'A.CB8', 0, 43) + struct.pack('<13sBI', b'', 0, 43 + len(payload)) + payload
            source = root / 'media/partial.LIB'
            source.write_bytes(full[:-20])
            report = recover_partial_audio(source, root / 'output')
            self.assertEqual(report['status'], 'incomplete')
            self.assertEqual(len(report['unavailableEntries']), 1)
            row = report['partialAudio'][0]
            self.assertFalse(row['complete'])
            self.assertEqual(row['status'], 'partial-embedded-audio')
            self.assertEqual((root / 'output' / row['pcm']).read_bytes(), bytes([128]) * 7350)
            self.assertEqual(source.read_bytes(), full[:-20])
            replacement = root / 'replacement.LIB'
            replacement.write_bytes(full[:-20] + bytes([255]) * 20)
            self.assertEqual(audit(source, replacement)['replacement']['status'], 'rejected')
