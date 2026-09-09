#!/usr/bin/env python3
"""Create a local Instruments Metal template selecting Apple's Performance Limiters.

Xcode 16.0 (17F42) on M3 uses profile 13. The private archive format is version
specific: never modify Xcode's template, and verify the exported counter names.
"""
import argparse
import copy
import plistlib
from pathlib import Path
import subprocess


def configure(archive, profile=13):
    archive = copy.deepcopy(archive)
    objects = archive['$objects']
    changed = []
    for item in list(objects):
        if not isinstance(item, dict) or 'NS.keys' not in item:
            continue
        for index, key in enumerate(item['NS.keys']):
            name = objects[key.data]
            if name in ('counterprofile', 'counterprofileinternal'):
                item['NS.objects'][index] = plistlib.UID(len(objects))
                objects.append(profile)
                changed.append(name)
    if sorted(changed) != ['counterprofile', 'counterprofileinternal']:
        raise ValueError(f'Unsupported template layout: counter profile fields {changed}')
    return archive


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--source', type=Path)
    args = parser.parse_args()
    developer = Path(subprocess.check_output(['xcode-select', '-p'], text=True).strip())
    source = args.source or developer.parent / 'Applications/Instruments.app/Contents/Packages/GPU.instrdst/Contents/Templates/Metal System Trace.tracetemplate'
    result = configure(plistlib.loads(source.read_bytes()))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Refuse overwriting an existing file, including the supplied source.
    with args.output.open('xb') as destination:
        plistlib.dump(result, destination, fmt=plistlib.FMT_BINARY)
    print(args.output)
