"""Object-type (.PT/.JT/.OT/.NT), terrain (.T2) and mission (.M/.MT) tests.

Structural tests use a synthetic BRF file.  Retail tests read the extracted
trees under /extracted (``USNF_EXTRACTED`` overrides) and skip when absent.
No retail bytes are embedded here; the real-world figures asserted against
are public aircraft data.
"""

import os
import unittest

from _paths import REPO, TOOLS_RETAIL  # noqa: F401
from retail import brf, jt, mission, pt, t2

EXTRACTED = os.environ.get("USNF_EXTRACTED", os.path.join(REPO, "extracted"))
USNF = os.path.join(EXTRACTED, "usnf97", "USNF_2.LIB")
ATF = os.path.join(EXTRACTED, "atf-gold", "ATF_2.LIB")
HAVE_USNF = os.path.isfile(os.path.join(USNF, "F14.PT"))
HAVE_ATF = os.path.isfile(os.path.join(ATF, "F14.PT"))


SYNTHETIC = "\r\n".join([
    "[brent's_relocatable_format]",
    ";---------------- START OF OBJ_TYPE ----------------",
    "    byte 5",
    "    word $ffff8000 ; typeSize",
    "    dword ^300",
    "\tptr names",
    "\tsymbol _PLANEProc\t; utilProc",
    ":names",
    '\tstring "A-1"',
    '\tstring "A-1 Test"',
    "\tend",
])


class BRFSyntheticTest(unittest.TestCase):
    def test_tokenizer(self):
        f = brf.loads(SYNTHETIC)
        kinds = [t.kind for t in f.tokens if t.section == "OBJ_TYPE"]
        self.assertEqual(kinds, ["byte", "word", "dword", "ptr", "symbol"])
        self.assertEqual(f.section("OBJ_TYPE")[1].value, -32768)     # folded to 16 bits
        self.assertEqual(f.section("OBJ_TYPE")[1].comment, "typeSize")
        self.assertTrue(f.section("OBJ_TYPE")[2].scaled)
        self.assertEqual(f.strings("names"), ["A-1", "A-1 Test"])
        self.assertFalse(f.labeled)

    def test_apply_schema_checks_kinds_and_comments(self):
        toks = brf.loads(SYNTHETIC).section("OBJ_TYPE")
        schema = [("byte", "a"), ("word", "typeSize"), ("dword", "c"), ("dword", "d"), ("symbol", "utilProc")]
        got = brf.apply_schema(toks, schema)
        self.assertEqual(got["d"].value, "names")
        with self.assertRaises(brf.BRFError):
            brf.apply_schema(toks, [("byte", "a"), ("word", "wrongName"), ("dword", "c"), ("dword", "d"), ("symbol", "utilProc")])
        with self.assertRaises(brf.BRFError):
            brf.apply_schema(toks, [("word", "a")] + schema[1:])
        # optional field skipped when kind does not match
        got = brf.apply_schema(toks, [("byte", "a"), ("word", "typeSize"), ("byte", "opt")] + schema[2:],
                               optional=("opt",))
        self.assertNotIn("opt", got)

    def test_bad_magic(self):
        with self.assertRaises(brf.BRFError):
            brf.loads("nope\r\n")


@unittest.skipUnless(HAVE_USNF, "extracted USNF'97 tree not present")
class USNFPlaneTypeTest(unittest.TestCase):
    def test_all_pt_parse(self):
        pts = pt.load_dir(USNF)
        self.assertEqual(len(pts), 48)
        for p in pts:
            with self.subTest(p.name):
                self.assertFalse(p.labeled)
                self.assertEqual(p.type_file.upper(), p.name.upper() + ".PT")
                self.assertGreater(p.weight, 0)
                self.assertGreaterEqual(p.max_takeoff_weight, p.weight)
                self.assertGreater(p.thrust, 0)
                self.assertEqual(len(p.envelopes), p.env_max - p.env_min + 1)
                self.assertEqual(p.year, None)

    def test_f14_values_plausible(self):
        f14 = pt.load_pt(os.path.join(USNF, "F14.PT"))
        self.assertEqual(f14.short_name, "F-14")
        self.assertEqual(f14.shape.lower(), "f14.sh")
        self.assertEqual(f14.hud.lower(), "f14.hud")
        self.assertEqual(f14.engines, 2)
        self.assertTrue(38_000 <= f14.weight <= 44_000, f14.weight)                  # lb, empty
        self.assertTrue(70_000 <= f14.max_takeoff_weight <= 76_000, f14.max_takeoff_weight)
        self.assertTrue(26_000 <= f14.thrust <= 34_000, f14.thrust)                  # lbf, 2 x TF30 military
        self.assertTrue(40_000 <= f14.aft_thrust <= 56_000, f14.aft_thrust)          # lbf, afterburner
        self.assertTrue(14_000 <= f14.internal_fuel <= 17_000, f14.internal_fuel)    # lb
        self.assertEqual(f14.coef_drag, 256)
        self.assertEqual(f14.max_alt, 56_000)                                        # ft, service ceiling
        lvl = f14.level_envelope
        self.assertIsNotNone(lvl)
        self.assertTrue(2100 <= lvl.vmax <= 2400, lvl.vmax)                          # ft/s, about Mach 2.3
        self.assertTrue(1200 <= lvl.vmax_at(0) <= 1450, lvl.vmax_at(0))              # ft/s at sea level
        self.assertEqual(len(f14.hardpoints), 8)
        defaults = {h.default_type.upper() for h in f14.hardpoints if h.default_type}
        self.assertIn("AIM9M.JT", defaults)
        self.assertIn("M61.JT", defaults)

    def test_fleet_ordering_matches_reality(self):
        by = {p.name: p for p in pt.load_dir(USNF)}
        self.assertLess(by["A4E"].weight, by["F14"].weight)
        self.assertLess(by["F14"].weight, by["B52"].weight)
        self.assertGreater(by["F22"].aft_thrust, by["F14"].aft_thrust)
        self.assertEqual(by["A10"].aft_thrust, 0)                                    # no afterburner
        self.assertEqual(by["B52"].engines, 8)

    def test_weapons_parse(self):
        ws = jt.load_dir(USNF)
        self.assertEqual(len(ws), 90)
        aim9 = next(w for w in ws if w.name == "AIM9M")
        self.assertTrue(170 <= aim9.weight <= 210, aim9.weight)                      # lb
        self.assertTrue(30_000 <= aim9.max_range <= 90_000, aim9.max_range)          # ft
        aim54 = next(w for w in ws if w.name == "AIM54C")
        self.assertGreater(aim54.max_range, aim9.max_range * 5)

    def test_ot_nt_parse(self):
        n = 0
        for name in sorted(os.listdir(USNF)):
            if name.upper().endswith((".OT", ".NT")):
                o = pt.load_object(os.path.join(USNF, name))
                n += 1
                if name.upper().endswith(".NT"):
                    self.assertEqual(len(o.hardpoints), int(o.npc["numHards"]))
        self.assertEqual(n, 110 + 64)


