import contextlib
import gzip
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
import rasterio
from rasterio.transform import from_origin

from pipeline.core import SyntheticSource, RasterSource, build, encode, probe, dump


class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        cls.root=Path(cls.tmp.name)
        cls.config={'id':'synthetic','name':'Synthetic terrain','roughnessThreshold':80}
        with contextlib.redirect_stdout(io.StringIO()):
            cls.report=build(cls.config,cls.root,SyntheticSource())
        cls.original=(cls.root/'manifest.json').read_text()

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def tearDown(self):
        (self.root/'manifest.json').write_text(self.original)

    def test_roundtrip_and_border_tolerance(self):
        report=probe(self.root/'manifest.json')
        self.assertEqual(report['chunks'],38)
        self.assertLess(report['maxSeamErrorMeters'],0.02)
        self.assertIn('synthetic',report['source'])

    def test_quantization_error_and_determinism(self):
        heights=np.linspace(-200,3500,65536).reshape(256,256)
        blob,offset,scale,high=encode(heights)
        decoded=np.frombuffer(gzip.decompress(blob),dtype='<u2').reshape(256,256)*scale+offset
        self.assertLessEqual(float(np.max(abs(decoded-heights))),scale/2)
        self.assertEqual(blob,encode(heights)[0])
        self.assertEqual(high,3500)

    def test_void_rejected(self):
        heights=np.zeros((256,256));heights[20,40]=np.nan
        with self.assertRaisesRegex(ValueError,'finite'):encode(heights)

    def test_constant_height(self):
        data,offset,scale,_=encode(np.full((256,256),123.5))
        self.assertEqual(offset,123.5)
        self.assertGreater(scale,0)
        self.assertFalse(np.frombuffer(gzip.decompress(data),dtype='<u2').any())

    def test_corruption_rejected(self):
        manifest=json.loads(self.original);manifest['chunks'][0]['sha256']='0'*64
        dump(self.root/'manifest.json',manifest)
        with self.assertRaisesRegex(ValueError,'checksum'):probe(self.root/'manifest.json')

    def test_seam_corruption_rejected_with_valid_hash(self):
        manifest=json.loads(self.original)
        chunk=next(c for c in manifest['chunks'] if c['lod']==1 and c['x']==0 and c['y']==0)
        # An independently offset chunk is internally consistent but disagrees with neighbours.
        chunk['offset']+=10;chunk['minElevation']+=10;chunk['maxElevation']+=10
        dump(self.root/'manifest.json',manifest)
        with self.assertRaisesRegex(ValueError,'seam'):probe(self.root/'manifest.json')

    def test_path_escape_rejected(self):
        manifest=json.loads(self.original);manifest['chunks'][0]['path']='../escape.gz'
        dump(self.root/'manifest.json',manifest)
        with self.assertRaisesRegex(ValueError,'escapes'):probe(self.root/'manifest.json')

    def test_water_mask_and_flat_elevations(self):
        manifest=json.loads(self.original)
        self.assertEqual(sorted(w['elevation'] for w in manifest['waterBodies']),[0,240])
        for body in manifest['waterBodies']:
            self.assertGreaterEqual(len(body['polygon']),3)
            for x,z in body['polygon']:
                self.assertTrue(0<=x<=51000 and 0<=z<=51000)

    def test_real_raster_warp_void_and_valid_zero_land(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);records=[]
            config={'id':'test','bbox':[30.1,46.1,30.2,46.2]}
            for kind,val in [('dem',120),('water',0)]:
                path=root/f'{kind}.tif'
                with rasterio.open(path,'w',driver='GTiff',width=100,height=100,count=1,
                                   dtype='float32',crs='EPSG:4326',transform=from_origin(30,47,0.01,0.01),nodata=-9999) as dst:
                    dst.write(np.full((100,100),val,dtype='float32'),1)
                records.append({'kind':kind,'path':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
            dump(root/'sources.json',{'config':config,'sources':records})
            src=RasterSource(root,config)
            try:
                np.testing.assert_allclose(src.sample(np.arange(256)*30,np.arange(256)*30),120)
                self.assertFalse(src.sample(np.arange(256)*30,np.arange(256)*30,'water').any())
                src.datasets['dem'][0].close();src.datasets['dem']=[]
                with self.assertRaisesRegex(ValueError,'void'):src.sample(np.arange(256)*30,np.arange(256)*30)
            finally:src.close()


if __name__=='__main__':unittest.main()
