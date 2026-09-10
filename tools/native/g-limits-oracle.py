"""Execute a bounded USNF G-limit instruction slice with synthetic polygons.

Requires local USNF.EXE and the existing isolated Unicorn environment. No native
bytes are copied to outputs. This is slice parity, not full FMFlight execution.
"""
import argparse
import hashlib
import json
import random
import struct
from pathlib import Path

from oracle import load_pe, call, SCRATCH, STACK
from unicorn.x86_const import UC_X86_REG_ESP, UC_X86_REG_EIP, UC_X86_REG_ECX, UC_X86_REG_EDX

START, END = 0x430937, 0x430c56


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--exe', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--profile', help='Optional local imported retail profile; output remains ignored')
    args = parser.parse_args()
    if args.profile:
        native = json.loads(Path(args.profile).read_text())['native']
    else:
        rows = []
        for g in range(-3, 10):
            magnitude = max(1, abs(g))
            low, high = 100 + magnitude * 24, 1450 - magnitude * 69
            ceiling = 60000 - magnitude * 4500
            points = [{'speedFps': speed, 'altitudeFt': altitude} for speed, altitude in
                      [(low, 0), (low + 60, ceiling // 2),
                       ((low + high) // 2, ceiling), (high, 0)]]
            rows.append({'g': g, 'count': 4, 'stallLiftIndex': 1,
                         'maxSpeedIndex': 3, 'points': points})
        native = {'envelopes': rows,
                  'structuralSpeedFps': {'seaLevel': 1500, 'at36000Ft': 2000}}
    rows = native['envelopes']
    g_min, g_max = min(row['g'] for row in rows), max(row['g'] for row in rows)
    if sorted(row['g'] for row in rows) != list(range(g_min, g_max + 1)):
        raise ValueError('Native G rows must be contiguous')
    uc = load_pe(args.exe)
    raw = b''
    for row in sorted(rows, key=lambda row: row['g']):
        encoded = struct.pack('<hhhh', row['g'], row['count'],
                              row['stallLiftIndex'], row['maxSpeedIndex'])
        encoded += b''.join(struct.pack('<Hi', p['speedFps'], p['altitudeFt'])
                            for p in row['points'])
        if len(encoded) > 128:
            raise ValueError('Envelope exceeds native row size')
        raw += encoded.ljust(128, b'\0')
    uc.mem_write(SCRATCH, raw)
    limits = native['structuralSpeedFps']
    uc.mem_write(0x4d5586, struct.pack('<Ihhhh', SCRATCH, g_min, g_max,
                                     limits['seaLevel'], limits['at36000Ft']))

    def write(address, value, fmt='i'):
        uc.mem_write(address, struct.pack('<' + fmt, value))

    seed = 90997
    rng = random.Random(seed)
    cases = []
    inputs = [(height * 256, speed * 256) for height in [0, 1, 10000, 36000, 60000]
              for speed in [0, 99, 100, 200, 350, 550, 900, 1499, 1500, 2000]]
    inputs += [(rng.randrange(0, 65000 * 256), rng.randrange(0, 2100 * 256))
               for _ in range(150)]
    for altitude_fixed, speed_fixed in inputs:
        for player, easier in [(True, False), (True, True), (False, False)]:
            context = {'altitudeFixed': altitude_fixed, 'speedFixed': speed_fixed,
                       'flaps': bool(len(cases) % 2), 'player': player,
                       'easier': easier, 'skill': (len(cases) // 3) % 4,
                       'loadA': 20 if len(cases) % 5 == 0 else 0,
                       'loadB': 10 if len(cases) % 7 == 0 else 0,
                       'loadedElevator': 17}
            write(0x4d50f9, altitude_fixed)
            write(0x4d5118, speed_fixed)
            write(0x4d5253, 256 if context['flaps'] else 0)
            write(0x4d5341, context['loadA'], 'h')
            write(0x4d5343, context['loadB'], 'h')
            write(0x4d5645, context['loadedElevator'], 'h')
            write(0x4d50f4, 0x80 if player else 0, 'B')
            write(0x4d51c6, context['skill'], 'B')
            write(0x4c35a8, 0x20 if easier else 0)
            uc.reg_write(UC_X86_REG_ESP, STACK + 0x80000)
            uc.emu_start(START, END, count=100000)
            if uc.reg_read(UC_X86_REG_EIP) != END:
                raise RuntimeError('Native slice did not reach its boundary')
            low, high = struct.unpack('<hh', uc.mem_read(0x4d533b, 4))
            cases.append({'context': context,
                          'expected': {'minimumGFixed': low, 'maximumGFixed': high}})
    low_speed_cases = []
    turn_cases = []
    for minimum_speed in [0, 100, 173, 500]:
        for speed_fixed in [-200000, -1, 0, 1, 125 * 256, 345 * 256,
                            346 * 256, 347 * 256, 1000 * 256]:
            for low, high in [(-1024, 2304), (0, 512), (-751, 1905)]:
                outputs = SCRATCH + 0x10000
                write(outputs, low)
                write(outputs + 4, high)
                write(0x4d5118, speed_fixed)
                write(0x52de24, minimum_speed)
                call(uc, 0x478950, (outputs, outputs + 4, 256))
                result_low, result_high = struct.unpack('<ii', uc.mem_read(outputs, 8))
                low_speed_cases.append({'speedFixed': speed_fixed,
                                        'minimumSpeedFps': minimum_speed,
                                        'minimumGFixed': low, 'maximumGFixed': high,
                                        'expected': {'minimumGFixed': result_low,
                                                     'maximumGFixed': result_high}})
    for speed in [-1, 0, 124, 125, 126, 346, 700, 1200, 30000]:
        for g_fixed in [-32768, -1024, -1, 0, 1, 256, 2048, 32767]:
            result = call(uc, 0x478b70, registers={UC_X86_REG_ECX: g_fixed,
                                                  UC_X86_REG_EDX: speed})
            signed = struct.unpack('<i', struct.pack('<I', result))[0]
            turn_cases.append({'speedFps': speed, 'gFixed': g_fixed,
                               'expectedTurnRateFixed': signed})
    result = {'exeSha256': hashlib.sha256(Path(args.exe).read_bytes()).hexdigest(),
              'scope': 'Actual native instruction slice 0x430937..0x430c56; no import stubs; '
                       'excludes caller weight update and later force/control integration',
              'seed': seed, 'synthetic': not bool(args.profile), 'native': native, 'cases': cases,
              'lowSpeedCases': low_speed_cases, 'turnCases': turn_cases}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(result, indent=2) + '\n')
    print(f'{len(cases)} native G-limit slice cases written to {args.out}')


if __name__ == '__main__':
    main()
