"""Original deterministic material swatches; no satellite or retail pixels.
Run with the project's .venv Python from the repository root.
Rows: unknown, beach, rock, cliff, marsh. RGB colors are directly authored.
"""
import struct
import zlib
from pathlib import Path
import numpy as np

rng=np.random.default_rng(917)
y,x=np.mgrid[:128,:128]
colors=np.array([[139,132,111],[193,176,130],[133,129,120],[117,111,99],[109,119,76]])
rows=[]
for kind,color in enumerate(colors):
    noise=rng.normal(0,1,(128,128))
    ripple=np.sin(x*2*np.pi/32+2*np.sin(y*2*np.pi/64))
    grain=noise*[3,2,9,7,5][kind]+ripple*[2,2,7,10,4][kind]
    rows.append(np.clip(color+grain[:,:,None],0,255).astype('uint8'))
raw=b''.join(b'\x00'+row.tobytes() for row in np.concatenate(rows))
def chunk(kind,data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
png=(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',128,640,8,2,0,0,0))
     +chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))
Path('engine/src/terrain/assets/shoreline.png').write_bytes(png)
