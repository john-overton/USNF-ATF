# PT: plane type

Status: **decoded field layout, partial semantics**. Many field names are
recovered; unnamed fields and uncertain units remain. Mass/thrust evidence is
recorded below; aerodynamic behaviour still needs the phase 4 harness. Reader: `tools/retail/retail/pt.py`,
tokenizer shared with JT/OT/NT in `retail/brf.py`.

    PYTHONPATH=tools/retail python3 -m retail.pt extracted/usnf97/USNF_2.LIB/F14.PT
    PYTHONPATH=tools/retail python3 -m retail.pt --table extracted/usnf97/USNF_2.LIB

## It is text

A `.PT` is not a binary record. It is a small CRLF text file in an
assembler-like data language whose first line is
`[brent's_relocatable_format]`; the game assembles it into a C struct at load
time. Sizes: USNF'97 7.5 to 15.6 KB, 48 files; ATF Gold 105 files. Every
`.PT`, `.JT`, `.OT` and `.NT` on both discs uses the same language.

Statements, one per line, `;` starts a comment:

| statement | size | meaning |
|---|---|---|
| `byte N` / `word N` / `dword N` | 1 / 2 / 4 | integer field |
| `ptr LABEL` | 4 | pointer to a `:LABEL` block later in the file (null pointer is written `dword 0`) |
| `symbol NAME` | 4 | pointer to an engine symbol, e.g. `_PLANEProc` (the update routine) |
| `string "text"` | n+1 | NUL-terminated string inside a `:LABEL` block |
| `:LABEL` | 0 | label |
| `end` | | end of file |

Numbers are decimal, `$hex`, or `^N`. The caret marks values the assembler
scales into internal units (altitudes, ranges, accelerations); the reader
keeps the raw integer and sets `Token.scaled`. Hex literals wider than the
field are truncated and sign-folded (`word $ffff8000` is -32768).

Struct boundaries are comments of the form
`;---------------- START OF PLANE_TYPE ----------------`. **ATF Gold files
carry the C field name as a trailing comment on nearly every statement**
(`dword 40104 ; weight`). USNF'97 files are the identical statement sequence
with no comments, so the names transfer by position. The reader verifies the
statement kinds against the schema for every file and refuses to label a
file that does not match, so a wrong alignment cannot silently mislabel.

## File layout

```
OBJ_TYPE      63 statements (USNF) / 64 (ATF adds `year`)   shared by PT/JT/OT/NT
NPC_TYPE       9 statements                                   shared by PT/NT
PLANE_TYPE   146 statements                                   PT only
:hards        12 statements x numHards
:env          44 statements x (envMax - envMin + 1)
;-- notes     "4G area = 0.307", "11 = rating for F-14" (design-time comments)
:ot_names     3 strings: short name, long name, own file name
:shape, :shadowShape, :loopSound, :secondSound, :engineOnSound, :engineOffSound,
:hudName (USNF only), :ctName, :defaultTypeName0..N
end
```

The statement counts are identical across all 48 USNF and all 105 ATF files
(checked by `apply_schema`, which is strict). `typeSize` is 632 in USNF and
636 in ATF, which is exactly the inserted `year` dword.

## OBJ_TYPE (common header)

