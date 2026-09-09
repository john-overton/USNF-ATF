"""Export local raw unsigned PCM flight sounds selected by the retail PT record.

No retail bytes are shipped by this module. Rate conventions remain an inference;
see Docs/formats/audio.md. The JSON intentionally preserves original PCM bytes.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
from .pt import load_pt

RATES = {'.5K': 5512, '.8K': 8000, '.11K': 11025}
ROLES = {'jet': 'loopSound', 'burner': 'secondSound',
         'start': 'engineOnSound', 'stop': 'engineOffSound'}


def decode_pcm(data: bytes, name: str) -> dict:
    suffix = Path(name).suffix.upper()
    if suffix not in RATES:
        raise ValueError(f'unsupported raw PCM extension: {suffix}')
    if not data or len(data) > 1_000_000:
        raise ValueError('PCM size outside supported range')
    if data.startswith((b'RIFF', b'Creative Voice File')):
        raise ValueError('container is not raw PCM')
    return {'source': name, 'sha256': hashlib.sha256(data).hexdigest(),
            'sampleRate': RATES[suffix], 'encoding': 'unsigned8-mono', 'pcm': list(data)}


def export(pt_path: Path, output: Path) -> dict:
    pt = load_pt(str(pt_path))
    files = {p.name.upper(): p for p in pt_path.parent.iterdir() if p.is_file()}
    clips = {}
    for role, field in ROLES.items():
        name = pt.sounds.get(field)
        if not name or name.upper() not in files:
            raise ValueError(f'missing {field} sample: {name}')
        source = files[name.upper()]
        clips[role] = {**decode_pcm(source.read_bytes(), source.name), 'ptField': field}
    result = {'schemaVersion': 1, 'provenance': f'{pt_path.name} sound references',
              'aircraftSource': pt_path.name,
              'aircraftSha256': hashlib.sha256(pt_path.read_bytes()).hexdigest(),
              'rateConfidence': 'extension convention; executable mixer rates not recovered',
              'clips': clips}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pt', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    result = export(args.pt, args.out)
    print(json.dumps({k: {x: v for x, v in c.items() if x != 'pcm'}
                      for k, c in result['clips'].items()}, indent=2))


if __name__ == '__main__':
    main()
