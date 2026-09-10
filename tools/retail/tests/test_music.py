"""Synthetic XMIDI fixtures and optional locally owned USNF tracks; no retail bytes."""
import struct
import tempfile
import unittest
from pathlib import Path

from retail.music import decode, decode_events, event_chunks, export, MAX_NOTES

ROOT = Path(__file__).resolve().parents[3]
EOT = b'\xff\x2f\x00'


def chunk(tag, payload):
    return tag + struct.pack('>I', len(payload)) + payload + (b'\x00' if len(payload) & 1 else b'')


def xmi(events, extra=b''):
    form = chunk(b'FORM', b'XMID' + extra + chunk(b'EVNT', events))
    return chunk(b'FORM', b'XDIR' + chunk(b'INFO', b'\x01\x00')) + chunk(b'CAT ', b'XMID' + form)


class MusicTests(unittest.TestCase):
    def test_channel_controllers_and_bend_are_preserved(self):
        track, _ = decode(xmi(bytes([0xb1, 7, 100, 0xe1, 0, 64, 0x91, 60, 100, 120]) + EOT), 'test')
        self.assertEqual(track['channelEvents'], [
            {'timeSeconds': 0, 'channel': 1, 'kind': 'controller', 'controller': 7, 'value': 100},
            {'timeSeconds': 0, 'channel': 1, 'kind': 'pitch-bend', 'value': 8192}])

    def test_additive_delay_duration_program_and_drums(self):
        # Delays 100+20 are additive, NOT a MIDI delta VLQ; duration129 is VLQ.
        events = bytes([0xc2, 40, 100, 20, 0x92, 60, 100, 0x81, 1,
                        0xc2, 41, 0x92, 62, 90, 0, 0x99, 36, 127, 12]) + EOT
        track, _ = decode(xmi(events), 'synthetic.XMI')
        first, second, drum = track['notes']
        self.assertEqual(first, {'timeSeconds': 1, 'durationSeconds': 129 / 120,
                                'note': 60, 'velocity': 100, 'channel': 2, 'program': 40})
        self.assertEqual(second['program'], 41)
        self.assertEqual(second['durationSeconds'], 1 / 120)
        self.assertEqual(drum['channel'], 9)
        self.assertAlmostEqual(track['durationSeconds'], 1 + 129 / 120)
        self.assertEqual(len(track['sourceSha256']), 64)

    def test_form_only_and_internal_zero_alignment(self):
        events = b'\x90\x3c\x7f\x78' + EOT
        self.assertEqual(event_chunks(chunk(b'FORM', b'XMID' + chunk(b'EVNT', events))), [events])
        plain, _ = decode(xmi(events), 'a')
        aligned, _ = decode(xmi(events + b'\x00'), 'a')
        self.assertEqual(plain['notes'], aligned['notes'])

    def test_tempo_is_fixed_and_ignored_controls_reported(self):
        events = (b'\xff\x51\x03\x01\x02\x03\xb0\x74\x00'
                  b'\x78\x90\x3c\x7f\x78\xb0\x75\x7f' + EOT)
        notes, duration, report = decode_events(events)
        self.assertEqual(notes[0]['timeSeconds'], 1)
        self.assertEqual(duration, 2)
        self.assertEqual(report['controllers'], {116: 1, 117: 1})
        self.assertEqual(report['ignoredEvents'], {'meta-51': 1})

    def test_explicit_and_zero_velocity_note_off(self):
        for off in (b'\x80\x3c\x00', b'\x90\x3c\x00\x01'):
            notes, _, _ = decode_events(b'\x90\x3c\x7f\x78\x3c' + off + EOT)
            self.assertEqual(notes[0]['durationSeconds'], .5)

    def test_every_truncation_is_rejected(self):
        data = xmi(b'\x90\x3c\x7f\x78' + EOT)
        for end in range(len(data)):
            with self.subTest(end=end), self.assertRaises(ValueError):
                decode(data[:end], 'bad')

    def test_chunk_overrun_count_and_nested_bounds(self):
        cases = [b'FORM\xff\xff\xff\xffXMID', xmi(EOT) + b'x',
                 chunk(b'FORM', b'XMID' + b'EVNT\x00\x00\x00\x20' + EOT),
                 chunk(b'FORM', b'XMID' + chunk(b'EVNT', EOT) * 2),
                 xmi(EOT, chunk(b'TIMB', b'\x02\x00\x01\x01')),
                 xmi(EOT, chunk(b'RBRN', b'\x01\x00\x00\x00\xff\xff\xff\xff'))]
        wrong_count = bytearray(xmi(EOT))
        wrong_count[20] = 2
        cases.append(bytes(wrong_count))
        for data in cases:
            with self.subTest(data=data), self.assertRaises(ValueError):
                decode(data, 'bad')

    def test_event_overruns_invalid_data_and_vlq(self):
        cases = [b'\x90\x3c', b'\x90\xff\x7f\x01' + EOT,
                 b'\x90\x3c\x7f\x80\x80\x80\x80\x00' + EOT,
                 b'\xf0\x10\x01', b'\xff\x51\x03\x01',
                 b'\xff\x51\x02\x01\x02' + EOT,
                 b'\xff\x2f\x01\x00', EOT + b'\x90\x3c\x7f\x01',
                 EOT + b'\x00\x00', b'\x7f', b'\xc0\x01', b'\xf4' + EOT]
        for events in cases:
            with self.subTest(events=events), self.assertRaises(ValueError):
                decode_events(events)

    def test_duration_and_note_count_are_bounded(self):
        cases = [b'\x7f' * 567 + b'\x90\x3c\x7f\x01' + EOT,
                 b'\x90\x3c\x7f\xff\xff\x7f' + EOT,
                 b'\x90\x3c\x7f\x01' * (MAX_NOTES + 1) + EOT]
        for events in cases:
            with self.assertRaises(ValueError):
                decode_events(events)

    def test_no_playable_notes_rejected(self):
        with self.assertRaisesRegex(ValueError, 'no playable'):
            decode(xmi(EOT), 'empty')

    def test_local_air_tracks_and_export(self):
        directory = ROOT / 'extracted/usnf97/USNF_2.LIB'
        paths = sorted(directory.glob('AIR*.XMI'))
        if not paths:
            self.skipTest('locally extracted USNF AIR tracks unavailable')
        for path in paths:
            with self.subTest(path=path.name):
                track, _ = decode(path.read_bytes(), path.name)
                self.assertGreater(len(track['notes']), 0)
                self.assertLessEqual(len(track['notes']), MAX_NOTES)
                self.assertLessEqual(track['durationSeconds'], 600)
        with tempfile.TemporaryDirectory(dir=ROOT / 'extracted') as temporary:
            report = export(directory, Path(temporary) / 'flight-music.json')
            self.assertEqual(set(report), {'cruise', 'combat', 'danger', 'victory', 'defeat'})


if __name__ == '__main__':
    unittest.main()
