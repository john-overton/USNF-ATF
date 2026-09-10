"""Export native aircraft wind and tire samples; remake levels/loop points.

ServiceSounds: WIND at 0x42c5f7; TIRES 0x42c516 in the OnTheGround/gear branch.
"""
import argparse
import json
from pathlib import Path
from .combat_audio import export

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(export(args.source, args.out,
        {'wind': ['&WIND.11K'], 'rolling': ['&TIRES.5K']},
        {'archive': args.source.name, 'wind': 'ServiceSounds 0x42c5f7',
         'rolling': 'ServiceSounds 0x42c516; OnTheGround and gear branch',
         'mixing': 'remake levels and crossfaded loops'}), indent=2))
