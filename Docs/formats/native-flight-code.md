# Native USNF97 flight routines

2026-09-09, Apple Silicon development Mac. **The original flight routines can be
located and selectively recovered.** This investigation found the game's own
external symbol map, traced its loader, and translated two envelope routines
with exact comparisons against the original x86 instructions in an isolated
emulator. This is a stronger milestone than fitting forces to PT polygons. It
is still not a complete native flight-model port.

## Source inventory and the missing symbol map

| Local input | Bytes | SHA-256 |
|---|---:|---|
| `extracted/usnf97/SETUP.ESA/USNF.EXE` | 1,063,936 | `ecd3eb067f624fe48ea6547e8d4b80d1232723a9b7e0113f77d0e94fcb14caf9` |
| `extracted/usnf97/SETUP.ESA/USNF.SMS` | 93,507 | `a2a7bd5ed91766458c0d768e3699f65645cab843c4fa63653602acc633a61b88` |

The executable is PE32 i386, preferred image base `0x400000`, entry RVA `0xacb10`.
Its sections are `.text`, `.rdata`, `.data`, `.idata`, `.rsrc`, `.reloc`.
The ordinary COFF symbol table is stripped, but **USNF.SMS contains 3,440 named
symbols with virtual addresses**. Earlier notes that stopped at the stripped
COFF table understated the available evidence. The two ordinary PE exports are
`T_HorizonProc` and `WRFogLayerUpdate`; neither is the flight entry point.

Imports include WINMM, KERNEL32, USER32, DDRAW, WAIL32, CDRVDL32, CDRVHF32 and
ADVAPI32. This inventory alone does not mean every flight helper calls Windows;
the envelope helpers below run without any import stubs.

SMS format, established by the native loader and the complete local map:

- Little-endian uint32 symbol count.
- `count` eight-byte records: uint32 string offset, uint32 virtual address.
- NUL-terminated ASCII string pool starts at `4 + count * 8`.
- Names are sorted. `_SMInit@0` (`0x448e60`) adds the string-pool base to each
  stored name offset; `_SMAddress@4` (`0x448fd0`) binary-searches the records and
  returns the stored address, or zero for a missing name.
- The BRF `symbol` command's handler at `0x498cfe` recognizes the command; the
  call at `0x498d3e` resolves its token through `_SMAddress@4` and stores the
  returned pointer into the assembled type object.

This gives a concrete chain from `symbol _PLANEProc` in F14.PT to the native
function at **`0x485780`**. Searching USNF.EXE for the literal name alone failed
because that name lives in USNF.SMS.

## Dispatcher and adjacent flight routines

`_PLANEProc` is a callback selector, not the whole dynamics integrator. Its
argument selects add/move/event/say/comment callbacks through a small jump
table; selectors 1, 4, 5 and values beyond 7 delegate to `_GVProc` (`0x47a4a0`).

| Selector | Callback |
|---:|---|
| 0 | `PLANEAddProc`, `0x4856c0` |
| 2 | `PLANEMoveProc`, `0x4854d0` |
| 3 | `_PLANEEventProc`, `0x483c00` |
| 6 | `_PLANESayProc`, `0x48ea10` |
| 7 | `_PLANECommentProc`, `0x48fbe0` |

PLANEMoveProc calls gear update, gear-pitch update, thrust-vector update and wing
sweep helpers. Named candidates now available for further bounded work include
`_FMGetWeight@0` (`0x42ff30`), `_FMUpdateThrustVector@0` (`0x42ff00`),
`@FMFuelConsumption@4` (`0x430620`), `_FMInitPlane@8` (`0x430120`),
`_MovePlane@0` (`0x478bb0`) and `@COThrust@4` (`0x453630`). Locating them is not
proof their state and timestep contracts are recovered.

## Recovered envelope behavior

The isolated translation lives in
`engine/src/sim/flight/native-envelope.ts`; existing assisted dynamics and the
original fitted polar remain separate. Inputs retain native integer feet,
feet/second and signed 24.8 current altitude/speed, rather than converting to
SI before emulating rounding.

| Native routine | VA | Recovered responsibility |
|---|---|---|
| `@GetFlightEnvelope@4` | `0x483080` | Select G row in contiguous 128-byte envelope records |
| `_CheckFlightEnvelope@8` | `0x4830b0` | Stall, G-envelope and structural-speed classification |
| `_EnvelopeSpeedLimits@16` | `0x483150` | Lower/upper envelope speed and structural threshold |
| unnamed interpolation helper | `0x4832c0` | Signed integer interpolation |
| `@EnvHighest@4` | `0x483350` | Last-authored point at greatest altitude |

Combined investigated byte range `[0x483080, 0x483382)` SHA-256:
`f7eefa81a3ec0e93aac1969aaecd6f4ab7ffe89a45458819f6d130c88aa92e18`.
The generated inventory records separate hashes for the loader, resolver,
BRF handler and callback selector. No instruction bytes/disassembly are committed.

