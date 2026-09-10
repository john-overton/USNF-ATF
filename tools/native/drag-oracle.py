"""Run bounded native drag/sound routines using synthetic inputs and local PE.

No executable bytes or retail assets are emitted. This proves isolated helper
arithmetic, not complete game flight or integration timing.
"""
import argparse
import hashlib
import json
import random
import struct
from pathlib import Path
from oracle import load_pe, call, SCRATCH, STACK, STOP
from unicorn.x86_const import UC_X86_REG_ECX, UC_X86_REG_ESP, UC_X86_REG_EDI, UC_X86_REG_EIP, UC_X86_REG_ESI


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    uc = load_pe(args.exe)
    seed = 974106
    rng = random.Random(seed)

    def w32(address, value):
        uc.mem_write(address, struct.pack('<I', value & 0xffffffff))

    def w16(address, value):
        uc.mem_write(address, struct.pack('<H', value & 0xffff))

    def signed(value):
        return value if value < 0x80000000 else value - 0x100000000

    cases = []
    for i in range(800):
        altitude = ([0, 36000 * 256, 60000 * 256, -100 * 256][i]
                    if i < 4 else rng.randint(-1000 * 256, 65000 * 256))
        result = signed(call(uc, 0x498010, registers={UC_X86_REG_ECX: altitude}))
        cases.append({'routine': 'sound', 'input': altitude, 'output': result})
    for i in range(1200):
        data = {'speedF8': rng.randint(-3000 * 256, 3000 * 256),
                'altitudeF8': rng.randint(-1000 * 256, 65000 * 256),
                'forwardSpeedBound': rng.randint(1, 3000)}
        w32(0x4d5118, data['speedF8'])
        w32(0x4d50f9, data['altitudeF8'])
        w16(0x52de0a, data['forwardSpeedBound'])
        result = signed(call(uc, 0x46a580))
        cases.append({'routine': 'dragPercent', 'input': data, 'output': result})
    for i in range(1200):
        data = {'speedF8': rng.randint(0, 2200 * 256),
                'altitudeF8': rng.randint(0, 60000 * 256),
                'forwardSpeedBound': rng.randint(500, 2500),
                'adjustedCoefDrag': rng.randint(128, 400),
                'throttleF8': 0 if i % 5 == 0 else rng.randint(256, 25600),
                'onGround': bool(i % 7 == 0), 'pitchAngle': rng.randint(-16384, 16384),
                'militaryThrust': rng.randint(10000, 50000),
                'afterburnerThrust': 0 if i % 3 == 0 else rng.randint(30000, 80000),
                'loadFactorF8': rng.randint(-4 * 256, 12 * 256),
                'gPullDrag': rng.randint(0, 30), 'weightLb': rng.randint(30000, 80000),
                'rudderF8': rng.randint(-256, 256), 'rudderDrag': rng.randint(0, 200),
                'flags': rng.choice([0, 0x40, 0x80, 0x100, 0x200, 0x1c0]),
                'gearDrag': rng.randint(0, 200), 'flapsDrag': rng.randint(0, 200),
                'airBrakesDrag': rng.randint(0, 400), 'bayDrag': rng.randint(0, 100),
                'wheelBrakesDrag': rng.randint(0, 20)}
        for address, key in ((0x4d5118, 'speedF8'), (0x4d50f9, 'altitudeF8'),
                             (0x52de28, 'adjustedCoefDrag'), (0x4d52d2, 'throttleF8'),
                             (0x4d5617, 'militaryThrust'), (0x4d561b, 'afterburnerThrust'),
                             (0x4d527f, 'loadFactorF8'), (0x4d52e6, 'weightLb'),
                             (0x52ddd8, 'rudderF8'), (0x4d5253, 'flags')):
            w32(address, data[key])
        for address, key in ((0x52de0a, 'forwardSpeedBound'), (0x4d5103, 'pitchAngle'),
                             (0x4d5633, 'gPullDrag'), (0x4d55d4, 'rudderDrag'),
                             (0x4d563b, 'gearDrag'), (0x4d5639, 'flapsDrag'),
                             (0x4d5635, 'airBrakesDrag'), (0x4d563d, 'bayDrag'),
                             (0x4d5637, 'wheelBrakesDrag')):
            w16(address, data[key])
        uc.mem_write(0x52de20, bytes([int(data['onGround'])]))
        # Isolate supplied adjusted coefficients from load/difficulty/MP state.
        uc.mem_write(0x4d50f4, b'\0')
        w32(0x4c34bc, 0)
        w16(0x4d5341, 0)
        w16(0x4d5343, 0)
        w16(0x4d5643, 0)
        call(uc, 0x46a410)
        result = struct.unpack('<i', uc.mem_read(0x52ddbc, 4))[0]
        cases.append({'routine': 'dragForce', 'input': data, 'output': result})
    # Execute original caller slices (without patching code or replacing calls).
    # The omitted prologue only allocates stack/saves registers. Stop before the
    # subsequent unrelated field updates; all calls inside each slice run real.
    bound_cases = []
    points = [(173, 0), (427, 39000), (631, 55000), (1247, 55000),
              (1823, 36000), (1321, 0)]
    raw = struct.pack('<hhhh', 1, len(points), 2, 4)
    raw += b''.join(struct.pack('<Hi', *point) for point in points)
    uc.mem_write(SCRATCH, raw.ljust(128, b'\0'))
    w32(0x4d5586, SCRATCH)
    w16(0x4d558a, 1)
    w16(0x4d558c, 1)
    w16(0x4d558e, 1300)
    w16(0x4d5590, 2000)
    for altitude in (0, 18000, 36000, 50000, 55000, 55001):
        w32(0x4d50f9, altitude * 256)
        w32(0x4d5253, 0)
        uc.reg_write(UC_X86_REG_ESP, STACK + 0x80000)
        uc.emu_start(0x430c56, 0x430caa, count=100000)
        if uc.reg_read(UC_X86_REG_EIP) != 0x430caa:
            raise RuntimeError('bound caller exceeded instruction limit')
        runtime = struct.unpack('<h', uc.mem_read(0x4d5329, 2))[0]
        uc.reg_write(UC_X86_REG_EDI, 0x52de08)
        uc.emu_start(0x46a1ca, 0x46a1d8, count=100000)
        if uc.reg_read(UC_X86_REG_EIP) != 0x46a1d8:
            raise RuntimeError('bound copy exceeded instruction limit')
        copied = struct.unpack('<h', uc.mem_read(0x52de0a, 2))[0]
        if runtime != copied:
            raise AssertionError('runtime bound was not preserved by COBv copy')
        bound_cases.append({'altitudeFt': altitude, 'runtimeBound': runtime,
                            'forceBound': copied})
    load_cases = []
    for i in range(800):
        data = {'emptyWeightLb': rng.randint(20000, 50000),
                'loadAWeightLb': rng.randint(0, 30000),
                'loadBWeightLb': 0 if i % 2 == 0 else rng.randint(0, 15000),
                'coefDrag': rng.randint(128, 400), 'gPullDrag': rng.randint(0, 30),
                'loadedDrag': rng.randint(0, 100), 'loadedGpullDrag': rng.randint(0, 100)}
        data['maxWeightLb'] = data['emptyWeightLb'] + rng.randint(10000, 40000)
        w32(0x4d551f, data['emptyWeightLb'])
        w32(0x4d5680, data['maxWeightLb'])
        if i % 2 == 0:
            # Complete FMGetWeight with internal fuel only, no hardpoints.
            w32(0x4c35a8, 0)
            uc.mem_write(0x4d557d, b'\0')
            w32(0x4d52e0, data['loadAWeightLb'] * 256 + 127)
            call(uc, 0x42ff30)
        else:
            # Native post-hardpoint accumulation tail; recreate saved-register
            # stack slots so its real epilogue returns to the sentinel.
            call(uc, 0x430025, args=(0, 0, 0, 0, 0, STOP),
                 registers={UC_X86_REG_ESI: data['loadAWeightLb'],
                            UC_X86_REG_EDI: data['loadBWeightLb']})
        weight = struct.unpack('<i', uc.mem_read(0x4d52e6, 4))[0]
        a, b = struct.unpack('<hh', uc.mem_read(0x4d5341, 4))
        for address, key in ((0x4d5631, 'coefDrag'), (0x4d5633, 'gPullDrag'),
                             (0x4d5641, 'loadedDrag'), (0x4d5643, 'loadedGpullDrag')):
            w16(address, data[key])
        uc.mem_write(0x4d50f4, b'\0')
        uc.reg_write(UC_X86_REG_ESP, STACK + 0x80000)
        uc.emu_start(0x46a130, 0x46a1ca, count=100000)
        if uc.reg_read(UC_X86_REG_EIP) != 0x46a1ca:
            raise RuntimeError('load coefficient setup exceeded instruction limit')
        adjusted = struct.unpack('<i', uc.mem_read(0x52de28, 4))[0]
        gpull = signed(call(uc, 0x453910))
        load_cases.append({'input': data, 'output': {'weightLb': weight,
                           'loadA': a, 'loadB': b, 'adjustedCoefDrag': adjusted,
                           'adjustedGPullDrag': gpull}})
    output = {'executableSha256': hashlib.sha256(args.exe.read_bytes()).hexdigest(),
              'seed': seed, 'scope': 'Synthetic inputs, exact native execution, no arithmetic stubs',
              'cases': cases, 'loadCases': load_cases, 'boundTrace': {'syntheticPoints': points, 'cases': bound_cases}}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(output, separators=(',', ':')) + '\n')
    print(f'Wrote {len(cases)} drag and {len(load_cases)} load comparisons to {args.out}')


if __name__ == '__main__':
    main()
