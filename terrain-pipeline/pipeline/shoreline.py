"""Offline artistic shoreline classes and shared landward ribbon cross-sections.

Water topology is authoritative. RGB and 100 m relief only suggest materials.
"""
from collections import defaultdict
from functools import lru_cache
import gzip
import hashlib
import json
import math
import numpy as np

KINDS = ['unknown', 'beach', 'rock', 'cliff', 'marsh']
WIDTHS = [12, 25, 18, 10, 25]


def classify(rgb, relief):
    if relief is None: return 0, 0.0
    if relief > 35: return 3, 0.55
    if relief > 12: return 2, 0.4
    if rgb is None: return 0, 0.0
    r,g,b = rgb
    if r > 135 and g > 110 and b < r*.85 and relief < 8: return 1, 0.4
    if g > r*1.08 and g > b*1.15 and relief < 3: return 4, 0.3
    return 0, 0.15


def cross(a,b): return a[0]*b[1]-a[1]*b[0]


class Edges:
    """Short-range exact edge queries, including other bodies and dry holes."""
    def __init__(self, bodies):
        self.grid=defaultdict(list)
        for body in bodies:
            for ring in [body['polygon'],*body.get('holes',[])]:
                for a,b in zip(ring,ring[1:]+ring[:1]):
                    if a==b: continue
                    # Split long theater-clipping edges before indexing.
                    n=max(1,math.ceil(math.dist(a,b)/500))
                    for i in range(n):
                        p=[a[j]+(b[j]-a[j])*i/n for j in (0,1)]
                        q=[a[j]+(b[j]-a[j])*(i+1)/n for j in (0,1)]
                        for cell in self.cells(p,q): self.grid[cell].append((p,q))
    def cells(self,a,b):
        return ((x,z) for x in range(math.floor(min(a[0],b[0])/500),math.floor(max(a[0],b[0])/500)+1)
                for z in range(math.floor(min(a[1],b[1])/500),math.floor(max(a[1],b[1])/500)+1))
    def unsafe_quad(self,quad):
        # Crossing cross-sections fold narrow islands; contained water bodies
        # need an interior test because they need not intersect the band edges.
        def orient(a,b,c): return cross([b[j]-a[j] for j in (0,1)],[c[j]-a[j] for j in (0,1)])
        def intersects(a,b,c,d): return orient(a,b,c)*orient(a,b,d)<-1e-8 and orient(c,d,a)*orient(c,d,b)<-1e-8
        if intersects(quad[0],quad[1],quad[2],quad[3]) or intersects(quad[1],quad[2],quad[3],quad[0]): return True
        signs=[orient(quad[i],quad[(i+1)%4],quad[(i+2)%4]) for i in range(4)]
        if min(signs)<-1e-6 and max(signs)>1e-6: return True
        lo=[min(p[j] for p in quad) for j in (0,1)];hi=[max(p[j] for p in quad) for j in (0,1)]
        for cell in self.cells(lo,hi):
            for a,b in self.grid.get(cell,[]):
                signs=[orient(quad[i],quad[(i+1)%4],a) for i in range(4)]
                if min(signs)>1e-5 or max(signs)<-1e-5:return True
        return False
    def crossing(self,a,b):
        d=[b[j]-a[j] for j in (0,1)]
        for cell in self.cells(a,b):
            for p,q in self.grid.get(cell,[]):
                e=[q[j]-p[j] for j in (0,1)]; v=[p[j]-a[j] for j in (0,1)]; den=cross(d,e)
                if abs(den)<1e-9: continue
                t=cross(v,e)/den; u=cross(v,d)/den
                if 1e-5<t<1-1e-5 and -1e-7<=u<=1+1e-7: return True
        return False


