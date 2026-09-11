"""Direct Sentinel-2 L2A summer composite from public Earth Search COGs."""
import hashlib
import json
import math
import urllib.parse
import urllib.request

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.transform import Affine
from rasterio.warp import transform_bounds, reproject
from scipy.ndimage import binary_dilation, distance_transform_edt

from .imagery import add_imagery

ATTRIBUTION = 'Contains modified Copernicus Sentinel data 2024'
LICENSE = 'Copernicus Sentinel Data Legal Notice: https://cds.climate.copernicus.eu/licences/ec-sentinel; processed from Sentinel-2 L2A COGs via Earth Search / AWS Open Data'


def clear_pixels(scl):
    # L2A classes: vegetation, bare ground, water, dark area. Reject clouds/shadows/snow.
    clear = np.isin(scl, [2, 4, 5, 6])
    contaminated = np.isin(scl, [1, 3, 8, 9, 10, 11])
    return clear & ~binary_dilation(contaminated, iterations=1)


def projected_clear(scl, src_transform, src_crs, dst_transform, dst_crs, shape):
    # Aggregate native contamination, not nearest-downsampled class labels.
    bad=(~np.isin(scl,[2,4,5,6])).astype('uint8')
    projected=np.full(shape,255,dtype='uint8')
    reproject(bad,projected,src_transform=src_transform,src_crs=src_crs,
              dst_transform=dst_transform,dst_crs=dst_crs,src_nodata=255,dst_nodata=255,
              resampling=Resampling.max)
    return ~binary_dilation(projected.astype(bool),iterations=1)


def stable_colors(samples):
    """Require three distinct-date colors within 12/255 of the per-channel median."""
    valid=np.any(samples,axis=1)
    floating=samples.astype('float32')
    floating[~np.broadcast_to(valid[:,None,:],floating.shape)]=np.nan
    # Missing points are reported by the caller, never silently replaced by black.
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter('ignore',RuntimeWarning)
        center=np.nanmedian(floating,axis=0)
    agrees=valid & np.all(np.abs(floating-center[None,:,:])<=12,axis=1)
    accepted=agrees.sum(axis=0)>=3
    return np.nan_to_num(center).astype('uint8'),accepted


def fill_stable_gaps(rgb,covered,water,used,items,output,grid_key,p,transform):
    missing=~covered & ~water
    yy,xx=np.where(missing)
    if not len(xx):return 0
    lookup=np.full(covered.shape,-1,dtype='int32');lookup[yy,xx]=np.arange(len(xx))
    samples=np.zeros((32,3,len(xx)),dtype='uint8')
    dates=np.full((32,len(xx)),-1,dtype='int16');counts=np.zeros(len(xx),dtype='uint8')
    by_id={item['id']:item for item in items}
    for record in used:
        item=by_id[record['id']];box=transform_bounds('EPSG:4326',p['crs'],*item['bbox'],densify_pts=21)
        x0=max(0,math.floor((box[0]-p['originX'])/transform.a)-2)
        y0=max(0,math.floor((box[1]-p['originY'])/transform.e)-2)
        with np.load(output/f"{grid_key}-{item['id']}.npz") as saved:color=saved['rgb']
        h,w=color.shape[1:];ids=lookup[y0:y0+h,x0:x0+w];ly,lx=np.where(ids>=0);idx=ids[ly,lx]
        date=int(record['datetime'][5:7])*31+int(record['datetime'][8:10])
        vals=color[:,ly,lx]
        eligible=(counts[idx]<32)&np.any(vals,axis=0)&~np.any(dates[:,idx]==date,axis=0)
        idx=idx[eligible];vals=vals[:,eligible];slots=counts[idx]
        samples[slots,:,idx]=vals.T;dates[slots,idx]=date;counts[idx]+=1
    colors,accepted=stable_colors(samples)
    rgb[:,yy[accepted],xx[accepted]]=colors[:,accepted];covered[yy[accepted],xx[accepted]]=True
    return int(accepted.sum())