Confirmed details that differ from a generic floating-point polygon query:

- Current altitude/speed use an arithmetic shift right by eight, truncating to
  integer native units before comparisons.
- The lower bound searches the ascending authored chain. The upper bound starts
  at the highest point and searches the descending chain. Equal highest points
  select the **last** authored point because the scan runs backwards with strict
  comparisons. Above that point's altitude, both speeds become its speed.
- With the flap bit set and `abs(G) <= 1`, the lower boundary becomes
  `minimum - (minimum >> 2)`. This adjustment is bypassed above the envelope's
  ceiling. It is an actual recovered USNF rule, not the original fitted flap
  coefficient. It does not independently recover the complete flap force law.
- **PT `structure[0]` / `structure[1]` are speed thresholds**: the code linearly
  interpolates the first to the second between zero and 36,000 feet, and uses
  the second at/above 36,000 feet. They were previously named but semantically
  unknown. For the local F14.PT the values are 1347 and 2268 ft/s.
- Result codes: 1 below minimum (also missing G row), 3 at/above structural
  threshold, 2 at/above the G-envelope upper boundary, otherwise 0. Priority is
  in that order. The additional flag compares altitude with the authored point
  selected by the envelope's `maxSpeed` index; that field is an **index**, not
  a speed value.
- Integer interpolation reproduces signed 64-bit multiplication, truncating
  signed division and 32-bit wrap on subtraction/addition. Division by zero or
  quotient overflow becomes an explicit error in the translation.

Globals observed: `_cp` (current plane) at `0x4d50e4`, `_cpt` (current plane type)
at `0x4d54cc`; altitude at `_cp+0x15`, speed at `_cp+0x34`, flap flag word at
`_cp+0x16f`, envelope pointer at `_cpt+0xba`, G minimum/maximum at `+0xbe/+0xc0`,
and structural speed words at `+0xc2/+0xc4`. These offsets are specific to this
USNF97 executable, not portable addresses for ATF Gold.

## Native execution oracle and verification

The optional research dependency is Unicorn **2.1.4**, installed in an ignored
isolated environment; no project runtime dependency was added. The oracle maps
the supplied PE image at its native base, allocates scratch/stack, seeds explicit
synthetic globals, and invokes only the selected instructions. Each call has
an instruction bound and must return to a sentinel. It does not launch Windows,
Wine, Linux or the whole game. No imported OS functions are stubbed.

```sh
python3 tools/native/inventory.py --exe extracted/usnf97/SETUP.ESA/USNF.EXE --sms extracted/usnf97/SETUP.ESA/USNF.SMS --out extracted/native-flight
python3 -m venv extracted/native-flight/.venv
extracted/native-flight/.venv/bin/python -m pip install unicorn==2.1.4
PYTHONPATH=tools/native extracted/native-flight/.venv/bin/python tools/native/envelope-oracle.py --exe extracted/usnf97/SETUP.ESA/USNF.EXE --out extracted/native-flight/envelope-oracle.json
bun tools/native/compare-envelope.ts extracted/native-flight/envelope-oracle.json
bun test engine/src/sim/flight/native-envelope.test.ts
```

**240 deterministic synthetic cases match both translated functions exactly**
against the real x86 instructions. Inputs cover negative/zero/positive G,
flaps, fractional fixed-point values, authored altitude boundaries, a two-point
ceiling plateau and above-ceiling behavior. Four committed synthetic tests /
24 assertions additionally exercise division faults, malformed input, thresholds
and the unavailable-envelope branch. Retail byte fixtures are not committed.

The first oracle comparison caught a real translation mistake: stack-output
argument order was misread and codes 2/3 were reversed. The translation was
corrected and all 240 comparisons repeated successfully. Inspection also caught
that objdump labels stripped addresses relative to the nearest exported name;
those labels do not identify the actual routine. Use SMS addresses instead.
An initial script name `inspect.py` shadowed Python's standard library and was
renamed `inventory.py` before publication.

## Reuse boundary and remaining work

Directly calling extracted i386 code inside the Apple Silicon renderer is not
supported. A native x86 emulator can serve as an oracle without a complete
Windows compatibility layer for sufficiently isolated helpers, as demonstrated
here. Reusing the entire integrator requires identifying all input/output
memory, calling conventions, fixed-point overflow, timestep, math tables,
callbacks, contacts, random state and mutable globals. Emulating a large routine
with guessed zeros or convenient stubs would not establish game fidelity.

The current translation rejects malformed records and reports unavailable
intersections explicitly. Native code can leave output slots untouched or read
following point storage for unsupported/unordered inputs; reproducing undefined
memory behavior is outside the adapter contract. The 240-case claim covers
well-formed ascending/descending synthetic profiles, not every malformed polygon.