def ribbon_ring(ring, hole, extents, edges, sample, override=None):
    points=[]
    for p in ring:
        if not points or p!=points[-1]: points.append(p)
    if len(points)>1 and points[0]==points[-1]: points.pop()
    if len(points)<3: return []
    # Collinear points do not change the boundary or its distance parameter.
    points=[p for i,p in enumerate(points) if abs(cross([p[j]-points[i-1][j] for j in (0,1)],
                    [points[(i+1)%len(points)][j]-p[j] for j in (0,1)]))>1e-6]
    if len(points)<3: return []
    area=sum(cross(p,points[(i+1)%len(points)]) for i,p in enumerate(points))
    sign=(1 if area>0 else -1)*(-1 if hole else 1)
    rows=[]; distance=0
    for i,p in enumerate(points):
        prev=points[i-1]; nxt=points[(i+1)%len(points)]
        if i: distance+=math.dist(prev,p)
        normals=[]
        for a,b in [(prev,p),(p,nxt)]:
            length=math.dist(a,b); normals.append([sign*(b[1]-a[1])/length,-sign*(b[0]-a[0])/length])
        nx,nz=np.sum(normals,axis=0); length=math.hypot(nx,nz)
        if length<1e-6: nx,nz=normals[1]; length=1
        nx/=length; nz/=length
        donor=[p[0]+nx*300,p[1]+nz*300]
        # Do not take color/relief from across a channel or from another island.
        rgb,relief=sample(p,donor) if not edges.crossing(p,donor) else (None,None)
        kind,confidence=classify(rgb,relief)
        width=WIDTHS[kind]
        if override:
            kind=KINDS.index(override['kind']);width=override.get('widthMeters',WIDTHS[kind]);confidence=1
        # Bounded miter: never grow past twice the nominal width at a sharp bend.
        offset=min(width*2,width/max(.5,nx*normals[1][0]+nz*normals[1][1]))
        if p[0] in (0,extents['width']) or p[1] in (0,extents['height']): offset=0
        for _ in range(8):
            inland=[p[0]+nx*offset,p[1]+nz*offset]
            if (0<=inland[0]<=extents['width'] and 0<=inland[1]<=extents['height'] and not edges.crossing(p,inland)): break
            offset*=.5
        else: offset=0
        rows.append([*p,p[0]+nx*offset,p[1]+nz*offset,distance,kind,confidence])
    # A landward edge must not bridge another water outline. Collapse unsafe
    # quads, retaining shared endpoints rather than leaving mismatched tile caps.
    for _ in range(12):
        changed=False
        for i,a in enumerate(rows):
            b=rows[(i+1)%len(rows)]
            if edges.crossing(a[2:4],b[2:4]) or edges.unsafe_quad([a[:2],b[:2],b[2:4],a[2:4]]):
                changed=True
                for row in (a,b):
                    row[2:4]=[(row[j]+row[j+2])*.5 for j in (0,1)]
        if not changed:break
    # Sub-centimeter slivers are neither useful detail nor robust at float32.
    for row in rows:
        if math.dist(row[:2],row[2:4])<.1:row[2:4]=row[:2]
    # Fail closed at residual complex junctions. Collapsing a shared cross-section
    # can affect its neighbors, so settle the ring before serializing.
    for _ in range(len(rows)):
        bad=[]
        for i,a in enumerate(rows):
            b=rows[(i+1)%len(rows)]
            if math.dist(a[:2],a[2:4])+math.dist(b[:2],b[2:4])<.1:continue
            if edges.crossing(a[2:4],b[2:4]) or edges.unsafe_quad([a[:2],b[:2],b[2:4],a[2:4]]):bad.append(i)
        if not bad:break
        for i in bad:
            for row in (rows[i],rows[(i+1)%len(rows)]):row[2:4]=row[:2]
    rows.append([*rows[0][:4],distance+math.dist(points[-1],points[0]),*rows[0][5:]])
    return [[float(v) if j<4 else (round(float(v),4) if j!=5 else int(v)) for j,v in enumerate(row)] for row in rows]


