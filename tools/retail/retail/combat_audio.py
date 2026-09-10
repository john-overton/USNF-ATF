"""Export original USNF effect samples. Event grouping is a remake adapter.

Native evidence: GRAPHICAddExp effect table 0x4c0de8 (48-byte records,
sound pointers at +10), ServiceSounds crash reference at 0x42c4da.
"""
import argparse
import io
import json
from pathlib import Path
import wave

from .audio import decode_pcm
from .audio_catalog import wav_preview
import hashlib

SOUNDS = {'impact': ['&BULLTS2.8K', '&BULLTS3.5K'],
          'explosion': ['&AIREXP1.11K', '&AIREXP2.11K'],
          'ground': ['&CRASH.5K'], 'water': ['&WTREXP1.5K', '&WTREXP2.5K'],
          'gearDown': ['&GEARDWN.5K'], 'gearUp': ['&GEARUP.5K'],
          'flapsDown': ['&FLAPOPN.5K'], 'flapsUp': ['&FLAPCLS.5K'],
          'stall': ['&STALL.5K'], 'playerHit': ['^IMHIT1.5K'],
          'outOfFuel': ['^OUTGAS.5K'], 'touchdown': ['&SQUEAL.5K'],
          'playerKill': ['^SPLBNDT.5K'],
          'terrainGround': ['&BULLTS1.5K', '&BULLTS4.5K'],
          'terrainWater': ['&SPLASH3.11K']}


def export(directory: Path, output: Path, sounds=None, provenance=None):
    clips = {}
    for role, names in (SOUNDS if sounds is None else sounds).items():
        clips[role] = []
        for name in names:
            data = (directory / name).read_bytes()
            if data.startswith(b'RIFF'):
                wav, _ = wav_preview(data, name)
                with wave.open(io.BytesIO(wav)) as stream:
                    if stream.getsampwidth() != 1 or stream.getnchannels() != 1:
                        raise ValueError('combat runtime requires unsigned mono PCM8')
                    clip = {'source': name, 'sha256': hashlib.sha256(data).hexdigest(),
                            'sampleRate': stream.getframerate(), 'encoding': 'unsigned8-mono',
                            'pcm': list(stream.readframes(stream.getnframes()))}
            else:
                clip = decode_pcm(data, name)
            clips[role].append(clip)
    result = {'schemaVersion': 1, 'source': 'retail-pcm',
              'mappingConfidence': 'native sample groups; remake event-to-effect adapter',
              'provenance': provenance or {'archive': directory.name,
                'gear': 'FMGear 0x4304a0', 'flapsAndHook': 'FMFlaps 0x4303a0 / FMHook 0x430440',
                'stall': 'FMFlight 0x46ada4; remake repeat cadence, not native LoopSound',
                'playerHit': 'PLANESayProc 0x48ef6d / text-resource table 0x4d43a0',
                'playerKill': 'PLANESayProc subtitle/resource table 0x4d42e8; credited player gun kill',
                'outOfFuel': 'SAYLowFuelMessage 0x48fa00; text/resource pair 0x4d44b0',
                'touchdown': 'ServiceSounds ground-entry gear branch; SQUEAL not BUMP',
                'bulletTerrain': 'M61/MK12 JT land expType15, water17; native effect table 0x4c0de8'},
              'clips': clips}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    return {role: [clip['source'] for clip in group] for role, group in clips.items()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(export(args.source, args.out), indent=2))
