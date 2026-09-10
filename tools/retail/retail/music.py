"""Bounded local XMIDI note extraction, not an AIL driver or native music dispatcher.

Protocol cross-check: https://github.com/scummvm/scummvm/blob/master/audio/midiparser_xmidi.cpp
(read 2026-09-10): additive delays, VLQ durations, fixed 120 ticks/sec regardless
of tempo metadata; zero-duration notes occupy one tick. This is an independent
implementation of those format rules, not copied source. One linear EVNT pass is
exported. Controller and pitch-bend events are preserved; the engine renders a
documented subset. Branch/loop behavior, TIMB bank selection, sustain and native
instrument synthesis are not reproduced. Channel 9 remains percussion.

The five AIR selections below are authored situational assignments, NOT recovered
USNF dispatch semantics. Exported notes are retail-derived and must stay local.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import struct
from .mnu import _sections
from .music_scores import decode_code

MAX_BYTES = 4 * 1024 * 1024
MAX_NOTES = 20000
MAX_TICKS = 600 * 120
TICKS_PER_SECOND = 120
# Representatives from recovered NORMAL/AIR/DANGER/SUCC/EJECT score groups.
# Fixed selection and defeat->EJECT remain remake adapters, not the native VM.
TRACKS = {'cruise': 'AIR02.XMI', 'combat': 'AIR04.XMI', 'danger': 'AIR01.XMI',
          'victory': 'AIR03.XMI', 'defeat': 'AIR10.XMI'}


def chunks(data: bytes, start: int, end: int):
    """IFF big-endian chunk bounds, including mandatory odd-byte padding."""
    while start < end:
        if end - start < 8:
            raise ValueError('truncated IFF chunk header')
        tag = data[start:start + 4]
        size = struct.unpack_from('>I', data, start + 4)[0]
        payload = start + 8
        stop = payload + size
        padded = stop + (size & 1)
        if padded > end:
            raise ValueError('IFF chunk exceeds parent bounds or lacks padding')
        yield tag, payload, stop
        start = padded


def event_chunks(data: bytes) -> list[bytes]:
    if not data or len(data) > MAX_BYTES:
        raise ValueError('XMI size outside supported range')
    roots = list(chunks(data, 0, len(data)))
    expected = 1
    if len(roots) == 2 and roots[0][0] == b'FORM':
        _, start, end = roots[0]
        if data[start:start + 4] != b'XDIR' or end - start < 4:
            raise ValueError('expected XDIR form')
        infos = [(p, e) for tag, p, e in chunks(data, start + 4, end) if tag == b'INFO']
        if len(infos) != 1 or infos[0][1] - infos[0][0] != 2:
            raise ValueError('XDIR needs one two-byte INFO')
        expected = struct.unpack_from('<H', data, infos[0][0])[0]
        if expected < 1 or expected > 32:
            raise ValueError('invalid XMI track count')
        tag, start, end = roots[1]
        if tag != b'CAT ' or end - start < 4 or data[start:start + 4] != b'XMID':
            raise ValueError('expected CAT XMID')
        forms = list(chunks(data, start + 4, end))
    elif len(roots) == 1 and roots[0][0] == b'FORM':
        forms = roots
    else:
        raise ValueError('expected FORM XMID or XDIR/CAT XMID')
    tracks = []
    for tag, start, end in forms:
        if tag != b'FORM' or end - start < 4 or data[start:start + 4] != b'XMID':
            raise ValueError('expected XMID track form')
        events = []
        branches = []
        for tag, begin, stop in chunks(data, start + 4, end):
            payload = data[begin:stop]
            if tag == b'EVNT':
                events.append(payload)
            elif tag == b'TIMB':
                if len(payload) < 2 or len(payload) != 2 + 2 * int.from_bytes(payload[:2], 'little'):
                    raise ValueError('invalid TIMB count/bounds')
            elif tag == b'RBRN':
                if len(payload) < 2 or len(payload) != 2 + 6 * int.from_bytes(payload[:2], 'little'):
                    raise ValueError('invalid RBRN count/bounds')
                branches.extend(int.from_bytes(payload[i + 2:i + 6], 'little')
                                for i in range(2, len(payload), 6))
            else:
                raise ValueError(f'unsupported XMI chunk {tag!r}')
        if len(events) != 1:
            raise ValueError('each XMID form needs exactly one EVNT')
        if any(offset >= len(events[0]) for offset in branches):
            raise ValueError('RBRN offset outside EVNT bounds')
        tracks.append(events[0])
    if len(tracks) != expected:
        raise ValueError('XDIR track count does not match CAT')
    return tracks


def decode_events(data: bytes) -> tuple[list[dict], float, dict]:
    cursor = 0
    tick = 0
    notes: list[dict] = []
    programs = [0] * 16
    active: dict[tuple[int, int], list[int]] = {}
    controls: Counter[int] = Counter()
    ignored: Counter[str] = Counter()
    channel_events = []
    ended = False

    def take(count: int) -> bytes:
        nonlocal cursor
        if count < 0 or count > len(data) - cursor:
            raise ValueError('truncated EVNT event')
        result = data[cursor:cursor + count]
        cursor += count
        return result

    def vlq() -> int:
        value = 0
        for _ in range(4):
            byte = take(1)[0]
            value = (value << 7) | (byte & 127)
            if byte < 128:
                return value
        raise ValueError('EVNT VLQ exceeds four bytes')

    def midi(count: int) -> bytes:
        values = take(count)
        if any(value >= 128 for value in values):
            raise ValueError('MIDI data byte contains status bit')
        return values

    def stop_note(channel: int, pitch: int):
        for index in active.pop((channel, pitch), []):
            note = notes[index]
            note['durationSeconds'] = max(0, min(note['durationSeconds'], tick / 120 - note['timeSeconds']))

    while cursor < len(data):
        while cursor < len(data) and data[cursor] < 128:
            tick += take(1)[0]
            if tick > MAX_TICKS:
                raise ValueError('XMI duration exceeds 600 seconds')
        status = take(1)[0]
        command, channel = status >> 4, status & 15
        if command == 9:
            pitch, velocity = midi(2)
            duration = max(1, vlq())
            if tick + duration > MAX_TICKS:
                raise ValueError('XMI note end exceeds 600 seconds')
            if velocity:
                if len(notes) >= MAX_NOTES:
                    raise ValueError('XMI exceeds 20000 notes')
                active.setdefault((channel, pitch), []).append(len(notes))
                notes.append({'timeSeconds': tick / 120, 'durationSeconds': duration / 120,
                              'note': pitch, 'velocity': velocity, 'channel': channel,
                              'program': programs[channel]})
            else:
                stop_note(channel, pitch)
        elif command == 8:
            pitch, _ = midi(2)
            stop_note(channel, pitch)
        elif command == 12:
            programs[channel] = midi(1)[0]
        elif command == 11:
            controller, value = midi(2)
            controls[controller] += 1
            channel_events.append({'timeSeconds': tick / 120, 'channel': channel,
                'kind': 'controller', 'controller': controller, 'value': value})
        elif command == 14:
            low, high = midi(2)
            channel_events.append({'timeSeconds': tick / 120, 'channel': channel,
                'kind': 'pitch-bend', 'value': low + high * 128})
        elif command in (10, 13):
            midi(1 if command == 13 else 2)
            ignored[hex(status & 0xf0)] += 1
        elif status == 255:
            kind = midi(1)[0]
            payload = take(vlq())
            if kind == 47:
                # Local AIR files count one zero alignment byte inside EVNT size.
                # Accept only that exact odd-position alignment, not trailing events.
                tail = data[cursor:]
                if payload or (tail and not (cursor % 2 and tail == b'\x00')):
                    raise ValueError('invalid EOT or bytes after EOT')
                ended = True
                break
            if kind == 81 and len(payload) != 3:
                raise ValueError('invalid tempo meta length')
            ignored[f'meta-{kind:02x}'] += 1
        elif status in (240, 247):
            take(vlq())
            ignored['sysex'] += 1
        else:
            raise ValueError(f'unsupported EVNT status {status:#x}')
    if not ended:
        raise ValueError('EVNT missing end-of-track')
    notes = [note for note in notes if note['durationSeconds'] > 0]
    if len(channel_events) > 20000:
        raise ValueError('XMI channel event budget exceeded')
    # The linear phrase ends at EOT or at the last scheduled release, whichever is later.
    duration = max(tick / 120, max((n['timeSeconds'] + n['durationSeconds'] for n in notes), default=0))
    return notes, duration, {'controllers': dict(controls), 'ignoredEvents': dict(ignored),
                            'channelEvents': channel_events}


def decode(data: bytes, name: str) -> tuple[dict, dict]:
    tracks = event_chunks(data)
    if len(tracks) != 1:
        raise ValueError('music exporter supports single-sequence XMI only')
    notes, duration, report = decode_events(tracks[0])
    if not notes or duration <= 0:
        raise ValueError('XMI has no playable notes')
    channel_events = report.pop('channelEvents')
    return {'name': name, 'sourceSha256': hashlib.sha256(data).hexdigest(),
            'durationSeconds': duration, 'notes': notes, 'channelEvents': channel_events}, report


def export(directory: Path, output: Path) -> dict:
    result = {'version': 1, 'source': 'retail-xmi', 'tracks': {}}
    reports = {}
    for role, name in TRACKS.items():
        path = directory / name
        track, details = decode(path.read_bytes(), name)
        result['tracks'][role] = track
        reports[role] = {key: value for key, value in track.items() if key not in ('notes', 'channelEvents')}
        reports[role]['channelEventCount'] = len(track['channelEvents'])
        reports[role].update(noteCount=len(track['notes']), **details)
    # Optional complete score library; existing representative-only imports still load.
    modules = {'cruise': 'M_NORMAL.MUS', 'combat': 'M_AIR.MUS', 'danger': 'M_DANGER.MUS',
               'victory': 'M_SUCC.MUS', 'defeat': 'M_EJECT.MUS'}
    if all((directory / name).exists() for name in modules.values()):
        result['scores'] = {}
        result['library'] = {}
        for role, name in modules.items():
            data = (directory / name).read_bytes()
            code = _sections(data, name)['CODE'].data
            score = decode_code(code)
            result['scores'][role] = {'sourceSha256': hashlib.sha256(data).hexdigest(), 'code': list(code)}
            for prefix in score['prefixes']:
                for number in score['trackIds']:
                    track_name = f'{prefix}{number:02d}.XMI'.upper()
                    if track_name not in result['library']:
                        result['library'][track_name] = decode((directory / track_name).read_bytes(), track_name)[0]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    return reports


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(export(args.source, args.out), indent=2))


if __name__ == '__main__':
    main()
