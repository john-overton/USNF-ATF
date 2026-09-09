import unittest
from pipeline.shoreline import Edges, ribbon_ring, classify


class ShorelineTests(unittest.TestCase):
    def test_exterior_and_hole_normals_and_closure(self):
        outer=[[100,100],[200,100],[200,200],[100,200],[100,100]]
        for ring in (outer,list(reversed(outer))):
            edges=Edges([dict(polygon=ring)])
            rows=ribbon_ring(ring,False,dict(width=1000,height=1000),edges,lambda p,q:(None,None))
            self.assertEqual(rows[0][:4],rows[-1][:4]);self.assertEqual(rows[-1][4],400)
            for p in rows:self.assertTrue(p[2]<100 or p[2]>200 or p[3]<100 or p[3]>200)
            island=ribbon_ring(ring,True,dict(width=1000,height=1000),edges,lambda p,q:(None,None))
            for p in island:self.assertTrue(100<=p[2]<=200 and 100<=p[3]<=200)

    def test_narrow_island_does_not_fold(self):
        hole=[[100,100],[120,100],[120,120],[100,120],[100,100]]
        edges=Edges([dict(polygon=[[0,0],[1000,0],[1000,1000],[0,1000],[0,0]],holes=[hole])])
        rows=ribbon_ring(hole,True,dict(width=1000,height=1000),edges,lambda p,q:(None,None))
        for a,b in zip(rows,rows[1:]):self.assertFalse(edges.unsafe_quad([a[:2],b[:2],b[2:4],a[2:4]]))

    def test_band_does_not_enclose_water_and_bounds_are_fixed(self):
        ring=[[100,100],[200,100],[200,200],[100,200],[100,100]]
        pond=[[145,92],[148,92],[148,95],[145,95],[145,92]]
        edges=Edges([dict(polygon=ring),dict(polygon=pond)])
        rows=ribbon_ring(ring,False,dict(width=1000,height=1000),edges,lambda p,q:(None,None))
        for a,b in zip(rows,rows[1:]):self.assertFalse(edges.unsafe_quad([a[:2],b[:2],b[2:4],a[2:4]]))
        boundary=[[0,0],[100,0],[100,100],[0,100],[0,0]]
        rows=ribbon_ring(boundary,False,dict(width=1000,height=1000),Edges([dict(polygon=boundary)]),lambda p,q:(None,None))
        for p in rows:
            if p[0]==0 or p[1]==0:self.assertEqual(p[:2],p[2:4])

    def test_classifier_uncertainty_and_overrides(self):
        self.assertEqual(classify(None,None),(0,0))
        for rgb,h,kind in [([180,150,100],2,1),([100,100,100],20,2),([100,100,100],50,3),([70,110,60],1,4)]:
            k,confidence=classify(rgb,h);self.assertEqual(k,kind);self.assertLess(confidence,1)
        ring=[[100,100],[200,100],[200,200],[100,200],[100,100]]
        rows=ribbon_ring(ring,False,dict(width=1000,height=1000),Edges([dict(polygon=ring)]),lambda p,q:(None,None),dict(kind='beach',widthMeters=5))
        self.assertTrue(all(p[5:]==[1,1] for p in rows))

    def test_coast_coordinates_keep_source_precision(self):
        x=561330.695345139
        ring=[[x-100,100],[x-25.123456789,100],[x-12.25,120],[x-100,200],[x-100,100]]
        rows=ribbon_ring(ring,False,dict(width=600000,height=600000),Edges([dict(polygon=ring)]),lambda p,q:(None,None))
        self.assertEqual(rows[1][0],ring[1][0])