def fill_small_gaps(rgb,covered,water,max_fraction=0.005,max_radius=6):
    """Bounded color interpolation only: configured land fraction and radius."""
    if not 0 < max_fraction <= 0.02:
        raise ValueError('Maximum interpolation fraction must be between 0 and 0.02')
    if not 0 < max_radius <= 12:
        raise ValueError('Maximum interpolation radius must be between 0 and 12 pixels')
    missing=~covered & ~water
    count=int(missing.sum())
    if not count:return 0,0.0
    if count>int((~water).sum())*max_fraction:
        raise ValueError(f'Too much missing land imagery to interpolate: {count} pixels')
    distance,indices=distance_transform_edt(~covered,return_indices=True)
    maximum=float(distance[missing].max())
    if maximum>max_radius:
        raise ValueError(f'Land imagery gap exceeds {max_radius}-pixel interpolation radius: {maximum}')
    for band in range(3):rgb[band,missing]=rgb[band,indices[0][missing],indices[1][missing]]
    covered[missing]=True
    return count,maximum


def ranked_scenes(items):
    groups = {}
    for item in items:
        groups.setdefault(item['properties']['grid:code'], []).append(item)
    def score(item):
        p = item['properties']
        return (p['eo:cloud_cover'] + p.get('s2:nodata_pixel_percentage', 0)*0.1,
                abs(int(p['datetime'][5:7])-7), p['datetime'], item['id'])
    return [item for rank in range(6) for key in sorted(groups)
            for item in sorted(groups[key], key=score)[rank:rank+1]]


