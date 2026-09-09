"""Bounded neutral-pose SH projection; never loads or runs the retail executable.

This is a development export, not an implementation of the original renderer.
See Docs/formats/sh.md for the statically recognized control-flow patterns.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

from . import sh
from .pal import load_pal, overlay
from .pic import parse_pic


def _project(data: bytes, name: str = '') -> dict:
    sections = sh._sections(data)
    va, size, offset, _ = sections['CODE']
    code = data[offset:offset + size]
    shape = sh.Shape(name)
    walker = sh._Walker(code, va, shape, sh._relocs(data, sections))
    slots = {}
    polygons = []
    parts = {}
    stack = []
    off = 0
    transform = (0, 0, 0)
    part = 'body'
    texture = ''
    scope_end = None
    seen_faces = set()
    instructions = 0
    while 0 <= off < len(code):
        instructions += 1
        if instructions > 30000 or len(stack) > 64:
            raise sh.SHError('static projection exceeded instruction/call bound')
        op = code[off]
        if op == 0 or (op == 0x1e and (scope_end is None or off >= scope_end)):
            if not stack:
                break
            off, transform, part, texture, scope_end = stack.pop()
            continue
        if op == 0x38:
            target = off + 3 + walker.s16(off + 1)
            if not off < target < len(code):
                raise sh.SHError('invalid structured block end')
            scope_end = max(scope_end or target, target)
            off += 3
            continue
        if op == 0xc4:
            target = off + 16 + walker.s16(off + 14)
            # C4 fields are renderer XYZ; vertex payload is X/forward/up.
            pivot = (walker.s16(off + 2), walker.s16(off + 6), walker.s16(off + 4))
            stack.append((off + 16, transform, part, texture, scope_end))
            scope_end = None
            transform = tuple(a + b for a, b in zip(transform, pivot))
            part = f'part-{target + va:04x}'
            parts[part] = transform
            if not 0 <= target < len(code):
                raise sh.SHError('part target outside CODE section')
            off = target
            continue
        if op == 0xf0:
            # Recognize a small *static* code idiom: optional cmp-word-zero
            # guard followed by a relocated push interpreter-target/push/ret.
            # No instructions are loaded/executed, and no general x86 VM exists.
            start = off + 2
            if code[start:start + 3] == b'\x66\x83\x3d':
                immediate, branch, delta = code[start + 7:start + 10]
                if branch not in (0x74, 0x75):
                    raise sh.SHError('unsupported static state guard')
                take = (immediate == 0) if branch == 0x74 else (immediate != 0)
                if take:
                    start += 10 + struct.unpack('b', bytes([delta]))[0]
            found = None
            for r in walker.relocs:
                if r < start or r > start + 128:
                    continue
                if r + 10 <= len(code) and code[r - 1] == 0x68 and code[r + 4] == 0x68 and code[r + 9] == 0xc3:
                    found = walker.u32(r) - va
                    break
            if found is None:
                raise sh.SHError(f'unsupported static reentry at {off + va:x}')
            if not 0 <= found < len(code):
                raise sh.SHError('interpreter target outside CODE section')
            off = found
            continue
        before = len(shape.prims)
        try:
            result = walker.step(off, -1)
        except (IndexError, struct.error) as exc:
            raise sh.SHError(f'truncated static record at {off + va:x}') from exc
        if result is None:
            raise sh.SHError(f'unsupported static record at {off + va:x}')
        length = result[0]
        if off + length > len(code):
            raise sh.SHError('static record exceeds CODE section')
        if op == 0x82:
            destination = walker.u16(off + 4)
            if destination % 8:
                raise sh.SHError('unaligned vertex destination')
            count = walker.u16(off + 2)
            for i in range(count):
                v = struct.unpack_from('<hhh', code, off + 6 + i * 6)
                slots[destination // 8 + i] = tuple(a + b for a, b in zip(v, transform))
        if op == 0xe2:
            texture = code[off + 2:off + 16].split(b'\0')[0].decode('ascii')
        for primitive in shape.prims[before:]:
            if primitive.kind != 'poly':
                continue
            key = (primitive.addr, transform)
            if key in seen_faces:
                continue
            seen_faces.add(key)
            if any(i not in slots for i in primitive.indices):
                raise sh.SHError(f'unresolved static vertex at {primitive.addr:x}')
            polygons.append({'vertices': [slots[i] for i in primitive.indices],
                             'color': primitive.color, 'uvs': primitive.uvs,
                             'texture': texture, 'part': part, 'addr': primitive.addr, 'subtype': primitive.subtype})
        # Nearest LOD: do not take distance/far-model links. Plane ordering and
        # state conditional links are not needed in a double-sided static mesh.
        off += length
    if not polygons:
        raise sh.SHError('static projection has no polygons')
    if stack:
        raise sh.SHError('unterminated static part')
    return {'polygons': polygons, 'parts': parts, 'instructions': instructions}


def project(data: bytes, name: str = '') -> dict:
    try:
        return _project(data, name)
    except (IndexError, struct.error, KeyError) as exc:
        raise sh.SHError('truncated or missing SH container/record') from exc


def split_polygon(polygon: dict, plane: tuple) -> tuple:
    """Split a convex source polygon at dot(xyz, plane[:3])+plane[3] == 0.

    Preserve winding, source metadata and interpolated UVs. Return positive and
    negative pieces; coplanar polygons belong only to positive (no duplicates).
    """
    vertices = polygon['vertices']
    distances = [sum(a * b for a, b in zip(v, plane)) + plane[3] for v in vertices]
    if min(distances) >= -1e-9:
        return polygon, None
    if max(distances) <= 1e-9:
        return None, polygon
    outputs = []
    for sign in (1, -1):
        points, uvs = [], []
        for i, v in enumerate(vertices):
            j = (i + 1) % len(vertices)
            a, b = distances[i], distances[j]
            if sign * a >= -1e-9:
                points.append(v)
                if polygon['uvs']:
                    uvs.append(polygon['uvs'][i])
            if a * b < -1e-18:
                t = a / (a - b)
                points.append(tuple(x + t * (y - x) for x, y in zip(v, vertices[j])))
                if polygon['uvs']:
                    uvs.append(tuple(x + t * (y - x) for x, y in zip(polygon['uvs'][i], polygon['uvs'][j])))
        outputs.append({**polygon, 'vertices': points, 'uvs': uvs or None} if len(points) >= 3 else None)
    return tuple(outputs)


def f14_surfaces(model: dict) -> dict:
    """Author a movable rig by subdividing existing F14 neutral-pose faces.

    This is geometry reuse, NOT recovered retail control-surface semantics.
    Coordinates/hinges are presentation choices fitted to the inspected model.
    The original polygons are replaced by their partition, never overlaid.
    """
    polygons, pivots, rig = [], dict(model['parts']), {}
    for polygon in model['polygons']:
        vertices = polygon['vertices']
        lo = [min(v[i] for v in vertices) for i in range(3)]
        hi = [max(v[i] for v in vertices) for i in range(3)]
        side = -1 if sum(v[0] for v in vertices) < 0 else 1
        suffix = 'left' if side < 0 else 'right'
        name, planes, pivot, axis, parent = '', [], None, None, None
        if polygon['part'].startswith('part-'):
            # Spanwise aft strip; keep the outer wingtip and root intact.
            name = f'flap-{suffix}'
            planes = [(side, 0, 0, -30), (-side, 0, 0, 80), (-side * 5 / 28, -1, 0, 9)]
            pivot, axis = (side * 30, 9 - 30 * 5 / 28, 2), (1, 0, side * 5 / 28)
            parent = f'wing-{suffix}-color'
        elif lo[2] == hi[2] == -2 and hi[1] < -10 and min(abs(v[0]) for v in vertices) >= 18:
            name, pivot, axis = f'taileron-{suffix}', (side * 22, -30, -2), (1, 0, 0)
        elif lo[2] >= 1 and hi[2] >= 27 and hi[1] < -5 and min(abs(v[0]) for v in vertices) >= 14 and max(abs(v[0]) for v in vertices) <= 16:
            name, planes = f'rudder-{suffix}', [(0, -1, -.25, -31)]
            pivot, axis = (side * 14.5, -34.75, 15), (0, 1, .25)
        elif lo[2] == hi[2] == 1 and lo[0] >= -8 and hi[0] <= 7 and hi[1] <= -26:
            name, planes = 'airbrake-upper', [(0, -1, 0, -30)]
            pivot, axis = (0, -30, 1), (1, 0, 0)
        elif lo[0] >= -7 and hi[0] <= 7 and lo[2] >= -6 and hi[2] <= -5 and lo[1] <= -38 and hi[1] >= 2:
            name, planes = 'airbrake-lower', [(0, -1, 0, -28)]
            pivot, axis = (0, -28, -5.25), (1, 0, 0)
        if not name:
            polygons.append(polygon)
            continue
        inside = polygon
        for plane in planes:
            inside, outside = split_polygon(inside, plane)
            if outside:
                polygons.append(outside)
            if inside is None:
                break
        if inside:
            polygons.append({**inside, 'part': name})
            pivots[name] = pivot
            rig[name] = {'rotationAxis': axis, **({'parent': parent} if parent else {})}
    return {**model, 'polygons': polygons, 'parts': pivots, 'rig': rig}


def export(source: Path, palette_path: Path, output: Path, length_metres: float = 19.1) -> dict:
    data = source.read_bytes()
    model = project(data, source.stem)
    source_polygons = len(model['polygons'])
    if source.stem.upper() == 'F14':
        model = f14_surfaces(model)
    vertices = [v for p in model['polygons'] for v in p['vertices']]
    lo = [min(v[i] for v in vertices) for i in range(3)]
    hi = [max(v[i] for v in vertices) for i in range(3)]
    if length_metres <= 0 or hi[1] <= lo[1]:
        raise sh.SHError('invalid presentation length or longitudinal bounds')
    scale = length_metres / (hi[1] - lo[1])
    center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, 0]
    # Preserve the native vertical origin: bounding-box centering would lower
    # the fuselage because the twin fins extend far above its centerline.
    def convert(v):
        return [(v[0] - center[0]) * scale, (v[2] - center[2]) * scale, -(v[1] - center[1]) * scale]
    palette = load_pal(str(palette_path))
    groups = {}
    for polygon in model['polygons']:
        component = polygon['part']
        if source.stem.upper() == 'F14' and polygon['subtype'] == 0x44:
            # Observed neutral F-14: the two special textured rear nozzle disks.
            # Keep them separate so authored engine state can darken an idle nozzle.
            x = sum(v[0] for v in polygon['vertices']) / len(polygon['vertices'])
            component = 'exhaust-left' if x < 0 else 'exhaust-right'
        key = (component, polygon['texture'] if polygon['uvs'] else '')
        if key not in groups:
            groups[key] = {'name': key[0], 'positions': [], 'colors': [], 'pivot': convert(model['parts'].get(key[0], center))}
            if key[0].startswith('part-') and source.stem.upper() == 'F14':
                groups[key]['name'] = 'wing-left' if model['parts'][key[0]][0] < 0 else 'wing-right'
            groups[key]['name'] += '-textured' if key[1] else '-color'
            if key[0] in model.get('rig', {}):
                groups[key].update(model['rig'][key[0]])
            if key[1]:
                groups[key]['uvs'] = []
                pic = parse_pic((source.parent / key[1].upper()).read_bytes())
                pal = overlay(palette, pic.palette or [])
                rgba = [component for index in pic.pixels for component in (*pal[index], 255)]
                groups[key]['texture'] = {'width': pic.width, 'height': pic.height, 'rgba': rgba}
        group = groups[key]
        n = len(polygon['vertices'])
        for i in range(1, n - 1):
            for index in (0, i, i + 1):
                group['positions'].extend(convert(polygon['vertices'][index]))
                rgb = (255, 255, 255) if key[1] else palette[polygon['color'] % 256]
                group['colors'].extend(c / 255 for c in rgb)
                if key[1]:
                    u, v = polygon['uvs'][index]
                    # Preserve the projection's V convention. The loader uses DataTexture
                    # flipY=false; special 0x44 exhaust material is separately named.
                    # Original material/UV dispatch beyond this projection is unproven.
                    group['uvs'].extend((u / group['texture']['width'], 1 - v / group['texture']['height']))
    result = {'version': 1, 'name': 'F-14 Tomcat', 'positions': [], 'colors': [],
              'parts': list(groups.values()),
              'source': {'file': source.name, 'sha256': hashlib.sha256(data).hexdigest(),
                         'paletteSha256': hashlib.sha256(palette_path.read_bytes()).hexdigest(),
                         'projection': 'nearest LOD, neutral static state', 'lengthMetres': length_metres,
                         'polygons': source_polygons, 'partitionPolygons': len(model['polygons']), 'instructions': model['instructions']},
              'limitations': ['Original flight dynamics are not imported.',
                              'Static neutral pose; original x86 animation and renderer are not executed.',
                              '19.1 m length is a presentation scale, not decoded retail units.',
                              'Retail faces are partitioned into authored taileron/rudder/flap/airbrake rig; hinges and motion are not decoded retail semantics.',
                              'Neutral projection includes wings; gear and hook animation are not recovered.',
                              'Special exhaust disks are separated for authored engine-state presentation.',
                              'Original texture dispatch is partial; DataTexture uses flipY=false.']}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--pal', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    result = export(args.source, args.pal, args.out)
    print(json.dumps({'source': result['source'], 'parts': [(p['name'], len(p['positions']) // 9) for p in result['parts']]}))


if __name__ == '__main__':
    main()
