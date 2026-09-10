"""Export owned XMI to standard MIDI; optionally audition a user-supplied SF2.

No bank is downloaded, inferred from TIMB, or attributed to the original game.
FluidSynth is optional and external. This is an offline audition path, not a new
engine backend. Inputs remain unchanged; generated output must stay private.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import wave

from .music import decode_events, event_chunks, MAX_BYTES


def vlq(value):
    if not 0 <= value <= 0x0fffffff:
        raise ValueError('MIDI delta outside VLQ range')
    result = [value & 127]
    while value > 127:
        value >>= 7
        result.insert(0, (value & 127) | 128)
    return bytes(result)


def standard_midi(data):
    tracks = event_chunks(data)
    if len(tracks) != 1:
        raise ValueError('only single-sequence XMI supported')
    _, duration, details = decode_events(tracks[0], include_midi=True)
    events = []
    omitted = {}
    for order, (tick, message, note) in enumerate(details.pop('midiEvents')):
        # Miles-specific host/patch controls must not become GM bank instructions.
        if message[0] >> 4 == 11 and 110 <= message[1] <= 119:
            name = f'XMIDI CC{message[1]}'
            omitted[name] = omitted.get(name, 0) + 1
            continue
        if note is not None:
            if note['durationSeconds'] <= 0:
                continue
            end = round((note['timeSeconds'] + note['durationSeconds']) * 120)
            if id(note) not in details['explicitReleases']:
                events.append((end, -1, bytes([0x80 | note['channel'], note['note'], 0])))
        events.append((tick, order, message))
    events.sort(key=lambda e: (e[0], e[1]))
    # PPQN60 at500000us/qn reproduces XMIDI's fixed120ticks/sec; tempo metas do not.
    stream = bytearray(b'\x00\xff\x51\x03\x07\xa1\x20')
    previous = 0
    for tick, _, message in events:
        stream.extend(vlq(tick - previous) + message)
        previous = tick
    end = max(previous, round(duration * 120))
    # Authored finite-file cleanup, not a recovered XMIDI host action.
    for channel in range(16):
        stream.extend(vlq(end - previous) + bytes([0xb0 | channel, 64, 0]))
        stream.extend(b'\x00' + bytes([0xb0 | channel, 123, 0]))
        previous = end
    stream.extend(b'\x00\xff\x2f\x00')
    midi = b'MThd' + struct.pack('>IHHH', 6, 0, 1, 60) + b'MTrk' + struct.pack('>I', len(stream)) + stream
    return midi, {'durationSeconds': duration, 'omittedControls': omitted,
        'ignoredEvents': details['ignoredEvents'],
        'policy': '120 ticks/sec; duration expirations before same-tick events; explicit releases in source order; pedal-off/all-notes-off at EOT',
        'limitations': ['TIMB and external RBRN branches not reproduced',
            'XMIDI patch controls omitted, never remapped to a SoundFont bank',
            'Device initialization, instruments and effects depend on the selected synth/bank']}


def sha(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for data in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(data)
    return result.hexdigest()


def instrument_readiness(soundfont=None, executable='fluidsynth'):
    binary = shutil.which(str(executable))
    report = {'status': 'blocked', 'synth': binary, 'reasons': [],
              'fidelity': 'user-selected instrument rendering; original Windows MIDI device/bank unknown'}
    if not binary:
        report['reasons'].append(f'FluidSynth executable unavailable: {executable}')
    if soundfont is None:
        report['reasons'].append('No user-supplied compatible SF2 selected; no bank downloaded or inferred')
    else:
        try:
            size = soundfont.stat().st_size
            with soundfont.open('rb') as stream:
                header = stream.read(12)
            if not 12 <= size <= 512 * 1024 * 1024 or header[:4] != b'RIFF' or header[8:] != b'sfbk':
                raise ValueError('expected bounded RIFF sfbk SoundFont2, not ancillary SBK')
            if int.from_bytes(header[4:8], 'little') + 8 != size:
                raise ValueError('truncated or inconsistent SoundFont RIFF size')
            report['soundfont'] = {'path': str(soundfont), 'sha256': sha(soundfont), 'bytes': size}
        except (OSError, ValueError) as error:
            report['reasons'].append(str(error))
    if not report['reasons']:
        report['status'] = 'ready-for-render-validation'
    return report


def export(source, output, soundfont=None, executable='fluidsynth'):
    # Repository-owned generated output belongs in ignored extracted/, never public/.
    root = Path(__file__).resolve().parents[3]
    target = output.resolve()
    if target.is_relative_to(root) and not target.is_relative_to(root / 'extracted'):
        raise ValueError('repository MIDI/render outputs must be under ignored extracted/')
    if source.stat().st_size > MAX_BYTES:
        raise ValueError('XMI too large')
    data = source.read_bytes()
    midi, details = standard_midi(data)
    source_sha = hashlib.sha256(data).hexdigest()
    output.mkdir(parents=True, exist_ok=True)
    midi_path = output / f'{source_sha}.mid'
    report_path = output / f'{source_sha}.json'
    inputs = {source.resolve(), soundfont.resolve() if soundfont else None}
    if midi_path.resolve() in inputs or report_path.resolve() in inputs:
        raise ValueError('generated output cannot overwrite an input')
    midi_path.write_bytes(midi)
    report = {'schemaVersion': 1, 'source': str(source), 'sourceSha256': source_sha,
        'midi': midi_path.name, 'midiSha256': hashlib.sha256(midi).hexdigest(), **details,
        'instruments': instrument_readiness(soundfont, executable)}
    readiness = report['instruments']
    if readiness['status'] == 'ready-for-render-validation':
        try:
            version = subprocess.run([readiness['synth'], '--version'], capture_output=True,
                                     text=True, timeout=10, check=True)
            readiness['version'] = version.stdout[:2000]
            with tempfile.TemporaryDirectory(dir=output) as temporary:
                rendered = Path(temporary) / 'render.wav'
                command = [readiness['synth'], '-ni', '-F', str(rendered), '-T', 'wav',
                           '-O', 's16', '-r', '22050', str(soundfont.resolve()), str(midi_path.resolve())]
                subprocess.run(command, capture_output=True, timeout=120, check=True)
                with wave.open(str(rendered), 'rb') as audio:
                    if audio.getsampwidth() != 2 or audio.getnchannels() not in (1, 2) or audio.getframerate() != 22050:
                        raise ValueError('unexpected rendered WAV format')
                    frames = audio.getnframes()
                    if not 0 < frames <= 610 * 22050:
                        raise ValueError('rendered duration outside bounds')
                    audible = False
                    byte_count = 0
                    while chunk := audio.readframes(22050):
                        audible |= any(chunk)
                        byte_count += len(chunk)
                    if byte_count != frames * audio.getnchannels() * 2:
                        raise ValueError('truncated rendered PCM frames')
                    if not audible:
                        raise ValueError('rendered WAV contains no signal')
                wav_sha = sha(rendered)
                wav_path = output / f'{wav_sha}.wav'
                shutil.copyfile(rendered, wav_path)
                report['rendered'] = {'path': wav_path.name, 'sha256': wav_sha,
                                      'durationSeconds': frames / 22050}
                readiness['status'] = 'rendered-user-bank-not-native-fidelity'
        except (OSError, ValueError, wave.Error, subprocess.SubprocessError) as error:
            readiness['status'] = 'render-failed'
            readiness['reasons'].append(str(error))
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--soundfont', type=Path)
    parser.add_argument('--synth', default='fluidsynth')
    args = parser.parse_args()
    if bool(args.source) != bool(args.out):
        parser.error('--source and --out must be supplied together')
    report = export(args.source, args.out, args.soundfont, args.synth) if args.source else {
        'instruments': instrument_readiness(args.soundfont, args.synth)}
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report['instruments']['status'].startswith('rendered-') else 2)
