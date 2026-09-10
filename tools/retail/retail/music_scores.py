"""Extract reachable USNF MUS score instructions without executing retail code.

Opcode evidence: USNF.EXE ScoreUpdate 0x42a730, dispatch table 0x42a928.
Chance helper 0x45ee50 compares Random(100) < operand. F9 sets a host flag;
its situation-switch implications are not inferred here. Runtime host situation
selection and original RNG synchronization are not reproduced.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct

from .mnu import _sections


def decode_code(code: bytes) -> dict:
    if not code or len(code) > 65536:
        raise ValueError('invalid score size')
    pending = [0]
    instructions = {}
    covered = set()
    tracks = set()
    prefixes = set()
    while pending:
        start = pending.pop()
        if start in instructions:
            continue
        if start in covered or start < 0 or start >= len(code):
            raise ValueError('score jump outside code or into operand')
        cursor = start
        def take(count):
            nonlocal cursor
            if cursor + count > len(code):
                raise ValueError('truncated score operand')
            value = code[cursor:cursor + count]
            cursor += count
            return value
        opcode = take(1)[0]
        row = {'offset': start, 'opcode': opcode}
        next_offsets = []
        if opcode == 255:
            end = code.find(b'\0', cursor, cursor + 32)
            if end < 0:
                raise ValueError('unterminated score prefix')
            prefix = take(end - cursor + 1)[:-1].decode('ascii')
            if not prefix.isalnum():
                raise ValueError('unsafe score prefix')
            prefixes.add(prefix)
            row.update(operation='prefix', prefix=prefix)
        elif opcode in (254, 250):
            if opcode == 250:
                row['chancePercent'] = take(1)[0]
            target = struct.unpack('<I', take(4))[0]
            row.update(operation='jump' if opcode == 254 else 'chance-jump', target=target)
            next_offsets.append(target)
        elif opcode == 253:
            count = take(1)[0]
            if count == 0:
                raise ValueError('empty random score choice')
            choices = list(take(count))
            if any(n == 0 or n >= 249 for n in choices):
                raise ValueError('invalid score track ID')
            tracks.update(choices)
            row.update(operation='random-track', tracks=choices)
        elif opcode == 252:
            row['operation'] = 'stop'
        elif opcode == 251:
            chance, track = take(2)
            if chance > 100 or not 0 < track < 249:
                raise ValueError('invalid chance/track')
            tracks.add(track)
            row.update(operation='chance-track', chancePercent=chance, track=track)
        elif opcode == 249:
            row['operation'] = 'set-host-flag'
        else:
            row.update(operation='track' if opcode else 'noop', track=opcode)
            if opcode:
                tracks.add(opcode)
        occupied = set(range(start, cursor))
        if occupied & covered:
            raise ValueError('overlapping score instructions')
        covered.update(occupied)
        instructions[start] = row
        if opcode not in (252, 254):
            next_offsets.append(cursor)
        pending.extend(next_offsets)
    return {'prefixes': sorted(prefixes), 'trackIds': sorted(tracks),
            'instructions': [instructions[i] for i in sorted(instructions)],
            'unreachableBytes': len(code) - len(covered)}


def export(directory: Path, output: Path, digits: int = 2):
    if digits not in (2, 3):
        raise ValueError('score filenames require two or three digits')
    result = {'schemaVersion': 1, 'source': 'retail-mus', 'filenameDigits': digits, 'scores': {}}
    for path in sorted(directory.glob('M_*.MUS')):
        data = path.read_bytes()
        score = decode_code(_sections(data, path.name)['CODE'].data)
        score.update(sourceSha256=hashlib.sha256(data).hexdigest())
        score['missingTracks'] = [f'{prefix}{track:0{digits}}.XMI' for prefix in score['prefixes']
                                 for track in score['trackIds']
                                 if not (directory / f'{prefix}{track:0{digits}}.XMI'.upper()).exists()]
        result['scores'][path.name] = score
    if not result['scores']:
        raise ValueError('no music score plugins found')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + '\n')
    return {name: {'tracks': score['trackIds'], 'missing': score['missingTracks']}
            for name, score in result['scores'].items()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--digits', type=int, choices=(2, 3), default=2)
    args = parser.parse_args()
    print(json.dumps(export(args.source, args.out, args.digits), indent=2))