@unittest.skipUnless(HAVE_ATF, "extracted ATF Gold tree not present")
class ATFPlaneTypeTest(unittest.TestCase):
    def test_all_pt_parse_with_labels(self):
        pts = pt.load_dir(ATF)
        self.assertEqual(len(pts), 105)
        for p in pts:
            with self.subTest(p.name):
                self.assertTrue(p.labeled)
                self.assertIsNotNone(p.year)
                self.assertGreater(p.thrust, 0)

    def test_weapons_parse(self):
        self.assertEqual(len(jt.load_dir(ATF)), 120)

    @unittest.skipUnless(HAVE_USNF, "needs both games")
    def test_f14_shared_fields_agree_across_games(self):
        a = pt.load_pt(os.path.join(USNF, "F14.PT"))
        b = pt.load_pt(os.path.join(ATF, "F14.PT"))
        for k in ("weight", "max_takeoff_weight", "thrust", "aft_thrust", "internal_fuel", "engines", "max_alt"):
            self.assertEqual(getattr(a, k), getattr(b, k), k)


@unittest.skipUnless(HAVE_USNF, "extracted USNF'97 tree not present")
class TerrainAndMissionTest(unittest.TestCase):
    def test_t2_headers_and_sizes(self):
        ts = t2.list_dir(USNF)
        self.assertEqual(len(ts), 11)
        names = {t.name for t in ts}
        self.assertEqual(names, {"Kuril Islands", "Ukraine", "North Vietnam"})
        kuril = next(t for t in ts if t.name == "Kuril Islands")
        self.assertEqual((kuril.width, kuril.height), (32, 32))
        self.assertLess(kuril.land_fraction(), 0.15)      # island chain in open sea
        ukr = next(t for t in ts if os.path.basename(t.path) == "UKR.T2")
        self.assertEqual((ukr.width, ukr.height), (26, 25))
        self.assertGreater(ukr.land_fraction(), 0.6)

    def test_missions_reference_terrains(self):
        ms = mission.load_dir(USNF)
        self.assertEqual(len(ms), 209)
        rows = {r[0]: r for r in mission.theater_table(USNF)}
        self.assertEqual(set(rows), {"KURILE", "UKR", "VIET"})
        for stem, r in rows.items():
            self.assertGreater(r[2], 20, stem)
        k1 = mission.load(os.path.join(USNF, "KURIL01.M"))
        self.assertEqual(k1.theater, "KURILE")
        self.assertIsNotNone(k1.player)
        self.assertGreater(len(k1.player.waypoints), 0)

    def test_static_objects_sit_on_land(self):
        """World units: 8192 per terrain cell, x -> column, z -> row."""
        ters = {t2.base_name(t.path): t for t in t2.list_dir(USNF)}
        total = on_land = 0
        for m in mission.load_dir(USNF):
            t = ters.get(m.theater or "")
            if t is None:
                continue
            for o in m.objects:
                if o.family != "OT":
                    continue
                x, z = o.pos[0] // mission.CELL, o.pos[2] // mission.CELL
                self.assertTrue(0 <= x < t.cols and 0 <= z < t.rows, (m.name, o.type, o.pos))
                total += 1
                on_land += 0 if t.is_sea(x, z) else 1
        self.assertGreater(total, 1000)
        self.assertGreater(on_land / total, 0.98)

    def test_mission_text(self):
        mt = mission.load_mt(os.path.join(USNF, "KURIL01.MT"))
        self.assertEqual(set(mt.sections), {1, 2, 3, 4})
        self.assertTrue(mt.title)
        self.assertIn("MISSION OBJECTIVE", mt.sections[2])


if __name__ == "__main__":
    unittest.main()
