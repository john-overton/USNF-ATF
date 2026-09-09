"""Conservative corner cutting of raster water boundaries (never elevation classification)."""
import math


def smooth_ring(ring, width, height, cut=25):
    # One bounded Chaikin pass. Keep clipping boundaries and point-touch junctions
    # fixed; remove only duplicate closing/consecutive vertices.
    points = []
    for point in ring:
        if not points or point != points[-1]:
            points.append(point)
    if points and points[0] == points[-1]:
        points.pop()
    if len(points) < 3:
        return ring
    from collections import Counter
    repeats = Counter(tuple(p) for p in points)
    result = []
    for i, point in enumerate(points):
        x,z = point
        if x in (0,width) or z in (0,height) or repeats[tuple(point)]>1:
            result.append(point)
            continue
        for neighbor in (points[i-1], points[(i+1)%len(points)]):
            dx,dz = neighbor[0]-x,neighbor[1]-z
            # At most a quarter edge; small islands/channels cannot collapse.
            t = min(0.25, cut/math.hypot(dx,dz))
            result.append([x+dx*t,z+dz*t])
    return result+[result[0]]


def smooth_coasts(manifest):
    if manifest.get('coastSmoothing'):
        raise ValueError('coasts already smoothed; start with original mask polygons')
    width,height = manifest['extents']['width'],manifest['extents']['height']
    for body in manifest['waterBodies']:
        # Only existing sea-level water polygons; elevation does not create water.
        # Inland rivers retain their existing band joins. Keep holes unchanged so
        # no previously dry island is flooded by corner cutting its interior ring.
        if body['elevation'] == 0:
            original = body['polygon']
            body['polygon'] = smooth_ring(original,width,height)
            if len(original) >= 16:
                body['polygon'] = smooth_ring(body['polygon'],width,height,12.5)
    manifest['coastSmoothing'] = {'method':'bounded Chaikin exterior, fixed holes/junctions', 'cutMeters':25, 'passes':2, 'secondPassMinOriginalVertices':16, 'secondCutMeters':12.5}
    return manifest
