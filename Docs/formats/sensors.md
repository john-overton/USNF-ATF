# SEE, ECM, GAS: store items (sensors, countermeasures, drop tanks)

Status: **decoded** (layout complete and named from the ATF Gold field-name
comments; angle and range units confirmed; a few flag bits and the
`lookDown` semantics remain hypotheses). Reader: the shared BRF tokenizer
`tools/retail/retail/brf.py`. There is no dedicated CLI yet, so dump one
with the tokenizer directly:

    PYTHONPATH=tools/retail python3 -c "from retail import brf; \
      [print(i, t.kind, t.value, '|', t.comment) for i, t in \
       enumerate(brf.load('extracted/atf-gold/ATF_2.LIB/F14R.SEE').tokens)]"

A `.SEE`, `.ECM` or `.GAS` file is the same `[brent's_relocatable_format]`
text data language as `.PT` ([pt.md](pt.md)) — see that file for the
statement grammar, the `^` scale prefix, and the fact that ATF Gold files
carry the C field name as a trailing comment while USNF'97 files are the
identical statement sequence with no comments.

All three are the **`STORE_ITEM`** family: the same prefix that a `.JT`
weapon's `PROJ_TYPE` starts with ([jt.md](jt.md)), standing alone. They
carry no `OBJ_TYPE` header, no shape and no `:hards`; the only label block
is `:si_names` (three strings: short name, long name, own file name).
`structType` is the class discriminator:

