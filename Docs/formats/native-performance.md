# Native envelope controls and longitudinal performance

2026-09-09. Local USNF97 executable SHA256
`ecd3eb067f624fe48ea6547e8d4b80d1232723a9b7e0113f77d0e94fcb14caf9`.
Machine: Apple M3, macOS 26.6.2, Bun 1.4.2, Unicorn 2.1.4.
Retail bytes, disassembly, profiles and oracle output stay under ignored
`extracted/`. This document describes structures and arithmetic only.

## Why the previous approximation failed

Both experimental modes used a common parabolic drag fit to the 1G upper speed
and one higher-G row, exponential thrust lapse and a fixed pitch-rate stick.
This omitted the native G command limits, speed penalty on thrust, transonic
drag shape and loading corrections. The default assisted model is separate.

The game manual (`Docs/reference/JANES_US_NAVY_FIGHTERS_djvu.txt`, lines
2825–2888) describes available instantaneous G dropping through the envelopes
as drag reduces speed. Its Cheat Menu (lines 2458–2465) identifies Extra G.
The old claim that all higher-G polygons were exclusively sustained boundaries
was an assumption, not a recovered force law.

## Executed control path

| Address | Observed role |
|---|---|
| `430937..430c56` | Classify all G rows; interpolate fractional positive/negative G; apply load, player/NPC and Extra G adjustments |
| `4533a0` (`COBrv`) | Replace PT control range with the computed G range; later player damage scaling remains separate |
| `46a1d8` | Copy control range into runtime flight controls |
| `478950` | Reduce excursions about 1G below twice the altitude-adjusted 1G minimum speed |
| `478a20` (`StickInput`) | Map stick input into bounded G target and slew toward it |
| `478b70` (`GToTurn`) | Convert G to a bounded turn rate |

The range caller accepts rows only when `CheckFlightEnvelope` returns zero.
It interpolates toward the next unavailable row using either its lower or upper
speed boundary. The result is signed 8.8 G. Loading multiplies both bounds by
`(100 - trunc((loadA + loadB) * loadedElevator / 100)) / 100`, truncating again.
Player preference bit `0x20` extends the range by ±1G, then clips it to the PT
minimum/maximum row. Final bounds have a zero negative ceiling and +2G positive
floor; the subsequent low-speed helper reduces excursions about 1G.

For the local F14, **unloaded coefficient state**, 3,281 ft/450 KTAS yields
7.4414G normally, 8.4414G with the extra-G flag. The highest PT row is 9G.
At 36,000 ft/770 KTAS the normal bound is 3.9609G. These are native helper
outputs, not measured whole-game trajectories or full-fuel limits.

`GToTurn` computes `clamp(trunc(2500 * signed16(GFixed) /
signed16(max(125, speedFps))), -10240, 10240)` in degrees ×256/second.
It is preserved as an independently checked helper, **not** directly inserted
into our Newtonian rotation solver: its gain differs from physical `g / speed`.

## Executed longitudinal path

`430c56..430caa` selects the 1G row and stores its altitude-adjusted upper
speed in `_cp+0x245` (`4d5329`). `COBv` copies that into its forward maximum;
`46a1ca..46a1d8` transfers it to `52de0a`. Six native caller-slice probes confirm
this path. The bound is not clipped to the structural speed threshold.

The existing `46a360` thrust helper subtracts a speed-dependent term from
throttle. Ignoring integer rounding, thrust is approximately
`selectedThrust * max(0, throttle - speed / (2 * upperSpeed))`.

`498010` supplies sound speed in ft/s:
`1115 + trunc(-148 * min(altitudeFt, 36000) / 36000)`.
`46a580` starts with `base = trunc(100 * abs(speedFps) / upperSpeed)` and
transitions from 366 ft/s to `min(soundSpeed, upperSpeed)` with a correction
clamped to −30..45. Positive correction blends the percentage toward 100;
negative correction scales it downward. Integer details live in `native-drag.ts`.

