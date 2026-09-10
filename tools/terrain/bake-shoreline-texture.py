"""Shoreline ribbon atlas: 5 rows (unknown, beach, rock, cliff, marsh), 384 x 128 each, RGBA.

Rows span the ribbon cross-section from the sea side (top) to the land side
(bottom); the water line sits at WATER_LINE of the row height. Alpha fades to
zero at both edges so the strip blends into water and terrain colors.

Sources are the user-authored grayscale paintings in gameassets/textures/
(beach, rocks, cliff, marsh; ignored by git, no retail or satellite pixels).
Each is made seamless along the coast, box-downsampled about 5.7x for a soft
look, then colored: luminance drives a two-tone land ramp per class and a
water-to-foam ramp on the sea side, so the ribbon matches the engine's slate
water and stays neutral across seasonal ground palettes. The unknown row is a
muted beach. Run with the project's .venv Python from the repository root.
"""
import struct
import zlib
from pathlib import Path
import numpy as np
import rasterio
from scipy.ndimage import gaussian_filter, zoom

W, H = 384, 128
WATER_LINE = 0.7 / 1.7  # matches SEA_RATIO in engine/src/terrain/shoreline.ts
root = Path(__file__).resolve().parents[2]
y, x = np.mgrid[:H, :W]
t = (y + 0.5) / H
WATER = np.array([0x28, 0x5E, 0x82], 'float32')
FOAM = np.array([205, 222, 228], 'float32')

# name, source file, dark land tone, light land tone, sea-side opacity
CLASSES = [
    ('unknown', 'beach-text.png', [118, 108, 88], [196, 186, 160], 0.6),
    ('beach', 'beach-text.png', [128, 112, 84], [226, 208, 160], 0.85),
    ('rock', 'rocks-text.png', [78, 76, 72], [178, 172, 160], 0.8),
    ('cliff', 'cliff-text.png', [66, 60, 54], [168, 156, 138], 0.8),
    ('marsh', 'marsh-text.png', [70, 78, 46], [176, 172, 128], 0.7),
]


def edge_alpha(sea_start, sea_full, land_full, land_end):
    a = np.clip((t - sea_start) / (sea_full - sea_start), 0, 1)
    a *= 1 - np.clip((t - land_full) / (land_end - land_full), 0, 1)
    return a


def seamless(img):
    """Blend the rolled seam into the original center so the left/right edges match."""
    w = img.shape[1]
    rolled = np.roll(img, w // 2, axis=1)
    band = w // 8
    d = np.abs(np.arange(w) - w / 2)
    m = np.clip(1 - (d - band) / band, 0, 1)[None, :]
    return rolled * (1 - m) + img * m


def luminance(name):
    with rasterio.open(root / 'gameassets/textures' / name) as src:
        img = src.read()[:3].astype('float32').mean(0)
    img = seamless(img)
    ratio = img.shape[1] / W, img.shape[0] / H
    soft = gaussian_filter(img, sigma=(ratio[1] / 2, ratio[0] / 2))
    lum = zoom(soft, (H / img.shape[0], W / img.shape[1]), order=1) / 255
    # Normalize the painting's mid-grey framing bands so ramps use the full range.
    lo, hi = np.percentile(lum, 2), np.percentile(lum, 98)
    return np.clip((lum - lo) / max(hi - lo, 1e-3), 0, 1)


def colorize(lum, dark, light, sea_opacity):
    land = np.array(dark, 'float32') + (np.array(light, 'float32') - dark) * lum[:, :, None]
    sea = WATER + (FOAM - WATER) * (lum[:, :, None] ** 1.6)
    k = np.clip((t - WATER_LINE) / 0.04 + 0.5, 0, 1)[:, :, None]
    rgb = sea * (1 - k) + land * k
    alpha = edge_alpha(0.02, 0.3, 0.62, 0.96) * (sea_opacity + (1 - sea_opacity) * k[:, :, 0])
    return rgb, alpha


rows = []
for _, name, dark, light, sea_opacity in CLASSES:
    rgb, alpha = colorize(luminance(name), dark, light, sea_opacity)
    rows.append(np.dstack([np.clip(rgb, 0, 255), np.clip(alpha, 0, 1) * 255]).astype('uint8'))
raw = b''.join(b'\x00' + row.tobytes() for row in np.concatenate(rows))


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, 5 * H, 8, 6, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
(root / 'engine/src/terrain/assets/shoreline.png').write_bytes(png)
print('wrote', W, 'x', 5 * H, 'RGBA atlas')
