"""Deterministic, bounded-memory terrain chunks from public raster sources."""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import sys
import urllib.request

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import shapes
from rasterio.transform import Affine, from_bounds
from rasterio.warp import reproject, transform_bounds
from rasterio.windows import from_bounds as window_bounds
from scipy.ndimage import map_coordinates, uniform_filter

SPACINGS = (30, 100, 300, 900, 2700)
SIZE = 256
ATTRIBUTION = [
    "Copernicus DEM GLO-30 2021, ESA; https://registry.opendata.aws/copernicus-dem/",
    "Copernicus DEM GLO-30 water body mask (WBM), ESA; ocean=1 lake=2 river=3",
]


def dump(path, obj):
    Path(path).write_text(json.dumps(obj, indent=2, allow_nan=False) + "\n")


def tile_name(lat, lon):
    return f"{'N' if lat >= 0 else 'S'}{abs(lat):02d}_{'E' if lon >= 0 else 'W'}{abs(lon):03d}"


def fetch(config, output):
    """Cache windowed public COG data, with source URLs and byte hashes."""
    output.mkdir(parents=True, exist_ok=True)
    west, south, east, north = config['bbox']
    pad = config.get('sourcePaddingDegrees', 0.5)
    bounds = (west-pad, south-pad, east+pad, north+pad)
    records = []
    tile_list_url = 'https://copernicus-dem-30m.s3.amazonaws.com/tileList.txt'
    tile_list_path = output/'tileList.txt'
    if not tile_list_path.exists():
        urllib.request.urlretrieve(tile_list_url, tile_list_path)
    available = set(tile_list_path.read_text().splitlines())
    for kind, step in [('dem', 1), ('water', 1)]:
        for lat in range(math.floor(bounds[1]/step)*step, math.ceil(bounds[3]), step):
            for lon in range(math.floor(bounds[0]/step)*step, math.ceil(bounds[2]), step):
                name = tile_name(lat, lon)
                a, b = name.split('_')
                stem = f'Copernicus_DSM_COG_10_{a}_00_{b}_00_DEM'
                prefix = f'https://copernicus-dem-30m.s3.amazonaws.com/{stem}'
                url = f'{prefix}/{stem}.tif' if kind == 'dem' else f'{prefix}/AUXFILES/{stem[:-3]}WBM.tif'
                target = output / f'{kind}-{name}.tif'
                if stem not in available and stem+'/' not in available:
                    # Publisher explicitly identifies unlisted ocean geocells as zero height.
                    # Ukraine has public coverage; other theaters must review restricted tiles.
                    if config['id'] != 'ukraine':
                        raise ValueError(f'Unlisted tile {stem}: establish ocean versus restricted coverage')
                    if not target.exists():
                        with rasterio.open(target,'w',driver='GTiff',width=2,height=2,count=1,
                                           dtype='float32',crs='EPSG:4326',transform=from_bounds(lon,lat,lon+1,lat+1,2,2)) as dst:
                            dst.write(np.full((2,2),0 if kind=='dem' else 1,dtype='float32'),1)
                    records.append({'kind':kind,'url':tile_list_url,'path':target.name,
                                    'oceanTileAbsentFromPublishedList':True,
                                    'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
                    continue
                if not target.exists():
                    print(f'fetch {kind} {name}', flush=True)
                    try:
                        with rasterio.open(url) as src:
                            crop = (max(bounds[0], src.bounds.left), max(bounds[1], src.bounds.bottom),
                                    min(bounds[2], src.bounds.right), min(bounds[3], src.bounds.top))
                            if crop[0] >= crop[2] or crop[1] >= crop[3]:
                                continue
                            # Cache at approximately 30 m, preserving categorical water values.
                            width = max(1, math.ceil((crop[2]-crop[0])*3600))
                            height = max(1, math.ceil((crop[3]-crop[1])*3600))
                            arr = src.read(1, window=window_bounds(*crop, src.transform),
                                           out_shape=(height, width), resampling=Resampling.nearest)
                            profile = dict(driver='GTiff', width=width, height=height, count=1,
                                           dtype=arr.dtype, crs=src.crs, transform=from_bounds(*crop,width,height),
                                           nodata=src.nodata, compress='deflate', tiled=True)
                            with rasterio.open(str(target)+'.tmp', 'w', **profile) as dst:
                                dst.write(arr, 1)
                            Path(str(target)+'.tmp').replace(target)
                    except rasterio.errors.RasterioIOError:
                        raise
                records.append({'kind':kind, 'url':url, 'path':target.name,
                                'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
    dump(output/'sources.json', {'config':config, 'sources':records, 'attribution':ATTRIBUTION})


class RasterSource:
    def __init__(self, root, config):
        self.root = root
        info = json.loads((root/'sources.json').read_text())
        if info['config']['bbox'] != config['bbox']:
            raise ValueError('source bounding box differs from build config; fetch again')
        self.datasets = {'dem':[], 'water':[]}
        for item in info['sources']:
            if 'path' in item:
                path = root/item['path']
                if hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
                    raise ValueError(f'source checksum mismatch: {path}')
                self.datasets[item['kind']].append(rasterio.open(path))
        west,south,east,north = config['bbox']
        self.crs = f'+proj=laea +lat_0={(south+north)/2} +lon_0={(west+east)/2} +datum=WGS84 +units=m +no_defs'
        left,bottom,right,top = transform_bounds('EPSG:4326',self.crs,*config['bbox'],densify_pts=41)
        self.origin = (left,bottom)
        self.extents = (right-left,top-bottom)

    def sample(self, xs, zs, kind='dem'):
        # Warp only the requested grid; constant boundary extension applies to padded chunk samples.
        xs = np.clip(xs,0,self.extents[0]); zs = np.clip(zs,0,self.extents[1])
        spacing = 30 if len(xs)<2 else max(1, float(np.max(np.diff(xs))))
        nx = max(1, math.ceil((xs[-1]-xs[0])/spacing)+1)
        nz = max(1, math.ceil((zs[-1]-zs[0])/spacing)+1)
        transform = Affine(spacing,0,self.origin[0]+xs[0]-spacing/2,0,spacing,self.origin[1]+zs[0]-spacing/2)
        dest = np.full((nz,nx), np.nan, dtype='float32')
        for src in self.datasets[kind]:
            bounds = transform_bounds(src.crs,self.crs,*src.bounds,densify_pts=21)
            if bounds[2]<transform.c or bounds[0]>transform.c+nx*spacing or bounds[3]<transform.f or bounds[1]>transform.f+nz*spacing:
                continue
            reproject(rasterio.band(src,1), dest, src_transform=src.transform,src_crs=src.crs,
                      src_nodata=src.nodata,dst_transform=transform,dst_crs=self.crs,dst_nodata=np.nan,
                      init_dest_nodata=False,resampling=Resampling.nearest if kind=='water' else Resampling.bilinear)
        result = map_coordinates(dest,[(zs[:,None]-zs[0])/spacing+np.zeros((len(zs),len(xs))),
                                      (xs[None,:]-xs[0])/spacing+np.zeros((len(zs),len(xs)))],order=0 if kind=='water' else 1,mode='nearest')
        if kind == 'dem' and np.isnan(result).any():
            water = self.sample(xs,zs,'water')
            result[np.isnan(result) & (water==1)] = 0
        if not np.isfinite(result).all():
            raise ValueError(f'uncovered/void {kind} pixels near local {xs[0]}, {zs[0]}')
        return result

    def close(self):
        for datasets in self.datasets.values():
            for src in datasets:
                src.close()


class SyntheticSource:
    crs = '+proj=laea +lat_0=46.5 +lon_0=31.5 +datum=WGS84 +units=m'
    origin = (0,0)
    extents = (51000,51000)

    def sample(self,xs,zs,kind='dem'):
        x,z = np.meshgrid(np.clip(xs,0,self.extents[0]),np.clip(zs,0,self.extents[1]))
        water = ((x<10000)&(z<16000)) | (((x-30000)**2+(z-28000)**2)<3500**2)
        if kind=='water':
            return np.where(water,np.where(x<10000,1,2),0).astype('float32')
        heights = 200+150*np.sin(x/5000)*np.cos(z/7000)+900*np.exp(-((x-36000)**2+(z-40000)**2)/8e7)
        return np.where(water,np.where(x<10000,0,240),heights).astype('float32')

    def close(self):
        pass


def encode(values):
    if values.shape != (SIZE,SIZE) or not np.isfinite(values).all():
        raise ValueError('chunk must contain 256x256 finite heights')
    low, high = float(values.min()),float(values.max())
    scale = max((high-low)/65535, 0.001)
    raw = np.rint((values-low)/scale).astype('<u2').tobytes()
    return gzip.compress(raw,compresslevel=9,mtime=0),low,scale,high


def build(config, output, source):
    output.mkdir(parents=True, exist_ok=True)
    width,height = source.extents
    base_x = np.arange(math.ceil(width/100)+1)*100
    base_z = np.arange(math.ceil(height/100)+1)*100
    base = source.sample(base_x,base_z)
    water_classes = source.sample(base_x,base_z,'water')
    mask = water_classes>0
    # Vectorize scanline runs: rectangles preserve islands/holes without a polygon-hole extension.
    water_bodies = []
    from scipy.ndimage import label, find_objects
    labels = np.zeros(mask.shape,dtype='int32')
    count = 0
    # Separate ocean/lakes/rivers; river elevation bands avoid flattening an entire watershed.
    bands = np.where(water_classes==3, np.rint(base/5)*5+100000,water_classes)
    for value in np.unique(bands[mask]):
        parts,n = label(mask & (bands==value))
        labels[parts>0] = parts[parts>0]+count
        count += n
    for ident,region in enumerate(find_objects(labels),1):
        if region is None:
            continue
        body = labels[region]==ident
        elevation = 0 if np.any(water_classes[region][body]==1) else float(np.median(base[region][body]))
        x0,z0=region[1].start*100,region[0].start*100
        for geometry,_ in shapes(body.astype('uint8'),mask=body,transform=Affine(100,0,x0,0,100,z0)):
            # Complex polygons with holes are represented as row rectangles to preserve dry islands.
            rings=geometry['coordinates']
            if len(rings)==1:
                polys=[rings[0]]
            else:
                polys=[]
                for row in np.flatnonzero(body.any(axis=1)):
                    indices=np.flatnonzero(body[row]); splits=np.split(indices,np.flatnonzero(np.diff(indices)>1)+1)
                    for run in splits:
                        polys.append([(x0+int(run[0])*100,z0+int(row)*100),(x0+(int(run[-1])+1)*100,z0+int(row)*100),(x0+(int(run[-1])+1)*100,z0+(int(row)+1)*100),(x0+int(run[0])*100,z0+(int(row)+1)*100)])
            for polygon in polys:
                polygon=[[min(width,max(0,float(x)-50)),min(height,max(0,float(z)-50))] for x,z in polygon]
                water_bodies.append({'id':f'water-{ident}-{len(water_bodies)}','elevation':elevation,'polygon':polygon})
    manifest = dict(schemaVersion=1,id=config['id'],name=config['name'],
                    projection=dict(crs=source.crs,originX=source.origin[0],originY=source.origin[1]),
                    extents=dict(width=width,height=height),lods=[],attribution=ATTRIBUTION if isinstance(source,RasterSource) else ['Original synthetic test fixture'],
                    source='Copernicus GLO-30 2021 DEM and WBM' if isinstance(source,RasterSource) else 'synthetic analytic hills and water; not real Ukraine terrain',
                    chunks=[],waterBodies=water_bodies)
    # Detail decisions are standard deviation of 30m samples over each 100m base tile.
    detail_regions=set()
    for y in range(math.ceil(height/25500)):
        for x in range(math.ceil(width/25500)):
            values=source.sample(np.arange(851)*30+x*25500,np.arange(851)*30+y*25500)
            if float(np.std(values))>=config.get('roughnessThreshold',80):
                detail_regions.add((x,y))
    for lod,spacing in enumerate(SPACINGS):
        filtered_base = uniform_filter(base,size=round(spacing/100),mode="nearest") if lod>1 else base
        span=255*spacing
        for y in range(math.ceil(height/span)):
            for x in range(math.ceil(width/span)):
                if lod==0:
                    covered={(a,b) for a in range(int(x*span//25500),int(((x+1)*span-1)//25500)+1)
                             for b in range(int(y*span//25500),int(((y+1)*span-1)//25500)+1)}
                    if not covered & detail_regions:
                        continue
                    values=source.sample(np.arange(SIZE)*spacing+x*span,np.arange(SIZE)*spacing+y*span)
                else:
                    xs=np.clip((np.arange(SIZE)*spacing+x*span)/100,0,base.shape[1]-1)
                    zs=np.clip((np.arange(SIZE)*spacing+y*span)/100,0,base.shape[0]-1)
                    zz,xx=np.meshgrid(zs,xs,indexing='ij')
                    values=map_coordinates(filtered_base,[zz,xx],order=1,mode='nearest')
                data,offset,scale,high=encode(values)
                path=f'chunks/{lod}/{x}-{y}.u16.gz'
                target=output/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
                manifest['chunks'].append(dict(lod=lod,x=x,y=y,path=path,originX=x*span,originZ=y*span,
                                               spacing=spacing,size=SIZE,offset=offset,scale=scale,
                                               minElevation=offset,maxElevation=high,byteLength=len(data),sha256=hashlib.sha256(data).hexdigest()))
        if any(c['lod']==lod for c in manifest['chunks']):
            manifest['lods'].append(lod)
        print(f'built LOD {lod}: {sum(c["lod"]==lod for c in manifest["chunks"])} chunks',flush=True)
    dump(output/'manifest.json',manifest)
    dump(output/'build-info.json',{'config':config,'roughnessDetailRegions':len(detail_regions),
                                 'waterGridMeters':100,'compression':'gzip level9 mtime0 uint16LE',
                                 'sourceManifest':str(source.root/'sources.json') if isinstance(source,RasterSource) else None})
    return probe(output/'manifest.json')


def probe(path):
    manifest=json.loads(path.read_text())
    if manifest.get('schemaVersion')!=1 or not manifest.get('chunks'):
        raise ValueError('invalid/empty terrain manifest')
    width,height=manifest['extents']['width'],manifest['extents']['height']
    if not all(math.isfinite(v) and v>0 for v in (width,height)):
        raise ValueError('invalid theater extents')
    cache={}; compressed=0
    for c in manifest['chunks']:
        if not isinstance(c['lod'],int) or not 0<=c['lod']<len(SPACINGS):
            raise ValueError('invalid LOD')
        if not all(isinstance(c[k],int) and c[k]>=0 for k in ['x','y']):
            raise ValueError('invalid chunk coordinates')
        if c['originX']!=c['x']*255*c['spacing'] or c['originZ']!=c['y']*255*c['spacing']:
            raise ValueError('chunk origin/address mismatch')
        key=(c['lod'],c['x'],c['y'])
        if key in cache or c['size']!=SIZE or c['spacing']!=SPACINGS[c['lod']]:
            raise ValueError('duplicate chunk or invalid addressing')
        target=(path.parent/c['path']).resolve()
        if not target.is_relative_to(path.parent.resolve()):
            raise ValueError('chunk path escapes manifest folder')
        data=target.read_bytes()
        if len(data)!=c['byteLength'] or hashlib.sha256(data).hexdigest()!=c['sha256']:
            raise ValueError(f'chunk checksum/length mismatch: {c["path"]}')
        import io
        with gzip.GzipFile(fileobj=io.BytesIO(data)) as stream:
            raw=stream.read(SIZE*SIZE*2+1)
        if len(raw)!=SIZE*SIZE*2:
            raise ValueError('invalid decompressed chunk size')
        if not math.isfinite(c['scale']) or c['scale']<=0 or not math.isfinite(c['offset']):
            raise ValueError('invalid quantization metadata')
        vals=np.frombuffer(raw,dtype='<u2').reshape(SIZE,SIZE)*c['scale']+c['offset']
        if vals.min()<c['minElevation']-c['scale'] or vals.max()>c['maxElevation']+c['scale']:
            raise ValueError('elevation range mismatch')
        cache[key]=({'west':vals[:,0].copy(),'east':vals[:,-1].copy(),'south':vals[0,:].copy(),'north':vals[-1,:].copy()},c); compressed+=len(data)
    if sorted(set(c['lod'] for c in manifest['chunks']))!=manifest['lods']:
        raise ValueError('LOD index mismatch')
    for lod in range(1,5):
        for x in range(math.ceil(width/(255*SPACINGS[lod]))):
            for y in range(math.ceil(height/(255*SPACINGS[lod]))):
                if (lod,x,y) not in cache:
                    raise ValueError('missing base/coarse coverage')
    max_seam=0
    for (lod,x,y),(vals,c) in cache.items():
        for neighbour,edge in [((lod,x+1,y),'east'),((lod,x,y+1),'north')]:
            if neighbour in cache:
                other,meta=cache[neighbour]
                error=float(np.max(np.abs(vals['east']-other['west'] if edge=='east' else vals['north']-other['south'])))
                if error>(c['scale']+meta['scale'])/2+1e-4:
                    raise ValueError(f'chunk seam exceeds quantization tolerance: {c["path"]}')
                max_seam=max(max_seam,error)
    for body in manifest['waterBodies']:
        if not math.isfinite(body['elevation']) or len(body['polygon'])<3 or not np.isfinite(body['polygon']).all():
            raise ValueError('invalid flat water polygon')
        if any(not (0<=x<=width and 0<=z<=height) for x,z in body['polygon']):
            raise ValueError('water polygon outside theater')
    report={'chunks':len(cache),'compressedBytes':compressed,'rawBytes':len(cache)*SIZE*SIZE*2,
            'compressionRatio':compressed/(len(cache)*SIZE*SIZE*2),'maxSeamErrorMeters':max_seam,
            'waterBodies':len(manifest['waterBodies']),'source':manifest['source']}
    dump(path.parent/'probe.json',report)
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='command',required=True)
    for command in ['fetch','build','fixture']:
        p=sub.add_parser(command);p.add_argument('--config',type=Path,default=Path('theaters/ukraine.json'));p.add_argument('--output',type=Path,required=True)
        if command=='build':p.add_argument('--source',type=Path,required=True)
    sub.add_parser('probe').add_argument('manifest',type=Path)
    args=parser.parse_args()
    try:
        if args.command=='probe': result=probe(args.manifest)
        else:
            config=json.loads(args.config.read_text())
            if args.command=='fetch':result=fetch(config,args.output)
            else:
                source=SyntheticSource() if args.command=='fixture' else RasterSource(args.source,config)
                try:result=build(config,args.output,source)
                finally:source.close()
        if result is not None:print(json.dumps(result,indent=2))
    except (ValueError,OSError,rasterio.errors.RasterioError) as exc:
        print(f'terrain pipeline: {exc}',file=sys.stderr);sys.exit(1)
