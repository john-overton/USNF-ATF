"""Export a ``.PT``'s hardpoints and the stores they carry.

Stations come from ``PLANE_TYPE``'s ``:hards`` block (:mod:`retail.pt`, and
Docs/formats/pt.md).  The stores are the ``.JT`` weapons, ``.GAS`` tanks,
``.SEE`` sensors and ``.ECM`` pods those stations name; all four share the
``STORE_ITEM`` prefix documented in Docs/formats/sensors.md, and their
``structType`` byte is what tells them apart (7 weapon, 8 tank, 9 ECM,
10 sensor).

What is deliberately *not* exported is a per-station compatibility rule.  The
hardpoint ``flags`` word is that rule and its bits are undecoded, so the raw
word is reported and nothing is inferred from it.  ``maxWeight`` is likewise
reported raw: it is a byte, it is not pounds, and its unit is unknown.

    python3 -m retail.loadout --pt extracted/usnf97/USNF_2.LIB/F14.PT \\
        --out extracted/f14-loadout.json
    python3 -m retail.loadout --pt extracted/usnf97/USNF_2.LIB/F14.PT \\
        --out extracted/f14-loadout.json --all-stores
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

from .brf import apply_schema, load
from .jt import load_jt
from .pt import load_pt

# Shared prefix of every ``STORE_ITEM`` file.  ``.JT`` carries the full
# OBJ_TYPE instead and is read by :mod:`retail.jt`.
STORE_ITEM = [("byte", "structType"), ("ptr", "si_names"), ("word", "weight"), ("byte", "flags")]

STRUCT_KINDS = {7: "weapon", 8: "tank", 9: "ecm", 10: "sensor"}
# ``sig`` 0..3 selects which signature channel a seeker reads; see
# Docs/formats/sensors.md.  Channel 4 exists but no retail file uses it.
GUIDANCE = {0: "visual", 1: "laser", 2: "infrared", 3: "radar"}
# The one authored rule reused here, matching retail.gun: these two are the
# internal cannon rather than a rack the player loads.
INTERNAL_GUNS = ("M61.JT", "MK12.JT")

SUFFIX_KINDS = {".JT": "weapon", ".GAS": "tank", ".ECM": "ecm", ".SEE": "sensor"}


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _names(brf) -> list[str]:
    for label in ("si_names", "ot_names"):
        found = brf.strings(label)
        if found:
            return found
    return []


def load_store(path: Path) -> dict:
    """Read one store file into a display record. Weapons carry the most detail."""
    suffix = path.suffix.upper()
    if suffix not in SUFFIX_KINDS:
        raise ValueError(f"{path.name}: not a store file")
    record: dict[str, object] = {"file": path.name, "sourceSha256": _sha256(path)}
    if suffix == ".JT":
        jt = load_jt(str(path))
        struct_type = int(jt.obj["structType"])
        record.update(
            kind=STRUCT_KINDS.get(struct_type, "weapon"),
            structType=struct_type,
            name=jt.short_name,
            displayName=jt.long_name or jt.short_name,
            weightLb=jt.weight,
            roundsPerPod=jt.projs_in_pod,
            guidance=GUIDANCE.get(int(jt.proj["sig"])),
            maxRangeFt=jt.max_range,
            initialSpeedFtPerS=jt.initial_speed,
            finalSpeedFtPerS=jt.final_speed,
            fuzeRadiusFt=jt.fuze_radius,
            # damage[0..4] is damage inflicted against five target hardness
            # classes, not armour; see Docs/formats/damage.md.
            damage=[int(jt.obj[f"damage[{i}]"]) for i in range(5)],
            internalGun=path.name.upper() in INTERNAL_GUNS,
        )
        return record
    brf = load(str(path))
    section = brf.sections[0] if brf.sections else ""
    tokens = brf.section(section)
    fields = apply_schema(tokens[: len(STORE_ITEM)], STORE_ITEM)
    struct_type = int(fields["structType"].value)
    names = _names(brf)
    record.update(
        kind=STRUCT_KINDS.get(struct_type, SUFFIX_KINDS[suffix]),
        structType=struct_type,
        name=names[0] if names else path.stem,
        displayName=(names[1] if len(names) > 1 else names[0] if names else path.stem),
        weightLb=int(fields["weight"].value),
    )
    if suffix == ".GAS":
        # STORE_ITEM prefix, then a single dword of fuel in pounds.  F250.GAS
        # holds 1650 lb, which is 250 US gallons at 6.6 lb/gal.
        fuel = tokens[len(STORE_ITEM)]
        record["fuelLb"] = int(fuel.value)
    return record


def station_kind(hard, store: dict | None) -> str:
    """Sensor and ECM slots are structural, not player-selectable stations."""
    if store is not None:
        return str(store["kind"])
    # 460 of 465 sensor/ECM hardpoints across both discs carry flags bit $0008
    # with maxWeight 0 and maxItems 1; see Docs/formats/sensors.md.
    if hard.flags & 0x0008 and hard.max_weight == 0 and hard.max_items == 1:
        return "sensor"
    # A real pylon that names no default store. Without the flags mask there is
    # nothing we can honestly offer to put on it, so it is reported, not hidden.
    return "empty"


def export(pt_path: Path, output: Path, all_stores: bool = False) -> dict:
    pt = load_pt(str(pt_path))
    folder = pt_path.parent
    available = {p.name.upper(): p for p in folder.iterdir() if p.is_file()}

    wanted: list[str] = []
    for hard in pt.hardpoints:
        if hard.default_type:
            wanted.append(hard.default_type.upper())
    if all_stores:
        wanted.extend(n for n in available if os.path.splitext(n)[1] in SUFFIX_KINDS)

    stores: dict[str, dict] = {}
    missing: list[str] = []
    for name in dict.fromkeys(wanted):
        path = available.get(name)
        if path is None:
            missing.append(name)
            continue
        stores[name] = load_store(path)

    stations = []
    for hard in pt.hardpoints:
        default = (hard.default_type or "").upper() or None
        store = stores.get(default) if default else None
        kind = station_kind(hard, store)
        stations.append(
            {
                "index": hard.index,
                "flags": hard.flags,
                "position": list(hard.pos),
                "slew": list(hard.slew),
                "maxWeight": hard.max_weight,
                "maxItems": hard.max_items,
                "nameIndex": hard.name,
                "defaultStore": default,
                "kind": kind,
                # A station the player may change: not a sensor or ECM slot,
                # and not the internal cannon.
                "selectable": kind in ("weapon", "tank")
                and not (store or {}).get("internalGun", False),
                "internalGun": bool((store or {}).get("internalGun", False)),
            }
        )

    plane = pt.plane
    result = {
        "schemaVersion": 1,
        "aircraftSource": pt_path.name,
        "aircraftSha256": _sha256(pt_path),
        "name": pt.long_name or pt.short_name,
        "emptyWeightLb": pt.weight,
        "maxTakeoffWeightLb": pt.max_takeoff_weight,
        "internalFuelLb": pt.internal_fuel,
        "fuelConsumptionLbPerS": pt.fuel_consumption,
        "afterburnerFuelConsumptionLbPerS": pt.aft_fuel_consumption,
        "hitPoints": pt.hit_points,
        # Percentage correction coefficients applied when the aircraft is
        # loaded; see the 2026-09-09 correction in Docs/formats/pt.md.
        "loadedPenalties": {
            "drag": int(plane.get("loadedDrag", 0)),
            "gPullDrag": int(plane.get("loadedGpullDrag", 0)),
            "elevator": int(plane.get("loadedElevator", 0)),
            "aileron": int(plane.get("loadedAileron", 0)),
            "rudder": int(plane.get("loadedRudder", 0)),
        },
        "stations": stations,
        "stores": stores,
        "missingStores": missing,
        "units": {
            "weight": "lb",
            "fuel": "lb",
            "range": "ft",
            "speed": "ft/s",
            "position": "raw PT hardpoint words; unit unverified",
            "maxWeight": "raw PT byte; not pounds, unit unknown",
        },
        "unresolved": [
            "Hardpoint flags is the per-station compatibility mask; its bits are undecoded, "
            "so no store compatibility is asserted beyond each station's own default.",
            "maxWeight is a byte that is not pounds; it is probably a rack or pylon class.",
            "Hardpoint positions are raw PT words; the unit is unverified.",
        ],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, separators=(",", ":")) + "\n")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pt", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--all-stores",
        action="store_true",
        help="also include every .JT/.GAS/.SEE/.ECM beside the PT, not just the ones it names",
    )
    args = parser.parse_args()
    result = export(args.pt, args.out, args.all_stores)
    selectable = [s for s in result["stations"] if s["selectable"]]
    print(
        f"{result['name']}: {len(result['stations'])} stations "
        f"({len(selectable)} selectable), {len(result['stores'])} stores, "
        f"{result['internalFuelLb']} lb internal fuel"
    )
    for station in result["stations"]:
        store = result["stores"].get(station["defaultStore"] or "")
        print(
            f"  {station['index']}: flags ${station['flags']:x} {station['kind']:7}"
            f" x{station['maxItems']:<4} {station['defaultStore'] or '-':12}"
            f" {(store or {}).get('displayName', '')}"
        )
    if result["missingStores"]:
        print(f"  missing store files: {', '.join(result['missingStores'])}")


if __name__ == "__main__":
    main()
