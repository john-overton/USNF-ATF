"""Optional, georeferenced label-free RGB paint; one bounded atlas for every LOD."""
import gzip
import hashlib
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request

import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.enums import Resampling
from rasterio.transform import Affine, from_bounds
from rasterio.warp import reproject, transform_bounds

EOX_ATTRIBUTION = 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024); https://maps.eox.at'
EOX_LICENSE = 'Imagery: CC BY-NC-SA 4.0 https://creativecommons.org/licenses/by-nc-sa/4.0/; reprojected and downsampled'


def add_imagery(manifest_path, source_path, attribution, license_text, size=3072):
    if not 2 <= size <= 6144:
        raise ValueError('imagery size must be 2..6144')
    manifest = json.loads(manifest_path.read_text())
    p, e = manifest['projection'], manifest['extents']
    width = max(2, round(size * e['width'] / max(e.values())))
    height = max(2, round(size * e['height'] / max(e.values())))
    # South-to-north rows match chunk rows and DataTexture's unflipped v axis.
    transform = Affine(e['width']/width, 0, p['originX'], 0, e['height']/height, p['originY'])
    rgb = np.full((3, height, width), np.nan, dtype='float32')
    with rasterio.open(source_path) as src:
        if src.count < 3 or src.crs is None:
            raise ValueError('imagery needs a georeferenced RGB raster')
        for band in range(3):
            reproject(rasterio.band(src, band+1), rgb[band], src_transform=src.transform,
                      src_crs=src.crs, src_nodata=src.nodata, dst_transform=transform,
                      dst_crs=p['crs'], dst_nodata=np.nan, resampling=Resampling.bilinear)
    if not np.isfinite(rgb).all() or rgb.min() < 0 or rgb.max() > 255:
        raise ValueError('imagery must cover the entire theater with 0..255 RGB')
    rgba = np.full((height, width, 4), 255, dtype='uint8')
    rgba[:, :, :3] = np.rint(rgb.transpose(1, 2, 0)).astype('uint8')
    data = gzip.compress(rgba.tobytes(), compresslevel=9, mtime=0)
    path = 'imagery/overview.rgba.gz'
    target = manifest_path.parent/path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    # A newly projected atlas has not received the optional coastal color pass.
    manifest.pop('coastPaint', None)
    manifest['imagery'] = dict(path=path, width=width, height=height, byteLength=len(data),
                              sha256=hashlib.sha256(data).hexdigest(),
                              attribution=attribution, license=license_text)
    manifest_path.write_text(json.dumps(manifest, separators=(',', ':'), allow_nan=False)+'\n')
    provenance = dict(source=str(source_path), sourceSha256=hashlib.sha256(source_path.read_bytes()).hexdigest(),
                      metersPerPixel=[e['width']/width, e['height']/height], imagery=manifest['imagery'])
    (manifest_path.parent/'imagery-info.json').write_text(json.dumps(provenance, indent=2)+'\n')
    return provenance


def wms_tiles(bounds, size, tile_size=3072):
    """Pixel-aligned north-to-south windows of one geographic image."""
    west, south, east, north = bounds
    for row in range(0, size, tile_size):
        for col in range(0, size, tile_size):
            width, height = min(tile_size, size-col), min(tile_size, size-row)
            box = (west+(east-west)*col/size, north-(north-south)*(row+height)/size,
                   west+(east-west)*(col+width)/size, north-(north-south)*row/size)
            yield row, col, width, height, box


def fetch_eox(manifest_path, output, size=3072):
    """Cached bounded WMS tiles assembled before projection; no runtime network."""
    if not 2 <= size <= 6144:
        raise ValueError('imagery size must be 2..6144')
    m = json.loads(manifest_path.read_text()); p, e = m['projection'], m['extents']
    bounds = transform_bounds(p['crs'], 'EPSG:4326', p['originX'], p['originY'],
                              p['originX']+e['width'], p['originY']+e['height'], densify_pts=41)
    bounds = tuple((math.floor(v*10)-1)/10 if i < 2 else (math.ceil(v*10)+1)/10 for i, v in enumerate(bounds))
    output.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(json.dumps([bounds,size,'s2cloudless-2024']).encode()).hexdigest()[:16]
    tif = output/f'eox-2024-mosaic-{key}.tif'
    sources = []
    with rasterio.open(tif,'w',driver='GTiff',width=size,height=size,count=3,dtype='uint8',
                       crs='EPSG:4326',transform=from_bounds(*bounds,size,size),compress='deflate') as dst:
        for row, col, width, height, box in wms_tiles(bounds, size):
            query = dict(service='WMS', version='1.1.1', request='GetMap', layers='s2cloudless-2024',
                         srs='EPSG:4326', bbox=','.join(map(str,box)), width=width, height=height,
                         format='image/jpeg', styles='')
            url = 'https://tiles.maps.eox.at/wms?' + urllib.parse.urlencode(query)
            tile_key = hashlib.sha256(url.encode()).hexdigest()[:16]
            jpeg = output/f'eox-2024-{tile_key}.jpg'
            if jpeg.exists():
                data = jpeg.read_bytes()
            else:
                with urllib.request.urlopen(url, timeout=120) as response:
                    data = response.read(32*1024*1024+1)
            if len(data)>32*1024*1024:
                raise ValueError('WMS response exceeds 32 MiB')
            with MemoryFile(data) as memory, memory.open() as src:
                if src.count != 3 or src.width != width or src.height != height:
                    raise ValueError('unexpected WMS RGB dimensions')
                dst.write(src.read(), window=rasterio.windows.Window(col,row,width,height))
            jpeg.write_bytes(data)
            sources.append(dict(url=url,bounds=box,width=width,height=height,
                                sha256=hashlib.sha256(data).hexdigest()))
    (output/f'eox-2024-mosaic-{key}.json').write_text(json.dumps(dict(sources=sources,
        bounds=bounds,size=size,attribution=EOX_ATTRIBUTION,license=EOX_LICENSE),indent=2)+'\n')
    return add_imagery(manifest_path, tif, EOX_ATTRIBUTION, EOX_LICENSE, size)
