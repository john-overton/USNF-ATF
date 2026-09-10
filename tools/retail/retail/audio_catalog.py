"""Recover a provenance-preserving audio library from locally owned retail media.

Original bytes are retained separately from listenable WAV previews. Incomplete
archives and unsupported multimedia are reported, never silently counted as audio
recovery. Outputs are retail-derived and belong only in ignored/local data folders.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import struct
import subprocess
import wave

from .audio import RATES
from .disc import iter_sources
from .dcl import explode
from .music import decode as decode_music

AUDIO = set(RATES) | {'.WAV', '.VOC', '.XMI', '.MID', '.MIDI', '.MUS',
                            '.DLS', '.SF2', '.SBK', '.BNK', '.AD', '.OPL', '.TMB', '.PAT', '.WLF'}
MULTIMEDIA = {'.CB8', '.VDO', '.FBC', '.AVI', '.BIK', '.SMK'}


def wav_preview(data: bytes, name: str) -> tuple[bytes, dict]:
    """Keep RIFF containers; wrap headerless unsigned PCM without changing samples."""
    if data.startswith(b'RIFF'):
        if len(data) < 12 or data[8:12] != b'WAVE' or struct.unpack_from('<I', data, 4)[0] + 8 != len(data):
            raise ValueError('invalid RIFF WAVE size/type')
        cursor = 12
        data_size = None
        while cursor < len(data):
            if cursor + 8 > len(data):
                raise ValueError('truncated RIFF chunk header')
            size = struct.unpack_from('<I', data, cursor + 4)[0]
            end = cursor + 8 + size
            if end > len(data):
                raise ValueError('RIFF chunk exceeds available bytes')
            if data[cursor:cursor + 4] == b'data':
                if data_size is not None:
                    raise ValueError('multiple WAV data chunks unsupported')
                data_size = size
            # Retail ATF EXPL9 omits padding ONLY at the bounded final odd chunk.
            cursor = end if end == len(data) else end + (size & 1)
        if data_size is None:
            raise ValueError('WAV missing data chunk')
    if data.startswith(b'RIFF') and data[8:12] == b'WAVE':
        with wave.open(io.BytesIO(data), 'rb') as stream:
            expected = stream.getnframes() * stream.getnchannels() * stream.getsampwidth()
            if expected != data_size or len(stream.readframes(stream.getnframes())) != expected:
                raise ValueError('truncated/partial PCM frames')
            info = {'sampleRate': stream.getframerate(), 'channels': stream.getnchannels(),
                    'sampleWidth': stream.getsampwidth(), 'frames': stream.getnframes(),
                    'rateConfidence': 'RIFF fmt header'}
        return data, info
    suffix = Path(name).suffix.upper()
    if suffix not in RATES or not data or data.startswith(b'Creative Voice File'):
        raise ValueError('unsupported waveform container or empty PCM')
    output = io.BytesIO()
    with wave.open(output, 'wb') as stream:
        stream.setnchannels(1)
        stream.setsampwidth(1)
        stream.setframerate(RATES[suffix])
        stream.writeframes(data)
    return output.getvalue(), {'sampleRate': RATES[suffix], 'channels': 1,
                              'sampleWidth': 1, 'frames': len(data),
                              'rateConfidence': 'USNF SoundOn pitch table / SetVolPitchPan integer rate'}


def salvage_entries(path: Path, unavailable: list):
    """Read only individually complete entries of an otherwise valid truncated LIB.

    This does not relax the normal archive parser or invent any missing bytes.
    All directory offsets must remain ordered and outside the complete directory.
    """
    with path.open('rb') as stream:
        header = stream.read(7)
        if len(header) != 7 or header[:5] != b'EALIB':
            raise ValueError('no complete EALIB header for salvage')
        count = struct.unpack_from('<H', header, 5)[0] + 1
        directory = stream.read(count * 18)
        if len(directory) != count * 18:
            raise ValueError('no complete directory for salvage')
        rows = [struct.unpack_from('<13sBI', directory, i * 18) for i in range(count)]
        offsets = [row[2] for row in rows]
        if offsets != sorted(offsets) or offsets[0] < 7 + count * 18:
            raise ValueError('unsafe non-monotonic/overlapping salvage directory')
        size = path.stat().st_size
        for index, (raw_name, flag, begin) in enumerate(rows):
            name = raw_name.split(b'\0', 1)[0].decode('latin1')
            if not name:
                continue
            end = offsets[index + 1] if index + 1 < count else size
            if begin > size or end > size:
                unavailable.append({'archive': path.name, 'entryIndex': index, 'name': name,
                                    'error': 'entry extends beyond available media bytes'})
                continue
            def read(begin=begin, end=end, flag=flag):
                stream.seek(begin)
                data = stream.read(end - begin)
                if len(data) != end - begin:
                    raise ValueError('short salvage read')
                if flag == 0:
                    return data
                if flag == 4 and len(data) >= 4:
                    return explode(data[4:], struct.unpack_from('<I', data)[0])
                raise ValueError(f'unsupported salvage flag {flag}')
            yield name, index, read


def save_blob(output: Path, folder: str, data: bytes, suffix: str) -> str:
    name = f'{folder}/{hashlib.sha256(data).hexdigest()}{suffix.lower()}'
    path = output / name
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError(f'output hash collision/corruption: {name}')
    else:
        path.write_bytes(data)
    return name


def export(media: Path, output: Path) -> dict:
    if output.resolve().is_relative_to(media.resolve()):
        raise ValueError('audio output must be outside the media tree')
    output.mkdir(parents=True, exist_ok=True)
    result = {'schemaVersion': 1, 'media': media.name, 'assets': [],
              'multimediaPending': [], 'errors': [], 'unavailableEntries': []}

    def accept(name: str, archive: str, index: int, read):
        row = {'name': name, 'archive': archive, 'entryIndex': index}
        try:
            data = read()
            row.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
                       original=save_blob(output, 'original', data, Path(name).suffix))
            suffix = Path(name).suffix.upper()
            if suffix in RATES or suffix == '.WAV':
                try:
                    wav, info = wav_preview(data, name)
                    row.update(info, status='waveform',
                               preview=save_blob(output, 'wav', wav, '.wav'))
                except (ValueError, wave.Error, EOFError) as error:
                    row.update(status='preserved-undecoded', decodeError=str(error))
                    # Optional installed decoder for compressed WAV, never raw guessing.
                    if isinstance(error, wave.Error) and str(error).startswith('unknown format:'):
                        try:
                            converted = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin',
                                '-i', 'pipe:0', '-f', 'wav', '-c:a', 'pcm_s16le', 'pipe:1'],
                                input=data, capture_output=True, check=True, timeout=30).stdout
                            # A pipe WAV advertises unknown (0xffffffff) chunk lengths.
                            # Re-wrap the actual frames into a seekable, bounded RIFF.
                            bounded = io.BytesIO()
                            with wave.open(io.BytesIO(converted), 'rb') as decoded:
                                frames = decoded.readframes(len(converted))
                                with wave.open(bounded, 'wb') as writer:
                                    writer.setnchannels(decoded.getnchannels())
                                    writer.setsampwidth(decoded.getsampwidth())
                                    writer.setframerate(decoded.getframerate())
                                    writer.writeframes(frames)
                            converted, info = wav_preview(bounded.getvalue(), name)
                            row.pop('decodeError', None)
                            row.update(info, status='waveform', conversion='ffmpeg PCM16 WAV',
                                       preview=save_blob(output, 'wav', converted, '.wav'))
                        except (OSError, subprocess.SubprocessError) as conversion_error:
                            row['conversionError'] = str(conversion_error)
            elif suffix == '.XMI':
                try:
                    notes, details = decode_music(data, name)
                    row.update(status='sequence', noteCount=len(notes['notes']),
                               durationSeconds=notes['durationSeconds'], limitations=details)
                except ValueError as error:
                    row.update(status='preserved-undecoded', decodeError=str(error))
            else:
                row['status'] = 'preserved-undecoded'
            result['assets'].append(row)
        except Exception as error:
            result['errors'].append({**row, 'error': str(error)})

    # Isolate root archive failures so a damaged video LIB cannot hide later audio.
    inputs = sorted(p for p in media.iterdir()
                    if p.is_file() and (p.suffix.upper() == '.LIB' or p.name.upper() == 'SETUP.ESA'))
    for path in inputs:
        try:
            for source in iter_sources(path):
                for entry in source.entries():
                    index = entry.index
                    suffix = Path(entry.name).suffix.upper()
                    if suffix in AUDIO:
                        accept(entry.name, source.name, index, lambda: source.read(entry))
                    elif suffix in MULTIMEDIA:
                        result['multimediaPending'].append({'archive': source.name,
                            'name': entry.name, 'entryIndex': index,
                            'status': 'audio-presence-and-demux-unverified'})
        except Exception as error:
            result['errors'].append({'archive': path.name, 'error': str(error)})
            if path.suffix.upper() == '.LIB':
                try:
                    for name, index, read in salvage_entries(path, result['unavailableEntries']):
                        suffix = Path(name).suffix.upper()
                        if suffix in AUDIO:
                            accept(name, path.name + ' (bounded salvage)', index, read)
                        elif suffix in MULTIMEDIA:
                            result['multimediaPending'].append({'archive': path.name,
                                'name': name, 'entryIndex': index,
                                'status': 'audio-presence-and-demux-unverified'})
                except Exception as salvage_error:
                    result['errors'][-1]['salvageError'] = str(salvage_error)
    # Include loose music/driver banks too, retaining their subdirectory provenance.
    for path in sorted(media.rglob('*')):
        if path.is_file() and path.suffix.upper() in AUDIO:
            accept(path.name, str(path.parent.relative_to(media)), 0, path.read_bytes)
    result['summary'] = {'assets': len(result['assets']),
        'uniqueOriginals': len({row['sha256'] for row in result['assets']}),
        'extensions': dict(sorted(Counter(Path(row['name']).suffix.upper()
                                         for row in result['assets']).items())),
        'statuses': dict(Counter(row['status'] for row in result['assets'])),
        'errors': len(result['errors']), 'multimediaPending': len(result['multimediaPending'])}
    (output / 'catalog.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--media', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = export(args.media, args.out)
    print(json.dumps({'summary': result['summary'], 'errors': result['errors']}, indent=2))


if __name__ == '__main__':
    main()
