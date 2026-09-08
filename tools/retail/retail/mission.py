"""``.M`` mission and ``.MT`` mission-text readers.  See Docs/formats/mission.md.

Both are plain text (CRLF).  A ``.M`` file is a flat list of ``key value``
lines with ``obj`` / ``waypoint2`` blocks that run until a line holding a
single ``.``; it ends with a NUL byte.  A ``.MT`` file is briefing prose with
dot-directives (``.section N``, ``.header``, ``.body`` ...).

    python3 -m retail.mission extracted/usnf97/USNF_2.LIB/KURIL01.M
    python3 -m retail.mission --theaters extracted/usnf97/USNF_2.LIB [more dirs]
"""

from __future__ import annotations

import collections
import os
import re
import sys
from dataclasses import dataclass, field

from .t2 import base_name, list_dir as list_t2

# Quick-mission templates (``~Q<letter>...M``) carry no ``map`` line; the
# letter after Q is the theater.
QUICK_THEATER = {"K": "KURILE", "U": "UKR", "V": "VIET", "B": "BAL", "E": "EGY", "F": "FRA"}

# World units per terrain cell.  ``pos x y z`` has y up (altitude in ft, same
# unit as the .PT altitudes); x // CELL is the T2 column and z // CELL the
# row.  Calibrated by checking that static .OT objects land on land cells
# (99.5% of 1,557 in USNF'97 at this scale; every other power of two, axis
# swap or flip does far worse).  A cell is therefore 8,192 ft = 2.5 km.
CELL = 8192


@dataclass
class MissionObject:
    type: str                     # "F14.PT", "WASP.NT", "T80.NT", ...
    pos: tuple[int, int, int]     # x, altitude, z in world units (see mission.md)
    props: dict[str, str] = field(default_factory=dict)
    waypoints: list[dict[str, str]] = field(default_factory=list)

    @property
    def alias(self) -> int | None:
        return int(self.props["alias"]) if "alias" in self.props else None

    @property
    def is_player(self) -> bool:
        return self.props.get("name") == "Player"

    @property
    def family(self) -> str:
        return self.type.rsplit(".", 1)[-1].upper()


@dataclass
class Mission:
    path: str
    header: dict[str, str]        # map, layer, time, clouds, wind, view, skills, sides...
    flags: list[str]              # bare words: brief, briefmap, selectplane, armplane, textFormat...
    objects: list[MissionObject]

    @property
    def name(self) -> str:
        return os.path.splitext(os.path.basename(self.path))[0]

    @property
    def map(self) -> str | None:
        return self.header.get("map")

    @property
    def theater(self) -> str | None:
        """Base terrain stem: KURILE, UKR, VIET, BAL, EGY, FRA, VLA, or None."""
        if self.map:
            return base_name(self.map)
        m = re.match(r"~Q([A-Z])", self.name.upper())
        return QUICK_THEATER.get(m.group(1)) if m else None

    @property
    def player(self) -> MissionObject | None:
        return next((o for o in self.objects if o.is_player), None)

    def types(self) -> collections.Counter:
        return collections.Counter(o.type.upper() for o in self.objects)


def loads(text: str, path: str = "") -> Mission:
    """Parse a ``.M`` file.  Free-text values (``name``, ``w_name``) are written
    between \\x01 delimiters in the file; they are stripped here."""
    header: dict[str, str] = {}
    flags: list[str] = []
    objects: list[MissionObject] = []
    lines = text.replace("\0", "").replace("\x01", "").splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        i += 1
        if not s or s.startswith(";"):
            continue
        key, _, rest = s.partition(" ")
        rest = rest.strip()
        if key == "obj":
            props: dict[str, str] = {}
            while i < len(lines) and lines[i].strip() != ".":
                k, _, v = lines[i].strip().partition(" ")
                if k:
                    props[k] = v.strip()
                i += 1
            i += 1
            pos = tuple(int(p) for p in props.get("pos", "0 0 0").split()[:3])
            objects.append(MissionObject(props.pop("type", "?"), pos, props))  # type: ignore[arg-type]
        elif key.startswith("waypoint"):
            wps: list[dict[str, str]] = []
            cur: dict[str, str] = {}
            owner: int | None = None
            while i < len(lines) and lines[i].strip() != ".":
                s2 = lines[i].strip()
                i += 1
                if not s2:
                    continue
                k, _, v = s2.partition(" ")
                if k == "w_for":
                    owner = int(v)
                    continue
                if k == "w_index" and cur:
                    wps.append(cur)
                    cur = {}
                cur[k] = v.strip()
            i += 1
            if cur:
                wps.append(cur)
            target = next((o for o in objects if o.alias == owner), None) if owner is not None else None
            if target is not None:
                target.waypoints.extend(wps)
            header.setdefault("_waypoint_blocks", "0")
            header["_waypoint_blocks"] = str(int(header["_waypoint_blocks"]) + 1)
        elif key.startswith("sides"):
            vals = []
            while i < len(lines) and lines[i].startswith("\t"):
                vals.append(lines[i].strip())
                i += 1
            header[key] = " ".join(vals)
        elif rest:
            header[key] = rest
        else:
            flags.append(key)
    return Mission(path, header, flags, objects)


