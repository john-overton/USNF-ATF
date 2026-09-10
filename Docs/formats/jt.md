# JT: projectile / weapon type

Status: **decoded** (layout complete and named; units confirmed for weight
and range, several timing fields still without a unit). Reader:
`tools/retail/retail/jt.py`.

    PYTHONPATH=tools/retail python3 -m retail.jt extracted/usnf97/USNF_2.LIB/AIM9M.JT
    PYTHONPATH=tools/retail python3 -m retail.jt --table extracted/usnf97/USNF_2.LIB

Same text language as `.PT` ([pt.md](pt.md)). 90 files in USNF'97, 120 in
ATF Gold; covers missiles, bombs, guns (`M61.JT`, `20MM_4.JT`), AAA and SAM
rounds, ship weapons. Layout:

```
OBJ_TYPE     63 / 64 statements, structType 7   (as pt.md; `weight` is the round's weight in lb)
PROJ_TYPE    90 statements
:ot_names, :shape, :loopSound, :si_names, :fireSound
```

## PROJ_TYPE

| name | kind | AIM-9M | notes |
|---|---|---|---|
| flags | dword | | |
| projsInPod | word | 1 | rounds per store (guns: 200 for the Aden) |
| structType | byte | 10 | |
| si_names | ptr | | store-item names (same three strings as ot_names) |
| weight | word | 0 | store weight (unused; OBJ_TYPE.weight holds it) |
| flags, sig, flags | byte x3 | | seeker type bits |
| lookDown, dopplerSpeedAbove, dopplerSpeedBelow, dopplerMinRange, allAspect | byte | 30 | seeker qualities |
| zone0.{h, p, minRange, maxRange, minAlt, maxAlt} | word, word, dword x4 | 45 deg, 45 deg, 0, 50000 | wider zone: seeker / track envelope (inferred) |
| zone1.{...} | | 45 deg, 45 deg, 0, 24000 | narrower zone: launch envelope (inferred) |
| chaffFlareChance, deceptionChance, trackT, trackMaxG, targetSunChance | byte | 50, 50, 12, 5, 10 | percent / counts; `trackMaxG` is a class index, see the 2026-09-09 corrections |
| randomFirePercent, offsetFirePercent, offsetFireH, offsetFireP | word | | AI fire dispersion |
| actualRoundsPerGame, gameRoundsInBurst, gameRoundsInCarpetBurst, gameBurstT, reloadT, startupShots | byte | | burst model |
| hSines, hSineDegrees, vSines, vSineDegrees, maxAON | byte | | |
| initialSpeed, finalSpeed | word | 0, 1026 | speed added to the launcher's; guns 2933 / 1466 (ft/s, probable) |
| igniteT, fuelT, removeT | word | 0, 44, 88 | motor delay, burn time, lifetime; unit not yet known (AIM-54: 960 / 1440) |
| poweredTurnRate, unpoweredTurnRate | word | 10920, 8190 | 1/65536 turn per tick (60 / 45 deg) |
| performanceAt0, performanceAt20 | byte | 75, 100 | percent vs altitude (kft) |
| cruise1Dist, cruise1Alt, cruise2Dist, cruise2Alt | byte | 0 | cruise profile (anti-ship) |
| jinkSize, jinkT, totalJinkT | word | | |
| launchRetard, smokeType, smokeFreq, smokeExistTime, smokeStartSize, smokeEndSize | byte | | effects |
| chances[0..3] | byte | 85, 85, 63, 0 | base hit chance, percent; **the index is unresolved — it is NOT skill**, see the 2026-09-09 corrections |
| taaHitChange .. gMiss | byte | | hit-chance modifiers |
| fuzeArmT, fuzeRadius | word | 4, 100 | radius ft (probable) |
| sideHitFuzeFailure, expTypeForLand, expTypeForWater | byte | | |
| fireSound | ptr | | |
| maxSndDist, freqAdj | word | | |
| collateralDamageRadius, collateralDamagePercent | word | 750, 35 | radius ft |

## Evidence

- OBJ_TYPE `weight`: AIM-9M 190, AIM-120 345, AIM-7F 505, AGM-88 795,
  AGM-84A 1165 lb, all the published launch weights within a few pounds.