def fetch_sentinel(manifest_path, output, size=3072, max_gap_fraction=0.005, max_gap_radius=6):
    if not 2 <= size <= 6144:
        raise ValueError('imagery size must be 2..6144')
    m = json.loads(manifest_path.read_text()); p, e = m['projection'], m['extents']
    width=max(2,round(size*e['width']/max(e.values())))
    height=max(2,round(size*e['height']/max(e.values())))
    transform=Affine(e['width']/width,0,p['originX'],0,e['height']/height,p['originY'])
    bounds=transform_bounds(p['crs'],'EPSG:4326',p['originX'],p['originY'],
                            p['originX']+e['width'],p['originY']+e['height'],densify_pts=41)
    output.mkdir(parents=True,exist_ok=True)
    query={'collections':'sentinel-2-l2a','bbox':','.join(map(str,bounds)),
           'datetime':'2024-06-01T00:00:00Z/2024-08-31T23:59:59Z','limit':100,
           'query':json.dumps({'eo:cloud_cover':{'lt':5}})}
    key=hashlib.sha256(json.dumps(query,sort_keys=True).encode()).hexdigest()[:16]
    catalog=output/f'catalog-{key}.json'
    if catalog.exists():items=json.loads(catalog.read_text())
    else:
        url='https://earth-search.aws.element84.com/v1/search?'+urllib.parse.urlencode(query)
        items=[]
        for _ in range(30):
            page=json.load(urllib.request.urlopen(url,timeout=60));items.extend(page['features'])
            link=next((l for l in page['links'] if l['rel']=='next'),None)
            if not link:break
            url=link['href']
        else:raise ValueError('Sentinel catalog exceeds 3000 scene budget')
        catalog.write_text(json.dumps(items))
    if not items:raise ValueError('No low-cloud Sentinel scenes found')
    grid_key=hashlib.sha256(json.dumps([p,e,width,height,"native-mask-v3"]).encode()).hexdigest()[:16]
    old_grid_key=hashlib.sha256(json.dumps([p,e,width,height,"overview-v1"]).encode()).hexdigest()[:16]
    rgb=np.zeros((3,height,width),dtype='uint8');covered=np.zeros((height,width),dtype=bool)
    # Only authoritative manifest water can fill gaps in satellite coverage.
    shapes=[({'type':'Polygon','coordinates':[body['polygon'],*body.get('holes',[])]},1)
            for body in m['waterBodies']]
    water=rasterize(shapes,out_shape=(height,width),transform=Affine(e['width']/width,0,0,0,e['height']/height,0),dtype='uint8')>0
    used=[]
    scenes=ranked_scenes(items)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_TIMEOUT=60,
                      GDAL_HTTP_MAX_RETRY=3,GDAL_CACHEMAX=128*1024*1024):
        for i,item in enumerate(scenes):
            box=transform_bounds('EPSG:4326',p['crs'],*item['bbox'],densify_pts=21)
            x0=max(0,math.floor((box[0]-p['originX'])/transform.a)-2)
            x1=min(width,math.ceil((box[2]-p['originX'])/transform.a)+2)
            y0=max(0,math.floor((box[1]-p['originY'])/transform.e)-2)
            y1=min(height,math.ceil((box[3]-p['originY'])/transform.e)+2)
            if x1<=x0 or y1<=y0:continue
            view=covered[y0:y1,x0:x1]
            if np.all(view | water[y0:y1,x0:x1]):continue
            cache=output/f"{grid_key}-{item['id']}.npz"
            if cache.exists():
                with np.load(cache) as saved:color=saved['rgb'];clear=saved['clear']
            else:
                dst_transform=transform*Affine.translation(x0,y0)
                previous=output/f"{old_grid_key}-{item['id']}.npz"
                if previous.exists():
                    with np.load(previous) as saved:color=saved['rgb']
                else:
                    with rasterio.open(item['assets']['visual']['href']) as src:
                        factor=max(1,2**math.floor(math.log2(min(transform.a,transform.e)/max(src.res))))
                        sw,sh=math.ceil(src.width/factor),math.ceil(src.height/factor)
                        sample=src.read(out_shape=(src.count,sh,sw),resampling=Resampling.bilinear)
                        color=np.zeros((src.count,y1-y0,x1-x0),dtype='uint8')
                        reproject(sample,color,src_transform=src.transform*Affine.scale(src.width/sw,src.height/sh),
                                  src_crs=src.crs,src_nodata=0,dst_transform=dst_transform,dst_crs=p['crs'],
                                  dst_nodata=0,resampling=Resampling.bilinear)
                with rasterio.open(item['assets']['scl']['href']) as src:
                    clear=projected_clear(src.read(1),src.transform,src.crs,dst_transform,p['crs'],(y1-y0,x1-x0))
                np.savez_compressed(cache,rgb=color,clear=clear)
            valid=clear & np.any(color,axis=0) & ~view
            for band in range(3):rgb[band,y0:y1,x0:x1][valid]=color[band][valid]
            view[valid]=True
            used.append(dict(id=item['id'],datetime=item['properties']['datetime'],
                             cloudPercent=item['properties']['eo:cloud_cover'],
                             assets={k:item['assets'][k]['href'] for k in ['visual','scl']},
                             cacheSha256=hashlib.sha256(cache.read_bytes()).hexdigest(),pixels=int(valid.sum())))
            print(f"Sentinel {i+1}/{len(scenes)} {item['id']}: {int((~covered & ~water).sum())} land pixels remaining",flush=True)
            if np.all(covered | water):break
    stable_fill=fill_stable_gaps(rgb,covered,water,used,items,output,grid_key,p,transform)
    missing=~covered & ~water
    print(f'Temporal agreement filled {stable_fill} mask-gap pixels; {int(missing.sum())} remain',flush=True)
    if missing.any():
        np.savez_compressed(output/'incomplete-coverage.npz',rgb=rgb,covered=covered,water=water)
    interpolated,interpolation_radius=fill_small_gaps(rgb,covered,water,max_gap_fraction,max_gap_radius)
    print(f'Interpolated {interpolated} residual color pixels, max radius {interpolation_radius:.2f} pixels',flush=True)
    for band,value in enumerate([40,94,130]):rgb[band,~covered]=value
    mosaic=output/f'sentinel-2024-{grid_key}.tif'
    with rasterio.open(mosaic,'w',driver='GTiff',width=width,height=height,count=3,dtype='uint8',
                       crs=p['crs'],transform=transform,compress='deflate') as dst:dst.write(rgb)
    (output/f'sentinel-2024-{grid_key}.json').write_text(json.dumps(dict(query=query,scenes=used,
        processingVersion="native-mask-v3-temporal-median12-gap6",stableMinimumDates=3,
        stableToleranceFromMedian=12,waterFillPixels=int((~covered).sum()),stableMaskGapPixels=stable_fill,interpolatedLandPixels=interpolated,
        maxInterpolationRadiusPixels=interpolation_radius,maxInterpolationFraction=max_gap_fraction,
        maximumAllowedInterpolationRadiusPixels=max_gap_radius,
        sourceResolutionMeters=10,attribution=ATTRIBUTION,license=LICENSE),indent=2)+'\n')
    result=add_imagery(manifest_path,mosaic,ATTRIBUTION,LICENSE,size)
    m=json.loads(manifest_path.read_text());m['imagery']['attributionDisplay']='credits'
    manifest_path.write_text(json.dumps(m,separators=(',',':'))+'\n')
    result['imagery']=m['imagery'];result['sourceResolutionMeters']=10
    (manifest_path.parent/'imagery-info.json').write_text(json.dumps(result,indent=2)+'\n')
    return result
