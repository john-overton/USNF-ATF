"""Execute locally supplied USNF envelope routines with synthetic inputs only.

PYTHONPATH=tools/native extracted/native-flight/.venv/bin/python tools/native/envelope-oracle.py \
  --exe extracted/usnf97/SETUP.ESA/USNF.EXE --out extracted/native-flight/envelope-oracle.json
No game assets/code are written to the output; input EXE/SMS remain local.
"""
import argparse
import hashlib
import json
import random
import struct
from pathlib import Path
from oracle import load_pe, call, SCRATCH


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--exe', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    uc = load_pe(args.exe)
    seed = 90497
    rng = random.Random(seed)
    points = [{'speedFps': s, 'altitudeFt': h} for s, h in
              [(173, 0), (239, 13000), (427, 39000), (631, 55000),
               (1247, 55000), (1823, 36000), (1321, 0)]]
    cases = []
    for i in range(240):
        g = [-1, 0, 1, 4][i % 4]
        altitude_fixed = ([0, 13000*256, 55000*256, 55001*256][i] if i < 4
                          else rng.randrange(0, 60000*256))
        speed_fixed = rng.randrange(0, 2100*256)
        context = {'altitudeFixed': altitude_fixed, 'speedFixed': speed_fixed,
                   'flaps': bool(i % 2), 'seaLevelLimitFps': 1341, 'highAltitudeLimitFps': 2217}
        env = {'g': g, 'count': len(points), 'maxSpeedIndex': 5, 'points': points}
        raw = struct.pack('<hhhh', g, len(points), 0, 5)
        raw += b''.join(struct.pack('<Hi', p['speedFps'], p['altitudeFt']) for p in points)
        uc.mem_write(SCRATCH, raw.ljust(128, b'\0'))
        uc.mem_write(0x4d5586, struct.pack('<Ihhhh', SCRATCH, g, g, 1341, 2217))
        uc.mem_write(0x4d50f9, struct.pack('<i', altitude_fixed))
        uc.mem_write(0x4d5118, struct.pack('<i', speed_fixed))
        uc.mem_write(0x4d5253, struct.pack('<I', 256 if context['flaps'] else 0))
        outputs = SCRATCH + 0x1000
        uc.mem_write(outputs, struct.pack('<iii', -777777, -777777, -777777))
        call(uc, 0x483150, (SCRATCH, outputs, outputs+4, outputs+8))
        minimum, maximum, structural = struct.unpack('<iii', uc.mem_read(outputs, 12))
        uc.mem_write(outputs+16, b'\xcc')
        code = call(uc, 0x4830b0, (g, outputs+16)) & 255
        above = bool(uc.mem_read(outputs+16, 1)[0])
        cases.append({'envelope': env, 'context': context,
                      'expected': {'minimumFps': minimum, 'maximumFps': maximum, 'limitFps': structural},
                      'check': {'code': code, 'aboveMaxSpeedPoint': above}})
    output = {'exeSha256': hashlib.sha256(Path(args.exe).read_bytes()).hexdigest(),
              'oracle': 'Unicorn x86 real EXE routines; no import stubs', 'seed': seed, 'cases': cases}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(output, indent=2))
    print(f'{len(cases)} native synthetic cases written to {args.out}')

if __name__ == '__main__':
    main()
