"""Editable appearance weights and seasonal palettes, independent of terrain LOD.

RGB prototypes are artistic appearance approximations, not land-cover or geology
classification. The reusable weights are stored separately from baked RGBA maps.
"""
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.transform import Affine
from rasterio.warp import reproject
from scipy.ndimage import distance_transform_edt

CLASSES = ['dark vegetation', 'light vegetation', 'dry cover', 'pale ground']
PROTOTYPES = np.array([[55,75,40],[110,125,70],[175,150,100],[150,150,145]], dtype='float32')
PALETTES = {
    'summer': ['#465339','#7f8851','#b1a16e','#99958a'],
    'spring': ['#40533a','#7b955b','#a99c72','#99958a'],
    'autumn': ['#59503a','#98905a','#b09b6a','#99958a'],
    'winter': ['#656b61','#a4aa9b','#b9b9a8','#c1c3bc'],
}


def appearance_weights(rgb):
    distance = np.sum(((rgb[..., None, :].astype('float32')-PROTOTYPES)/45)**2, axis=-1)
    weight = np.exp(-(distance-distance.min(axis=-1, keepdims=True)))
    return weight / weight.sum(axis=-1, keepdims=True)


def palette_rgb(weights, colors):
    if len(colors) != 4 or any(len(c) != 7 or c[0] != '#' for c in colors):
        raise ValueError('palette requires four #RRGGBB colors')
    palette = np.array([[int(c[i:i+2], 16) for i in (1,3,5)] for c in colors], dtype='float32')
    return np.rint(weights @ palette).clip(0,255).astype('uint8')


def bake_color_maps(manifest_path, size=1024, palette_path=None, weights_path=None):
    if not 2 <= size <= 2048:
        raise ValueError('color map size must be 2..2048')
    m = json.loads(manifest_path.read_text()); e = m['extents']; image = m['imagery']
    root = manifest_path.parent
    palettes = json.loads(palette_path.read_text()) if palette_path else PALETTES
    if set(palettes) != set(PALETTES):
        raise ValueError('palettes must contain summer, spring, autumn and winter')
    for colors in palettes.values(): palette_rgb(np.ones((1,4),dtype='float32')/4, colors)
    output = root/'color-maps'; output.mkdir(exist_ok=True)
    if weights_path:
        with np.load(weights_path, allow_pickle=False) as data:
            quantized = data['weights'].copy()
            if quantized.dtype != np.uint8: raise ValueError('appearance weights must be uint8')
            weights = quantized.astype('float32')/255
            if (json.loads(str(data['extents'])) != e or json.loads(str(data['projection'])) != m['projection']):
                raise ValueError('weight map belongs to a different theater grid')
        if (weights.ndim != 3 or weights.shape[2] != 4 or min(weights.shape[:2]) < 2
                or max(weights.shape[:2]) > 2048 or np.any(weights.sum(axis=-1) == 0)):
            raise ValueError('invalid appearance weights')
        weights /= weights.sum(axis=-1, keepdims=True)
        h,w = weights.shape[:2]
        source_hash = hashlib.sha256(weights_path.read_bytes()).hexdigest()
    else:
        source = root/image['path']
        if not source.resolve().is_relative_to(root.resolve()): raise ValueError('imagery path escapes theater')
        packed = source.read_bytes(); source_hash = hashlib.sha256(packed).hexdigest()
        if source_hash != image['sha256'] or len(packed) != image['byteLength']:
            raise ValueError('imagery checksum/length mismatch')
        ih,iw = image['height'],image['width']
        rgb = np.frombuffer(gzip.decompress(packed), dtype='uint8').reshape(ih,iw,4)[:,:,:3]
        transform = Affine(e['width']/iw,0,0,0,e['height']/ih,0)
        shapes = [({'type':'Polygon','coordinates':[b['polygon'],*b.get('holes',[])]},1) for b in m['waterBodies']]
        water = rasterize(shapes, out_shape=(ih,iw), transform=transform, dtype='uint8') > 0 if shapes else np.zeros((ih,iw),bool)
        w=max(2,round(size*e['width']/max(e.values()))); h=max(2,round(size*e['height']/max(e.values())))
        dst_transform=Affine(e['width']/w,0,0,0,e['height']/h,0)
        samples=np.full((h,w,3),np.nan,dtype='float32')
        for band in range(3):
            src=rgb[:,:,band].astype('float32'); src[water]=np.nan
            reproject(src,samples[:,:,band],src_transform=transform,src_crs=m['projection']['crs'],src_nodata=np.nan,
                      dst_transform=dst_transform,dst_crs=m['projection']['crs'],dst_nodata=np.nan,resampling=Resampling.average)
        valid=np.isfinite(samples).all(axis=-1)
        if not valid.any():raise ValueError('color map has no land samples')
        # Underwater texels carry nearby land colors to avoid blue mip fringes.
        nearest=distance_transform_edt(~valid,return_distances=False,return_indices=True)
        samples[~valid]=samples[nearest[0][~valid],nearest[1][~valid]]
        weights=appearance_weights(samples)
        quantized=np.rint(weights*255).astype('uint8')
    np.savez_compressed(output/'weights.npz',weights=quantized,classes=np.array(CLASSES),
                        extents=json.dumps(e),projection=json.dumps(m['projection']))
    # Bake from the saved quantized weights, so palette-only rebakes are identical.
    weights=quantized.astype('float32'); weights/=weights.sum(axis=-1,keepdims=True)
    maps={}
    for season,colors in palettes.items():
        rgba=np.full((h,w,4),255,dtype='uint8');rgba[:,:,:3]=palette_rgb(weights,colors)
        data=gzip.compress(rgba.tobytes(),compresslevel=9,mtime=0)
        path=f'color-maps/{season}.rgba.gz'; (root/path).write_bytes(data)
        maps[season]=dict(path=path,width=w,height=h,byteLength=len(data),sha256=hashlib.sha256(data).hexdigest(),
                          attribution=image['attribution'],license=image['license'],attributionDisplay=image.get('attributionDisplay','overlay'))
    (output/'palettes.json').write_text(json.dumps(palettes,indent=2)+'\n')
    record=dict(method='RGB appearance weights v1; not land-cover classification',classes=CLASSES,
                inputSha256=source_hash,weightsSha256=hashlib.sha256((output/'weights.npz').read_bytes()).hexdigest(),
                metersPerPixel=[e['width']/w,e['height']/h],palettes=palettes)
    (output/'provenance.json').write_text(json.dumps(record,indent=2)+'\n')
    m['colorMaps']=maps
    manifest_path.write_text(json.dumps(m,separators=(',',':'))+'\n')
    return dict(width=w,height=h,colorMaps=maps,**record)
