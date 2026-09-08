"""``.JT`` projectile / weapon-type reader (missiles, bombs, guns, pods).

A ``.JT`` is a BRF text file (:mod:`retail.brf`) with an ``OBJ_TYPE`` struct
(shared with ``.PT``/``.NT``/``.OT``, see :mod:`retail.pt`) followed by a
``PROJ_TYPE`` struct.  Field names are the ATF Gold source comments, applied
by position to the comment-free USNF'97 files.  See Docs/formats/jt.md.

    python3 -m retail.jt extracted/usnf97/USNF_2.LIB/AIM9M.JT
    python3 -m retail.jt --table extracted/usnf97/USNF_2.LIB
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field

from .brf import BRFError, BRFFile, Token, apply_schema, load
from .pt import OBJ_TYPE, OBJ_TYPE_OPTIONAL


def _zone(prefix: str) -> list[tuple[str, str]]:
    return [("word", f"{prefix}.h"), ("word", f"{prefix}.p"), ("dword", f"{prefix}.minRange"),
            ("dword", f"{prefix}.maxRange"), ("dword", f"{prefix}.minAlt"), ("dword", f"{prefix}.maxAlt")]


PROJ_TYPE = (
    [("dword", "flags"), ("word", "projsInPod"), ("byte", "structType"), ("ptr", "si_names"),
     ("word", "weight"), ("byte", "flags[1]"), ("byte", "sig"), ("byte", "flags[2]"),
     ("byte", "lookDown"), ("byte", "dopplerSpeedAbove"), ("byte", "dopplerSpeedBelow"),
     ("byte", "dopplerMinRange"), ("byte", "allAspect")]
    + _zone("zone0") + _zone("zone1")
    + [("byte", "chaffFlareChance"), ("byte", "deceptionChance"), ("byte", "trackT"), ("byte", "trackMaxG"),
       ("byte", "targetSunChance"),
       ("word", "randomFirePercent"), ("word", "offsetFirePercent"), ("word", "offsetFireH"), ("word", "offsetFireP"),
       ("byte", "actualRoundsPerGame"), ("byte", "gameRoundsInBurst"), ("byte", "gameRoundsInCarpetBurst"),
       ("byte", "gameBurstT"), ("byte", "reloadT"), ("byte", "startupShots"),
       ("byte", "hSines"), ("byte", "hSineDegrees"), ("byte", "vSines"), ("byte", "vSineDegrees"), ("byte", "maxAON"),
       ("word", "initialSpeed"), ("word", "finalSpeed"), ("word", "igniteT"), ("word", "fuelT"), ("word", "removeT"),
       ("word", "poweredTurnRate"), ("word", "unpoweredTurnRate"),
       ("byte", "performanceAt0"), ("byte", "performanceAt20"),
       ("byte", "cruise1Dist"), ("byte", "cruise1Alt"), ("byte", "cruise2Dist"), ("byte", "cruise2Alt"),
       ("word", "jinkSize"), ("word", "jinkT"), ("word", "totalJinkT"),
       ("byte", "launchRetard"), ("byte", "smokeType"), ("byte", "smokeFreq"), ("byte", "smokeExistTime"),
       ("byte", "smokeStartSize"), ("byte", "smokeEndSize")]
    + [("byte", f"chances[{i}]") for i in range(4)]
    + [("byte", "taaHitChange"), ("byte", "climbHitChange"), ("byte", "gHitChange"), ("byte", "airHitChange"),
       ("byte", "speedHitChange"), ("byte", "speedHitMin"), ("byte", "predictableHitChange"),
       ("byte", "bigPlaneChange"), ("byte", "gMiss"),
       ("word", "fuzeArmT"), ("word", "fuzeRadius"), ("byte", "sideHitFuzeFailure"),
       ("byte", "expTypeForLand"), ("byte", "expTypeForWater"),
       ("ptr", "fireSound"), ("word", "maxSndDist"), ("word", "freqAdj"),
       ("word", "collateralDamageRadius"), ("word", "collateralDamagePercent")]
)


@dataclass
class Zone:
    """An engagement zone: half-angles (65536 == 360 degrees), ranges and altitudes in ft."""

    h: int
    p: int
    min_range: int
    max_range: int
    min_alt: int
    max_alt: int


@dataclass
class WeaponType:
    path: str
    labeled: bool
    short_name: str
    long_name: str
    type_file: str
    shape: str | None
    year: int | None
    weight: int                    # lb (OBJ_TYPE.weight; AIM-9M is 190)
    projs_in_pod: int
    zones: tuple[Zone, Zone]       # zone0 is the wider (seeker/track) one, zone1 the launch one (inferred)
    initial_speed: int
    final_speed: int
    fuel_t: int
    remove_t: int
    fuze_radius: int
    collateral_radius: int
    collateral_percent: int
    chances: tuple[int, int, int, int]
    fire_sound: str | None
    obj: dict[str, int | str] = field(default_factory=dict)
    proj: dict[str, int | str] = field(default_factory=dict)
    file: BRFFile | None = field(default=None, repr=False)

    @property
    def name(self) -> str:
        return os.path.splitext(os.path.basename(self.path))[0]

    @property
    def max_range(self) -> int:
        return max(z.max_range for z in self.zones)


def _resolve(brf: BRFFile, tok: Token) -> str | None:
    return brf.string(str(tok.value)) if tok.kind == "ptr" else None


def from_brf(brf: BRFFile, path: str = "") -> WeaponType:
    if "PROJ_TYPE" not in brf.sections:
        raise BRFError(f"{path}: no PROJ_TYPE section")
    obj = apply_schema(brf.section("OBJ_TYPE"), OBJ_TYPE, optional=OBJ_TYPE_OPTIONAL)
    proj = apply_schema(brf.section("PROJ_TYPE"), PROJ_TYPE)
    pv = {k: t.value for k, t in proj.items()}
    ov = {k: t.value for k, t in obj.items()}

    def zone(p: str) -> Zone:
        return Zone(*(int(pv[f"{p}.{k}"]) for k in ("h", "p", "minRange", "maxRange", "minAlt", "maxAlt")))

    names = brf.strings("ot_names")
    return WeaponType(
        path=path, labeled=brf.labeled,
        short_name=names[0] if names else "", long_name=names[1] if len(names) > 1 else "",
        type_file=names[2] if len(names) > 2 else "",
        shape=_resolve(brf, obj["shape"]), year=int(obj["year"].value) if "year" in obj else None,
        weight=int(ov["weight"]), projs_in_pod=int(pv["projsInPod"]),
        zones=(zone("zone0"), zone("zone1")),
        initial_speed=int(pv["initialSpeed"]), final_speed=int(pv["finalSpeed"]),
        fuel_t=int(pv["fuelT"]), remove_t=int(pv["removeT"]),
        fuze_radius=int(pv["fuzeRadius"]), collateral_radius=int(pv["collateralDamageRadius"]),
        collateral_percent=int(pv["collateralDamagePercent"]),
        chances=tuple(int(pv[f"chances[{i}]"]) for i in range(4)),  # type: ignore[arg-type]
        fire_sound=_resolve(brf, proj["fireSound"]),
        obj=ov, proj=pv, file=brf)


def load_jt(path: str) -> WeaponType:
    return from_brf(load(path), path)


def load_dir(directory: str) -> list[WeaponType]:
    return [load_jt(os.path.join(directory, n)) for n in sorted(os.listdir(directory)) if n.upper().endswith(".JT")]


def main(argv: list[str]) -> int:
    if len(argv) == 2 and argv[0] == "--table":
        cols = ("name", "short", "weight", "pod", "z0.maxRange", "z1.minRange", "z1.maxRange",
                "v0", "v1", "fuelT", "removeT", "fuze", "collat", "chances", "year")
        rows = [list(cols)]
        for w in load_dir(argv[1]):
            rows.append([str(c) for c in (w.name, w.short_name, w.weight, w.projs_in_pod, w.zones[0].max_range,
                                          w.zones[1].min_range, w.zones[1].max_range, w.initial_speed,
                                          w.final_speed, w.fuel_t, w.remove_t, w.fuze_radius,
                                          w.collateral_radius, w.chances, w.year if w.year is not None else "")])
        widths = [max(len(r[i]) for r in rows) for i in range(len(cols))]
        for r in rows:
            print("  ".join(c.ljust(w) if i < 2 else c.rjust(w) for i, (c, w) in enumerate(zip(r, widths))))
        return 0
    if len(argv) == 1:
        w = load_jt(argv[0])
        print(f"{w.name}: {w.short_name} / {w.long_name}  shape {w.shape}  year {w.year}  weight {w.weight} lb")
        print(f"  zones: {w.zones[0]}\n         {w.zones[1]}")
        print("  OBJ_TYPE:")
        for k, v in w.obj.items():
            print(f"    {k:26s} {v!r}")
        print("  PROJ_TYPE:")
        for k, v in w.proj.items():
            print(f"    {k:26s} {v!r}")
        return 0
    print("usage: python3 -m retail.jt <file.JT> | --table <dir>", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
