# Damage model as it exists in the data files

Status: **partial** (every field is located and named, and the aggregate
value distributions below are measured; the *meaning* of the two arrays
that matter most — `damage[0..4]` and `systemDamage[0..44]` — is not
recoverable from the data files, for reasons this file records). Reader:
`tools/retail/retail/pt.py`.

    PYTHONPATH=tools/retail python3 -m retail.pt --table extracted/usnf97/USNF_2.LIB
    PYTHONPATH=tools/retail python3 -c "from retail import pt; o=pt.load_object( \
      'extracted/atf-gold/ATF_2.LIB/IOWA.NT'); print(o.short_name, o.hit_points)"

Scope: 153 `.PT`, 130 `.NT`, 240 `.OT` and 210 `.JT` files, both discs,
all parsed clean by the strict schema check. Every count below is over
that whole set unless a disc is named. Field layout and the BRF language
are in [pt.md](pt.md); the sensor half of `OBJ_TYPE` is in
[sensors.md](sensors.md).

The headline finding: **the data files contain a damage *economy* (how much
each weapon inflicts, how much each object can absorb) and almost no damage
*model*.** Armour, per-subsystem vulnerability and the damage→performance
arithmetic are all in engine code.

## The fields, and what varies

All observed. "const" means one value in every file of that type.

| field | `.PT` (153) | `.NT` (130) | `.OT` (240) | `.JT` (210) |
|---|---|---|---|---|
| `hitPoints` | 30..467 | 1..4000 | 0..30000 | 0 const |
| `damage[0..4]` | 255,255,255,255,255 const | same const | 0,0,0,0,0 const | **varies**, 46 distinct 5-tuples |
| `expType` | 30 const | 15, 21, 35 | 0, 15, 35 | 15, 18, 21, 30, 35 |
| `craterSize` | 0 const | 0, 1, 6 | 0, 6, 12, 15, 31 | 0, 1, 2, 3, 6, 9, 12, 15, 18 |
| `dmgType` | 0 const | 0 const | 0 const | 0 const |
| `dmgDebrisPos.{x,y,z}` | varies | varies | mostly 0 | 0 const |
| `dstDebrisPos.{x,y,z}` | varies | varies | mostly 0 | 0 const |

`dmgType` is 0 in all 523 `.PT`/`.NT`/`.OT` files and all 210 `.JT`:
**unused**. Named by the ATF Gold comment, never populated. Certain.

## hitPoints

Observed, certain. This is the only per-object durability number in the
data.

**Aircraft (`.PT`)** — 30 to 467, scaling with airframe size. ATF Gold
values, with USNF'97 in parentheses where they differ:

| aircraft | hitPoints |
|---|---|
| `C5.PT` C-5B | 467 |
| `B52.PT` | 370 (242) |
| `A10.PT` | 244 (123) |
| `F14.PT` | 153 (140) |
| `F22.PT` | 132 (126) |
| `F18.PT` | 116 (115) |
| `KA50.PT` | 103 (100) |
| `MIG21.PT` | 86 (80) |
| `DRNR1.PT` (drone) | 30 |

**Ships and vehicles (`.NT`)** — 1 to 4000:

| class | hitPoints |
|---|---|
| Iowa, Eisenhower, Kitty Hawk | 4000 |
| Clemenceau, Wasp | 2500 |
| Kiev, Kirov | 2000 |
| Type 69 | 1500 |
| Ticonderoga, Knox | 1000 |
| Jianghu | 800 |
| Sovremennyy | 700 |
| cargo ships | 500 |
| T-80, T-90, M-1 | 200 |
| T-72 | 150 |
| APCs, most SAM / AAA sites | 100 |
| trucks, radars | 50 |
| MANPADS, personnel (`RUNNER`, `EJECT`, `CATGUY`) | 5 |
| `A_M1939.NT` "M1939 Zone" | 1 |

**Statics (`.OT`)** — the distribution is 25 objects at 0, then 10, 50,
100 (the modal value, 86 objects), 150, 200, up through 1000 (27
objects), one at 1800 (`BNK9.OT`, "Super Hardened C&C Bunker"), three at
10000 (`CITY1..3.OT`, "Large City"), ten at 20000 (the `ROCK*.OT` terrain
props) and eleven at 30000. The 30000-point objects are the `STRIP*.OT`
runways, which also have `expType` and `craterSize` 0 — effectively
indestructible, and no crater.

