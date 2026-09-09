"""Execute native gear-pitch and ground-pitch helpers with synthetic terrain.

PYTHONPATH=tools/native:tools/retail extracted/native-flight/.venv/bin/python \
  tools/native/gear-pitch-oracle.py --exe extracted/usnf97/SETUP.ESA/USNF.EXE \
  --pt extracted/usnf97/USNF_2.LIB/F14.PT --out extracted/native-flight/gear-pitch-oracle.json

The ONLY replacement is _T_Info, the terrain provider, returning fixture height
and orientation. Ground predicate, envelope lookup, target arithmetic, angle
slew and ground-angle conversion execute actual x86. No full game parity claim.
Output contains synthetic values and aggregate PT facts, never executable bytes.
"""
import argparse
import hashlib
import json
import random
import struct
from pathlib import Path
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_EIP, UC_X86_REG_ESP
from oracle import call, load_pe, SCRATCH
from retail.pt import load_pt


def signed16(value):
    return (value + 32768) % 65536 - 32768


def trunc(n, d):
    return (abs(n) // abs(d)) * (-1 if (n < 0) != (d < 0) else 1)


def expected(case):
    top = case['takeoffSpeedFps']
    lower = top - (top >> 2)
    target = 0
    if case['flags'] & 0x40 and case['altitudeF8'] <= case['terrainHeightF8'] + 256 and top != lower:
        speed = min(top, max(lower, case['speedF8'] >> 8))
        product = signed16(case['gearPitch'] * 182)
        target = signed16(trunc((top - speed) * product, top - lower))
    current = case['currentAngle']
    delta = signed16(target - current)
    step = abs(trunc(case['deltaTicks'] * 1820, 256))
    return {'targetAngle': target, 'currentAngle': target if abs(delta) <= step else signed16(current + (step if delta >= 0 else -step))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', required=True, type=Path)
    parser.add_argument('--pt', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    digest = hashlib.sha256(args.exe.read_bytes()).hexdigest()
    if digest != 'ecd3eb067f624fe48ea6547e8d4b80d1232723a9b7e0113f77d0e94fcb14caf9':
        raise ValueError('Routine addresses belong to the documented USNF97 executable only')
    plane = load_pt(str(args.pt))
    uc = load_pe(args.exe)
    fixture = {'height': 0, 'pitch': 0, 'roll': 0}

    def w16(address, value): uc.mem_write(address, struct.pack('<H', value & 65535))
    def w32(address, value): uc.mem_write(address, struct.pack('<I', value & 0xffffffff))
    def r16(address): return struct.unpack('<h', uc.mem_read(address, 2))[0]
    def r32(address): return struct.unpack('<i', uc.mem_read(address, 4))[0]

    def terrain_hook(machine, address, size, context):
        stack = machine.reg_read(UC_X86_REG_ESP)
        ret, _, _, _, orientation, _, _ = struct.unpack('<7I', machine.mem_read(stack, 28))
        if orientation:
            w16(orientation + 2, fixture['pitch'])
            w16(orientation + 4, fixture['roll'])
        machine.reg_write(UC_X86_REG_EAX, fixture['height'] & 0xffffffff)
        machine.reg_write(UC_X86_REG_ESP, stack + 28)
        machine.reg_write(UC_X86_REG_EIP, ret)

    uc.hook_add(UC_HOOK_CODE, terrain_hook, begin=0x408120, end=0x408120)
    seed = 9792026
    rng = random.Random(seed)
    cases = []
    for i in range(1000):
        top = [0, 1, 3, 4, 170, 65535][i % 6] if i < 60 else rng.randint(4, 5000)
        height = rng.randint(-100000, 100000)
        case = {
            'flags': 0x40 if i % 3 else 0,
            'altitudeF8': height + [0, 256, 257, -1][i % 4],
            'terrainHeightF8': height,
            'takeoffSpeedFps': top,
            'speedF8': rng.randint(-100, top + 100) * 256 + rng.randint(0, 255),
            'gearPitch': rng.randint(-180, 180),
            'currentAngle': rng.randint(-32768, 32767),
            'deltaTicks': [0, 1, 4, 256, -4, 32767, -32768][i % 7],
        }
        if i >= 990:
            case.update(gearPitch=plane.plane['gearPitch'], takeoffSpeedFps=plane.level_envelope.points[0][0], flags=0x40, altitudeF8=height)
        fixture['height'] = height
        w32(0x4d5253, case['flags'])
        w32(0x4d50f9, case['altitudeF8'])
        w32(0x4d5118, case['speedF8'])
        w16(0x4d5608, case['gearPitch'])
        w16(0x4d52ea, case['currentAngle'])
        w16(0x521658, case['deltaTicks'])
        w32(0x4d5586, SCRATCH)
        w16(0x4d558a, 1)
        w16(0x4d558c, 1)
        w16(SCRATCH + 8, top if i < 990 else case['takeoffSpeedFps'])
        call(uc, 0x42fd40)
        actual = {'targetAngle': r16(0x4d52ec), 'currentAngle': r16(0x4d52ea)}
        assert actual == expected(case), (i, case, actual, expected(case))
        cases.append({'input': case, 'actual': actual})
    ground = []
    for pitch in [-32768, -1820, -1, 0, 1, 1820, 32767]:
        for offset in [0, 256, 257]:
            fixture.update(height=12345, pitch=pitch, roll=0)
            w32(0x4d50f9, fixture['height'] + offset)
            call(uc, 0x46a940)
            actual = {'groundPitchF8': r32(0x52ddb8), 'groundHeightF8': r32(0x52dddc), 'onGround': bool(uc.mem_read(0x52de20, 1)[0])}
            assert actual == {'groundPitchF8': trunc(pitch * 1406 + 500, 1000), 'groundHeightF8': fixture['height'], 'onGround': offset <= 256}
            ground.append({'terrainPitchAngle': pitch, 'heightOffsetF8': offset, 'actual': actual})
    result = {
        'exeSha256': digest, 'ptSha256': hashlib.sha256(args.pt.read_bytes()).hexdigest(),
        'seed': seed, 'scope': 'Actual x86 with _T_Info synthetic terrain hook ONLY; no Windows launch or full flight parity',
        'ptFacts': {'gearPitch': plane.plane['gearPitch'], 'takeoffSpeedFps': plane.level_envelope.points[0][0]},
        'gearCases': cases, 'groundCases': ground,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2) + '\n')
    print(f'{len(cases)} gear-pitch and {len(ground)} ground-pitch cases matched native x86: {args.out}')


if __name__ == '__main__': main()
