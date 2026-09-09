# Native power and fuel routines

2026-09-09, macOS Apple M3/arm64, Bun1.4.2, Unicorn2.1.4. This is a
bounded implementation of arithmetic recovered from the locally supplied
USNF97 executable, independently compared with execution of its x86 routines.
At initial extraction, the helpers in `engine/src/sim/flight/native-power.ts` were isolated from
both the preserved assisted model and the experimental flight backend.

The executable is `extracted/usnf97/SETUP.ESA/USNF.EXE`, SHA256
`ecd3eb067f624fe48ea6547e8d4b80d1232723a9b7e0113f77d0e94fcb14caf9`.
The local `USNF.SMS` address/name map identifies the named routines below.
Executable bytes, disassembly and oracle results remain ignored under
`extracted/native-flight/`; the committed fixtures are synthetic.

## Verified arithmetic

| Address | Routine | Implemented scope |
|---|---|---|
| `0x430620` | `@FMFuelConsumption@4` | Signed integer fuel quantity with eight fractional bits |
| `0x497260` | `_MatchF24@12` | Signed fixed-point slew, including wrap/shift and target clipping |
| `0x453630` | `@COThrust@4` | Military/AB selection, missing-AB fallback and conditional halving |
| `0x46a360` | Unnamed in the SMS map | Scalar thrust calculation at **zero thrust-vector angle** |

Fuel consumption takes a signed32 throttle command. Above100 it returns the
signed16 afterburner consumption field shifted left8. Otherwise it multiplies
the signed16 military field by the command, wraps32, shifts left8 with another
wrap, then divides by100 with truncation toward zero. It does not clamp invalid
negative throttle commands. The TypeScript helper preserves these operations.

`_MatchF24` computes a step by signed32 multiplication of its rate and the
signed16 `_serviceTicks` global (`0x521658`), followed by arithmetic right
shift8. It adds/subtracts that step with32-bit wrapping, then clips against the
target using signed comparisons. It returns unchanged when already at target
or the rate is zero. Throttle and thrust-vector slewing both use this helper.

`@COThrust` selects the raw PT afterburner thrust when requested and nonzero,
otherwise military thrust. A separate branch halves the selected integer
arithmetically when `_numComputers` (`0x4c34bc`) exceeds1,
`_gameMultiPrefs` (`0x4c35ac`) has bit`0x10`, and the current object's flag byte
at`0x4d50f4` has bit`0x80`. The flag's gameplay label is not established;
this is a **multiplayer gate**, not evidence of a difficulty setting.

The unnamed scalar calculation uses the following native inputs:

| Address | Meaning evidenced by the caller |
|---|---|
| `0x4d52d2` | Slewed throttle percentage with8 fractional bits |
| `0x52ddf0` | Thrust scale, normally initialized to256 by `_FMAircraftSetup` |
| `0x4d5118` | Current speed with8 fractional bits |
| `0x52de0a` | Signed16 adjusted forward-speed bound from `_COBv` |
| `0x4d52da` | Thrust-vector angle before native angle/trig conversion |

First calculate `commanded = trunc((throttleF8 >> 8) * scaleF8 / 100)`.
Subtract `trunc(((speedF8 & 0xffffff01) >> 1) / forwardSpeedBound)`, then
clamp the signed result to zero. The mask intentionally preserves bit0 while
clearing bits1–7. Integer multiplication wraps as in the executable.
At zero vector angle, the cosine path multiplies by32767, wraps, divides by32767,
then multiplies by the selected raw thrust with32-bit wrapping. The helper
retains that intermediate stage even though ordinary inputs cancel it out.
The second force component is zero at this angle.

There is **no exponential altitude lapse** in these isolated selection/scalar
routines. This does not prove altitude has no effect in the complete native
flight model: their scale and adjusted speed-bound inputs are prepared elsewhere.
In particular, do not replace the adjusted forward bound with the fitted
1G maximum without tracing that assignment.

`_FMUpdateThrustVector@0` (`0x42ff00`) is only a vector-angle slew wrapper,
not the engine-force calculation. The actual force caller at`0x46a300` also
gates thrust on positive fuel and positive slewed throttle. Those outer state
rules are not silently included in the scalar helper.

AB uses a separate state bit`0x20`. The throttle command handler at`0x430340`
passes the throttle through a clamp to0..100, then enables AB for a request
above100 when available and allowed. Fuel code passes101 for that AB branch;
the force calculation still receives100% throttle plus separately selected AB
thrust. A command of200 is not a200% thrust multiplier.

## Verification

The oracle runs the actual local PE code in Unicorn with seeded globals,
normal function returns, and **no import or arithmetic replacement stubs**.
At zero vector angle it also executes the executable's real conversion and
integer trigonometric routines. The generated outputs are compared against
the independent TypeScript helpers:

```sh
PYTHONPATH=tools/native extracted/native-flight/.venv/bin/python tools/native/power-oracle.py --exe extracted/usnf97/SETUP.ESA/USNF.EXE --out extracted/native-flight/power-oracle.json
bun tools/native/check-power.ts extracted/native-flight/power-oracle.json
bun test engine/src/sim/flight/native-power.test.ts
```

The isolated research environment needs Unicorn2.1.4; its installation belongs
under ignored `extracted/native-flight/.venv`, not the system Python.
**3200 differential comparisons pass:**800 each for fuel, slew, thrust selection,
and scalar thrust. Fuel and slew include negative/overflow inputs; scalar cases
cover ordinary nonnegative operational inputs and nonzero speed bounds.
The committed unit suite passes **4 tests /25 expectations**. Typecheck and
focused ESLint also pass. Evidence records the executable hash rather than
claiming another edition has equivalent code.

## Remaining integration work

- `_COBv` (`0x453370`) copies the PT body-limit structure but replaces its first
  maximum with the runtime short at`0x4d5329` (`_cp +0x245`). Trace assignments
  in `_FMUpdatePlaneFields` (`0x430910`) before converting its meaning to SI.
- `_BurnFuel` (`0x430650`) subtracts five times the fuel helper result per five
  `_currentTime` counts (`0x4fddf0`), consuming external tanks before internal
  fuel and handling depletion events. The units of those time counts and the
  scheduling/wrap semantics are not yet ported. Do not label the helper output
  lb/s merely from the PT field name.
- `_FMGetWeight` (`0x42ff30`) includes fuel, hardpoints, special item cases,
  overload clamping and load percentages. This entire stateful routine is not
  represented by the current fixed-mass aircraft definition.
- Recover nonzero vector-angle conversion/trigonometry, the force accumulator
  scale and `_FMGetAcc` (`0x46a210`) integration before exposing this scalar
  as a world-space force in SI units.
- These isolated comparisons establish arithmetic agreement, not a complete
  native flight tick, game launch, aircraft handling parity or audio parity.

## Follow-up: clock resolved and fuel integrated

Later on 2026-09-09, [native clock tracing](native-flight-code.md#follow-up-native-time-and-fuel-rate-units-recovered)
established 256 ticks/second and integer-second `_currentTime`. The rate output
is therefore fixed-point lb/s, not an unresolved per-tick quantity. `FuelSystem`
now calls the recovered fuel calculation and converts with 0.45359237 kg/lb.
The runtime integrates continuously at 120 Hz, deliberately adapting the native
five-second deduction schedule. Thrust selection/scalar and slew helpers remain
isolated; their existence does not mean the complete native power path is active.