**Weapons (`.JT`)** — `hitPoints` is 0 in all 210. A round is not a
target.

### Destroyed states are separate object types

The 25 zero-`hitPoints` `.OT` entries are 17 distinct names: `CRATER`,
`DEST`, `FLAGO1/2`, `FLAGR1/2`, `FLAGY1/2`, `ROAD`, `ROAD2`, `ROAD4`,
`ROADC`, `TREE1`, `TREE2`, and `~BNK5`, `~BNK6`, `~BNK8`. The first group
is scenery that was never meant to be shot; the `~BNK*` group are the
pre-destroyed "Damaged Shelter" variants.

So a destroyed building is **a different object type with its own `.SH`
shape**, not a damage state of the intact one, and the crater is itself an
`.OT`. Observed, high confidence: the `~BNK*` names, long names and zero
hit points are consistent with nothing else, though the substitution
itself happens in engine code that has not been read.

## damage[0..4] is damage INFLICTED

`OBJ_TYPE.damage[]` on a `.JT` is the round's warhead effect, in the same
units as the target's `hitPoints`. It is *not* armour, and it is not the
damage the object takes. Observed, high confidence — see the scale checks
below, which only work in that direction.

Normalised to `damage[0]`, only a handful of patterns exist across 210
files:

| pattern | files | what carries it |
|---|---|---|
| 1, 0.1, 0.3, 0.2, 1 | 79 | air-to-air missiles and SAMs (`AIM9M` 100, 10, 30, 20, 100) |
| 1, 1, 1, 1, 1 | 64 | bombs and AGMs (`MK82` 200×5 USNF'97 / 220×5 ATF, `MK84` 400×5, `AGM84A` 300×5 / 350×5, `GBU28` 1600×5) |
| 1, 0.1, 0.3, 0.3, 1 | 23 | guns and cannon (`M61` 25, 2, 7, 7, 25) |
| 1, 0.2, 1, 1, 1 | 2 | `GAU8` 80, 16, 80, 80, 80 and `C_40` |

`damage[0] == damage[4]` in 208 of 210 files. The extreme values are
`AEMP1.JT` (an EM-pulse weapon: 0 damage in all five slots, but
`collateralDamageRadius` 4000 and `collateralDamagePercent` 70) and
`GBU28.JT` at 1600.

### The five slots as hardness classes

HYPOTHESIS, medium-high confidence: the five slots are **target-hardness
classes**, with slot 1 the hardest (~10% pass-through on a
fragmentation warhead), slots 2–3 intermediate, and slots 0 and 4 soft.

The decisive evidence is the GAU-8 against the M61. Both are cannon, both
have `sig` 0 and the same muzzle speed, and the only structural difference
between them in the whole file is the damage vector:

| round | slot 0 | slot 1 | slot 2 | slot 3 | slot 4 |
|---|---|---|---|---|---|
| `M61.JT` 20 mm | 25 | 2 (8%) | 7 (28%) | 7 (28%) | 25 |
| `GAU8.JT` 30 mm | 80 | 16 (20%) | 80 (100%) | 80 (100%) | 80 |

The GAU-8 is the purpose-built tank-killer and it keeps **full** damage in
slots 2 and 3, where the M61 keeps 28%. Corroboration: `PROJ_TYPE.flags`
bit `$40000` is set on exactly three files — `GAU8`, `C_105` and `C_40` —
which is the same set as the "1, 0.2, 1, 1, 1" pattern plus `C_105`. An
armour-piercing bit and an intact slot-2/3 figure agreeing on the same
three rounds is hard to explain any other way.

What is **not** recoverable: the class index → `obj_class` mapping.
`obj_class` has ten single-bit values (`$40` infantry, `$80` projectile,
`$100` building, `$200` soft vehicle, `$400` armour, `$800` AAA, `$1000`
SAM, `$2000` ship, `$4000` large aircraft, `$8000` fighter), which is more
classes than there are damage slots, so the collapse from ten to five
happens in engine code. Settled only by reading `USNF.EXE`.

### The important negative: there is no per-object armour

`damage[]` is a **constant** on every non-weapon type: 255,255,255,255,255
in all 153 `.PT` and all 130 `.NT`, and 0,0,0,0,0 in all 240 `.OT`.
Observed, certain.

It therefore carries **no per-aircraft and no per-ship information
whatsoever**. Do not model it as armour, damage resistance, or a
per-target multiplier — an importer that reads it per object will read the
same five bytes 523 times. The 255 on planes and ships is best read as
"this object, when it collides with something, inflicts a saturating
amount"; the 0 on statics as "a building cannot damage what hits it". That
reading is a HYPOTHESIS (medium); what is certain is that the field does
not vary.

### Damage-scale sanity checks

Observed. These are the reason the "inflicted" reading is high confidence:
the numbers only come out as playable in that direction.

| check | arithmetic |
|---|---|
| `AIM9M` vs `F14.PT` (ATF) | 100 vs 153 hitPoints → **two hits** to kill a fighter |
| `M61` vs `F14.PT` (ATF) | 25/round vs 153 → **≈ 6 rounds** on target |
| `MK84` vs a 1000-point block | 400 vs 1000 → 2.5 bombs |
| `GBU28` vs `BNK9.OT` | 1600 vs 1800 → the one `.OT` at 1800 hitPoints is "Super Hardened C&C Bunker", and the deepest penetrator in the game very nearly kills it in one |
| `AIM9M` vs `IOWA.NT` | 100 vs 4000 → 40 Sidewinders, i.e. useless, as intended |

Note the checks use slot 0 against an aircraft. Against `IOWA.NT` the
hardness hypothesis says slot 1 applies, making it 10 per hit rather than
100 — 400 Sidewinders. Either way the design intent is the same.

## Explosion, crater and debris

Observed for the values, HYPOTHESIS (high) for the semantics: `expType`
and `craterSize` are **indices into engine effect tables**, not physical
quantities. The evidence is that they are small dense integers with no
arithmetic relationship to `damage[]` or `hitPoints`, and that `.JT` adds
a *pair* of them for terrain.

| field | kind | domain | reading |
|---|---|---|---|
| `expType` | byte | `.PT` 30 const; `.NT` 15/21/35; `.OT` 0/15/35; `.JT` 15/18/21/30/35 | explosion effect index |
| `craterSize` | byte | see the table above | crater effect index; 0 = no crater |
| `expTypeForLand` | byte (`.JT`) | 15 (68), 18 (5), 21 (81), 22 (2), 35 (54) | land impact effect |
| `expTypeForWater` | byte (`.JT`) | 17 (91), 18 (5), 34 (114) | water impact effect |

Every `.JT` therefore carries one land and one water explosion. The
`.PT`/`.NT`/`.OT` `expType` is the effect for the object's own
destruction; the `.JT` `expType` is used when the round detonates on an
object rather than on terrain — HYPOTHESIS, medium, since nothing in the
data distinguishes the three from each other.

`dmgDebrisPos.{x,y,z}` and `dstDebrisPos.{x,y,z}` (six words in
`OBJ_TYPE`) are the **damaged-state and destroyed-state debris/smoke
emitter positions on the model**, in the same model-space units as
hardpoint `pos`. The F-14 has `dmg` (−30, 0, 0) and `dst` (0, 20, −40).
They are 0 in every `.JT` and in most `.OT`. HYPOTHESIS, high confidence:
the pairing of a "dmg"/"dst" prefix with a plausible on-model offset, and
the fact that they are zero on exactly the types that have no damaged
state, is the whole of the evidence.

## Fuze and collateral (`.JT` only)

Observed. Feet where a length; percent where a percent.

| field | kind | domain | note |
|---|---|---|---|
| `fuzeArmT` | word | 0 (77), 4 (121), 8 (12) | arming delay; unit shared with the other `.JT` `T` fields, still open |
| `fuzeRadius` | word | 0 (32), 50 (17), 100 (150), 250 (2), 300 (9) | proximity radius in ft: 0 on guns, 50 on AAA, 100 on almost every missile, 300 on the ballistic bombs `MK82`/`MK84`/`FAB` |
| `collateralDamageRadius` | word | 0 (73) .. 4000 | ft. 750 is the typical missile (90 files), 1000 the next (19), 100 on `GBU28`, 2500 on the `RBK500`/`CBU97` clusters, 4000 on `AEMP1` |
| `collateralDamagePercent` | word | 0 (73), 30 (1), 35 (108), 70 (1), 100 (27) | percent of `damage[]` applied inside the collateral radius (HYPOTHESIS, medium) |

`fuzeRadius` 300 on a slick bomb is much larger than a real fuze and much
smaller than the blast radius, which is consistent with it being the
"close enough to count as a hit" test rather than a modelled fuze.

`sideHitFuzeFailure` is 0 in all 210 files: named, unused.

## PLANE_TYPE.systemDamage[0..44] — the subsystem model is code

45 bytes in `PLANE_TYPE`, immediately after `structureWarnLimit` /
`structureLimit`.

**CRITICAL FINDING (observed, certain): the array is byte-identical in all
153 `.PT` files across both discs.** One distinct array, 153/153, checked
by reading the 45 statements out of every file and comparing.

    20 22 20 148 22 20 20 20 20 148 148 148 20 20 20 148 20 22 20 20 20 22 22
    20 20 20 148 22 36 148 36 0 0 0 22 150 20 22 22 22 6 6 6 6 6

Only seven distinct values appear: 0, 6, 20, 22, 36, 148, 150. As bit
patterns (`$14`, `$16`, `$24`, `$94`, `$96`, `$06`) the low nibble is
always 4 or 6 and the high nibble always 1, 2 or 9, so bits 0, 3 and 6 are
never set. Slots 31–33 are 0 and slots 40–44 are all 6.

Consequences:

- **There is no per-aircraft vulnerability data.** If the array were
  tuning — "the F-14's hydraulics are more fragile than the F-15's" — it
  would vary across 153 aircraft. It does not vary at all. Certain.
- The manual's per-subsystem damage model (radar, weapons, control
  surfaces, fuel flow, engine) is therefore implemented in **engine code
  against a fixed 45-slot layout**, with the array as a static
  descriptor that the data files merely carry along.
