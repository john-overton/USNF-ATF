"""Reviewed ATF F14 control rig, separate from the different USNF F14 mesh.

Flaps reuse complete source trailing panels. Tailplane motion and the rudder
cut/hinges are authored presentation; native control scheduling is not decoded.
No fixed fuselage skin is removed to manufacture speedbrakes.
"""
from __future__ import annotations


_WINGS = {'part-4ca2': (1, 22), 'part-503d': (-1, 21)}
_TAILPLANES = {0x4744, 0x47a1, 0x49af, 0x4a0f}
_FINS = {0x4a68, 0x4a98, 0x4abf, 0x4aef, 0x4b3c, 0x4b63}


def f14_atf_surfaces(model: dict) -> dict:
    """Rig only reviewed ATF wing/tail faces, retaining source metadata and UVs.

    Coordinates are source X/right, Y/forward, Z/up; rotation axes use renderer
    X/right, Y/up, Z/aft. Input baseColors, when present, interpolate with UVs.
    The exporter must name the two wing anchors ``wing-*-textured-cutout``.
    """
    # Delayed import avoids a cycle when the exporter imports this helper.
    from .sh_static import split_polygon

    polygons = []
    parts = dict(model.get('parts', {}))
    rig = dict(model.get('rig', {}))
    for polygon in model['polygons']:
        vertices = polygon['vertices']
        source_part = polygon['part']
        if source_part in _WINGS:
            side, root = _WINGS[source_part]
            # Original aft-strip seam: six/four units of chord at root/tip.
            # Respect the original one-unit left/right lateral asymmetry.
            slope = 8 / 68
            is_flap = all(v[1] + (side * v[0] - root) * slope <= -4 + 1e-9
                          for v in vertices)
            if is_flap:
                suffix = 'left' if side < 0 else 'right'
                name = f'flap-{suffix}'
                parts[name] = (side * root, -4, 4)
                rig[name] = {'rotationAxis': (1, 0, side * slope),
                             'parent': f'wing-{suffix}-textured-cutout'}
                polygons.append({**polygon, 'part': name})
            else:
                polygons.append(polygon)
            continue
        # Gear, burner, and other articulated parts must never become wings or
        # tail surfaces merely because they are behind the aircraft's origin.
        if source_part != 'body':
            polygons.append(polygon)
            continue
        side = -1 if sum(v[0] for v in vertices) < 0 else 1
        suffix = 'left' if side < 0 else 'right'
        if polygon.get('addr') in _TAILPLANES:
            name = f'taileron-{suffix}'
            parts[name] = (side * 22, -40, -1)
            rig[name] = {'rotationAxis': (1, 0, 0)}
            polygons.append({**polygon, 'part': name})
            continue
        if polygon.get('addr') not in _FINS:
            polygons.append(polygon)
            continue
        # A five-unit strip ahead of the fin's original trailing edge. This
        # authored hinge is parallel to that edge, including its aft rake.
        name = f'rudder-{suffix}'
        slope = 8 / 29
        plane = (0, -1, -slope, -48 + 7 * slope)
        for i in range(1, len(vertices) - 1):
            indices = (0, i, i + 1)
            triangle = {**polygon, 'vertices': [vertices[j] for j in indices],
                        'uvs': [polygon['uvs'][j] for j in indices] if polygon['uvs'] else None}
            for attribute in ('baseColors', 'vertexColors'):
                if polygon.get(attribute):
                    triangle[attribute] = [polygon[attribute][j] for j in indices]
            moving, fixed = split_polygon(triangle, plane)
            if fixed:
                polygons.append(fixed)
            if moving:
                polygons.append({**moving, 'part': name})
                parts[name] = (side * 14, -48, 7)
                rig[name] = {'rotationAxis': (0, 1, slope)}
    return {**model, 'polygons': polygons, 'parts': parts, 'rig': rig}
