"""Read-only archive completeness/replacement audit; never repairs or invents bytes.

A replacement must preserve every available source byte and pass strict archive
parsing. This proves compatibility with this partial copy, not retail authenticity.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import struct
import wave
from .audio_catalog import salvage_entries, save_blob
from .ealib import EALib
from .video_audio import decode_cb8


def digest(path: Path, count=None):
    sha = hashlib.sha256()
    with path.open('rb') as stream:
        while count is None or count > 0:
            data = stream.read(1024 * 1024 if count is None else min(count, 1024 * 1024))
            if not data:
                if count:
                    raise ValueError('short prefix read')
                break
            sha.update(data)
            if count is not None:
                count -= len(data)
    return sha.hexdigest()


def audit(path: Path, replacement: Path | None = None):
    missing = []
    # Exhaust the generator so all directory entries, not only audio, are checked.
    available = sum(1 for _ in salvage_entries(path, missing))
    with path.open('rb') as stream:
        header = stream.read(7)
        count = struct.unpack_from('<H', header, 5)[0] + 1
        directory = stream.read(count * 18)
    name, flag, expected_end = struct.unpack_from('<13sBI', directory, (count - 1) * 18)
    if name.split(b'\0', 1)[0] or flag != 0:
        raise ValueError('completeness audit requires a terminal empty-name, flag-zero sentinel')
    size = path.stat().st_size
    result = {'schemaVersion': 1, 'archive': str(path), 'sourceSha256': digest(path),
        'directorySha256': hashlib.sha256(header + directory).hexdigest(),
        'availableBytes': size, 'expectedEnd': expected_end,
        'missingTailBytes': max(0, expected_end - size), 'availableEntries': available,
        'unavailableEntries': missing, 'status': 'incomplete' if missing else 'complete',
        'recovery': 'Supply a complete owned archive; no reconstruction or old-extract substitution.'}
    try:
        lib = EALib.open(path)
        try:
            if not lib.sentinel:
                raise ValueError('terminal sentinel does not equal file length')
        finally:
            lib.buf.close()
    except ValueError as error:
        result['strictError'] = str(error)
        result['status'] = 'incomplete' if missing else 'invalid'
    if replacement is not None:
        candidate = {'path': str(replacement), 'status': 'rejected'}
        try:
            if replacement.stat().st_size < size:
                raise ValueError('replacement is shorter than the available source')
            if digest(replacement, size) != result['sourceSha256']:
                raise ValueError('replacement does not preserve the available source prefix')
            lib = EALib.open(replacement)
            recovered = []
            try:
                if not lib.sentinel or replacement.stat().st_size != expected_end:
                    raise ValueError('replacement length must exactly match the terminal sentinel')
                for entry in lib:
                    if any(row['entryIndex'] == entry.index for row in missing):
                        payload = lib.read(entry)
                        details = decode_cb8(payload)[1] if entry.name.upper().endswith('.CB8') else {}
                        recovered.append({'name': entry.name, 'sha256': hashlib.sha256(payload).hexdigest(),
                                          'bytes': len(payload), 'audioStatus': details.get('status')})
            finally:
                lib.buf.close()
            candidate.update(status='compatible-complete', sha256=digest(replacement),
                recoveredEntries=recovered, authenticity='not established by prefix/structure validation')
        except (ValueError, OSError) as error:
            candidate['error'] = str(error)
        result['replacement'] = candidate
    return result


def recover_partial_audio(path: Path, output: Path):
    """Recover complete audio packets from an audited partial entry; never a full movie."""
    root = Path(__file__).resolve().parents[3]
    target = output.resolve()
    if target.is_relative_to(path.resolve().parent):
        raise ValueError('partial outputs must be outside source media')
    if target.is_relative_to(root) and not target.is_relative_to(root / 'extracted'):
        raise ValueError('repository partial outputs must stay under ignored extracted/')
    report = audit(path)
    report['partialAudio'] = []
    for row in report['unavailableEntries']:
        if row['availability'] != 'partial' or not row['name'].upper().endswith('.CB8'):
            continue
        item = {**row, 'complete': False, 'status': 'unrecoverable-prefix'}
        try:
            if row['availableBytes'] > 256 * 1024 * 1024:
                raise ValueError('partial CB8 exceeds decoder budget')
            with path.open('rb') as stream:
                stream.seek(row['begin'])
                prefix = stream.read(row['availableBytes'])
            if len(prefix) != row['availableBytes']:
                raise ValueError('short available-prefix read')
            pcm, info = decode_cb8(prefix, partial=True)
            item.update(info, prefixSha256=hashlib.sha256(prefix).hexdigest())
            if pcm:
                preview = io.BytesIO()
                with wave.open(preview, 'wb') as wav:
                    wav.setnchannels(1); wav.setsampwidth(1); wav.setframerate(info['sampleRate'])
                    wav.writeframes(pcm)
                item.update(originalPrefix=save_blob(output, 'prefix', prefix, '.cb8-prefix'),
                    pcm=save_blob(output, 'pcm', pcm, '.u8'),
                    preview=save_blob(output, 'wav', preview.getvalue(), '.wav'),
                    sampleBytes=len(pcm), pcmSha256=hashlib.sha256(pcm).hexdigest())
        except (ValueError, OSError) as error:
            item['error'] = str(error)
        report['partialAudio'].append(item)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'partial-audio.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--replacement', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--partial-out', type=Path, help='Optional private output for intact packets from partial movies')
    args = parser.parse_args()
    report = audit(args.archive, args.replacement)
    if args.partial_out:
        report['partialAudio'] = recover_partial_audio(args.archive, args.partial_out)['partialAudio']
    text = json.dumps(report, indent=2) + '\n'
    if args.out:
        if args.out.resolve() in {args.archive.resolve(), args.replacement.resolve() if args.replacement else None}:
            raise ValueError('audit output cannot overwrite media')
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text)
    print(text)
    raise SystemExit(0 if report.get('replacement', report)['status'] in ('complete', 'compatible-complete') else 2)
