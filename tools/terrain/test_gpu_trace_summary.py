import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('gpu_trace_summary', Path(__file__).with_name('gpu-trace-summary.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SummaryTests(unittest.TestCase):
    def summarize(self, name):
        xml = f'''<trace-query-result><node>
        <row><start-time id="1">0</start-time><duration id="2">1000000000</duration>
        <gpu-counter-name id="3" fmt="{name}">{name}</gpu-counter-name>
        <formatted-label id="4" fmt="2 GB/s"/><fixed-decimal id="5">2</fixed-decimal>
        <metal-device-name id="6" fmt="M3">M3</metal-device-name></row>
        <row><start-time>1000000000</start-time><duration>3000000000</duration>
        <gpu-counter-name ref="3"/><formatted-label ref="4"/>
        <fixed-decimal>6</fixed-decimal><metal-device-name ref="6"/></row>
        </node></trace-query-result>'''
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'counters.xml'
            path.write_text(xml)
            return module.summarize(path)

    def test_weighted_mean_and_reference_resolution(self):
        result = self.summarize('DRAM Bandwidth')
        self.assertTrue(result['dramBandwidthAvailable'])
        counter = result['dramCounters'][0]
        self.assertEqual(counter['durationWeightedMean'], 5)
        self.assertEqual(counter['samples'], 2)
        self.assertEqual(counter['sampledSeconds'], 4)
        self.assertEqual(counter['minimum'], 2)
        self.assertEqual(counter['maximum'], 6)

    def test_absent_dram_is_unavailable_not_zero(self):
        result = self.summarize('Unrelated Counter')
        self.assertFalse(result['dramBandwidthAvailable'])
        self.assertEqual(result['dramCounters'], [])


if __name__ == '__main__':
    unittest.main()