- HYPOTHESIS (medium): the array is a per-slot **descriptor bitmask** —
  which repair pool a subsystem belongs to, whether it affects flight,
  whether it is one of a paired left/right set — copied verbatim into
  every type. The regular nibble structure and the run of five 6s at the
  end support "bitfield", not "magnitude".
- Recovering slot → subsystem *names* needs the x86 code, not the data
  files. That is the settling test, and it has not been done.

## Structural and crash limits (`.PT`)

Observed. These turned out to be far more constant than a single-aircraft
sample suggests, so read the counts carefully:

| field | value | files |
|---|---|---|
| `structureWarnLimit` | 2560 | **153 of 153** |
| `structureLimit` | 5120 | **153 of 153** |
| `crashSpeedForward` | 330 | 153 of 153 |
| `crashSpeedSide` | 51 | 153 of 153 |
| `crashSpeedVertical` | 95 | 153 of 153 |
| `crashPitch` | 25 | 153 of 153 |
| `crashRoll` | 10 | 153 of 153 |
| `miscPerFlight` | 10 | 153 of 153 |
| `repairMultiplier` | 10 | 153 of 153 |
| `negGLimit` | 0 | 139 of 153 |
| `negGLimit` | 2560 | 14: `F18`, `F18C` on both discs, plus ATF `CMCHE`, `GAZ`, `GAZE`, `GAZV`, `KA50`, `MI24`, `SFR`, `SFRV`, `SH60`, `TIGRE` |
| `gearPitch` | 0 | 145 of 153 (non-zero on `A4E` 3, `AV8` 3, `SEAHAR` 3, `~MOTH` 2, `~QUE` 5) |

