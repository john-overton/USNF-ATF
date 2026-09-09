"""Differential inputs/results from locally supplied USNF97 executable routines.

No retail bytes are emitted. Results are ignored research artifacts; native
calls run under Unicorn without import stubs or replacement arithmetic.
"""
import argparse
import hashlib
import json
import random
import struct
from pathlib import Path
from oracle import load_pe, call, SCRATCH
from unicorn.x86_const import UC_X86_REG_ECX


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    uc = load_pe(args.exe)
    rng = random.Random(972026)
    def w32(address, value): uc.mem_write(address, struct.pack('<I', value & 0xffffffff))
    def w16(address, value): uc.mem_write(address, struct.pack('<H', value & 0xffff))
    def signed(value): return value if value < 0x80000000 else value - 0x100000000
    def r32(address): return struct.unpack('<i', uc.mem_read(address, 4))[0]
    cases = []
    for i in range(800):
        throttle = [-2147483648, -1, 0, 1, 25, 50, 75, 100, 101, 2147483647][i % 10] if i < 100 else rng.randint(-1000, 200)
        military, burner = rng.randint(-32768, 32767), rng.randint(-32768, 32767)
        w16(0x4d5629, military); w16(0x4d562b, burner)
        result = signed(call(uc, 0x430620, registers={UC_X86_REG_ECX: throttle}))
        cases.append({'routine': 'fuel', 'input': [throttle, military, burner], 'output': result})
    for i in range(800):
        current, target, rate = (rng.randint(-2147483648, 2147483647) for _ in range(3))
        delta = rng.randint(-32768, 32767)
        if i % 5 == 0: rate = 0
        if i % 7 == 0: target = current
        w32(SCRATCH, current); w16(0x521658, delta)
        call(uc, 0x497260, args=(SCRATCH, target, rate))
        cases.append({'routine': 'slew', 'input': [current, target, rate, delta], 'output': r32(SCRATCH)})
    for i in range(800):
        data = {'militaryThrust': rng.randint(-100000, 100000), 'afterburnerThrust': rng.randint(-150000, 150000) if i % 3 else 0,
                'afterburner': bool(i % 2), 'modeValue': i % 4, 'modeFlags': 0x10 if i % 3 else 0,
                'objectFlags': 0x80 if i % 5 else 0}
        for address, key in ((0x4d5617, 'militaryThrust'), (0x4d561b, 'afterburnerThrust'), (0x4c34bc, 'modeValue'), (0x4c35ac, 'modeFlags')): w32(address, data[key])
        uc.mem_write(0x4d50f4, bytes([data['objectFlags']]))
        result = signed(call(uc, 0x453630, registers={UC_X86_REG_ECX: int(data['afterburner'])}))
        cases.append({'routine': 'selection', 'input': data, 'output': result})
    for i in range(800):
        data = {'throttleF8': rng.randint(0, 25600), 'thrustScaleF8': rng.randint(0, 512),
                'speedF8': rng.randint(0, 400000), 'forwardSpeedBound': rng.randint(1, 3000), 'selectedThrust': rng.randint(1, 200000)}
        for address, key in ((0x4d52d2, 'throttleF8'), (0x52ddf0, 'thrustScaleF8'), (0x4d5118, 'speedF8'), (0x4d5617, 'selectedThrust')): w32(address, data[key])
        w16(0x52de0a, data['forwardSpeedBound'])
        w32(0x4d5253, 0); w32(0x4c34bc, 0); w32(0x4d52da, 0)
        call(uc, 0x46a360, args=(SCRATCH, SCRATCH + 4))
        if r32(SCRATCH + 4) != 0: raise AssertionError('zero vector angle produced vertical force')
        cases.append({'routine': 'scalar', 'input': data, 'output': r32(SCRATCH)})
    result = {'executableSha256': hashlib.sha256(args.exe.read_bytes()).hexdigest(), 'seed': 972026,
              'scope': 'Synthetic inputs; exact native routine execution; no Windows game run or SI/time conversion', 'cases': cases}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print(f'Wrote {len(cases)} native power comparisons to {args.out}')


if __name__ == '__main__': main()
