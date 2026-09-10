"""Conservative DRBC/CB8 audio demux from available disc ranges, never old extracts.

Native InitCobra 0x40175d / MainLoop 0x401f98 read 64-byte file and 24-byte
chunk headers. Silence initialization 0x40186c uses 0x80 (unsigned PCM8).
VDO movies use external basename audio via StartVDOAudio 0x42e160.
Retail outputs must remain local, outside the source media tree.
"""
import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import struct
import wave

from .audio_catalog import salvage_entries, save_blob
from .disc import iter_sources


def decode_cb8(data: bytes) -> tuple[bytes, dict]:
    if len(data) < 64 or len(data) > 256 * 1024 * 1024 or data[:4] != b'DRBC':
        raise ValueError('invalid DRBC header/size')
    flags, fps10, rate, version = struct.unpack_from('<IHHI', data, 4)
    if flags not in (0, 1) or version != 101 or fps10 != 150 or rate != 22050:
        raise ValueError('unsupported DRBC flags/version/timing/audio rate')
    cursor = 64
    samples = bytearray()
    chunks = []
    counts = Counter()
    while cursor < len(data):
        if cursor + 24 > len(data):
            raise ValueError('truncated CB8 chunk header')
        tag, size = struct.unpack_from('<4sI', data, cursor)
        if tag not in (b'VooM', b'MRFI', b'MRFA') or size < 24 or size > len(data) - cursor:
            raise ValueError('unsupported or truncated CB8 chunk')
        counts[tag.decode('ascii')] += 1
        if tag == b'MRFA':
            if flags != 1 or struct.unpack_from('<4I', data, cursor + 8) != (128, 0, 8, 1):
                raise ValueError('unsupported CB8 audio format')
            if size != 7374:
                raise ValueError('unsupported CB8 audio block size')
            chunks.append({'sourceOffset': cursor + 24, 'bytes': size - 24,
                           'sampleOffset': len(samples)})
            samples.extend(data[cursor + 24:cursor + size])
        cursor += size
    if flags == 1 and not samples:
        raise ValueError('CB8 advertises audio but contains no audio chunks')
    if counts['VooM'] != 1 or counts['MRFI'] < 1:
        raise ValueError('CB8 lacks expected movie/video chunks')
    return bytes(samples), {'sampleRate': rate, 'encoding': 'unsigned8-mono',
        'durationSeconds': len(samples) / rate, 'chunks': dict(counts), 'audioRanges': chunks,
        'status': 'embedded-audio' if samples else 'no-embedded-audio'}


def export(media: Path, output: Path):
    if output.resolve().is_relative_to(media.resolve()):
        raise ValueError('video audio output must be outside source media')
    output.mkdir(parents=True, exist_ok=True)
    result = {'schemaVersion': 1, 'media': str(media), 'assets': [], 'errors': [],
              'unavailableEntries': [], 'vdoSidecars': []}
    audio_sources = {}

    def accept(name, archive, index, read):
        suffix = Path(name).suffix.upper()
        identity = {'name': name, 'archive': archive, 'entryIndex': index}
        if suffix in ('.11K', '.5K'):
            audio_sources.setdefault(name.upper(), []).append(identity)
        if suffix == '.VDO':
            stem = Path(name).stem.upper()
            # Inverse of BuildVDOList: group base + segment letter A..Z.
            if len(stem) < 2 or not 'A' <= stem[-1] <= 'Z':
                result['errors'].append({**identity, 'error': 'unsupported VDO segment name'})
            else:
                base = stem[:-1]
                result['vdoSidecars'].append({**identity, 'group': base,
                    'audioName': base + ('.5K' if base == 'IQC' else '.11K'),
                    'evidence': 'BuildVDOList 0x42df70 / StartVDOAudio 0x42e160'})
        if Path(name).suffix.upper() != '.CB8':
            return
        row = {'name': name, 'archive': archive, 'entryIndex': index}
        try:
            data = read()
            row.update(sourceSha256=hashlib.sha256(data).hexdigest(), sourceBytes=len(data))
            pcm, info = decode_cb8(data)
            row.update(info)
            if pcm:
                stream = io.BytesIO()
                with wave.open(stream, 'wb') as wav:
                    wav.setnchannels(1)
                    wav.setsampwidth(1)
                    wav.setframerate(info['sampleRate'])
                    wav.writeframes(pcm)
                row.update(pcmSha256=hashlib.sha256(pcm).hexdigest(), sampleBytes=len(pcm),
                    originalPcm=save_blob(output, 'pcm', pcm, '.u8'),
                    preview=save_blob(output, 'wav', stream.getvalue(), '.wav'))
            result['assets'].append(row)
        except (ValueError, OSError) as error:
            result['errors'].append({**row, 'error': str(error)})

    for path in sorted(media.iterdir()):
        if not path.is_file() or (path.suffix.upper() != '.LIB' and path.name.upper() != 'SETUP.ESA'):
            continue
        try:
            for source in iter_sources(path):
                for entry in source.entries():
                    accept(entry.name, source.name, entry.index, lambda: source.read(entry))
        except (ValueError, OSError) as error:
            result['errors'].append({'archive': path.name, 'error': str(error)})
            if path.suffix.upper() == '.LIB':
                try:
                    for name, index, read in salvage_entries(path, result['unavailableEntries']):
                        accept(name, path.name + ' (bounded salvage)', index, read)
                except (ValueError, OSError) as salvage_error:
                    result['errors'].append({'archive': path.name, 'salvageError': str(salvage_error)})
    for row in result['vdoSidecars']:
        row['audioSources'] = audio_sources.get(row['audioName'], [])
        row['status'] = 'external-audio-present' if row['audioSources'] else 'missing-external-audio'
    result['summary'] = {'statuses': dict(Counter(row['status'] for row in result['assets'])),
        'vdoSegments': len(result['vdoSidecars']),
        'vdoDistinctSidecars': len({row['audioName'] for row in result['vdoSidecars']}),
        'vdoMissingSidecars': sum(not row['audioSources'] for row in result['vdoSidecars']),
        'sampleBytes': sum(row.get('sampleBytes', 0) for row in result['assets']),
        'unavailable': len(result['unavailableEntries']), 'errors': len(result['errors'])}
    (output / 'catalog.json').write_text(json.dumps(result, indent=2) + '\n')
    return result['summary']


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--media', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(export(args.media, args.out), indent=2))
