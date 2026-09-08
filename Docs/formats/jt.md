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
| chaffFlareChance, deceptionChance, trackT, trackMaxG, targetSunChance | byte | 50, 50, 12, 5, 10 | percent / counts |
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
| chances[0..3] | byte | 85, 85, 63, 0 | hit chance by skill level, percent |
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