So the over-G structural warning and failure thresholds, and the
ground-impact destruction limits, are **fleet-wide constants** — 2560 and
5120 are the same fixed-point pair for a Cessna and a B-52. Reading them
per aircraft is harmless but pointless; the per-aircraft G limit lives in
the `:env` envelope polygons ([pt.md](pt.md)), not here.

`negGLimit` 2560 on the F/A-18 and on nine ATF helicopters is the only
real per-aircraft variation in this block. HYPOTHESIS (low): the same
fixed-point scale as `structureWarnLimit`, i.e. 2560 = "1.0 unit" of
something rather than −G in Gs. The value is identical on a Hornet and a
Gazelle, which argues against it being a physical negative-G limit at all.
Unresolved.

`crashSpeedForward` 330 ft/s (≈196 kt), `crashSpeedSide` 51 and
`crashSpeedVertical` 95 ft/s read as ft/s ground-impact thresholds and
`crashPitch` 25 / `crashRoll` 10 as degrees of attitude at touchdown —
probable, by unit consistency with the rest of `PLANE_TYPE`, not measured
in game.

## Damage → degraded performance (recovered from code)

The data files say nothing about what damage *does*. Four sites in
`USNF.EXE` do, and they are recovered in the AI VM notes; summarised here
because this is the file a reader will look in.