- `maxRange` in feet: AIM-9M 50,000 ft (8 nmi), AIM-120 150,000 ft (25 nmi),
  AGM-84 Harpoon 360,000 ft (59 nmi), AIM-54 Phoenix 900,000 ft (148 nmi).
  Guns 7,500 to 20,000 ft. Same unit as `.PT` altitudes and mission
  coordinates.
- `zone1.minRange` is 500 for the AIM-9B, 1000..3000 for radar missiles and
  0 for guns, so zone1 is the launch envelope and zone0 (always wider) the
  seeker/track envelope.
- `min/maxAlt` of `$80000000` / `$7fffffff` mean unlimited.

## Open

Unit of `fuelT` / `removeT` (ticks of some fixed rate; AIM-9M 44 / 88, guns
0 / 40) and the exact meaning of `initialSpeed` / `finalSpeed` (1026 for
every missile, which is too slow for ft/s unless it is added to the
launcher's speed and the seeker/turn model does the rest).

## 2026-09-09: practice gun import

`retail.gun` follows the supported aircraft PT's internal-gun hardpoint to its
JT and then the JT `fireSound` reference. Local observations: USNF F14 selects
M61/675 rounds; A4E selects MK12/400 with paired-hardpoint flags 12; ATF F31
selects M61/740. M61 selects `&FASTGUN.11K`, MK12 `&SU33GUN.11K`. Names alone
are not evidence for which airplane uses a sample.

The exported manifest preserves the raw projectile fields, PT/JT/sample hashes,
hardpoint index, flags and position. Runtime individual-round cadence, muzzle
speed, mount positions, tracer spacing and red/green belt color are separate
**authored** settings. In particular, the runtime does not use
`actualRoundsPerGame` to debit multiple rounds for each visible tracer. A
non-tracer is still a simulated round. The initial/final-speed and timing-unit
questions above are not resolved by the new physical-speed implementation.
See [cockpit and gun implementation](../phase-4-cockpit-guns.md) for sources,
controls and the intentionally limited gravity-only ballistics model.

## 2026-09-09: corrections and newly measured fields

Two corrections to what is above, then new material. All counts are over
all 210 `.JT` files on both discs unless stated. The store-item prefix that
`PROJ_TYPE` begins with is shared with `.SEE`, `.ECM` and `.GAS`; see
[sensors.md](sensors.md) for those and for the `sig` / `lookDown` /
`allAspect` / zone fields on the sensor side.

### Correction 1: the speed fields are in OBJ_TYPE, not PROJ_TYPE

The **Open** section above asks what `initialSpeed` / `finalSpeed` mean and
notes that 1026 is too slow for ft/s. The better candidates were in
`OBJ_TYPE` all along. Correction: `OBJ_TYPE._minSpeed`, `_cornerSpeed`,
`_maxSpeed`, `_acc` and `_dacc` — the underscored movement block that
[pt.md](pt.md) records as "0 for planes, computed from the envelope" — are
**non-zero and varied on projectiles**.

| field | domain | zeros | distinct |
|---|---|---|---|
| `_minSpeed` | 0, 1026, 1466, 3520, 3666, 3960, 4400, 5866 | 139 | 8 |
| `_cornerSpeed` | 1026..5866 | **0** | 19 |
| `_maxSpeed` | 1026..5866 | **0** | 19 |
| `_acc` | 0..4400 | 98 | 14 |
| `_dacc` | 0, 7, 14, 73, 146 | 47 | 5 |

`_cornerSpeed == _maxSpeed` in **210 of 210** files, so they are one
number written twice. Observed values, ft/s:

| round | `_maxSpeed` | `_acc` | `_dacc` | `initialSpeed` | `finalSpeed` |
|---|---|---|---|---|---|
| `AIM9M` | 4400 | 1466 | 146 | 0 | 1026 |
| `AIM120` | 3813 | 1466 | 146 | 0 | 1026 |
| `AIM54C` | 5866 ATF / 4693 USNF'97 | 1173 | 146 | 0 | 1026 |
| `AGM88` | 4400 | 4400 | 146 | 0 | 1026 |
| `SA6` | 3080 | 733 | 73 | 0 | 1026 |
| `M61`, `GAU8` | 2933 | 0 | 7 | 2933 | 1466 |
| `MK82` | 1466 | 0 | 0 | 0 | 0 |
| `GBU28` | 2933 | 0 | 14 | 0 | 278 |

`_maxSpeed` is a **much better muzzle / terminal-speed candidate than
`initialSpeed` / `finalSpeed`**: the ATF AIM-54C tops the list at 5866 ft/s
(≈ Mach 5.2, the fastest weapon in the game and the right one), gun rounds
sit at 2933–3666, and iron bombs at 1466. `_acc` and `_dacc` then read as
motor acceleration and coast deceleration, which is consistent with `_acc`
being zero on exactly the unpowered stores. Confidence medium-high.
`initialSpeed` is non-zero only on the 71 gun-type rounds; `finalSpeed`
1026 on 110 files is the value the older note mistook for `initialSpeed`.

This does **not** resolve the units question outright: the two readings are
still `_maxSpeed` as an absolute ft/s speed versus a speed added to the
launcher's. The settling test is running the native projectile update
against a known launch state, which has not been done. The `fuelT` /
`removeT` unit is likewise still open; the value set is now fully
enumerated (`fuelT` 0..960, `removeT` 20..1440, both always multiples
of 4).

### Correction 2: trackMaxG is a class index, not a G number

`trackMaxG` has only **five distinct values across all 210 files**:

| value | files | what carries it |
|---|---|---|
| 5 | 105 | guided missiles |
| 6 | 44 | guns and rockets |
| 0 | 33 | AAA and vehicle guns |
| 3 | 26 | cluster and ballistic bombs |
| 4 | 2 | — |

A real maximum tracking G would be a continuous quantity spread over the
byte range; 5 values over 210 weapons, clustering exactly by weapon
category, is a **class index**. Observed, high confidence. The classes
themselves are named by the correlation above, which is a hypothesis
(medium): what the engine does with the index is not decoded. Do not read
`trackMaxG` as Gs, and do not feed it to a turn-rate model — the actual
turn rates are `poweredTurnRate` / `unpoweredTurnRate` (0 for bullets and
bombs; 3640 = 20° for old SAMs, 5460 = 30° for the AIM-7, 10920 = 60° for
AIM-9M / AIM-120, 18200 = 100° for AIM-9X, 21840 = 120° for AA-11/AA-12,
32760 = 180° for AA-11B, in 1/65536 turn per tick).

### The envelope: zone1 launches, zone0 acquires

`zone1.minRange`..`zone1.maxRange` is the **launch** envelope and
`zone0.maxRange` the **acquisition / seeker** envelope. Observed:
`zone0.maxRange >= zone1.maxRange` in **210 of 210** files, and
`zone0.minRange` is 0 in every file while `zone1.minRange` is non-zero on
120 (50, 500, 1000, 1500, 2000, 3000, 4000, 7500, 12000, …).

The clean confirmation comes from the SAM sites, which have no `.SEE` of
their own and so must be firing on the round's own envelope
([sensors.md](sensors.md)): `SA6.NT` fires `SA6.JT` with a `zone1` launch
window of 9,000–75,000 ft inside a `zone0` of 80,000 ft; `SA3.JT` is
7,500–54,000 inside 100,000; `PHALANX.JT` 50–20,000 inside 50,000. Feet
throughout. Measured launch/acquisition pairs:

| round | `zone1` min..max | `zone0` max | `zone1.h` |
|---|---|---|---|
| `AIM9M` | 0..24,000 | 50,000 | ±45° |
| `AIM9X` | 3,000..24,000 | 50,000 | ±75° |
| `AIM7` | 3,000..120,000 | 120,000 | ±30° |
| `AIM120` | 0..150,000 | 150,000 | ±45° |
| `AIM54C` | 1,000..900,000 | 900,000 | ±30° |
| `AA9` | 3,000..250,000 | 250,000 | ±30° |
| `AA11B` | 1,500..60,000 | 60,000 | ±180° |
| `AAML` | 30,000..450,000 | 450,000 | ±30° |
| `MK82` | 0..20,000 | 20,000 | ±180° |
| `SA6` | 9,000..75,000 | 80,000 | ±30° |
| `SA7` | 0..9,000 | 15,000 | ±30° |

Correction to an earlier draft of these figures: the minimum-range column
is smaller than reported — the AIM-9M and AIM-120 have `zone1.minRange` 0,
not 4,000 and 12,000, and the AIM-54C's is 1,000 rather than 30,000. The
`maxRange` pair often coincides (`AIM120`, `AIM54C`, `AIM7`, `MK82`), so
the two zones differ mainly in cone width, not always in range.
Confidence high; measured directly.

`zone1.h` / `zone1.p` are then **off-boresight launch limits**, half-angles
in 1/65536 turn as everywhere else: `AIM9M` ±45°, `AIM9X` ±75°,
`AA11B` ±180° (over-the-shoulder), `AIM7` ±30°, `MK82` ±180°. Observed,
high confidence.

### sig: the seeker enum

`PROJ_TYPE.sig` is the same 0..4 enum as `.SEE` — the signature the seeker
reads, indexing the target's `OBJ_TYPE.sigs[]`. Distinct names, both discs:

| sig | seeker | distinct names | which |
|---|---|---|---|
| 0 | unguided | 57 | all guns, rockets, iron bombs, cluster bombs, AT-2 |
| 1 | laser | 8 | AS-14, AS-30L, GBU-10/27/28, AT-12, Paveway |
| 2 | IR | 24 | AIM-9 family, AA-8/11, R-550, SA-7/9/13/14/16, FIM-92, AGM-65G |
| 3 | radar | 48 | AIM-7/120/54, AA-2/6/9/10/12, AGM-84A, all SA-N-*, AAA and Phalanx directors |
| 4 | anti-radiation | 2 | `AGM88.JT` (HARM) and `AGM45.JT` (Shrike) |

Correction to a common mis-statement: sig 4 is **not** HARM-only; the
Shrike has it too (in ATF Gold). No `.SEE` uses sig 4, so anti-radiation
homing has no sensor counterpart and must be special-cased in engine code.
Hypothesis, high.

### PROJ_TYPE.flags: the guidance word

A dword with **35 distinct values**. Bits 24..31 are never set, and bit 12
(`$1000`) is never set. Per-bit correlations, HYPOTHESIS at medium-high
confidence per bit — the label is the intersection of what carries the bit,
not something read from code. Counts are (hardpoint instances / distinct
names):

| bit | files | reading | evidence |
|---|---|---|---|
| `$10` | 19 / 16 | free-fall ballistic bomb | exactly MK-82 variants, MK-84, FAB-250/500/1000, CBU-87/89, MK-20, RBK |
| `$80` | 71 / 44 | gun or cannon round | every 20/23/25/30 mm and vehicle gun |
| `$200` | 41 / 27 | semi-active or command guidance needing the launcher's illumination | AIM-7/7E, AA-6/9/10, HQ-2J, HQ-61, MIM-23, R-440, R-530, ASROC, PL-10, AS-7, AS-15 |
| `$400` | 9 / 8 | laser-guided | exactly AS-14, AS-30, AT-12, GBU-10/10A/28, Paveway, Paveway 3 — the sig 1 set |
| `$800` | 44 / 27 | gun or rocket burst | 20MM_4, Aden, B8/B13 rocket pods, BK27, C_25/40/105, DEFA, GAU-12 … |
| `$4000` | 46 / 30 | tracer-drawing gun | a subset of `$80` |
| `$8000` | 26 / 21 | air-to-ground only | AGM-65A/G, AGM-84A/E, AM39, AS-14, AS-30, AT-12, CBU-87/89 … |
| `$20000` | 110 / 74 | air-to-ground capable | superset of `$8000` |
| `$40000` | 6 / 3 | armour-piercing gun | exactly `GAU8`, `C_105`, `C_40` — see [damage.md](damage.md) |
| `$800000` | 5 / 5 | cluster / submunition | exactly CBU-87, CBU-89, MK-20, RBK-250, RBK-500 |

Correction to an earlier draft claim that bits 19–22 are never set: they
are, but only just — `$80000` and `$200000` on `KS12.JT` and `KS19.JT`,
`$100000` and `$400000` on `A_M1939.JT`, i.e. three heavy AAA guns. With
one or two files each, no reading is worth proposing.

### allAspect is a rear-aspect RESTRICTION

HYPOTHESIS, high confidence: despite the name, `allAspect` is a **percent
of rear-aspect restriction**, not a capability flag. Higher = more
tail-restricted. Observed values (distinct names):

| value | weapons |
|---|---|
| 100 | `AIM9B`, `AA2`, `AA2D`, `SA7`, `SA9`, `FIM92`, `SAN5` |
| 50 | `SAN8` |
| 40 | `PL7` |
| 30 | `AIM9M`, `AA8`, `AA11`, `AA11B`, `R550`, `SA13`, `SA14`, `SA16`, `SAN7`, `SAN11` |
| 20 | `AIM9X` |
| 0 | 176 files: every unguided weapon and nearly every radar missile |

The ordering is exactly backwards for a capability reading — the AIM-9B,
the one Sidewinder that genuinely *cannot* shoot all-aspect, carries the
highest number, and the AIM-9X carries the lowest. As a restriction
percent it reads correctly in every one of the 34 non-zero cases. The
minor exception to "0 on every radar missile" is four instances of the
naval `SAN7`/`SAN11` at 30. What would settle it: the x86 launch-validity
check.

### chances[0..3]: the index is UNRESOLVED

`chances[0..3]` (`PROJ_TYPE` statements 67–70, ATF comment
`chances [i]`) is a base hit probability in percent. **The index is not
known, and it is specifically not pilot skill.** Recorded here so nobody
re-derives the wrong reading:

- `chances[3]` is 0 in **197 of 210** files. A per-skill reading makes the
  best pilot's hit chance zero for 94% of the arsenal.
- `AIM120.JT` is `0, 100, 85, 0` — `chances[0]` is 0. So a per-skill
  reading also makes the *worst* pilot's chance zero, on the game's
  premier radar missile. Ten files have `chances[0]` = 0, all of them
  radar missiles: `AA6`, `AA9`, `AA10`, `AA12`, `AAML`, `AIM7`, `AIM54C`,
  `AIM120`.
- Representative rows: `AIM9M` 85/85/63/0, `M61` 100/75/50/0,
  `MK82` 100/50/0/0, `SA3` 10/10/7/0, `AIM7` 0/70/35/0.

The pattern that fits both the zeros and the ordering better is an
**aspect band, target class, or guidance phase** — a radar missile with
`chances[0]` = 0 and a bomb with `chances[2..3]` = 0 look like different
weapons being invalid in different bands. All three remain hypotheses at
low confidence. What would settle it: the x86 hit-resolution routine.

Note the genuine per-skill mechanism is elsewhere and is confirmed from
code — the AI VM's `chance NNNNNNNN` opcode packs four two-digit
percentages indexed by skill 0..3, and the engine applies a per-skill
missile-reaction table and a per-skill G-envelope penalty. None of that
reads `.JT`. Do not conflate the two.

Nine hit-chance modifiers follow `chances[]`: `taaHitChange`,
`climbHitChange`, `gHitChange`, `airHitChange`, `speedHitChange`,
`speedHitMin`, `predictableHitChange`, `bigPlaneChange`, `gMiss`
(`gMiss` = 9 in 145 files). Named only.

### Countermeasure susceptibility

`chaffFlareChance` and `deceptionChance` are both 100 — fully susceptible —
in 175 of 210 files, 50 in 16, and >127 unsigned (120, 125, 150, 200) on a
handful. **The reader sign-folds bytes**, so read these unsigned;
`chaffFlareChance` 200 comes back as −56. `targetSunChance` is 0 (176),
10 (12), 15 (1), 25 (6), 35 (2) or 50 (13). `lookDown` and `allAspect`
carry the readings documented in [sensors.md](sensors.md); on the weapon
side `lookDown` is 0 on 190 files and non-zero on the older or
semi-active seekers (`AIM7` 100, `AIM7E` 150, `AA6` 100, `AA2` 75,
`AIM9B` 20 in ATF / 75 in USNF'97, `AIM120` 10, `AIM54C` 20).

### Fields that carry no information

Constant across all 210 files, so ignorable for an importer:
`OBJ_TYPE.instanceSize` 52, `obj_class` `$80`, `sigs[]` 100/100/100/100/0,
`hitPoints` 0, `maxClimb`/`maxDive`/`maxBank` ±16380, `utilProc`
`_PROJProc`, `doDoppler` 1, `maxSndDist` 7000; `PROJ_TYPE.structType` 10,
`weight` 0 (the real weight is `OBJ_TYPE.weight`), the second `flags` byte
0, `dopplerSpeed*` 0, `zone0.minRange` 0, `hSines` / `hSineDegrees` /
`vSines` / `vSineDegrees` 0, `performanceAt20` 100, `sideHitFuzeFailure` 0.
Sixty of the 159 dumped columns fall in this group.
