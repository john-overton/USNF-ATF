"""Synthetic standard MIDI and optional-render boundary tests; no retail bank."""
import struct
import tempfile
import unittest
import wave
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch

from retail.music_midi import standard_midi, instrument_readiness, export, vlq
from test_music import xmi, EOT


def read_smf(data):
    assert data[:14] == b'MThd' + struct.pack('>IHHH', 6, 0, 1, 60)
    assert data[14:18] == b'MTrk'
    assert int.from_bytes(data[18:22], 'big') == len(data) - 22
    cursor, tick, events = 22, 0, []
    while cursor < len(data):
        delta = 0
        while True:
            byte = data[cursor]
            cursor += 1
            delta = delta * 128 + (byte & 127)
            if byte < 128:
                break
        tick += delta
        status = data[cursor]
        length = (3 + data[cursor + 2]) if status == 255 else (2 if status >> 4 in (12, 13) else 3)
        events.append((tick, data[cursor:cursor + length]))
        cursor += length
    assert cursor == len(data)
    return events


class MidiTests(unittest.TestCase):
    def test_program_controller_bend_pressure_order_and_note_offs(self):
        data = xmi(bytes([0xb0, 114, 55, 0xc0, 40, 0xb0, 101, 0, 0xb0, 100, 0,
                          0xb0, 6, 12, 0xe0, 0, 0, 0xd0, 3, 0xa0, 60, 9,
                          0x90, 60, 100, 120, 60, 0x80, 60, 0]) + EOT)
        midi, report = standard_midi(data)
        events = read_smf(midi)
        self.assertEqual(events[1:8], [(0, bytes(v)) for v in ([0xc0, 40], [0xb0, 101, 0],
            [0xb0, 100, 0], [0xb0, 6, 12], [0xe0, 0, 0], [0xd0, 3], [0xa0, 60, 9])])
        self.assertIn((60, b'\x80\x3c\x00'), events)
        self.assertEqual(report['omittedControls'], {'XMIDI CC114': 1})
        self.assertEqual(events[-1], (60, EOT))

    def test_loop_one_is_one_pass_and_vlq_limits(self):
        midi, _ = standard_midi(xmi(b'\xb0\x74\x01\x90\x3c\x7f\x01\xb0\x75\x7f' + EOT))
        self.assertEqual(sum(m[0] >> 4 == 9 for _, m in read_smf(midi)), 1)
        self.assertEqual(vlq(128), b'\x81\x00')
        for bad in (-1, 0x10000000):
            with self.assertRaises(ValueError):
                vlq(bad)

    def test_explicit_release_retains_order_after_same_tick_pedal_down(self):
        data = xmi(bytes([0x90, 60, 100, 0x81, 0x70, 120, 0xb0, 64, 127,
                          0x80, 60, 0, 120, 0xb0, 64, 0]) + EOT)
        midi, _ = standard_midi(data)
        self.assertEqual([message for tick, message in read_smf(midi) if tick == 120],
                         [b'\xb0\x40\x7f', b'\x80\x3c\x00'])

    def test_missing_dependencies_and_invalid_bank_are_explicit(self):
        with patch('retail.music_midi.shutil.which', return_value=None):
            report = instrument_readiness()
        self.assertEqual(report['status'], 'blocked')
        self.assertEqual(len(report['reasons']), 2)
        with tempfile.TemporaryDirectory() as temporary:
            bank = Path(temporary) / 'bad.sf2'
            bank.write_bytes(b'RIFF\xff\xff\xff\xffsfbk')
            report = instrument_readiness(bank)
            self.assertEqual(report['status'], 'blocked')
            self.assertIn('truncated', report['reasons'][-1])

    def test_export_provenance_and_no_source_mutation_on_block(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / 'test.xmi'
            original = xmi(b'\x90\x3c\x7f\x78' + EOT)
            source.write_bytes(original)
            with patch('retail.music_midi.shutil.which', return_value=None):
                report = export(source, directory / 'out')
            self.assertEqual(source.read_bytes(), original)
            self.assertEqual(len(report['sourceSha256']), 64)
            self.assertEqual(len(report['midiSha256']), 64)
            self.assertTrue((directory / 'out' / report['midi']).exists())
            self.assertNotIn('rendered', report)
            with self.assertRaisesRegex(ValueError, 'ignored extracted'):
                export(source, Path(__file__).resolve().parents[3] / 'engine/public/audio')

    def test_render_failure_does_not_claim_success(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / 'test.xmi'
            source.write_bytes(xmi(b'\x90\x3c\x7f\x78' + EOT))
            bank = directory / 'synthetic-header.sf2'
            bank.write_bytes(b'RIFF\x04\x00\x00\x00sfbk')
            # Header-only is only readiness, not proof that a bank can render.
            with patch('retail.music_midi.shutil.which', return_value='/nonexistent/synth'):
                report = export(source, directory / 'out', bank)
            self.assertEqual(report['instruments']['status'], 'render-failed')
            self.assertNotIn('rendered', report)

    def test_render_adapter_validates_output_and_retains_provenance(self):
        # Mock process I/O only: not evidence of a working synth or usable bank.
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / 'test.xmi'
            source.write_bytes(xmi(b'\x90\x3c\x7f\x78' + EOT))
            bank = directory / 'synthetic-header.sf2'
            bank.write_bytes(b'RIFF\x04\x00\x00\x00sfbk')
            for mode in ('valid', 'silent', 'truncated'):
                def run(command, **kwargs):
                    if command[-1] == '--version':
                        return SimpleNamespace(stdout='synthetic test process')
                    output = Path(command[command.index('-F') + 1])
                    with wave.open(str(output), 'wb') as audio:
                        audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(22050)
                        audio.writeframes((b'\x00\x00' if mode == 'silent' else b'\x01\x00') * 100)
                    if mode == 'truncated':
                        output.write_bytes(output.read_bytes()[:-10])
                    return SimpleNamespace(stdout='')
                with patch('retail.music_midi.shutil.which', return_value='/synthetic/process'), patch('retail.music_midi.subprocess.run', side_effect=run):
                    report = export(source, directory / mode, bank)
                if mode == 'valid':
                    self.assertEqual(report['instruments']['status'], 'rendered-user-bank-not-native-fidelity')
                    self.assertEqual(len(report['rendered']['sha256']), 64)
                    self.assertEqual(len(report['instruments']['soundfont']['sha256']), 64)
                else:
                    self.assertEqual(report['instruments']['status'], 'render-failed')
                    self.assertNotIn('rendered', report)


if __name__ == '__main__':
    unittest.main()