| # | kind | name | notes |
|---|---|---|---|
| 0 | byte | structType | 5 = plane, 7 = projectile, 3 = NPC, 1 = static object |
| 1 | word | typeSize | struct size in bytes |
| 2 | word | instanceSize | runtime instance size |
| 3 | ptr | ot_names | |
| 4 | dword | flags | |
| 5 | word | obj_class | bitmask; -32768 for planes |
| 6, 7 | ptr | shape, shadowShape | `.SH` file names |
| 8, 9 | dword | (unnamed) | 0 in every plane |
| 10..12 | word | dmgDebrisPos.x/y/z | |
| 13, 14 | dword | (unnamed) | |
| 15..17 | word | dstDebrisPos.x/y/z | |
| 18 | dword | dmgType | |
| 18a | dword | year | **ATF Gold only**; service entry year, 1984 for the F-14 |
| 19 | word | maxVisDist | |
| 20 | word | cameraDist | |
| 21..25 | word | sigs[0..4] | signatures (radar, IR, visual...) |
| 26 | word | hitPoints | |
| 27..31 | word | damage[0..4] | |
| 32 | byte | expType | explosion type |
| 33 | byte | craterSize | |
| 34 | dword | **weight** | **empty weight, lb** |
| 35 | word | cmdBufSize | |
| 36..43 | word | _turnRate, _bankRate, maxClimb, maxDive, maxBank, _minSpeed, _cornerSpeed, _maxSpeed | angles in 1/65536 turn (16380 = 90 deg); underscored ones are 0 for planes (computed from the envelope) |
| 44..47 | dword | _acc, _dacc, minAlt, maxAlt | `^`-scaled; minAlt/maxAlt in ft (F-14 300 / 56000) |
| 48 | symbol | utilProc | `_PLANEProc` |
| 49..52 | ptr | loopSound, secondSound, engineOnSound, engineOffSound | `.11K` / `.5K` names |
| 53 | byte | doDoppler | |
| 54..58 | word | maxSndDist, maxPlusDopplerPitch, maxMinusDopplerPitch, minDopplerSpeed, maxDopplerSpeed | |
| 59..61 | word | viewOffset.x/y/z | |
| 62 | ptr | hudName | `.HUD` name in USNF'97; `dword 0` in ATF Gold |

## NPC_TYPE

`flags` (dword), `ctName` (ptr), `searchFrequencyT`,
`unreadyAttackT`, `attackT` (bytes), `retargetT`, `zoneDist` (words),
`numHards` (byte), `hards` (ptr).

Correction (2026-09-09): `ctName` names the object's **AI program** (`f.BI`,
`h.BI`, `large.BI`, …), not a cockpit definition. `.BI` is the compiled form
of the plaintext `.AI` behaviour script. See
[object-types.md](object-types.md) for the corrected note and the
per-program file counts. The engagement timers `searchFrequencyT`,
`unreadyAttackT`, `attackT` and `retargetT` belong to the detection and
attack scheduling path, not to the AI script's decision cadence, which is
event-driven.

## PLANE_TYPE

146 statements. The ones that matter for the flight model:

| name | kind | F-14 value | unit / meaning | confidence |
|---|---|---|---|---|
| envMin, envMax | word | -4, 9 | G range of the envelope table | certain (count matches) |
| structure[0..1] | word | | | unknown |
| _bv.{x,y,z}.{min,max,acc,dacc} | word | | body velocity limits per axis | named only |
| _brv.{x,y,z}.{...} | word | | body rotation rate limits | named only |
| gpullAOA, lowAOASpeed, lowAOAPitch, turbulencePercent | word | | | named only |
| rudderYaw.{min,max,acc,dacc}, rudderSlip, rudderDrag, rudderBank | word | | | named only |
| puffRot.{x,y,z}.{...} | word | | | named only |
| stallWarningDelay, stallDelay, stallSeverity, stallPitchDown | word | 512, 768, 256, 30 | 256 = 1.0 fixed point likely | probable |
| spinEntry .. spinBankHigh | word | | spin model | named only |
| gearPitch, crashSpeed{Forward,Side,Vertical}, crashPitch, crashRoll | word | 330, 51, 95 | ft/s | probable |
| engines | byte | 2 | engine count (B-52: 8) | certain |
| negGLimit | word | 0 | | |
| **thrust** | dword | 28435 | **lbf, military, all engines** | certain |
| **aftThrust** | dword | 41800 | **lbf, afterburner, all engines; 0 = no AB** | certain |
| throttleAcc, throttleDacc | word | 40, 60 | | |
| vtLimitUp, vtLimitDown, vtSpeed | word | 0 | VTOL (non-zero on AV-8, Yak-141) | probable |
| fuelConsumption, aftFuelConsumption | word | 2, 10 | lb/s at mil / AB (TF30 SFC gives 5 and 29; game halves them) | probable |
| **internalFuel** | dword | 15741 | **lb** | high |
| **coefDrag** | word | 256 | drag coefficient, 8.8 fixed point (256 = 1.0 in every aircraft; per-aircraft drag is in the envelope) | named, semantics probable |
| _gpullDrag, airBrakesDrag, wheelBrakesDrag, flapsDrag, gearDrag, bayDrag | word | 20, 320, 40, 76, 23, 0 | drag increments, same fixed point | probable |
| flapsLift | word | 51 | lift increment (51/256 = 0.2) | probable |
| loadedDrag, loadedGpullDrag, loadedElevator, loadedAileron, loadedRudder | word | | penalties with stores | named only |
| structureWarnLimit, structureLimit | word | 2560, 5120 | | |
| systemDamage[0..44] | byte | | per-system damage table | named only |
| miscPerFlight, repairMultiplier | word | | campaign | |
| **maxTakeoffWeight** | dword | 74349 | **lb** | certain |

