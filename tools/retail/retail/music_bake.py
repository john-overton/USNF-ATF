"""Bake all locally supplied XMI with the approved FluidSynth audition process.

Outputs are private, source-attributed, and never a claim of native bank fidelity.
Copy music-baked/ and flight-music-baked.json into appData/audio for runtime use.
The existing flight-music.json remains the authority for score sequencing.
"""
import argparse
import json
from pathlib import Path
import shutil

from .music_midi import export, instrument_readiness


def bake(source, output, soundfont, executable='fluidsynth'):
    root = Path(__file__).resolve().parents[3]
    target = output.resolve()
    if target.is_relative_to(root) and not target.is_relative_to(root / 'extracted'):
        raise ValueError('repository bake output must be under ignored extracted/')
    if target == source.resolve() or target.is_relative_to(source.resolve()):
        raise ValueError('bake output must be outside source directory')
    ready = instrument_readiness(soundfont, executable)
    if ready['status'] != 'ready-for-render-validation':
        raise ValueError('; '.join(ready['reasons']))
    paths = sorted(source.glob('*.XMI'))
    if not 1 <= len(paths) <= 256:
        raise ValueError('expected 1..256 XMI files')
    manifest = {'version': 1, 'rendering': 'fluidsynth-user-bank', 'tracks': {}}
    failures = []
    for path in paths:
        try:
            report = export(path, output / 'provenance' / path.stem, soundfont, executable)
            if 'rendered' not in report:
                raise ValueError(str(report['instruments']['reasons']))
            rendered = report['rendered']
            destination = output / 'music-baked' / rendered['path']
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(output / 'provenance' / path.stem / rendered['path'], destination)
            manifest['tracks'][report['sourceSha256']] = {
                'name': path.name, 'wavSha256': rendered['sha256'],
                'bankSha256': report['instruments']['soundfont']['sha256'],
                'bytes': destination.stat().st_size,
                'durationSeconds': report['durationSeconds'],
                'renderedSeconds': rendered['durationSeconds'],
                'limitations': report['limitations'],
            }
            print(f'{path.name}: rendered', flush=True)
        except (ValueError, OSError) as error:
            failures.append({'name': path.name, 'error': str(error)})
            print(f'{path.name}: FAILED {error}', flush=True)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'bake-report.json').write_text(json.dumps({
        'source': str(source), 'files': len(paths), 'rendered': len(paths) - len(failures),
        'uniqueSourceHashes': len(manifest['tracks']),
        'failures': failures, 'instruments': ready}, indent=2) + '\n')
    # Do not publish a partial manifest as a complete rebake.
    if failures:
        raise ValueError(f'{len(failures)} tracks failed; see bake-report.json')
    (output / 'flight-music-baked.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--soundfont', type=Path, required=True)
    parser.add_argument('--synth', default='fluidsynth')
    args = parser.parse_args()
    bake(args.source, args.out, args.soundfont, args.synth)
