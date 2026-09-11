"""Synthetic orchestration tests; actual bank acceptance is separately recorded."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from retail.music_bake import bake


class BakeTests(unittest.TestCase):
    def test_complete_catalog_keeps_source_identity_and_private_wave_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'source'
            source.mkdir()
            for name in ('AIR01', 'AIR02'):
                (source / f'{name}.XMI').write_bytes(name.encode())
            def render(path, out, bank, exe):
                out.mkdir(parents=True)
                wav = b'synthetic output, not a retail asset'
                digest = hashlib.sha256(wav).hexdigest()
                (out / f'{digest}.wav').write_bytes(wav)
                return {'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                    'durationSeconds': 1, 'limitations': ['test'],
                    'instruments': {'soundfont': {'sha256': 'b' * 64}},
                    'rendered': {'path': f'{digest}.wav', 'sha256': digest, 'durationSeconds': 2}}
            with patch('retail.music_bake.instrument_readiness', return_value={'status':'ready-for-render-validation'}), patch('retail.music_bake.export', side_effect=render):
                result = bake(source, root / 'out', root / 'bank.sf2')
            self.assertEqual(len(result['tracks']), 2)
            self.assertEqual(len(list((root / 'out/music-baked').glob('*.wav'))), 1)
            self.assertEqual(json.loads((root / 'out/bake-report.json').read_text())['failures'], [])
            self.assertEqual((source / 'AIR01.XMI').read_bytes(), b'AIR01')

    def test_failed_tracks_do_not_publish_partial_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'source'
            source.mkdir()
            (source / 'AIR01.XMI').write_bytes(b'bad')
            with patch('retail.music_bake.instrument_readiness', return_value={'status':'ready-for-render-validation'}), patch('retail.music_bake.export', side_effect=ValueError('bad XMI')):
                with self.assertRaisesRegex(ValueError, '1 tracks failed'):
                    bake(source, root / 'out', root / 'bank.sf2')
            self.assertFalse((root / 'out/flight-music-baked.json').exists())
            self.assertEqual(len(json.loads((root / 'out/bake-report.json').read_text())['failures']), 1)

    def test_source_overlap_and_public_outputs_reject(self):
        root = Path(__file__).resolve().parents[3]
        with self.assertRaisesRegex(ValueError, 'ignored extracted'):
            bake(Path('/source'), root / 'engine/public/baked', Path('/bank'))
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, 'outside source'):
                bake(Path(temp), Path(temp) / 'out', Path('/bank'))