### Evidence for the units

Values are the game's own; the published figures are public data.

- `weight` 40104 and `maxTakeoffWeight` 74349 for the F-14 are the Jane's
  figures for the F-14A empty weight and MTOW in pounds, digit for digit.
  Fleet check: A-10 25,600 / 50,000; AC-130U 76,469 / 155,000; F-15 28,600 /
  68,000; B-52 235,220 / 488,000; Ka-50 18,298 / 23,810. Ordering and
  magnitude are right across all 48 aircraft.
- `aftThrust` 41800 = 2 x 20,900 lbf, the TF30-P-414A afterburning rating.
  A-10 `thrust` 18130 = 2 x 9,065 lbf (TF34-GE-100), F-15 `aftThrust` 47860 =
  2 x 23,930 lbf (F100-PW-220), F-22 70000 = 2 x 35,000.
  Correction from the 2026-09-08 review: the previously stated Su-27 match was
  arithmetically wrong (59,510 is not 2 × 27,557 = 55,114); that physical
  cross-check remains unresolved. Aircraft without afterburner have `aftThrust` 0.
- Speeds are ft/s and altitudes ft: the F-14's 1 G envelope tops out at
  2270 ft/s (Mach 2.34, the book figure) at 34,000 ft, 1350 ft/s at sea level
  (800 kt), stall about 230 ft/s (136 kt), ceiling 56,000 ft, which is also
  `maxAlt`. MiG-31: 2743 ft/s (Mach 2.83), 68,000 ft. Helicopters: 220 ft/s,
  7,000 to 8,000 ft.
- Angles: 16380 for `maxBank` and 14560 for `maxClimb` are 90 and 80 degrees
  in 1/65536-turn units.

## Hardpoints (`:hards`)

12 statements each, `numHards` of them: `flags` (word), `pos.x/y/z` (words,
position on the model), `slewH`, `slewP`, `slewLimitH`, `slewLimitP` (words,
for turrets), `defaultTypeName` (ptr to a string: `M61.JT`, `AIM9M.JT`,
`F250.GAS` drop tank, `F14R.SEE` radar, `VIS340.SEE` visual sensor,
`F14.ECM`), `maxWeight` (byte), `maxItems` (word), `name` (byte). The first
hardpoints of a plane are its sensors and gun, so the F-14's 8 "hardpoints"
are visual, radar, ECM, gun, then four weapon stations.

`python3 -m retail.loadout --pt <PT>` exports the list together with the
stores it names; `engine/src/data/retail-loadout.ts` is the engine-side
contract. Measured station counts, local media, 2026-09-10: F14.PT 8 (4
selectable), A4E.PT 7 (3), F31.PT 9 (3), where "selectable" excludes the
sensor and ECM slots and the internal cannon. F31.PT station 5 is a real
pylon (`flags $681`, `maxItems 1`) that names no default store.

Two fields in this block remain **unresolved**, and both bound what a loadout
screen can honestly offer:

- **`flags` is the per-station compatibility mask.** Observed values on the
  F-14's weapon stations are `$1f5`, `$605`, `$7f5` and `$485`; the A-4E's are
  `$1781`, `$1785`, `$1585`. Bit `$0008` marks the sensor/ECM slots and is the
  one bit we do read. That the rest encode a real rule is corroborated by
  `ARMPLANE.MNU`, whose own menu carries "Cheat (load anything anywhere)".
  Until the bits are decoded, nothing may be inferred about which store fits
  which station. A way in: cluster the roughly 1,200 weapon stations across all
  153 `.PT` files by flags value and correlate with the store classes their
  defaults belong to.
