import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from _paths import TOOLS_RETAIL  # noqa: F401
from retail.audio import decode_pcm, export


class AudioTest(unittest.TestCase):
    def test_unsigned_raw_pcm_retains_bytes_and_rates(self):
        for ext, rate in [('.5k', 5512), ('.8K', 8010), ('.11K', 11025)]:
            clip = decode_pcm(bytes([0, 128, 255]), 'synthetic' + ext)
            self.assertEqual(clip['pcm'], [0, 128, 255])
            self.assertEqual(clip['sampleRate'], rate)
            self.assertEqual(len(clip['sha256']), 64)

    def test_rejects_empty_oversized_unknown_and_containers(self):
        for data, name in [(b'', 'x.5k'), (bytes(1_000_001), 'x.5k'),
                           (b'RIFFxxxx', 'x.11k'), (b'x', 'x.wav')]:
            with self.assertRaises(ValueError):
                decode_pcm(data, name)

    def test_local_f14_references_four_distinct_samples(self):
        pt = Path(__file__).resolve().parents[3] / 'extracted/usnf97/USNF_2.LIB/F14.PT'
        if not pt.is_file():
            self.skipTest('local extracted USNF97 F14.PT unavailable')
        with TemporaryDirectory() as tmp:
            result = export(pt, Path(tmp) / 'f14.json')
            self.assertEqual(set(result['clips']), {'jet', 'burner', 'start', 'stop'})
            self.assertEqual(len({c['sha256'] for c in result['clips'].values()}), 4)
            self.assertEqual(result['clips']['start']['source'], '&POWERUP.5K')
            self.assertEqual(result['clips']['stop']['source'], '&POWERDN.5K')