`46a410` computes clean drag using **afterburner thrust even at dry throttle**:
`AB_lbf * max(16, trunc(dragPercent * adjustedCoefDrag / 200))`, in lbf ×256.
Idle airborne drag has an additional pitch-dependent floor. G and device drag
are separate weight-relative terms. Native acceleration divides the force
accumulator by `weightLb >> 5`, corresponding to native gravity 32 ft/s².
Our SI adapter converts lbf ×256 into newtons and retains its existing SI solver.

Local F14, 36,000 ft, unloaded coefficient state, 1G, 45% throttle:
native thrust/drag are 8,553/7,021 lbf at 400 KTAS, 8,108/9,307 at 450 KTAS,
and 4,665/15,838 at 770 KTAS. The latter strongly decelerates without wind.

## Loading and coefficient meanings

The weight routine begins component A with internal fuel pounds. Hardpoint
contents are accumulated into A or B according to a hardpoint flag. Otherwise
`loadA/B = trunc(100 * componentLb / (maximumWeight - emptyWeight))`.
Above maximum weight it clamps the weight and sets each load percentage to 50.

| PT field | Confirmed use |
|---|---|
| `coefDrag` | 8.8 drag-force normalization, 256 = 1.0; not aerodynamic CD |
| `_gpullDrag` | 8.8 weight-relative drag per G above `abs(G)=1` |
| gear/flap/airbrake/bay drag | 8.8 weight-relative force factors multiplied by drag percentage |
| `rudderDrag` | Same force factor, weighted by absolute rudder command |
| `wheelBrakesDrag` | Weight-relative factor without drag-percentage multiplier |
| `loadedDrag`, `loadedGpullDrag` | Plain percentage correction coefficients |
| `loadedElevator` | Plain percentage reduction of the control G range |

Drag coefficients become `trunc(base * (100 +
trunc((loadA + loadB) * loadedCoefficient / 100)) / 100)`.
Native weight/setup routines were exercised in 800 synthetic cases, including
complete fuel-only weight calls and two-component accumulation slices.

## Remake integration and limits

Both PT modes use the recovered G targets when native rows are available and
recovered longitudinal forces when `coefDrag`/`_gpullDrag` are also supplied.
They still differ in their lift-envelope boundary query. Older/polygon-only
profiles keep the fitted force path; locally imported A-4E/X-31 profiles have
no USNF native metadata and retain that behavior.

The attitude controller approaches alpha for the bounded G request, with
airflow-turn feedforward. It does not clip the HUD number or clamp lift forces.
Transient G overshoot remains possible. Lift, atmosphere density, stall,
attitude slew, lateral damping, ground contact and device interpolation remain
original integration. Fractional devices and AB spool interpolate native
endpoints. Fuel-only loading follows native whole-pound percentage arithmetic;
the aggregate payload lacks native hardpoint partition and may differ by a
percentage point. Native damage, NPC controls, Extra G UI and whole `FMFlight`
execution are not implemented. `structureWarnLimit`, `structureLimit` and
`negGLimit` still lack complete caller semantics; they are not invented G caps.

## Reproduction

```sh
PYTHONPATH=tools/native extracted/native-flight/.venv/bin/python tools/native/g-limits-oracle.py --exe extracted/usnf97/SETUP.ESA/USNF.EXE --out extracted/native-flight/g-limits-synthetic.json
bun tools/native/check-g-limits.ts extracted/native-flight/g-limits-synthetic.json
PYTHONPATH=tools/native extracted/native-flight/.venv/bin/python tools/native/drag-oracle.py --exe extracted/usnf97/SETUP.ESA/USNF.EXE --out extracted/native-flight/drag-oracle.json
bun tools/native/check-drag.ts extracted/native-flight/drag-oracle.json
bun tools/harness/envelope-audit.ts extracted/flight/f14-flight.json extracted/flight-envelope-audit/f14.json
```

The oracles execute actual local x86 instructions, with no arithmetic or import
stubs. Checks cover 600 G ranges, 108 low-speed reductions, 72 turn rates,
3,200 sound/drag cases and 800 loading cases. These establish isolated arithmetic
and caller-path parity, not complete native gameplay parity. Current flight
measurements and Mac acceptance are in the [phase 4 baseline](../baselines/phase-4.md).
