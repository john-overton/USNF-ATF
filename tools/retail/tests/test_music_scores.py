import struct
import unittest

from retail.music_scores import decode_code


class MusicScoreTests(unittest.TestCase):
    def test_choices_and_unreachable_trailer(self):
        score = decode_code(b'\xfftest\0\xfd\x02\x01\x05\xfb\x32\x09\xfc\xaa\xbb')
        self.assertEqual(score['trackIds'], [1, 5, 9])
        self.assertEqual(score['prefixes'], ['test'])
        self.assertEqual(score['unreachableBytes'], 2)

    def test_loop_and_forward_jump_follow_control_flow(self):
        score = decode_code(b'\xfe' + struct.pack('<I', 6) + b'\x08\x01\xfe' + struct.pack('<I', 6))
        self.assertEqual(score['trackIds'], [1])
        self.assertEqual(score['unreachableBytes'], 1)

    def test_bad_bounds_and_operand_jumps(self):
        for code in [b'\xffoops', b'\xfd\0', b'\xfd\x04\x01',
                     b'\xfe' + struct.pack('<I', 1), b'\xfb\xff\x01\xfc']:
            with self.assertRaises(ValueError):
                decode_code(code)


if __name__ == '__main__':
    unittest.main()
