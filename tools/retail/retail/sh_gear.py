"""Combine reviewed SH gear-state geometry without inventing texture coordinates.

The selected state reveals native deployed gear billboards and doors. Grouping,
hinges and runtime retraction are authored presentation, not native animation.
"""
from __future__ import annotations

import math


# Source X/right, Y/forward, Z/up. Pivots are the native C4 main strut mounts;
# the nose pivot includes its associated native doors and brace.
_RECIPES = {
    'F14': {'nose_after': 40, 'pivots': {
        'left': (-18, 6, -4), 'right': (18, 6, -4), 'nose': (0, 73, -3)}},
    'F14_ATF': {'nose_after': 40, 'pivots': {
        'left': (-26, 5, 1), 'right': (27, 5, 1), 'nose': (0, 69, -6)}},
    'A4': {'nose_after': 10, 'pivots': {
        'left': (-9, -7, -8), 'right': (9, -7, -8), 'nose': (0, 26, -10)}},
    'F31': {'nose_after': 15, 'pivots': {
        'left': (-9, -13, -4), 'right': (9, -13, -4), 'nose': (0, 35, -4)}},
}


def _signature(polygon: dict) -> tuple:
    return polygon['addr'], tuple(tuple(v) for v in polygon['vertices'])


def merge_gear(neutral: dict, deployed: dict, aircraft: str) -> dict:
    """Retain the neutral airframe and add only the selected gear-state delta.

    Parts named ``gear-{left,right,nose}`` have ``gearPose='deployed'`` rig
    metadata. Any neutral-only geometry becomes ``gear-stowed-*`` with
    ``gearPose='stowed'``. No geometry is dropped, mirrored or rescaled. The
    caller must select only the reviewed gear word, keeping other state neutral.
    """
    aircraft = {'A4E': 'A4', 'X31': 'F31'}.get(aircraft.upper(), aircraft.upper())
    if aircraft not in _RECIPES:
        raise ValueError(f'no reviewed gear recipe for {aircraft}')
    recipe = _RECIPES[aircraft]
    neutral_keys = {_signature(p) for p in neutral['polygons']}
    deployed_keys = {_signature(p) for p in deployed['polygons']}
    parts = dict(neutral.get('parts', {}))
    rig = dict(neutral.get('rig', {}))

    def gear_polygon(polygon: dict, pose: str) -> dict:
        vertices = polygon['vertices']
        x = sum(v[0] for v in vertices) / len(vertices)
        y = sum(v[1] for v in vertices) / len(vertices)
        side = 'nose' if y > recipe['nose_after'] else 'left' if x <= 0 else 'right'
        part = f'gear-{side}' if pose == 'deployed' else f'gear-stowed-{side}'
        parts[part] = recipe['pivots'][side]
        # Retraction folds main legs inward about renderer Z; nose folds aft
        # about X. These axes are for the authored runtime interpolation only.
        axis = (-1, 0, 0) if side == 'nose' else (0, 0, -1 if side == 'right' else 1)
        rig[part] = {'rotationAxis': axis, 'gearPose': pose}
        return {**polygon, 'part': part}

    polygons = [p if _signature(p) in deployed_keys else gear_polygon(p, 'stowed')
                for p in neutral['polygons']]
    polygons.extend(gear_polygon(p, 'deployed') for p in deployed['polygons']
                    if _signature(p) not in neutral_keys)
    return {**neutral, 'polygons': polygons, 'parts': parts, 'rig': rig}


def _clip_texel(polygon: list, axis: int, boundary: float, sign: int) -> list:
    result = []
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        da, db = (a[axis] - boundary) * sign, (b[axis] - boundary) * sign
        if da >= 0:
            result.append(a)
        if (da < 0) != (db < 0):
            t = da / (da - db)
            result.append(tuple(x + t * (y - x) for x, y in zip(a, b)))
    return result


def gear_support_height(model: dict, load_texture) -> float:
    """Positive source-unit height of the lowest visible deployed gear point.

    Clip the original triangle fan against opaque nearest-sampled texel cells.
    Source UVs address texel centres; V is bottom-up, while PIC rows are top-down.
    Ignore dynamic decal pages and stowed gear. Return zero without visible gear.
    """
    lowest = 0.0
    textures = {}
    for polygon in model['polygons']:
        if model.get('rig', {}).get(polygon['part'], {}).get('gearPose') != 'deployed':
            continue
        texture_name = polygon.get('texture', '')
        if texture_name.lower().startswith('@decal'):
            continue
        vertices = polygon['vertices']
        if not polygon.get('uvs') or not (polygon.get('subtype', 0) & 0x08):
            lowest = min(lowest, *(v[2] for v in vertices))
            continue
        if texture_name not in textures:
            textures[texture_name] = load_texture(texture_name)
        pic = textures[texture_name]
        for k in range(1, len(vertices) - 1):
            triangle = [(*polygon['uvs'][i], vertices[i][2]) for i in (0, k, k + 1)]
            first_u = max(0, math.ceil(min(p[0] for p in triangle) - 0.5))
            last_u = min(pic.width - 1, math.floor(max(p[0] for p in triangle) + 0.5))
            first_v = max(0, math.ceil(min(p[1] for p in triangle) - 0.5))
            last_v = min(pic.height - 1, math.floor(max(p[1] for p in triangle) + 0.5))
            for u in range(first_u, last_u + 1):
                for v in range(first_v, last_v + 1):
                    if pic.pixels[(pic.height - 1 - v) * pic.width + u] == 255:
                        continue
                    clipped = triangle
                    for axis, boundary, sign in ((0, u - 0.5, 1), (0, u + 0.5, -1),
                                                  (1, v - 0.5, 1), (1, v + 0.5, -1)):
                        if clipped:
                            clipped = _clip_texel(clipped, axis, boundary, sign)
                    if len(clipped) < 3:
                        continue
                    area = sum(a[0] * b[1] - b[0] * a[1]
                               for a, b in zip(clipped, clipped[1:] + clipped[:1]))
                    if abs(area) > 1e-10:
                        lowest = min(lowest, *(p[2] for p in clipped))
    return -lowest
