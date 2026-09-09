import importlib.util
from pathlib import Path
import plistlib
import unittest

spec = importlib.util.spec_from_file_location('gpu_trace_template', Path(__file__).with_name('gpu-trace-template.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TemplateTests(unittest.TestCase):
    def test_profile_changes_do_not_mutate_shared_values_or_source(self):
        archive = {'$objects': ['$null', 'counterprofile', 'counterprofileinternal',
                               'otherSetting', 0,
                               {'NS.keys': [plistlib.UID(1), plistlib.UID(2), plistlib.UID(3)],
                                'NS.objects': [plistlib.UID(4)] * 3}]}
        result = module.configure(archive)
        objects = result['$objects']
        values = [objects[x.data] for x in objects[5]['NS.objects']]
        self.assertEqual(values, [13, 13, 0])
        self.assertEqual(len(archive['$objects']), 6)
        self.assertEqual(archive['$objects'][5]['NS.objects'][0], plistlib.UID(4))

    def test_unknown_template_layout_fails_closed(self):
        with self.assertRaises(ValueError):
            module.configure({'$objects': ['$null']})
