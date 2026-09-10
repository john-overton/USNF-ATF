import io
from pathlib import Path
import struct
import tempfile
import unittest
import wave

from retail.audio_catalog import export, wav_preview, salvage_entries


class AudioCatalogTests(unittest.TestCase):
    def test_output_cannot_be_scanned_as_media(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaises(ValueError):
                export(Path(temporary), Path(temporary) / 'generated')
    def test_salvage_keeps_complete_entries_and_reports_missing_tail(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'CUT.LIB'
            rows = [(b'A.5K', 0, 61), (b'B.5K', 0, 64), (b'', 0, 100)]
            path.write_bytes(b'EALIB' + struct.pack('<H', 2) +
                             b''.join(struct.pack('<13sBI', *row) for row in rows) + b'abcX')
            missing = []
            recovered = [(name, read()) for name, _, read in salvage_entries(path, missing)]
            self.assertEqual(recovered, [('A.5K', b'abc')])
            self.assertEqual([row['name'] for row in missing], ['B.5K'])

    def test_raw_preview_preserves_every_sample(self):
        source = bytes(range(256)) * 10
        wav, info = wav_preview(source, 'TEST.5K')
        self.assertEqual(info['sampleRate'], 5512)
        with wave.open(io.BytesIO(wav)) as stream:
            self.assertEqual(stream.readframes(stream.getnframes()), source)
        self.assertEqual(wav_preview(wav, 'ODD.11K')[0], wav)

    def test_unsupported_and_empty_are_not_mislabelled_pcm(self):
        for data, name in [(b'', 'X.5K'), (b'Creative Voice File', 'X.11K'),
                           (b'other', 'X.VOC')]:
            with self.assertRaises(ValueError):
                wav_preview(data, name)

    def test_truncated_riff_is_rejected_but_final_odd_data_needs_no_pad(self):
        wav, _ = wav_preview(bytes([128]) * 1000, 'TEST.5K')
        with self.assertRaises(ValueError):
            wav_preview(wav[:-990], 'BROKEN.WAV')
        shortened = bytearray(wav[:-990])
        struct.pack_into('<I', shortened, 4, len(shortened) - 8)
        with self.assertRaises(ValueError):
            wav_preview(bytes(shortened), 'BADCHUNK.WAV')
        odd, _ = wav_preview(b'abc', 'ODD.5K')
        self.assertEqual(wav_preview(odd, 'ODD.WAV')[0], odd)

    def test_bad_archive_does_not_hide_loose_audio_and_paths_are_not_trusted(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            media, output = root / 'disc', root / 'output'
            media.mkdir()
            (media / 'BAD.LIB').write_bytes(b'EALIB')
            # A malicious archive entry must never become an output filename.
            name = b'../escape.5K'
            payload = bytes([0, 128, 255])
            directory = struct.pack('<13sBI', name, 0, 25)
            (media / 'GOOD.LIB').write_bytes(b'EALIB' + struct.pack('<H', 0) + directory + payload)
            (media / 'SAME.5K').write_bytes(payload)
            report = export(media, output)
            self.assertEqual(report['summary']['assets'], 2)
            self.assertEqual(report['summary']['uniqueOriginals'], 1)
            self.assertEqual(report['summary']['errors'], 1)
            self.assertFalse((root / 'escape.5K').exists())
            self.assertEqual(len(list((output / 'wav').iterdir())), 1)
            self.assertEqual(export(media, output)['summary'], report['summary'])


if __name__ == '__main__':
    unittest.main()
