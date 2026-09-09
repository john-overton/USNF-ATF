import gzip
import json
from pathlib import Path
import tempfile
import unittest
import numpy as np
import rasterio
from rasterio.transform import from_bounds
from pipeline.coast import smooth_coasts, smooth_ring
from pipeline.imagery import add_imagery, wms_tiles

class PolishTests(unittest.TestCase):
    def test_corner_cut_preserves_bounds_islands_and_narrow_channels(self):
        exterior = [[0,0],[400,0],[400,100],[300,100],[300,300],[100,300],[100,100],[0,100],[0,0]]
        hole = [[150,150],[250,150],[250,250],[150,250],[150,150]]
        m = {'extents':{'width':1000,'height':1000}, 'waterBodies':[{'elevation':0,'polygon':exterior,'holes':[hole]}]}
        smooth_coasts(m)
        self.assertEqual(m['waterBodies'][0]['holes'],[hole])
        ring = m['waterBodies'][0]['polygon']
        self.assertIn([0,0],ring);self.assertIn([400,0],ring)
        self.assertNotIn([300,300],ring)
        self.assertTrue(all(0<=x<=400 and 0<=z<=300 for x,z in ring))
        self.assertEqual(ring[0],ring[-1])
        with self.assertRaisesRegex(ValueError,'already'):smooth_coasts(m)
        island = smooth_ring([[100,100],[200,100],[200,200],[100,200],[100,100]],1000,1000)
        self.assertEqual(len(island),9)
        self.assertIn([175,100],island)

    def test_rgb_projection_south_to_north_and_missing_coverage(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'rgb.tif';manifest=root/'manifest.json'
            m={'projection':{'crs':'EPSG:32636','originX':1000,'originY':2000},'extents':{'width':400,'height':400}}
            manifest.write_text(json.dumps(m))
            rgb=np.zeros((3,4,4),dtype='uint8');rgb[0,:2]=200;rgb[2,2:]=180
            with rasterio.open(source,'w',driver='GTiff',width=4,height=4,count=3,dtype='uint8',crs='EPSG:32636',transform=from_bounds(1000,2000,1400,2400,4,4)) as dst:dst.write(rgb)
            add_imagery(manifest,source,'Original fixture','CC0',4)
            updated=json.loads(manifest.read_text());image=updated['imagery']
            rgba=np.frombuffer(gzip.decompress((root/image['path']).read_bytes()),dtype='uint8').reshape(4,4,4)
            np.testing.assert_array_equal(rgba[0,0],[0,0,180,255])
            np.testing.assert_array_equal(rgba[-1,0],[200,0,0,255])
            m['extents']['width']=800;manifest.write_text(json.dumps(m))
            with self.assertRaisesRegex(ValueError,'cover'):add_imagery(manifest,source,'Fixture','CC0',4)

    def test_wms_tiles_preserve_geographic_pixel_grid(self):
        tiles=list(wms_tiles((20,40,28,48),6144))
        self.assertEqual(len(tiles),4)
        self.assertEqual(tiles[0],(0,0,3072,3072,(20,44,24,48)))
        self.assertEqual(tiles[-1],(3072,3072,3072,3072,(24,40,28,44)))
        odd=list(wms_tiles((0,0,5,5),5,3))
        self.assertEqual(sum(w*h for _,_,w,h,_ in odd),25)
        self.assertEqual(odd[-1],(3,3,2,2,(3,0,5,2)))
