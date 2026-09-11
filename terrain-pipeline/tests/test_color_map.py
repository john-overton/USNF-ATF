import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
from pipeline.color_map import appearance_weights, bake_color_maps, palette_rgb, PALETTES, snow_amount, validate_snow, elevation_grid


class ColorMapTests(unittest.TestCase):
    def snow_rules(self):
        return dict(color='#e5e9ed', seasons={s:[1800,2400] if s=='winter' else [3300,3800]
                                          for s in PALETTES}, permanent=[3800,4100])

    def test_snow_bands_and_permanent_override(self):
        rules=self.snow_rules();validate_snow(rules)
        heights=np.array([1200,1800,2100,2400,3300,3550,3800,4100])
        winter=snow_amount(heights,'winter',rules);summer=snow_amount(heights,'summer',rules)
        self.assertEqual(winter[0],0);self.assertEqual(winter[2],.5)
        self.assertEqual(summer[5],.5);self.assertTrue(np.all(winter>=summer))
        rules['seasons']['summer']=[5000,6000]
        self.assertEqual(snow_amount(np.array([4100]),'summer',rules)[0],1)
        for band in ([2400,1800], [1800,1800], [float('nan'),2400], [True,2400]):
            rules['permanent']=band
            with self.assertRaises(ValueError):validate_snow(rules)

    def test_dem_snow_bake_registration_reuse_and_missing_coverage(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path,m=self.fixture(root,[0,0,255])
            # Linear east/north ramp makes texel-center registration observable.
            a=(1000+np.arange(256)[None,:]*100+np.arange(256)[:,None]*100).astype('<u2')
            data=gzip.compress(a.tobytes(),mtime=0);(root/'height.gz').write_bytes(data)
            m['chunks']=[dict(lod=1,originX=0,originZ=0,path='height.gz',scale=1,offset=0,
                              byteLength=len(data),sha256=hashlib.sha256(data).hexdigest())]
            path.write_text(json.dumps(m));rules=self.snow_rules()
            snow=root/'snow.json';snow.write_text(json.dumps(rules))
            heights,_=elevation_grid(m,root,8,8)
            self.assertEqual(heights[0,0],1200);self.assertEqual(heights[-1,-1],4000)
            bake_color_maps(path,8,snow_path=snow)
            baked=json.loads(path.read_text());before=baked['colorMaps']
            pixels=np.frombuffer(gzip.decompress((root/before['summer']['path']).read_bytes()),dtype='uint8').reshape(8,8,4)
            np.testing.assert_array_equal(pixels[-1,-1],[229,233,237,255])
            self.assertEqual(baked['chunks'],m['chunks']);self.assertEqual(baked['waterBodies'],m['waterBodies'])
            (root/'image.gz').unlink()
            bake_color_maps(path,weights_path=root/'color-maps/weights.npz',snow_path=snow)
            self.assertEqual(before,json.loads(path.read_text())['colorMaps'])
            m['chunks']=[]
            with self.assertRaisesRegex(ValueError,'coverage'):elevation_grid(m,root,8,8)

    def fixture(self, root, water_color):
        root.mkdir(exist_ok=True)
        rgba=np.full((16,16,4),255,dtype='uint8');rgba[:,:,:3]=[21,158,100];rgba[:,:8,:3]=water_color
        data=gzip.compress(rgba.tobytes(),mtime=0);(root/'image.gz').write_bytes(data)
        m=dict(projection=dict(crs='EPSG:32636',originX=0,originY=0),extents=dict(width=1600,height=1600),chunks=['unchanged'],
               waterBodies=[dict(elevation=0,polygon=[[0,0],[800,0],[800,1600],[0,1600],[0,0]])],
               imagery=dict(path='image.gz',width=16,height=16,byteLength=len(data),sha256=hashlib.sha256(data).hexdigest(),attribution='Synthetic',license='CC0'))
        path=root/'manifest.json';path.write_text(json.dumps(m));return path,m

    def test_weights_normalize_and_palettes_control_colors(self):
        weights=appearance_weights(np.array([[[55,75,40],[175,150,100]]],dtype='uint8'))
        np.testing.assert_allclose(weights.sum(axis=-1),1,atol=1e-6)
        self.assertGreater(weights[0,0,0],weights[0,0,2])
        self.assertGreater(weights[0,1,2],weights[0,1,0])
        np.testing.assert_array_equal(palette_rgb(weights,['#112233']*4),np.array([[[17,34,51],[17,34,51]]]))

    def test_water_pixels_do_not_contaminate_land_and_geometry_is_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            a,original=self.fixture(Path(tmp)/'a',[0,0,255]); b,_=self.fixture(Path(tmp)/'b',[255,0,0])
            bake_color_maps(a,8);bake_color_maps(b,8)
            ma=json.loads(a.read_text());mb=json.loads(b.read_text())
            self.assertEqual(ma['imagery'],original['imagery']);self.assertEqual(ma['chunks'],original['chunks']);self.assertEqual(ma['waterBodies'],original['waterBodies'])
            for season in PALETTES:self.assertEqual(ma['colorMaps'][season]['sha256'],mb['colorMaps'][season]['sha256'])

    def test_palette_only_rebake_reuses_weights_without_satellite_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path,_=self.fixture(root,[0,0,255]);bake_color_maps(path,8)
            before=json.loads(path.read_text())['colorMaps']
            (root/'image.gz').unlink()
            bake_color_maps(path,weights_path=root/'color-maps/weights.npz')
            self.assertEqual(before,json.loads(path.read_text())['colorMaps'])
            palettes=dict(PALETTES);palettes['summer']=['#112233']*4
            p=root/'custom.json';p.write_text(json.dumps(palettes))
            bake_color_maps(path,palette_path=p,weights_path=root/'color-maps/weights.npz')
            after=json.loads(path.read_text())['colorMaps']
            self.assertNotEqual(before['summer']['sha256'],after['summer']['sha256'])
            self.assertEqual(before['winter'],after['winter'])
            pixels=np.frombuffer(gzip.decompress((root/after['summer']['path']).read_bytes()),dtype='uint8').reshape(8,8,4)
            np.testing.assert_array_equal(pixels[0,0],[17,34,51,255])

    def test_bad_palette_and_weights_leave_existing_bake_intact(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path,_=self.fixture(root,[0,0,255]);bake_color_maps(path,8)
            before={p:p.read_bytes() for p in root.rglob('*') if p.is_file()}
            palettes=dict(PALETTES);palettes['summer']=['#112233']*4;palettes['spring']=['typo']*4
            p=root/'bad-palette.json';p.write_text(json.dumps(palettes))
            with self.assertRaises(ValueError):bake_color_maps(path,palette_path=p)
            for file,data in before.items():self.assertEqual(file.read_bytes(),data)
            m=json.loads(path.read_text())
            invalid=root/'invalid.npz'
            np.savez(invalid,weights=np.full((8,8,4),np.nan),extents=json.dumps(m['extents']),projection=json.dumps(m['projection']))
            with self.assertRaisesRegex(ValueError,'uint8'):bake_color_maps(path,weights_path=invalid)
            for file,data in before.items():self.assertEqual(file.read_bytes(),data)