def load(path: str) -> Mission:
    with open(path, "rb") as f:
        return loads(f.read().decode("latin-1"), path)


def load_dir(directory: str) -> list[Mission]:
    return [load(os.path.join(directory, n)) for n in sorted(os.listdir(directory)) if n.upper().endswith(".M")]


# ---------------------------------------------------------------------------
# .MT

@dataclass
class MissionText:
    path: str
    sections: dict[int, str]      # 1 title block, 2 briefing, 3 debrief (success), 4 debrief (failure)

    @property
    def title(self) -> str:
        lines = [ln for ln in self.sections.get(1, "").splitlines() if ln.strip()]
        return lines[1] if len(lines) > 1 else (lines[0] if lines else "")


def loads_mt(text: str, path: str = "") -> MissionText:
    sections: dict[int, str] = {}
    cur = 0
    buf: list[str] = []
    for line in text.replace("\0", "").splitlines():
        m = re.match(r"^\.section\s+(\d+)", line)
        if m:
            if cur:
                sections[cur] = "\n".join(buf)
            cur, buf = int(m.group(1)), []
            continue
        buf.append(line)
    if cur:
        sections[cur] = "\n".join(buf)
    return MissionText(path, sections)


def load_mt(path: str) -> MissionText:
    with open(path, "rb") as f:
        return loads_mt(f.read().decode("latin-1"), path)


def plain_text(section: str) -> str:
    """Strip dot-directives from an MT section."""
    return "\n".join(ln for ln in section.splitlines() if not ln.lstrip().startswith("."))


# ---------------------------------------------------------------------------
# Theater table

def theater_table(directory: str) -> list[tuple[str, str, int, int, int, str]]:
    """Rows of (stem, display name, missions with explicit map, quick templates, variants, size)."""
    t2s = {base_name(t.path): t for t in list_t2(directory)}
    variants: collections.Counter = collections.Counter()
    explicit: collections.Counter = collections.Counter()
    quick: collections.Counter = collections.Counter()
    for m in load_dir(directory):
        th = m.theater
        if th is None:
            continue
        if m.map:
            explicit[th] += 1
            variants[th] = max(variants[th], 1)
        else:
            quick[th] += 1
    for n in os.listdir(directory):
        if n.upper().endswith(".T2"):
            variants[base_name(n)] += 0
    stems = sorted(set(explicit) | set(quick) | set(t2s))
    rows = []
    for s in stems:
        t = t2s.get(s)
        nvar = sum(1 for n in os.listdir(directory) if n.upper().endswith(".T2") and base_name(n) == s)
        rows.append((s, t.name if t else "(no .T2 on this disc)", explicit[s], quick[s], nvar,
                     f"{t.width}x{t.height} tiles / {t.cols}x{t.rows} cells" if t else ""))
    return rows


def main(argv: list[str]) -> int:
    if argv and argv[0] == "--theaters":
        for d in argv[1:]:
            print(f"== {d}")
            print(f"{'stem':8s} {'theater':18s} {'missions':>8s} {'quick':>6s} {'T2 files':>8s}  size")
            for s, name, ex, q, nv, size in theater_table(d):
                print(f"{s:8s} {name:18s} {ex:8d} {q:6d} {nv:8d}  {size}")
        return 0
    if len(argv) == 1:
        p = argv[0]
        if p.upper().endswith(".MT"):
            mt = load_mt(p)
            for k in sorted(mt.sections):
                print(f"--- section {k}")
                print(plain_text(mt.sections[k]))
            return 0
        m = load(p)
        print(f"{m.name}: map {m.map} theater {m.theater} flags {m.flags}")
        for k, v in m.header.items():
            print(f"  {k}: {v[:70]}")
        print(f"  {len(m.objects)} objects: {dict(m.types())}")
        pl = m.player
        if pl:
            print(f"  player: {pl.type} at {pl.pos}, {len(pl.waypoints)} waypoints")
        return 0
    print("usage: python3 -m retail.mission <file.M|file.MT> | --theaters <dir>...", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
