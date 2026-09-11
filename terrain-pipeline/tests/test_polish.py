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
            m={'projection':{'crs':'EPSG:32636','originX':1000,'originY':2000},'extents':{'width':400,'height':400},'coastPaint':{'method':'old atlas'}}
            manifest.write_text(json.dumps(m))
            rgb=np.zeros((3,4,4),dtype='uint8');rgb[0,:2]=200;rgb[2,2:]=180
            with rasterio.open(source,'w',driver='GTiff',width=4,height=4,count=3,dtype='uint8',crs='EPSG:32636',transform=from_bounds(1000,2000,1400,2400,4,4)) as dst:dst.write(rgb)
            add_imagery(manifest,source,'Original fixture','CC0',4)
            updated=json.loads(manifest.read_text());image=updated['imagery']
            self.assertNotIn('coastPaint',updated)
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

    def test_sentinel_quality_mask_excludes_clouds_and_shadows(self):
        from pipeline.sentinel import clear_pixels, ranked_scenes
        scl=np.full((7,7),4,dtype='uint8');scl[3,3]=9
        clear=clear_pixels(scl)
        self.assertFalse(clear[3,3]);self.assertFalse(clear[3,2]);self.assertTrue(clear[0,0])
        for value in [0,1,3,7,8,9,10,11]:
            self.assertFalse(clear_pixels(np.full((3,3),value,dtype='uint8')).any())
        for value in [2,4,5,6]:
            self.assertTrue(clear_pixels(np.full((3,3),value,dtype='uint8')).all())
        def item(id,cloud,nodata):
            return {'id':id,'properties':{'grid:code':'tile','eo:cloud_cover':cloud,
                    's2:nodata_pixel_percentage':nodata,'datetime':'2024-07-01'}}
        self.assertEqual([i['id'] for i in ranked_scenes([item('partial',0,90),item('full',1,0)])],['full','partial'])

    def test_native_clouds_survive_mask_downsampling(self):
        from pipeline.sentinel import projected_clear
        from rasterio.transform import from_origin
        scl=np.full((20,20),4,dtype='uint8');scl[:2,:2]=9
        clear=projected_clear(scl,from_origin(0,20,1,1),'EPSG:32636',
                              from_origin(0,20,4,4),'EPSG:32636',(5,5))
        self.assertFalse(clear[0,0]);self.assertFalse(clear[0,1]);self.assertTrue(clear[-1,-1])

        for value in [0,9]:
            rejected=projected_clear(np.full((20,20),value,dtype='uint8'),from_origin(0,20,1,1),'EPSG:32636',
                                     from_origin(0,20,4,4),'EPSG:32636',(5,5))
            self.assertFalse(rejected.any())
        outside=projected_clear(np.full((20,20),4,dtype='uint8'),from_origin(0,20,1,1),'EPSG:32636',
                                from_origin(100,200,4,4),'EPSG:32636',(5,5))
        self.assertFalse(outside.any())

    def test_temporal_fill_requires_three_matching_observations(self):
        from pipeline.sentinel import stable_colors
        samples=np.zeros((4,3,3),dtype='uint8')
        samples[:3,:,0]=[[40,70,90],[42,68,91],[39,71,89]]
        samples[:2,:,1]=50
        samples[:,:,2]=[[30,30,30],[90,90,90],[180,180,180],[250,250,250]]
        color,accepted=stable_colors(samples)
        np.testing.assert_array_equal(accepted,[True,False,False])
        np.testing.assert_array_equal(color[:,0],[40,70,90])

    def test_color_gap_fill_is_bounded_and_never_changes_water_classification(self):
        from pipeline.sentinel import fill_small_gaps
        rgb=np.full((3,100,100),50,dtype='uint8');covered=np.ones((100,100),bool)
        water=np.zeros((100,100),bool);water[0,0]=True;covered[0,0]=False
        covered[40:43,40:43]=False;rgb[:,40:43,40:43]=0
        count,radius=fill_small_gaps(rgb,covered,water)
        self.assertEqual(count,9);self.assertEqual(radius,2)
        self.assertFalse(covered[0,0]);self.assertTrue(water[0,0])
        self.assertTrue(np.all(rgb[:,40:43,40:43]==50))
        covered[20:50,20:50]=False
        with self.assertRaisesRegex(ValueError,'Too much'):fill_small_gaps(rgb,covered,water)
        covered[20:50,20:50]=True
        covered[20:27,20:27]=False
        count,radius=fill_small_gaps(rgb,covered,water,max_fraction=0.01)
        self.assertEqual(count,49)
        self.assertLessEqual(radius,6)
        covered[20:27,20:27]=True
        covered[20:29,20:29]=False
        count,radius=fill_small_gaps(rgb,covered,water,max_fraction=0.01,max_radius=10)
        self.assertEqual(count,81)
        self.assertLessEqual(radius,10)
        with self.assertRaisesRegex(ValueError,'Maximum interpolation'):fill_small_gaps(rgb,covered,water,max_fraction=0.03)
        with self.assertRaisesRegex(ValueError,'Maximum interpolation radius'):fill_small_gaps(rgb,covered,water,max_radius=13)
