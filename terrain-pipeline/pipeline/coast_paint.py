"""Bake land-color padding around existing sea-level water polygons.

This repairs the terrain underlay, not the physical shoreline. No RGB threshold
or elevation threshold is used to invent water. Keep the original atlas to rebake.
"""
import gzip
import hashlib
import json
import math

import numpy as np
from rasterio.features import rasterize
from rasterio.transform import Affine
from scipy.ndimage import distance_transform_edt, label


def extend_land_colors(rgb, water, sea, spacing, inland=200, feather=100, offshore=3000):
    """Extend interior colors in metres; never borrow land colors across islands.

    Arrays use south-to-north rows. `spacing` is (row metres, column metres).
    Narrow islands with no interior donor retain their original imagery.
    """
    if (rgb.shape != (*water.shape, 3) or sea.shape != water.shape
            or any(not math.isfinite(v) or v <= 0 for v in (*spacing, inland, feather, offshore))):
        raise ValueError('invalid coastal paint grid or distances')
    if np.any(sea & ~water):
        raise ValueError('sea must be a subset of authoritative water')
    stats = dict(changedLandPixels=0, changedWaterPixels=0, skippedComponentPixels=0)
    if not sea.any() or water.all() or not water.any():
        return stats
    # Every inland lake/river is excluded from donors, even though only coasts
    # are targets. Pixel centers and physical distances match the atlas grid.
    interior = distance_transform_edt(~water, sampling=spacing)
    donors = interior >= inland + feather
    if not donors.any():
        return stats
    coast_distance = distance_transform_edt(~sea, sampling=spacing)
    target_land = ~water & (coast_distance < inland + feather)
    del coast_distance
    offshore_distance, shore = distance_transform_edt(water, sampling=spacing, return_indices=True)
    target_water = sea & (offshore_distance <= offshore)
    del offshore_distance
    components, _ = label(~water)
    owner = components[shore[0], shore[1]]
    del shore
    nearest = distance_transform_edt(~donors, sampling=spacing, return_distances=False, return_indices=True)
    same_component = components[nearest[0], nearest[1]] == owner
    stats['skippedComponentPixels'] = int(((target_land | target_water) & ~same_component).sum())
    target_land &= same_component
    target_water &= same_component
    y, x = np.where(target_land | target_water)
    weight = np.clip((inland + feather - interior[y, x]) / feather, 0, 1)
    sy, sx = nearest[0, y, x], nearest[1, y, x]
    # Reflect into the interior to retain field/vegetation texture instead of
    # stretching one shoreline pixel into a kilometre-long stripe. Where a
    # reflected point leaves this land component, use the safe nearest donor.
    ry, rx = 2*sy-y, 2*sx-x
    inside = (ry >= 0) & (ry < water.shape[0]) & (rx >= 0) & (rx < water.shape[1])
    ry = np.clip(ry, 0, water.shape[0]-1); rx = np.clip(rx, 0, water.shape[1]-1)
    reflect = inside & donors[ry, rx] & (components[ry, rx] == owner[y, x])
    sy = np.where(reflect, ry, sy); sx = np.where(reflect, rx, sx)
    source = rgb[sy, sx].astype('float32')
    before = rgb[y, x].copy()
    rgb[y, x] = np.rint(before * (1-weight[:, None]) + source * weight[:, None]).astype('uint8')
    changed = np.any(before != rgb[y, x], axis=1)
    stats['changedLandPixels'] = int((changed & ~water[y, x]).sum())
    stats['changedWaterPixels'] = int((changed & water[y, x]).sum())
    return stats


def paint_coasts(manifest_path, inland=200, feather=100, offshore=3000):
    manifest = json.loads(manifest_path.read_text())
    if manifest.get('coastPaint'):
        raise ValueError('coast paint already applied; start with the original atlas')
    image = manifest['imagery']
    path = manifest_path.parent / image['path']
    if not path.resolve().is_relative_to(manifest_path.parent.resolve()):
        raise ValueError('imagery path escapes manifest folder')
    compressed = path.read_bytes()
    if len(compressed) != image['byteLength'] or hashlib.sha256(compressed).hexdigest() != image['sha256']:
        raise ValueError('imagery checksum/length mismatch')
    height, width = image['height'], image['width']
    rgba = np.frombuffer(gzip.decompress(compressed), dtype='uint8').reshape(height, width, 4).copy()
    e = manifest['extents']
    spacing = (e['height']/height, e['width']/width)
    transform = Affine(spacing[1], 0, 0, 0, spacing[0], 0)
    def mask(bodies):
        shapes = [({'type': 'Polygon', 'coordinates': [b['polygon'], *b.get('holes', [])]}, 1) for b in bodies]
        return (rasterize(shapes, out_shape=(height, width), transform=transform, dtype='uint8') > 0
                if shapes else np.zeros((height, width), bool))
    water = mask(manifest['waterBodies'])
    # Existing sea-level polygons only; height never creates a water polygon.
    sea = mask([b for b in manifest['waterBodies'] if b['elevation'] == 0])
    stats = extend_land_colors(rgba[:, :, :3], water, sea, spacing, inland, feather, offshore)
    record = dict(method='component-safe reflected interior land color v1',
                  inlandMeters=inland, featherMeters=feather, offshoreMeters=offshore,
                  inputImagerySha256=image['sha256'], **stats)
    compressed = gzip.compress(rgba.tobytes(), compresslevel=9, mtime=0)
    image.update(byteLength=len(compressed), sha256=hashlib.sha256(compressed).hexdigest())
    manifest['coastPaint'] = record
    info_path = manifest_path.parent/'imagery-info.json'
    info = json.loads(info_path.read_text()) if info_path.exists() else {}
    info.update(imagery=image, coastPaint=record)
    path.write_bytes(compressed)
    info_path.write_text(json.dumps(info, indent=2)+'\n')
    manifest_path.write_text(json.dumps(manifest, separators=(',', ':'), allow_nan=False)+'\n')
    return record