def bake_shorelines(path, overrides_path=None):
    m=json.loads(path.read_text()); root=path.parent
    overrides=json.loads(overrides_path.read_text()) if overrides_path else {}
    sea=[b for b in m['waterBodies'] if b['elevation']==0]
    ids={f'{b["id"]}/{i}' for b in sea for i in range(1+len(b.get('holes',[])))}
    for key,value in overrides.items():
        if key not in ids or value.get('kind') not in KINDS or not 0<float(value.get('widthMeters',25))<=100:
            raise ValueError('invalid shoreline override id/kind/width (0..100 m)')
    edges=Edges(m['waterBodies'])
    chunks={(c['x'],c['y']):c for c in m['chunks'] if c['lod']==1}
    @lru_cache(maxsize=16)
    def heights(x,z):
        c=chunks.get((x,z))
        if not c:return None
        packed=(root/c['path']).read_bytes()
        if hashlib.sha256(packed).hexdigest()!=c['sha256']: raise ValueError('height checksum mismatch')
        return np.frombuffer(gzip.decompress(packed),dtype='<u2').reshape(256,256)*c['scale']+c['offset']
    def elevation(p):
        x,z=p; c=chunks.get((int(x//25500),int(z//25500)))
        if not c:return None
        a=heights(c['x'],c['y']);sx=(x-c['originX'])/100;sz=(z-c['originZ'])/100
        ix=min(254,int(sx));iz=min(254,int(sz));fx=sx-ix;fz=sz-iz
        return float((a[iz,ix]*(1-fx)+a[iz,ix+1]*fx)*(1-fz)+(a[iz+1,ix]*(1-fx)+a[iz+1,ix+1]*fx)*fz)
    image=m.get('imagery');rgb=None
    if image:
        packed=(root/image['path']).read_bytes()
        if hashlib.sha256(packed).hexdigest()!=image['sha256']: raise ValueError('imagery checksum mismatch')
        rgb=np.frombuffer(gzip.decompress(packed),dtype='uint8').reshape(image['height'],image['width'],4)
    def sample(p,donor):
        if not (0<=donor[0]<m['extents']['width'] and 0<=donor[1]<m['extents']['height']):return None,None
        h0=elevation(p);h1=elevation(donor)
        color=rgb[min(image['height']-1,int(donor[1]/m['extents']['height']*image['height'])),min(image['width']-1,int(donor[0]/m['extents']['width']*image['width'])),:3].astype(float) if rgb is not None else None
        return color,max(0,h1-h0) if h0 is not None and h1 is not None else None
    rings=[];counts={k:0 for k in KINDS}
    for body in sea:
        for i,ring in enumerate([body['polygon'],*body.get('holes',[])]):
            key=f'{body["id"]}/{i}'
            rows=ribbon_ring(ring,i>0,m['extents'],edges,sample,overrides.get(key))
            if not rows:continue
            for row in rows[:-1]:counts[KINDS[row[5]]]+=1
            rings.append(dict(id=key,points=rows))
    document=dict(version=1,kinds=KINDS,rings=rings)
    raw=json.dumps(document,separators=(',',':')).encode();packed=gzip.compress(raw,mtime=0)
    if len(raw)>64*1024*1024 or sum(len(r['points']) for r in rings)>300000:raise ValueError('shoreline budget exceeded')
    output=root/'shorelines';output.mkdir(exist_ok=True)
    (output/'ribbons.json.gz').write_bytes(packed)
    m['shorelines']=dict(path='shorelines/ribbons.json.gz',byteLength=len(packed),decodedBytes=len(raw),sha256=hashlib.sha256(packed).hexdigest())
    record=dict(method='Artistic RGB/300 m relief hints v1; not verified shoreline geology',counts=counts,
                imagerySha256=image['sha256'] if image else None,overrides=overrides,waterSha256=hashlib.sha256(json.dumps(m['waterBodies'],sort_keys=True).encode()).hexdigest())
    (output/'provenance.json').write_text(json.dumps(record,indent=2)+'\n')
    (output/'overrides.json').write_text(json.dumps(overrides,indent=2)+'\n')
    path.write_text(json.dumps(m,separators=(',',':'))+'\n')
    return dict(**m['shorelines'],**record,rings=len(rings))


def validate_shorelines(path, manifest):
    meta=manifest['shorelines']; target=(path.parent/meta['path']).resolve()
    if not target.is_relative_to(path.parent.resolve()):raise ValueError('shoreline path escapes theater')
    packed=target.read_bytes()
    if (not 0<len(packed)<=32*1024*1024 or len(packed)!=meta['byteLength'] or hashlib.sha256(packed).hexdigest()!=meta['sha256']
            or not 0<meta['decodedBytes']<=64*1024*1024):raise ValueError('invalid shoreline transport')
    import io
    with gzip.GzipFile(fileobj=io.BytesIO(packed)) as stream:raw=stream.read(meta['decodedBytes']+1)
    if len(raw)!=meta['decodedBytes']:raise ValueError('invalid shoreline inflated length')
    doc=json.loads(raw)
    if doc['version']!=1 or doc['kinds']!=KINDS or len(doc['rings'])>50000:raise ValueError('invalid shoreline document')
    count=0;ids=set();e=manifest['extents']
    for ring in doc['rings']:
        rows=ring['points'];count+=len(rows)
        if count>300000 or len(rows)<4 or ring['id'] in ids:raise ValueError('invalid shoreline ring budget/id')
        ids.add(ring['id']);previous=-1
        for p in rows:
            if (len(p)!=7 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in p)
                or not 0<=p[0]<=e['width'] or not 0<=p[2]<=e['width'] or not 0<=p[1]<=e['height'] or not 0<=p[3]<=e['height']
                or math.dist(p[:2],p[2:4])>200.001 or not previous<=p[4]<=100000000 or p[5] not in range(5) or not 0<=p[6]<=1):raise ValueError('invalid shoreline point')
            previous=p[4]
        if rows[0][4]!=0 or any(rows[0][i]!=rows[-1][i] for i in (0,1,2,3,5,6)):raise ValueError('shoreline ring is not closed')
    return doc


def probe_shorelines(path):
    """Independent serialized-geometry gate, including post-serialization precision."""
    m=json.loads(path.read_text());doc=validate_shorelines(path,m);edges=Edges(m['waterBodies'])
    visible=0;collapsed=0
    for ring in doc['rings']:
        for i,(a,b) in enumerate(zip(ring['points'],ring['points'][1:])):
            if math.dist(a[:2],a[2:4])+math.dist(b[:2],b[2:4])<.1:collapsed+=1;continue
            if edges.unsafe_quad([a[:2],b[:2],b[2:4],a[2:4]]) or edges.crossing(a[2:4],b[2:4]):
                raise ValueError(f'unsafe shoreline quad: {ring["id"]} segment {i}')
            visible+=1
    return dict(visibleSegments=visible,collapsedSegments=collapsed,unsafe=0)