| structType | extension | meaning | files (USNF'97 + ATF Gold) | statements |
|---|---|---|---|---|
| 8 | `.GAS` | external fuel tank | 8 (4 + 4) | 5 |
| 9 | `.ECM` | countermeasures / jammer suite | 56 (30 distinct names) | 20 |
| 10 | `.SEE` | sensor | 93 (51 distinct names) | 25 |
| 10 | `.JT` `PROJ_TYPE` | a weapon is also a store item | 210 | 90 |

Observed, certain: every file of each extension has exactly one statement
shape — 93/93 `.SEE`, 56/56 `.ECM`, 8/8 `.GAS` parse to a single
kind sequence, so there are no variants to detect. Measured over both
discs with the tokenizer.

## SEE: sensor

25 statements, in this order. All observed; the names are the ATF Gold
comments, verified statement-for-statement against the expected order.

| # | kind | name | notes |
|---|---|---|---|
| 0 | byte | structType | always 10 |
| 1 | ptr | si_names | short name, long name, own file name |
| 2 | word | weight | lb. 0 = internal (88 of 93); 350 = `AAS38` FLIR pod; 425 = `PAVESPK` / `PAVEKNF` |
| 3 | byte | flags | bit `$1` set in exactly the 5 files with `weight > 0`, and in no other: "this sensor is an external pod" |
| 4 | byte | sig | which target signature this sensor reads; indexes `OBJ_TYPE.sigs[]` (below) |
| 5 | byte | flags | bit `$1` on 39 of 93 files; only ever on `sig` 3 files (see Open) |
| 6 | byte | lookDown | 0, 20, 25, 30 or 50 |
| 7 | byte | dopplerSpeedAbove | 0 in all 93 |
| 8 | byte | dopplerSpeedBelow | 0 in all 93 |
| 9 | byte | dopplerMinRange | 0 in all 93 |
| 10 | byte | allAspect | 0, except 50 on the four IRST files |
| 11, 12 | word | zone0.h, zone0.p | **half-angles**, 1/65536 turn |
| 13, 14 | dword | zone0.minRange, zone0.maxRange | `^`-scaled, feet |
| 15, 16 | dword | zone0.minAlt, zone0.maxAlt | feet; `$80000000` / `$7fffffff` = unlimited |
| 17..22 | | zone1.{h, p, minRange, maxRange, minAlt, maxAlt} | same shape |
| 23 | byte | chaffFlareChance | 100 in all 93 |
| 24 | byte | deceptionChance | 100 in all 93 |

`zone0` is the search / detection volume and `zone1` the track / lock
volume: `zone1` is the narrower cone in every file (`h` and `p` fall from
±60/±60 to ±45/±45 on a typical nose radar) and the shorter range in 87 of
93 (see Open for the three exceptions). Confidence high; the reading is the
same one that `.JT` uses for the identically-named pair.

`minRange` is 0 in all 93 files, so a sensor has no minimum range.
`minAlt` / `maxAlt` are unlimited everywhere except `GCIR.SEE` and
`REDCR.SEE` (USNF'97 only), where `minAlt` is 1: the two ground / ship
early-warning radars cannot see at or below sea level. Observed, certain.

### Units — both confirmed

**`h` and `p` are half-angles in 1/65536 turn** (the same unit as `.PT`
`maxBank` / `maxClimb`; 16380 = 90°). Proof: the four visual sensors are
named for their **total** field of view in degrees and `h` is exactly half
of it.

| file | zone0.h | ± degrees | total | zone0.p | ± degrees |
|---|---|---|---|---|---|
| `VIS180.SEE` | 16380 | 90 | 180 | 16380 | 90 |
| `VIS240.SEE` | 21840 | 120 | 240 | 16380 | 90 |
| `VIS300.SEE` | 27300 | 150 | 300 | 21840 | 120 |
| `VIS340.SEE` | 30940 | 170 | 340 | 25480 | 140 |

Certain. 32767 (≈180°) is the "no limit" value used by the laser
designator pods and the hemispheric ground radars.

**`maxRange` is feet, and every value is a whole number of nautical
miles** at 6,076 ft/nmi. The 20 distinct `zone0.maxRange` values are
exactly 9, 10, 15, 18, 30, 35, 40, 43, 50, 55, 60, 62, 75, 90, 100, 124,
150, 190, 200 and 300 nmi; `zone1.maxRange` adds 5, 20, 25, 34 and 115.
Certain: 20 of 20 values land on an integer nmi with no rounding, which a
different unit would not.

The corroborating external check is that the values are the published
figures. `F14R.SEE` is named `AWG-9` in its `:si_names` and searches to
190 nmi — the quoted AN/AWG-9 detection range — and tracks to 150 nmi.

### Representative ranges (nmi, search / track)

Aggregate table, both discs; where the two discs differ the USNF'97 value
is in parentheses. Observed.

| file | `:si_names` short | sig | search | track | zone0 h/p |
|---|---|---|---|---|---|
| `VIS180/240/300/340.SEE` | — | 0 | 10 | 5 | ±90…±170 / ±90…±140 |
| `PAVESPK.SEE`, `PAVEKNF.SEE` | Pave Spike / Knife | 1 | 10 | 10 | ±180 / ±180 |
| `AV8L`, `KA50L`, `SU24L`, `SU37L` | — | 1 | 10 | 10 | ±60 / ±60 |
| `AAS38.SEE` | AAS-38 FLIR | 2 | 15 | 15 | ±60 / ±60 |
| `AV8IR.SEE`, `SU37I.SEE` | — | 2 | 15 | 15 | ±60 / ±60 |
| `AC130I`, `MIG29I`, `SU27I` | — | 2 | 9 | 10 | ±60 / ±60 |
| `F14R.SEE` | AWG-9 | 3 | 190 | 150 | ±60 / ±60 |
| `MIG31R.SEE` | Flash Dance | 3 | 124 | 100 (75) | ±60 / ±60 |
| `F15R.SEE` | — | 3 | 150 | 100 (75) | ±60 / ±60 |
| `F22R.SEE` | — | 3 | 150 | 150 | ±60 / ±60 |
| `SU27R.SEE`, `SU35R.SEE` | Stinger | 3 | 150 | 115 | ±60 / ±60 |
| `B52R`, `TU95R`, `TU160R` | Big Bulge | 3 | 150 | 150 | ±60 / ±60 |
| `F18R.SEE` | APG-65 | 3 | 90 | 50 | ±60 / ±60 |
| `AV8R.SEE`, `SEAHARR.SEE` | — | 3 | 90 | 50 | ±60 / ±60 |
| `A7R.SEE` | — | 3 | 75 | 50 | ±60 / ±60 |
| `MIG29R.SEE` | Slot Back | 3 | 62 | 43 | ±60 / ±60 |
| `SU37R.SEE` | — | 3 | 60 | 40 | ±60 / ±60 |
| `MIG21R.SEE` | Jay Bird | 3 | 55 (18) | 40 (9) | ±60 / ±60 |
| `MIG27R.SEE` | High Lark | 3 | 55 (43) | 40 (34) | ±60 / ±60 |
| `SU24R.SEE` | — | 3 | 50 | 40 (35) | ±60 / ±60 |
| `F4BR`, `F4JR`, `F4R`, `F104R` | APQ-72 / APG-59 | 3 | 50 | 25 | ±60 / ±60 |
| `A6R.SEE`, `EA6R.SEE`, `AC130R.SEE` | — | 3 | 50 | 25…30 | ±60 / ±60 |
| `YAK141R.SEE` | — | 3 | 40 | 25 | ±60 / ±60 |
| `F8R.SEE` | APQ-94 | 3 | 35 | 20 | ±60 / ±60 |
| `A10R.SEE` | — | 3 | 30 | 30 | ±60 / ±60 |
| `E2R.SEE`, `E3R.SEE` | — | 3 | 200 | 200 | ±180 / ±90 |
| `E6R.SEE`, `E8R.SEE` | — | 3 | 300 | 300 | ±180 / ±90 |
| `GCIR.SEE`, `REDCR.SEE` | GCI / Red Crown radar | 3 | 50 | 50 | ±180 / ±90 |

The pattern is a nose cone of ±60° search narrowing to ±45° track for
every aircraft radar, a hemisphere (±180 / ±90) for the AEW and
ground-station radars, and a 10 nmi / ±170° eyeball.

### `sig`: which signature the sensor reads

`sig` is 0..4 and selects one element of the target's
`OBJ_TYPE.sigs[0..4]`. Observed, very high confidence: the grouping of
files by `sig` is exactly the grouping by sensor kind that their names and
`:si_names` describe.

| sig | kind | distinct `.SEE` files | which |
|---|---|---|---|
| 0 | visual (eyeball) | 4 | `VIS180/240/300/340` |
| 1 | laser / EO designator | 6 | `AV8L`, `KA50L`, `PAVEKNF`, `PAVESPK`, `SU24L`, `SU37L` |
| 2 | IR / IRST / FLIR | 6 | `AAS38`, `AC130I`, `AV8IR`, `MIG29I`, `SU27I`, `SU37I` |
| 3 | radar | 35 | every `*R.SEE` |
| 4 | anti-radiation | 0 | no `.SEE` uses it |

The same enum is `PROJ_TYPE.sig` in `.JT` (see [jt.md](jt.md)), where 4
appears on exactly `AGM88.JT` (HARM) and `AGM45.JT` (Shrike).

### `OBJ_TYPE.sigs[0..4]`: the target side of the same index

`sigs[i]` is the object's signature *as seen by a sensor whose `sig` is
`i`*, with 100 as the baseline. Observed, high confidence — the
correspondence is inferred from the shared 0..4 domain and from the values
being physically sensible per column, not read out of code.

- `sigs[0] == sigs[1]` in **all 523** `.PT`/`.NT`/`.OT` and all 210 `.JT`
  files, so visual and laser share one number. Observed, certain.
- `sigs[4]` is 0 in all 733 files. Anti-radiation homing therefore cannot
  be table-driven and must be special-cased in engine code — hypothesis,
  high confidence.
- All 240 `.OT` statics and all 210 `.JT` are a flat 100/100/100/100/0.
- Ranges: `.PT` `sigs[0]` 60..326, `sigs[2]` 5..200, `sigs[3]` 1..500.
  `.NT` 0..300 / 0..150 / 0..200.

Representative values (visual, laser, IR, radar; ATF Gold unless noted):

| object | vis | laser | IR | radar |
|---|---|---|---|---|
| `F14.PT` | 137 (124 in USNF'97) | = | 100 | 100 |
| `B2.PT` | 220 | 220 | 15 | 1 |
| `F117.PT` | 162 | 162 | 20 | 1 |
| `F22.PT` | 115 | 115 | 60 | 10 |
| `SU37.PT` | 124 | 124 | 50 | 10 |
| `B1.PT` | 220 | 220 | 60 | 40 |
| `RAFALE.PT` | 95 | 95 | 70 | 50 |
| `B52.PT` (USNF'97) | 195 | 195 | 200 | 100 |
| `KA50.PT` | 104 | 104 | 50 | 400 |
| `BLIMP.PT` | 200 | 200 | 200 | 500 |
| `NIMZ.NT` Eisenhower | 300 | 300 | 150 | 200 |
| `SESHDW.NT` Sea Shadow | 100 | 100 | 50 | 10 |

The columns read as the design intent one would expect: stealth aircraft
have radar signature 1..10 while staying large visually, hot straight-pipe
jets carry IR 200, and helicopters carry radar 400 (rotor flash). That
consistency is the evidence for the sig→column mapping; it is not proof.

### `lookDown`

HYPOTHESIS, high confidence: `lookDown` is a **look-down
degradation/failure percent**, not a look-down capability rating. 0 means
full look-down.

Evidence, all observed:

- 0 on every pulse-doppler set in the file list — `F18R` (APG-65),
  `F22R`, `MIG29R` (Slot Back), `SU27R`, `SU37R`, `B52R`, `TU95R`,
  `TU160R`, `E2R`, `E3R`, `E6R`, `E8R`, `GCIR`, `REDCR`, and every `sig`
  0/1/2 sensor: 65 of 93 files.
- 50 on exactly the old pulse radars: `F104R`, `F4R`, `F4BR` (APQ-72),
  `F8R` (APQ-94), `MIG21R` (Jay Bird), `MIG27R` (High Lark).
- 30 on `F14R`, `F15R`, `MIG31R`, `A10R`, `A7R`, `AC130R`, `AV8R`,
  `SEAHARR`; 25 on `YAK141R`; 20 on `F4JR` (APG-59).
- The same field in `.JT` follows the same polarity: `AIM7.JT` (SARH, no
  look-down) 100, `AIM7E` 150, `AIM9B` 20/75 (disc-dependent),
  `AIM120` 10, `AIM9M` / `AIM9X` 0.

A capability reading would have to make the AWG-9 *worse* at look-down
than the APG-65 by the same number that makes the AIM-7 better than the
AIM-9M, which is incoherent; the degradation reading is consistent in both
files. What would settle it: the x86 read of the field in the detection
path. Not yet done.

### Binding sensors to hardpoints

The sensor suite is carried in a `.PT`'s **`:hards` list**, not in a
separate table. Observed, certain, measured over all 153 `.PT` files:

- Every `.PT` references at least one `.SEE`, and every one references a
  `VIS*.SEE`: 153 of 153. Unarmed transports (C-130, KC-135, IL-96,
  SH-60) have only `VIS300.SEE` and nothing else.
- Sensor and ECM hardpoints are marked by hardpoint `flags` bit
  **`$0008`**, `maxItems` 1 and `maxWeight` 0. Across all 153 `.PT` files
  there are 465 hardpoints referencing a `.SEE` (341) or an `.ECM` (124).
  **460 of 465 carry bit `$0008`** — 367 at exactly `$0008` and 85 at
  `$1008`. `maxItems` is 1 on 457 and 32767 on 8. `maxWeight` is 0 on 460.
  Only 5 depart from the pattern: three `.SEE` and two `.ECM` hardpoints
  at flags `$0601` with a non-zero `maxWeight`, which are the genuine
  external pods occupying a real store station.
- `.GAS` is *not* one of these: drop tanks sit on ordinary weapon
  stations (flags `$0605`, `$0205`, `$1785`, …) with a non-zero
  `maxWeight`. Only `.SEE` and `.ECM` get the `$0008` sensor slot.
- The conventional order is **visual → radar → (IRST / laser) → ECM →
  gun → weapon stations**. The F-14 (ATF Gold) is `VIS340.SEE`,
  `F14R.SEE`, `F14.ECM`, `M61.JT`(675), `AIM54C`(4), `F250.GAS`(2),
  `AIM120`(2), `AIM9M`(2).
- **Correction to the simple form of that rule:** the order is a
  convention, not an invariant. 12 of 153 `.PT` files place a sensor
  *after* a weapon station — `A10.PT` puts `PAVESPK.SEE` at index 4
  behind the GAU-8, `F22.PT` and `RAFALE*.PT` do the same with their
  IRST/FLIR, `AV8.PT` ends with `ALQ167.ECM`, and `B52.PT` (USNF'97)
  ends with `B52.ECM`. An importer must key on the referenced extension
  and the `$0008` flag, never on hardpoint index.
- Several ATF Gold aircraft reuse another type's sensors wholesale: B-1,
  B-2, F-16, F-4 and the Rafale variants all name `F18R.SEE` +
  `F18.ECM`.

### Ground threats have no sensor of their own

`.NT` NPC types (SAM sites, AAA, ships, vehicles) carry 149 `.JT`
hardpoints and only **two** `.SEE` references across both discs:
`GCI.NT` → `GCIR.SEE` and `BUTLER.NT` → `REDCR.SEE`, both USNF'97, both
dedicated early-warning radar stations rather than shooters. No `.NT`
references an `.ECM`, and no `.OT` has hardpoints at all.

So a SAM or AAA site has no detection envelope of its own: its engagement
volume is the launcher `.JT`'s `zone0` / `zone1`. Observed, certain.
This is the correction to the loose statement that ".NT have no .SEE" —
the two GCI/Red Crown stations are the exception, and they are sensors
without weapons rather than weapons without sensors.

Cross-reference: the engine-side scan that consumes all of this is
`@Reaction@12`, whose filters (active, alive, opposite side only, an
eligibility byte, flag `$200`) are decoded but whose target *ranking* is
not. See the AI VM notes for the detection/attack scheduling path and for
why `PT.searchFrequencyT` / `attackT` / `unreadyAttackT` / `retargetT`
belong to it rather than to the AI script cadence.

## ECM: countermeasures and jamming

20 statements. Names from the ATF Gold comments; all values observed over
all 56 files.

| # | kind | name | observed values |
|---|---|---|---|
| 0 | byte | structType | always 9 |
| 1 | ptr | si_names | |
| 2 | word | weight | 0 (52 files) or a pod: `ALE40` 100, `ALQ72` 224, `ALQ167` 310 lb |
| 3 | byte | flags | `$1` on exactly the four pod files |
| 4 | word | flags | 0 (23), `$f0` (2), `$1f0` (31) |
| 5 | byte | chaffLoaded | 0, 5, 20, 30, 50, 60, 99 |
| 6 | byte | chaffChance | 35 in every file that carries chaff |
| 7 | byte | chaffH | 95 in every file that carries chaff |
| 8 | byte | chaffP | 24 in every file that carries chaff |
| 9 | byte | flaresLoaded | same domain as `chaffLoaded` |
| 10 | byte | flareChance | 35 in every file that carries flares |
| 11 | byte | flareH | 159 in every file that carries flares |
| 12 | byte | flareP | 31 in every file that carries flares |
| 13 | byte | rdChance | 0 (23), 30 (27), 50 (4), 80 (2) |
| 14 | word | rdSigAdd | 0, else always 100 |
| 15 | byte | rNoiseMaxDist | 0 in all 56 (unused) |
| 16 | byte | rNoiseMinDist | 0 in all 56 (unused) |
| 17 | byte | irdChance | 0 (25), 40 (25), 50 (4), 80 (2) |
| 18 | word | irdSigAdd | 0, else always 100 |
| 19 | byte | irdLoseLockTime | 0 in all 56 (unused) |

Note the byte fields are signed in the reader: `flareH` reads back as
−97, which is 159 unsigned. Compare `.JT`'s `chaffFlareChance` 150 / 200.

The dispenser geometry is fixed: chaff 95/24 and flares 159/31 in every
file that dispenses at all. The four exceptions are the pure-jammer pods —
`ALQ167.ECM` has no chaff and no flares on either disc, and USNF'97's
`ALQ72.ECM` and `MIG27.ECM` likewise carry no chaff (`ALQ72` no flares
either). HYPOTHESIS (medium): `chaffH`/`chaffP` and `flareH`/`flareP` are
the ejection direction as byte angles. Nothing in the data distinguishes
that from a dispersion cone, because the values never vary.

`flags` word `$1f0` vs `$f0` splits the jammers: `$f0` on `ALQ72.ECM` and
ATF Gold `MIG27.ECM` (both radar-only), `$1f0` on the other 16 distinct
jammer names, 0 on the 23 files with no jammer at all. HYPOTHESIS (high):
bit `$100` is the IR-deception capability. Consistent with `irdChance`
being 0 on the same files.

Per-aircraft variation is confined to four fields — everything else is a
constant across the fleet:

| field | values by aircraft |
|---|---|
| `chaffLoaded` / `flaresLoaded` | 5 MiG-21; 20 F-104 / F-4 / F-8 / Yak; 30 F-15 / F-18 / MiG-29 / Ka-50; 50 F-14 / A-10 / F-22; 60 MiG-31 / Su-24 / Su-27 / Su-37; 99 B-52 / Tu-95 / AC-130 / EA-6 |
| `rdChance` | 0 none, 30 typical, 50 F-22 / Su-37, 80 EA-6B |
| `irdChance` | 0 / 40 / 50 / 80 |

## GAS: external fuel tank

Five statements, eight files, four distinct tanks that are identical on
both discs. Observed, certain.

| # | kind | name |
|---|---|---|
| 0 | byte | structType (always 8) |
| 1 | ptr | si_names |
| 2 | word | weight (empty tank, lb) |
| 3 | byte | flags (`$1`, "external pod", on all eight) |
| 4 | dword | fuel |

| file | `:si_names` | weight | fuel | fuel / gal |
|---|---|---|---|---|
| `F150.GAS` | 150 gallon tank | 108 | 990 | 6.600 |
| `F250.GAS` | 250 gallon tank | 198 | 1650 | 6.600 |
| `F350.GAS` | 350 gallon tank | 248 | 2300 | 6.571 |
| `F500.GAS` | 500 gallon tank | 315 | 3300 | 6.600 |

`fuel` is **pounds**, at 6.6 lb/gal — the standard JP-5 figure — in three
of the four tanks; the 350 works out to 6.571, which is 2,300 rather than
the exact 2,310, i.e. a rounded design value rather than a different unit.
This independently **confirms that `.PT` `internalFuel` is lb**, not
gallons: the same field feeds the same fuel total. Certain.

## Open

Ordered by how much they matter for the remake.

1. **`lookDown`'s exact arithmetic.** The degradation reading is strongly
   supported but the multiplier form (subtract a percent of range? fail
   the detection roll?) is unknown. Settled only by the x86 detection
   path.
2. **`SEE` statement 5, `flags` bit `$1`.** Set on 39 of 93 files, and
   *only* on `sig` 3 radars — 23 of the 35 distinct radar names. The 12
   radars without it are `A10R`, `A6R`, `AC130R`, `AV8R`, `B52R`,
   `MIG21R`, `MIG27R`, `SEAHARR`, `SU37R`, `TU95R`, `TU160R` and
   `YAK141R`. That looks like a capability split (continuous-wave
   illumination for semi-active missiles is the obvious candidate, since
   the same set is roughly the fleet that carries SARH weapons) but the
   correlation is not clean enough to assert. Needs code, or a check
   against which aircraft can actually guide an AIM-7/AA-6 in game.
3. **Three files where `zone1.maxRange` exceeds `zone0.maxRange`.**
   `AC130I.SEE`, `MIG29I.SEE` and `SU27I.SEE` are 9 nmi search / 10 nmi
   track on both discs, inverting the rule that holds in the other 90
   files (`SU37I` and `AAS38` are 15/15). Most likely a data bug in three
   copied IRST files; an importer should clamp rather than trust it.
4. **`SU35R.SEE` has a negative `h`** in ATF Gold: `zone0.h` −10920 and
   `zone1.h` −8190, magnitudes identical to every other nose radar. Its
   long name is "Stinger Rear Facing", which makes a sign-encoded
   rear-hemisphere flag the natural reading — HYPOTHESIS, medium. The
   alternative is a data-entry bug. Settled by whether the engine takes
   the absolute value.
5. **`allAspect` 50 on the four IRST files.** `AC130I`, `MIG29I`,
   `SU27I`, `SU37I` are the only `.SEE` files with a non-zero
   `allAspect`; the field is otherwise 0 in all 93. In `.JT` the same
   field reads as a rear-aspect *restriction* percent (see
   [jt.md](jt.md)), which would make an IRST half-restricted to the tail
   aspect — plausible for a 1990s IRST, but the sample is four files.
6. **Whether `chaffFlareChance` / `deceptionChance` in a `.SEE` do
   anything.** Both are 100 in all 93 files, so they carry no
   information; they exist because `.SEE` shares the `STORE_ITEM` prefix
   with `.JT`, where they vary.
7. **`ECM` `rNoiseMaxDist`, `rNoiseMinDist`, `irdLoseLockTime`** are 0 in
   all 56 files: named by the ATF comments, never populated. Treat as
   unused.

## Related

- [pt.md](pt.md) — the BRF data language, `:hards`, `internalFuel`.
- [jt.md](jt.md) — `PROJ_TYPE`, the same `STORE_ITEM` prefix, the same
  `sig` / `lookDown` / `allAspect` / zone fields on the weapon side.
- [object-types.md](object-types.md) — `.OT` / `.NT`, and where these
  files are referenced from.
- [damage.md](damage.md) — `OBJ_TYPE.hitPoints` / `damage[]`, the other
  half of `OBJ_TYPE` that `sigs[]` sits next to.
