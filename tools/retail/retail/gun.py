"""Export PT-selected gun, source JT and PCM; authored ballistics stay distinct."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
from .pt import load_pt
from .jt import load_jt
from .audio import decode_pcm
from .bullet import export_geometry


def export(pt_path: Path, output: Path, tracer_color: str | None = None) -> dict:
    pt = load_pt(str(pt_path))
    files = {p.name.upper(): p for p in pt_path.parent.iterdir() if p.is_file()}
    hards = [h for h in pt.hardpoints if (h.default_type or '').upper() in ('M61.JT', 'MK12.JT')]
    if len(hards) != 1:
        raise ValueError('Expected one supported internal gun hardpoint')
    hard = hards[0]
    jt_path = files[hard.default_type.upper()]
    jt = load_jt(str(jt_path))
    sound = files[(jt.fire_sound or '').upper()]
    m61 = jt_path.name.upper() == 'M61.JT'
    result = {
        'schemaVersion': 1, 'aircraftSource': pt_path.name,
        'aircraftSha256': hashlib.sha256(pt_path.read_bytes()).hexdigest(),
        'name': jt.long_name or jt.short_name, 'type': 'm61' if m61 else 'mk12-pair',
        'source': {'jt': jt_path.name, 'sha256': hashlib.sha256(jt_path.read_bytes()).hexdigest(),
                   'hardpointIndex': hard.index, 'hardpointFlags': hard.flags,
                   'hardpointPosition': list(hard.pos), 'rawProjectile': jt.proj},
        'capacity': hard.max_items,
        'damage': [int(jt.obj[f'damage[{i}]']) for i in range(5)],
        'muzzleSpeedMps': 1030 if m61 else 1005.84,
        'roundsPerSecond': 100 if m61 else 33.333333333333336,
        'tracerEvery': 5, 'tracerColor': tracer_color or ('green' if pt_path.name.upper() == 'F31.PT' else 'red'),
        'ballisticsNote': 'Authored: M61 6000 rpm, GD 1030 m/s; paired Mk12 1000 rpm each, NAVPERS 10826-B approximately 3300 ft/s. Gravity only; drag, dispersion and recoil not modeled. Damage exports the JT five-class table; runtime aircraft hardness selection is authored. One visible tracer per five actual rounds; belt color is an authored default, not decoded retail color.',
        'mounts': [[-0.6, -0.7, -2.5], [0.6, -0.7, -2.5]] if not m61 else ([[0, -0.5, -4]] if pt_path.name.upper() == 'F31.PT' else [[-0.5, 0, -6]]),
        'mountNote': 'Authored body-space metres, forward -Z; retail hardpoint units unverified.',
        'clip': decode_pcm(sound.read_bytes(), sound.name),
        'native': {
            'source': jt_path.name, 'sha256': hashlib.sha256(jt_path.read_bytes()).hexdigest(),
            'initialSpeedFps': jt.initial_speed, 'finalSpeedFps': jt.final_speed,
            'minSpeedFps': int(jt.obj['_minSpeed']), 'maxSpeedFps': int(jt.obj['_maxSpeed']),
            'decelerationFps2': int(jt.obj['_dacc']),
            'launchRetardPercent': int(jt.proj['launchRetard']) & 255,
            'actualRoundsPerProjectile': int(jt.proj['actualRoundsPerGame']) & 255,
            'intervalSeconds': (int(jt.proj['gameBurstT']) & 255) / 4,
            'lifetimeSeconds': jt.remove_t / 4,
            'maxRangeM': jt.zones[1].max_range * 0.3048,
            'gravityFps2': 32, 'terminalFallSpeedFps': 80,
        },
    }
    bullet = files.get((jt.shape or '').upper())
    palette = files.get('PALETTE.PAL')
    if bullet is not None and bullet.name.upper() == 'BULLET.SH' and palette is not None:
        result['bulletGeometry'] = export_geometry(bullet, palette)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pt', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--tracer-color', choices=['red', 'green'])
    args = parser.parse_args()
    result = export(args.pt, args.out, args.tracer_color)
    print(f"Gun: {result['type']}, {result['capacity']} rounds, {result['clip']['source']}")


if __name__ == '__main__':
    main()