Next useful work is to recover small mass, throttle, thrust and fuel helpers
with the same native-oracle method, then build a state adapter and compare full
maneuver traces. A selectable recovered-envelope mode can use these exact
helpers while retaining shared original forces, but it must not be labeled a
complete native flight model.

## Follow-up: native time and fuel-rate units recovered

The subsequent fuel work traced the native clock rather than assuming a rate
from the field names. `_InstallTimerInt` (`0x40e900`) obtains the counter
frequency through the PE import `QueryPerformanceFrequency` at IAT `0x54e5f0`,
then captures an initial counter through `QueryPerformanceCounter` at
`0x54e5f8`. The routine at `0x40e770` updates `_timerTicks` using the signed
64-bit calculation:

`timerTicks = trunc(((counter - initialCounter) * 256) / counterFrequency)`.

At `0x40e7a6` onward the counter and origin are shifted left eight; the native
`__alldiv` routine at `0x4aa740` divides their difference by the frequency.
**There are 256 native timer ticks per second.** `_TIMEUpdate@0`
(`0x40e620`) accumulates frame ticks, including native pause/time-acceleration
handling, into `_currentTicks` (`0x4fde38`). At `0x40e74c` it shifts that value
right eight and stores the low word into `_currentTime` (`0x4fddf0`).
`_TIMEInit@12` at `0x40e590` initializes the same relationship. `_currentTime`
therefore counts **simulation seconds**, with a 16-bit representation.

The current object's `_serviceTicks` (`0x521658`) is calculated at `0x434b00`
as the difference between current ticks and the object's stored last-service
word, with a minimum of two ticks. The other observed assignment at `0x4243ed`
copies `_frameTicks`. These are 1/256-second quantities, consistent with
`_MatchF24` multiplying its rate by service ticks and shifting right eight.
The scheduler's minimum/clamps should not be silently copied into the remake's
120 Hz integration; reproducing its full scheduling is separate work.

This resolves the fuel-rate unit left open in the earlier
[native power investigation](native-power.md):

- `@FMFuelConsumption@4` (`0x430620`) returns a rate in **24.8 pounds/second**
  for the supported aircraft fuel fields and throttle convention.
- `_BurnFuel@0` at `0x430721` obtains that rate, multiplies it by five at
  `0x430726`, and subtracts the result from fixed-point tank quantity. It
  advances the tank's next deadline by **five seconds** at `0x4307f5`.
- The conversion to a continuous remake rate is
  `nativeRate / 256 * 0.45359237` kg/s. The local F-14's native fields 2 and 10
  therefore correspond to **0.90718474 kg/s at 100% military throttle** and
  **4.5359237 kg/s in afterburner**. Lesser throttle retains the recovered
  integer truncation, rather than multiplying a floating-point ideal rate.
- Native fuel accounting is batched at five-second deadlines and includes
  external-tank ordering, limited overdue catch-up and an infinite-fuel option.
  A continuous 120 Hz decrement using the recovered rate is a deliberate
  presentation/integration adaptation, not exact reproduction of those batches.
  Engine-off and exhaustion gates must still be honored by the runtime adapter.

A separate clock oracle executed the actual native counter conversion and
TIMEInit instructions for **18 synthetic cases**: three counter frequencies
(1 kHz, 10 MHz, 1 GHz) at six durations from zero to 60 seconds. All matched
256 ticks/second and the integer-second field. This oracle explicitly supplies
deterministic values at the **QueryPerformanceCounter import**; it does not
claim to execute a real Windows clock or a complete game frame. Unlike the
isolated envelope oracle, this test does contain that named OS-input hook.

```sh
objdump -d --start-address=0x40e590 --stop-address=0x40e7d3 extracted/usnf97/SETUP.ESA/USNF.EXE
objdump -d --start-address=0x4306ec --stop-address=0x430817 extracted/usnf97/SETUP.ESA/USNF.EXE
PYTHONPATH=tools/native extracted/native-flight/.venv/bin/python tools/native/clock-oracle.py --exe extracted/usnf97/SETUP.ESA/USNF.EXE --out extracted/native-flight/clock-oracle.json
```

This is now direct native-code evidence for the time unit. Earlier labels of
fuel consumption as "probable lb/s" accurately described the earlier research
state; they are superseded for this specific executable and these fields.


## 2026-09-09 correction: envelopes feed control G limits

The original caller derives fractional minimum/maximum G from the envelope
rows, applies loading and Extra G adjustments, then maps stick input into that
range. Treating every higher-G row exclusively as a sustained-drag fitting
point was an unverified assumption. The manual
(`Docs/reference/JANES_US_NAVY_FIGHTERS_djvu.txt`, lines 2825–2888) describes
instantaneous G decreasing through those envelopes as speed bleeds away.
[Native performance](native-performance.md) records the newly executed callers
and integration, including the missing thrust/drag behavior.