Each site computes a percentage from the sum of two damage counters times a
per-type coefficient, and applies it. OBSERVED arithmetic, high
confidence; the field *labels* are hypotheses.

| routine | coefficient | form | applied to |
|---|---|---|---|
| `_FMUpdatePlaneFields` | `0x4d5645` | 100 − dmg·k/100 | max and min available G, scaled **down** |
| `_COBv` region | `0x4d5647` | 100 − dmg·k/100 | speed bound, scaled **down** |
| `_COGPullDrag@0` | `0x4d5643` | 100 + dmg·k/100 | G-pull drag, **increased** |
| `_FMAircraftSetup@0` | `0x4d5641` | 100 + dmg·k/100 | a drag term; the thrust scale is set flat at this site |

A parallel player-only adjustment array is applied when the object's
"human-flown" flag is set, so the player and the AI degrade on separate
curves.

This substantiates the manual's claim that damaged aircraft turn and
accelerate worse: two of the four sites scale the G envelope and the speed
bound down, and two raise drag.

**State plainly: the manual also says damaged AI lose thrust, and no
thrust reduction was found in the code.** `@COThrust@4` selects military
or afterburner thrust and applies the multiplayer halving, and nothing
else; the `_FMAircraftSetup` site sets the thrust scale to a flat 1.0 while
raising the drag term next to it. The observed loss of acceleration comes
from added drag, not from reduced thrust. Confidence high that no such
site exists in the routines that were read; not a proof of absence across
the whole binary.

Naming the two damage counters (probably left and right wing) is a
hypothesis. What would settle both open points: tracing every writer of
those two counters, and a full cross-reference of the thrust scale global.

## Open

1. **damage-slot → `obj_class` mapping.** Five slots, ten classes. Needs
   the x86 damage-application routine. Everything about applying weapon
   damage to a non-aircraft target is blocked on this.
2. **`systemDamage` slot → subsystem names**, and the meaning of the
   bitmask nibbles. Needs the x86 code; no data-file experiment can help.
3. **What writes the two damage counters**, and therefore what "damage"
   is measured in when it reaches the four scaling sites.
4. **`negGLimit`'s unit**, given that 2560 appears on both a Hornet and a
   Gazelle.
5. **`collateralDamagePercent`'s referent** — percent of `damage[]`, or an
   independent probability? The domain (0/30/35/70/100) fits either.
6. **`expType` / `craterSize` table contents.** The indices are known; the
   effects they name are engine assets. For the remake these are a lookup
   table to author, not to port.

## Related

- [pt.md](pt.md) — `OBJ_TYPE` / `PLANE_TYPE` field layout, the `:env`
  envelope polygons that hold the real per-aircraft G limits.
- [jt.md](jt.md) — the weapon side: `PROJ_TYPE`, guidance flags, fuzing.
- [sensors.md](sensors.md) — `sigs[]`, the other varying `OBJ_TYPE` array.
- [object-types.md](object-types.md) — `.OT` and `.NT`.
