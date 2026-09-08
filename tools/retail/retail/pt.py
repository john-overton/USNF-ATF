"""``.PT`` plane-type reader (USNF'97 and ATF Gold).

A ``.PT`` is a BRF text file (see :mod:`retail.brf`) holding three structs
in a row, ``OBJ_TYPE`` / ``NPC_TYPE`` / ``PLANE_TYPE``, followed by the
hardpoint table, the G-load flight envelopes, and the string block.  ATF Gold
files name every field in a trailing ``; comment``; USNF'97 files have the
identical statement sequence without comments, so the same names are applied
by position (:func:`retail.brf.apply_schema` refuses to label a file whose
statement kinds do not match the schema).  Field names below are those
comments; see Docs/formats/pt.md for units and evidence.

Command line::

    python3 -m retail.pt extracted/usnf97/USNF_2.LIB/F14.PT
    python3 -m retail.pt --table extracted/usnf97/USNF_2.LIB
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field

from .brf import BRFError, BRFFile, Token, apply_schema, load

# ---------------------------------------------------------------------------
# Schemas: (kind, name) in file order.  Names are the ATF Gold source comments;
# unnamed statements get unk<N>.

OBJ_TYPE = [
    ("byte", "structType"), ("word", "typeSize"), ("word", "instanceSize"),
    ("ptr", "ot_names"), ("dword", "flags"), ("word", "obj_class"),
    ("ptr", "shape"), ("ptr", "shadowShape"),
    ("dword", "unk0"), ("dword", "unk1"),
    ("word", "dmgDebrisPos.x"), ("word", "dmgDebrisPos.y"), ("word", "dmgDebrisPos.z"),
    ("dword", "unk2"), ("dword", "unk3"),
    ("word", "dstDebrisPos.x"), ("word", "dstDebrisPos.y"), ("word", "dstDebrisPos.z"),
    ("dword", "dmgType"),
    ("dword", "year"),                      # ATF Gold only (optional)
    ("word", "maxVisDist"), ("word", "cameraDist"),
    ("word", "sigs[0]"), ("word", "sigs[1]"), ("word", "sigs[2]"), ("word", "sigs[3]"), ("word", "sigs[4]"),
    ("word", "hitPoints"),
    ("word", "damage[0]"), ("word", "damage[1]"), ("word", "damage[2]"), ("word", "damage[3]"), ("word", "damage[4]"),
    ("byte", "expType"), ("byte", "craterSize"),
    ("dword", "weight"), ("word", "cmdBufSize"),
    # movement info
    ("word", "_turnRate"), ("word", "_bankRate"), ("word", "maxClimb"), ("word", "maxDive"), ("word", "maxBank"),
    ("word", "_minSpeed"), ("word", "_cornerSpeed"), ("word", "_maxSpeed"),
    ("dword", "_acc"), ("dword", "_dacc"), ("dword", "minAlt"), ("dword", "maxAlt"),
    ("symbol", "utilProc"),
    # sound info
    ("ptr", "loopSound"), ("ptr", "secondSound"), ("ptr", "engineOnSound"), ("ptr", "engineOffSound"),
    ("byte", "doDoppler"), ("word", "maxSndDist"),
    ("word", "maxPlusDopplerPitch"), ("word", "maxMinusDopplerPitch"),
    ("word", "minDopplerSpeed"), ("word", "maxDopplerSpeed"),
    ("word", "viewOffset.x"), ("word", "viewOffset.y"), ("word", "viewOffset.z"),
    ("ptr", "hudName"),                     # ``ptr hudName`` in USNF'97, ``dword 0`` in ATF Gold
]
OBJ_TYPE_OPTIONAL = ("year",)

NPC_TYPE = [
    ("dword", "flags"), ("ptr", "ctName"),
    ("byte", "searchFrequencyT"), ("byte", "unreadyAttackT"), ("byte", "attackT"),
    ("word", "retargetT"), ("word", "zoneDist"), ("byte", "numHards"), ("ptr", "hards"),
]


def _triple(prefix: str) -> list[tuple[str, str]]:
    return [("word", f"{prefix}.{k}") for k in ("min", "max", "acc", "dacc")]


PLANE_TYPE = (
    [("dword", "flags"), ("ptr", "env"), ("word", "envMin"), ("word", "envMax"),
     ("word", "structure[0]"), ("word", "structure[1]")]
    + _triple("_bv.x") + _triple("_bv.y") + _triple("_bv.z")
    + _triple("_brv.x") + _triple("_brv.y") + _triple("_brv.z")
    + [("word", "gpullAOA"), ("word", "lowAOASpeed"), ("word", "lowAOAPitch"), ("word", "turbulencePercent")]
    + _triple("rudderYaw")
    + [("word", "rudderSlip"), ("word", "rudderDrag"), ("word", "rudderBank")]
    + _triple("puffRot.x") + _triple("puffRot.y") + _triple("puffRot.z")
    + [("word", "stallWarningDelay"), ("word", "stallDelay"), ("word", "stallSeverity"), ("word", "stallPitchDown"),
       ("word", "spinEntry"), ("word", "spinExit"), ("word", "spinYawLow"), ("word", "spinYawHigh"),
       ("word", "spinAOALow"), ("word", "spinAOAHigh"), ("word", "spinBankLow"), ("word", "spinBankHigh"),
       ("word", "gearPitch"),
       ("word", "crashSpeedForward"), ("word", "crashSpeedSide"), ("word", "crashSpeedVertical"),
       ("word", "crashPitch"), ("word", "crashRoll"),
       ("byte", "engines"), ("word", "negGLimit"),
       ("dword", "thrust"), ("dword", "aftThrust"),
       ("word", "throttleAcc"), ("word", "throttleDacc"),
       ("word", "vtLimitUp"), ("word", "vtLimitDown"), ("word", "vtSpeed"),
       ("word", "fuelConsumption"), ("word", "aftFuelConsumption"), ("dword", "internalFuel"),
       ("word", "coefDrag"), ("word", "_gpullDrag"), ("word", "airBrakesDrag"), ("word", "wheelBrakesDrag"),
       ("word", "flapsDrag"), ("word", "gearDrag"), ("word", "bayDrag"), ("word", "flapsLift"),
       ("word", "loadedDrag"), ("word", "loadedGpullDrag"),
       ("word", "loadedElevator"), ("word", "loadedAileron"), ("word", "loadedRudder"),
       ("word", "structureWarnLimit"), ("word", "structureLimit")]
    + [("byte", f"systemDamage[{i}]") for i in range(45)]
    + [("word", "miscPerFlight"), ("word", "repairMultiplier"), ("dword", "maxTakeoffWeight")]
)

HARDPOINT = [
    ("word", "flags"), ("word", "pos.x"), ("word", "pos.y"), ("word", "pos.z"),
    ("word", "slewH"), ("word", "slewP"), ("word", "slewLimitH"), ("word", "slewLimitP"),
    ("ptr", "defaultTypeName"), ("byte", "maxWeight"), ("word", "maxItems"), ("byte", "name"),
]

ENV_POINTS = 20
ENVELOPE = [("word", "gload"), ("word", "count"), ("word", "stallLift"), ("word", "maxSpeed")] + [
    kv for j in range(ENV_POINTS) for kv in (("word", f"speed[{j}]"), ("dword", f"alt[{j}]"))
]


# ---------------------------------------------------------------------------


@dataclass
class Hardpoint:
    index: int
    flags: int
    pos: tuple[int, int, int]
    slew: tuple[int, int, int, int]      # slewH, slewP, slewLimitH, slewLimitP
    default_type: str | None             # e.g. "AIM9M.JT", "F250.GAS", "M61.JT", "F14R.SEE"
    max_weight: int
    max_items: int
    name: int


@dataclass
class Envelope:
    """Flight-envelope polygon for one G load: (speed ft/s, altitude ft) points."""

    gload: int
    count: int
    stall_lift: int
    max_speed: int
    points: list[tuple[int, int]]        # only the first ``count`` are meaningful

    @property
    def ceiling(self) -> int:
        return max((a for _, a in self.points[: self.count]), default=0)

    @property
    def vmax(self) -> int:
        return max((s for s, _ in self.points[: self.count]), default=0)

    def vmax_at(self, alt: int, tol: int = 500) -> int:
        return max((s for s, a in self.points[: self.count] if abs(a - alt) <= tol), default=0)

    def vmin_at(self, alt: int, tol: int = 500) -> int:
        return min((s for s, a in self.points[: self.count] if abs(a - alt) <= tol and s > 0), default=0)


@dataclass
class PlaneType:
    path: str
    labeled: bool                        # ATF-style inline field names present
    short_name: str                      # ot_names[0], e.g. "F-14"
    long_name: str                       # ot_names[1], e.g. "F-14B Tomcat"
    type_file: str                       # ot_names[2], e.g. "F14.PT"
    shape: str | None
    shadow_shape: str | None
    hud: str | None                      # USNF'97 only
    cockpit: str | None                  # ctName, e.g. "f.BI"
    sounds: dict[str, str]
    year: int | None                     # ATF Gold only
    # identified with confidence (see pt.md)
    weight: int                          # lb, empty weight
    max_takeoff_weight: int              # lb
    thrust: int                          # lbf, military (all engines)
    aft_thrust: int                      # lbf, afterburner (all engines); == thrust when no AB
    engines: int
    internal_fuel: int                   # lb
    fuel_consumption: int                # lb/s (probable)
    aft_fuel_consumption: int
    coef_drag: int                       # fixed point, 256 == 1.0 (probable)
    flaps_lift: int
    hit_points: int
    min_alt: int                         # ft
    max_alt: int                         # ft
    env_min: int
    env_max: int
    hardpoints: list[Hardpoint]
    envelopes: list[Envelope]
    # everything, by struct
    obj: dict[str, int | str] = field(default_factory=dict)
    npc: dict[str, int | str] = field(default_factory=dict)
    plane: dict[str, int | str] = field(default_factory=dict)
    raw_fields: dict[str, int] = field(default_factory=dict)   # "OBJ_TYPE.unk0" -> value (unlabelled)
    file: BRFFile | None = field(default=None, repr=False)

    @property
    def name(self) -> str:
        return os.path.splitext(os.path.basename(self.path))[0]

    def envelope(self, gload: int) -> Envelope | None:
        for e in self.envelopes:
            if e.gload == gload:
                return e
        return None

    @property
    def level_envelope(self) -> Envelope | None:
        """The 1 G polygon: min/max level-flight speed against altitude."""
        return self.envelope(1)


def _vals(tokens: dict[str, Token]) -> dict[str, int | str]:
    return {k: t.value for k, t in tokens.items()}


def _resolve(brf: BRFFile, tok: Token | None) -> str | None:
    if tok is None or tok.kind != "ptr":
        return None
    return brf.string(str(tok.value))


def from_brf(brf: BRFFile, path: str = "") -> PlaneType:
    sections = brf.sections
    for need in ("OBJ_TYPE", "NPC_TYPE", "PLANE_TYPE"):
        if need not in sections:
            raise BRFError(f"{path}: no {need} section")
    obj = apply_schema(brf.section("OBJ_TYPE"), OBJ_TYPE, optional=OBJ_TYPE_OPTIONAL)
    npc = apply_schema(brf.section("NPC_TYPE"), NPC_TYPE)
    plane = apply_schema(brf.section("PLANE_TYPE"), PLANE_TYPE)

    n_hards = int(npc["numHards"].value)
    hard_toks = brf.section("HARD")
    if len(hard_toks) != n_hards * len(HARDPOINT):
        raise BRFError(f"{path}: numHards={n_hards} but {len(hard_toks)} hardpoint statements")
    hardpoints = []
    for i in range(n_hards):
        h = apply_schema(hard_toks[i * len(HARDPOINT):(i + 1) * len(HARDPOINT)], HARDPOINT)
        hardpoints.append(Hardpoint(
            index=i, flags=int(h["flags"].value),
            pos=(int(h["pos.x"].value), int(h["pos.y"].value), int(h["pos.z"].value)),
            slew=tuple(int(h[k].value) for k in ("slewH", "slewP", "slewLimitH", "slewLimitP")),  # type: ignore[arg-type]
            default_type=_resolve(brf, h["defaultTypeName"]),
            max_weight=int(h["maxWeight"].value), max_items=int(h["maxItems"].value), name=int(h["name"].value)))

    env_min, env_max = int(plane["envMin"].value), int(plane["envMax"].value)
    n_env = env_max - env_min + 1
    env_toks = brf.section("ENV")
    if len(env_toks) != n_env * len(ENVELOPE):
        raise BRFError(f"{path}: envMin..envMax gives {n_env} envelopes but {len(env_toks)} statements")
    envelopes = []
    for i in range(n_env):
        e = apply_schema(env_toks[i * len(ENVELOPE):(i + 1) * len(ENVELOPE)], ENVELOPE)
        pts = [(int(e[f"speed[{j}]"].value), int(e[f"alt[{j}]"].value)) for j in range(ENV_POINTS)]
        envelopes.append(Envelope(int(e["gload"].value), int(e["count"].value),
                                  int(e["stallLift"].value), int(e["maxSpeed"].value), pts))

    names = brf.strings("ot_names")
    sounds = {k: v for k in ("loopSound", "secondSound", "engineOnSound", "engineOffSound")
              if (v := _resolve(brf, obj[k])) is not None}
    ov, nv, pv = _vals(obj), _vals(npc), _vals(plane)
    raw = {f"OBJ_TYPE.{k}": int(v) for k, v in ov.items() if k.startswith("unk")}
    return PlaneType(
        path=path, labeled=brf.labeled,
        short_name=names[0] if names else "", long_name=names[1] if len(names) > 1 else "",
        type_file=names[2] if len(names) > 2 else "",
        shape=_resolve(brf, obj["shape"]), shadow_shape=_resolve(brf, obj["shadowShape"]),
        hud=_resolve(brf, obj["hudName"]), cockpit=_resolve(brf, npc["ctName"]),
        sounds=sounds, year=int(obj["year"].value) if "year" in obj else None,
        weight=int(ov["weight"]), max_takeoff_weight=int(pv["maxTakeoffWeight"]),
        thrust=int(pv["thrust"]), aft_thrust=int(pv["aftThrust"]), engines=int(pv["engines"]),
        internal_fuel=int(pv["internalFuel"]), fuel_consumption=int(pv["fuelConsumption"]),
        aft_fuel_consumption=int(pv["aftFuelConsumption"]),
        coef_drag=int(pv["coefDrag"]), flaps_lift=int(pv["flapsLift"]), hit_points=int(ov["hitPoints"]),
        min_alt=int(ov["minAlt"]), max_alt=int(ov["maxAlt"]), env_min=env_min, env_max=env_max,
        hardpoints=hardpoints, envelopes=envelopes,
        obj=ov, npc=nv, plane=pv, raw_fields=raw, file=brf)


def load_pt(path: str) -> PlaneType:
    return from_brf(load(path), path)


def load_dir(directory: str) -> list[PlaneType]:
    out = []
    for n in sorted(os.listdir(directory)):
        if n.upper().endswith(".PT"):
            out.append(load_pt(os.path.join(directory, n)))
    return out


@dataclass
class ObjectType:
    """Generic ``.OT`` (static object) / ``.NT`` (NPC: ship, vehicle, site) record.

    Same OBJ_TYPE struct as a plane; ``.NT`` adds NPC_TYPE and hardpoints.
    """

    path: str
    labeled: bool
    short_name: str
    long_name: str
    shape: str | None
    year: int | None
    weight: int
    hit_points: int
    obj: dict[str, int | str]
    npc: dict[str, int | str]
    hardpoints: list[Hardpoint]

    @property
    def name(self) -> str:
        return os.path.splitext(os.path.basename(self.path))[0]


def load_object(path: str) -> ObjectType:
    brf = load(path)
    obj = apply_schema(brf.section("OBJ_TYPE"), OBJ_TYPE, optional=OBJ_TYPE_OPTIONAL)
    npc: dict[str, Token] = {}
    hardpoints: list[Hardpoint] = []
    if "NPC_TYPE" in brf.sections:
        npc = apply_schema(brf.section("NPC_TYPE"), NPC_TYPE)
        n = int(npc["numHards"].value)
        toks = brf.section("HARD")
        if len(toks) != n * len(HARDPOINT):
            raise BRFError(f"{path}: numHards={n} but {len(toks)} hardpoint statements")
        for i in range(n):
            h = apply_schema(toks[i * len(HARDPOINT):(i + 1) * len(HARDPOINT)], HARDPOINT)
            hardpoints.append(Hardpoint(
                i, int(h["flags"].value), (int(h["pos.x"].value), int(h["pos.y"].value), int(h["pos.z"].value)),
                tuple(int(h[k].value) for k in ("slewH", "slewP", "slewLimitH", "slewLimitP")),  # type: ignore[arg-type]
                _resolve(brf, h["defaultTypeName"]), int(h["maxWeight"].value), int(h["maxItems"].value),
                int(h["name"].value)))
    names = brf.strings("ot_names")
    return ObjectType(path, brf.labeled, names[0] if names else "", names[1] if len(names) > 1 else "",
                      _resolve(brf, obj["shape"]), int(obj["year"].value) if "year" in obj else None,
                      int(obj["weight"].value), int(obj["hitPoints"].value),
                      _vals(obj), _vals(npc), hardpoints)


# ---------------------------------------------------------------------------
# CLI

def _print_one(pt: PlaneType) -> None:
    print(f"{pt.name}: {pt.short_name} / {pt.long_name}  ({'labelled' if pt.labeled else 'unlabelled'} source)")
    print(f"  shape {pt.shape}  shadow {pt.shadow_shape}  hud {pt.hud}  cockpit {pt.cockpit}  year {pt.year}")
    print(f"  sounds {pt.sounds}")
    print("  identified:")
    for k in ("weight", "max_takeoff_weight", "thrust", "aft_thrust", "engines", "internal_fuel",
              "fuel_consumption", "aft_fuel_consumption", "coef_drag", "flaps_lift", "hit_points",
              "min_alt", "max_alt", "env_min", "env_max"):
        print(f"    {k:22s} {getattr(pt, k)}")
    for sec, d in (("OBJ_TYPE", pt.obj), ("NPC_TYPE", pt.npc), ("PLANE_TYPE", pt.plane)):
        print(f"  {sec}:")
        for k, v in d.items():
            if k.startswith("systemDamage["):
                continue
            print(f"    {k:22s} {v if not isinstance(v, int) else v!r}")
        if sec == "PLANE_TYPE":
            print(f"    systemDamage[0..44]    {[d[f'systemDamage[{i}]'] for i in range(45)]}")
    print("  hardpoints:")
    for h in pt.hardpoints:
        print(f"    {h.index}: flags ${h.flags:x} pos {h.pos} slew {h.slew} default {h.default_type} "
              f"maxWeight {h.max_weight} maxItems {h.max_items} name {h.name}")
    print("  envelopes (speed ft/s, alt ft):")
    for e in pt.envelopes:
        print(f"    G={e.gload:3d} count {e.count:2d} stallLift {e.stall_lift} maxSpeed {e.max_speed} "
              f"pts {e.points[:e.count]}")
    if pt.file:
        notes = [c for _, c in pt.file.comments if "area" in c or "rating" in c]
        if notes:
            print("  source notes: " + "; ".join(notes))


_TABLE_COLS = ("name", "short", "weight", "mtow", "thrust", "aftThrust", "eng", "fuel", "fc", "afc",
               "coefDrag", "flapsLift", "hp", "hards", "env", "vmaxSL", "vmax", "ceiling", "maxAlt", "year")


def _row(pt: PlaneType) -> list:
    lvl = pt.level_envelope
    return [pt.name, pt.short_name, pt.weight, pt.max_takeoff_weight, pt.thrust, pt.aft_thrust, pt.engines,
            pt.internal_fuel, pt.fuel_consumption, pt.aft_fuel_consumption, pt.coef_drag, pt.flaps_lift,
            pt.hit_points, len(pt.hardpoints), f"{pt.env_min}..{pt.env_max}",
            lvl.vmax_at(0) if lvl else "", lvl.vmax if lvl else "", lvl.ceiling if lvl else "",
            pt.max_alt, pt.year if pt.year is not None else ""]


def print_table(pts: list[PlaneType], out=sys.stdout) -> None:
    rows = [list(_TABLE_COLS)] + [[str(c) for c in _row(p)] for p in pts]
    widths = [max(len(r[i]) for r in rows) for i in range(len(_TABLE_COLS))]
    for r in rows:
        print("  ".join(c.ljust(w) if i < 2 else c.rjust(w) for i, (c, w) in enumerate(zip(r, widths))), file=out)


def main(argv: list[str]) -> int:
    if len(argv) == 2 and argv[0] == "--table":
        pts = load_dir(argv[1]) if os.path.isdir(argv[1]) else [load_pt(argv[1])]
        print_table(pts)
        return 0
    if len(argv) == 1:
        _print_one(load_pt(argv[0]))
        return 0
    print("usage: python3 -m retail.pt <file.PT> | --table <dir>", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
