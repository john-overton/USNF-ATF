"""Reviewed native device-state deltas with authored presentation metadata.

Native open brake polygons retain their geometry, UVs and fixed fuselage backing.
The yaw angles measured from these polygons describe an authored folding motion;
they do not reproduce a native timing or continuous animation routine.
"""
from __future__ import annotations

import math


_BRAKES = {
    # Native F14 dorsal brake halves have non-collinear, sloping forward edges.
    # Keep the exact open pose with visibility only rather than inventing an X hinge.
    'F14_ATF': {'hinge_x': 0, 'hinge_y': -43, 'hinge_z': 5, 'angle': 0,
                'axis': (1, 0, 0), 'panels': {0x4c37, 0x4c4e, 0x4c65, 0x4c7c}},
    'A4': {'hinge_x': 5, 'hinge_y': -30, 'angle': math.atan2(8, 4),
           'panels': {0x589c, 0x58bc, 0x5a17, 0x5a66}},
    'F31': {'hinge_x': 6, 'hinge_y': -12, 'angle': math.pi / 4,
            'panels': {0x47d0, 0x47e7, 0x4825, 0x483c}},
}


def _signature(polygon: dict) -> tuple:
    return polygon['addr'], tuple(tuple(v) for v in polygon['vertices'])


def merge_brakes(neutral: dict, opened: dict, stem: str) -> dict:
    """Add native fully-open brake delta; never remove the fixed neutral skin.

    ``nativeBrakeAngle`` in each part's rig is its signed open yaw in radians
    (right positive, left negative). Export the open geometry unchanged. Runtime
    folds panels with ``-nativeBrakeAngle * (1 - fraction)`` and shows them only
    above zero deployment. Support groups carry angle zero, so their native
    recess/brace geometry stays fixed while sharing the deployment visibility.
    Both inputs must precede authored surface partitioning; neutral may already
    include additional gear parts whose source polygons remain unpartitioned.
    """
    stem = {'A4E': 'A4', 'X31': 'F31'}.get(stem.upper(), stem.upper())
    if stem not in _BRAKES:
        raise ValueError(f'no reviewed brake recipe for {stem}')
    recipe = _BRAKES[stem]
    keys = {_signature(p) for p in neutral['polygons']}
    polygons = list(neutral['polygons'])
    parts, rig = dict(neutral.get('parts', {})), dict(neutral.get('rig', {}))
    for polygon in opened['polygons']:
        if _signature(polygon) in keys:
            continue
        side = -1 if sum(v[0] for v in polygon['vertices']) < 0 else 1
        suffix = 'left' if side < 0 else 'right'
        panel = polygon['addr'] in recipe['panels']
        name = f'airbrake-native-{suffix}-{"panel" if panel else "support"}'
        parts[name] = (side * recipe['hinge_x'], recipe['hinge_y'], recipe.get('hinge_z', 0))
        rig[name] = {'nativeBrakeAngle': side * recipe['angle'] if panel else 0,
                     'rotationAxis': recipe.get('axis', (0, 1, 0))}
        polygons.append({**polygon, 'part': name})
    return {**neutral, 'polygons': polygons, 'parts': parts, 'rig': rig}


def merge_afterburner(neutral: dict, burning: dict, stem: str) -> dict:
    """Append only the reviewed burner-state delta before surface partitioning.

    Runtime owns visibility and emissive presentation of ``afterburner-*`` parts.
    No source polygons are moved, replaced or assigned invented UVs.
    """
    stem = {'X31': 'F31'}.get(stem.upper(), stem.upper())
    if stem not in ('F14_ATF', 'F31'):
        raise ValueError(f'no reviewed afterburner recipe for {stem}')
    keys = {_signature(p) for p in neutral['polygons']}
    polygons, parts = list(neutral['polygons']), dict(neutral.get('parts', {}))
    for polygon in burning['polygons']:
        if _signature(polygon) in keys:
            continue
        x = sum(v[0] for v in polygon['vertices']) / len(polygon['vertices'])
        name = 'afterburner-' + ('center' if stem == 'F31' else 'left' if x < 0 else 'right')
        parts[name] = (0, -40, 0) if stem == 'F31' else (-14 if x < 0 else 14, -57, -1)
        polygons.append({**polygon, 'part': name})
    return {**neutral, 'polygons': polygons, 'parts': parts}
