import struct
import unittest

from retail.video_audio import decode_cb8


def movie(audio=True):
    header = b'DRBC' + struct.pack('<IHHI', int(audio), 150, 22050, 101) + bytes(48)
    video = b'MRFI' + struct.pack('<I', 24) + bytes(16)
    chunk = b'MRFA' + struct.pack('<5I', 7374, 128, 0, 8, 1) + bytes([128]) * 7350
    return header + video + (chunk if audio else b'') + b'VooM' + struct.pack('<I', 24) + bytes(16)


class VideoAudioTests(unittest.TestCase):
    def test_lossless_audio_ranges_and_silent_movie(self):
        pcm, info = decode_cb8(movie())
        self.assertEqual(pcm, bytes([128]) * 7350)
        self.assertEqual(info['durationSeconds'], 1 / 3)
        self.assertEqual(info['audioRanges'][0]['sourceOffset'], 112)
        self.assertEqual(decode_cb8(movie(False))[1]['status'], 'no-embedded-audio')

    def test_reject_truncation_unknown_formats_and_false_audio_flag(self):
        original = movie()
        for length in (0, 63, 65, 87, len(original) - 1):
            with self.assertRaises(ValueError):
                decode_cb8(original[:length])
        for at, value in ((4, 0), (10, 0), (12, 0), (88, 0), (92, 1), (104, 16)):
            data = bytearray(original)
            data[at] = value
            with self.assertRaises(ValueError):
                decode_cb8(bytes(data))

    def test_advertised_audio_without_chunks_rejected(self):
        with self.assertRaises(ValueError):
            decode_cb8(movie()[:88])

    def test_partial_mode_recovers_only_complete_packets_never_claims_complete_movie(self):
        complete = movie()
        prefix = complete[:-24]  # No index/footer; retained audio packet intact.
        pcm, info = decode_cb8(prefix, partial=True)
        self.assertEqual(len(pcm), 7350)
        self.assertEqual(info['status'], 'partial-embedded-audio')
        self.assertFalse(info['complete'])
        self.assertEqual(info['discardedTailBytes'], 0)
        chunk = complete[88:-24]
        pcm, info = decode_cb8(prefix + chunk[:100], partial=True)
        self.assertEqual(len(pcm), 7350)  # Never pads the next partial packet.
        self.assertEqual(info['discardedTailBytes'], 100)
        with self.assertRaises(ValueError): decode_cb8(prefix)
        with self.assertRaises(ValueError): decode_cb8(prefix + b'BAD!'+bytes(20), partial=True)


if __name__ == '__main__':
    unittest.main()