- **`maxWeight` is a byte and is not pounds.** F-14 stations give 40 for a
  975 lb AIM-54C, 38 for a 250 gal tank (198 lb empty, 1,650 lb of fuel), 30
  for a 345 lb AIM-120 and 5 for a 190 lb AIM-9M. Roughly monotone in store
  weight but not proportional; probably a rack or pylon class.

`pos.x/y/z` are raw words whose unit is unverified, so they are exported
unconverted. `maxItems` is confirmed as the count the station holds: 675 M61
rounds on the F-14, 400 Mk 12 rounds on the A-4E, 740 on the X-31, matching the
gun capacities `retail.gun` already recovered independently.

## Envelopes (`:env`)

One block per integer G load from `envMin` to `envMax`, 44 statements each:
`gload`, `count`, `stallLift`, `maxSpeed` (words), then 20 `(speed word, alt
dword)` points of which the first `count` are used. Each block is a closed
polygon in (speed ft/s, altitude ft) inside which the aircraft can sustain
that G. The G = 1 polygon is the level-flight envelope (min speed rising with
altitude up to the ceiling, then max speed falling back to sea level). The
design-time comments after the table (`4G area = 0.307`) are the polygon
areas relative to the 1 G one and a derived "rating". This table, not a
lift-curve, is USNF's aerodynamic model; phase 4 should fit its tables to
these polygons.

## USNF'97 vs ATF Gold

Same layout except: ATF inserts `year` in OBJ_TYPE, drops the `hudName`
pointer (written `dword 0`), and its F-14 has `envMax` 7 instead of 9 and a
higher `hitPoints`. Shared fields (`weight`, `maxTakeoffWeight`, `thrust`,
`aftThrust`, `internalFuel`, `maxAlt`) are byte-identical for the F-14.

## Related

`.PTS` files are not plane types: they are 4 KB Win32 PE modules (see
[object-types.md](object-types.md)).

The stores a `:hards` list references are decoded elsewhere:
[sensors.md](sensors.md) for `.SEE` / `.ECM` / `.GAS` and
[jt.md](jt.md) for `.JT`. [damage.md](damage.md) covers `hitPoints`,
`damage[]`, `systemDamage[0..44]` and the structural and crash limits —
note in particular that `structureWarnLimit` / `structureLimit` and every
`crash*` field are **the same value in all 153 `.PT` files**, so the F-14
figures in the table above are fleet-wide constants, not per-aircraft
tuning.


## 2026-09-09: bounded A-4E and X-31 flight exports

`retail.flight` now accepts the inspected unlabelled USNF97 A4E.PT variant
(typeSize 608, G rows -4..7) and labelled ATF-GOLD F31.PT (typeSize 660,
G rows -4..9), in addition to the existing USNF97 F14.PT. Source game identity
is preserved. ATF-GOLD A4E.PTS is an MZ/PL module and is not accepted as BRF PT.

A-4E's `aftThrust` is zero. Export preserves that raw value and sets the force
fitter's effective maximum/afterburner thrust equal to military thrust. This
avoids a zero-thrust fit without inventing an A-4 burner. The new profiles omit
native-helper data: neither native X-31 vectoring nor full per-aircraft flight
parity is established. PT facts and SI conversion are separate from the
original envelope-fit force law; see [aircraft setup](../phase-4-aircraft.md).


## 2026-09-09 coefficient interpretation correction

Native callers now verify `coefDrag` as an 8.8 force normalization, not an
aerodynamic drag coefficient. `_gpullDrag` and device drag fields are 8.8
weight-relative force factors. `loadedDrag`, `loadedGpullDrag` and
`loadedElevator` are **percentage correction coefficients**, not 8.8 values.
Earlier generated profile metadata may still say probable/unknown; the raw
values remain usable without reimporting. See [native performance](native-performance.md)
for formulas, caller addresses, coverage and remaining unknowns.
