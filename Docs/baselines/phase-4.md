# Phase 4 baseline: original practice flight on Mac

Verified 2026-09-09 on Apple M3, macOS 26.6.2, Bun 1.4.2. Packaged runtime
source **`49a3123`**; subsequent documentation and smoke-tool commits do not
change that binary. Mac arm64/x64 DMG/ZIP packaging passed in **22.5 s**;
only arm64 was launched. The real Ukraine terrain is the phase 2 dataset.

## Implementation and automated acceptance

The original aircraft uses validated JSON coefficient tables and a pure 120 Hz
assisted flight model, quaternion attitude, aerodynamic forces, throttle,
stall, gear contact, brakes and crash states. The app adds a procedural aircraft,
chase camera, HUD, keyboard/standard gamepad input and runway/approach starts.
Terrain contact independently samples decoded 30/100 m data with an 8 MiB LRU;
unavailable samples pause simulation. The practice runway validates dry terrain
coverage before flight. It is fictional, not a surveyed airport or retail asset.

`bun run check` passed **53 tests / 4642 expectations**, including strict types,
lint and formatting. `bun run harness --output extracted/flight-harness/phase4-final.json`
passed all **11 scenarios** at source `49a3123`:

| Case | Measured result |
|---|---|
| Level flight, 60 simulated s | Maximum altitude error 4.04 m; final 150.90 m/s |
| Sustained 35° bank | Velocity heading changes 156.05°; altitude error 20.26 m |
| Unpowered flight | Specific energy falls 40669.95 → 36909.74 J/kg |
| Vertical trajectory loop | 360.06° in 40.55 s; peak altitude 7270.33 m; minimum speed 145.98 m/s |
| Stall and recovery | 79 stalled diagnostic samples; last at 8.61 s; final 152.59 m/s |
| Takeoff from rest | Airborne at 237.86 m and 130.73 m/s after 45 s |
| Approach and braking | Touchdown at 24.11 s; stops after 3585.77 m, inside the equivalent runway |
| Hard impact / water impact | Both enter crashed state |
| Render cadence independence | Identical state after 7200 ticks at 30/60/144 Hz |
| Missing terrain | No integration until contact samples become available |

The loop is an actual velocity-path maneuver with an imperfect return, not just
an attitude rotation. See [harness contracts](../phase-4-harness.md) for gates.

## Packaged real-terrain flight

[Reproduction commands](../../tools/flight/README.md) launch isolated profiles
at 2560×1440. A virtual standard gamepad drives the normal input adapter; the
feedback pilot never writes aircraft state. Background/occlusion throttling is
disabled and CDP emulates focus. Screenshots are outside the measured interval.
These settings describe the benchmark, not ordinary app background behavior.

| Scenario | Sample duration | Mean FPS | p95 frame ms | Final result |
|---|---:|---:|---:|---|
| Ground | 15 s | 60.035 | 18.600 | Grounded, stationary, no false landing |
| Takeoff | 40 s | 60.013 | 17.300 | One takeoff, 149.01 m/s, 227.55 m AGL |
| Approach | 60 s | 60.007 | 17.600 | One landing, stopped inside runway |

All three passed with no renderer exceptions or browser console errors, and
screenshots were independently inspected. Approach stopped at x=289000,
y=113.2, z=391217.614, speed approximately zero, throttle zero and brakes on.
Runway center is (289000, 392000), dimensions 100×2800 m, elevation 111 m;
the aircraft's 2.2 m gear offset accounts for final center height.
Each run used 262144 decoded contact-cache bytes. Ground and takeoff recorded
zero clamped frames; approach recorded **one clamped frame**. A 60 FPS average
does not prove every frame was smooth or establish long-duration performance.

Ignored evidence directories contain report JSON, per-frame flight/terrain
samples, initial/final screenshots, runtime errors and Electron logs:

- `extracted/phase4-ground-final`
- `extracted/phase4-takeoff-final`
- `extracted/phase4-approach-final`
- `extracted/flight-harness/phase4-final.json` (headless report)

Reports distinguish packaged source from current HEAD/working-tree status;
the smoke tools were uncommitted during capture. Do not infer that subsequent
documentation was in the measured binary.

An additional default terrain-only coast run on this package timed out in its
65-second CDP frame-collection request (`extracted/phase4-terrain-regression.log`).
It produced no accepted timing report. The earlier phase 3 coast baseline remains
historical; this attempt does not establish a new explorer performance result.
The cause is unresolved and should be checked before claiming that regression
gate passed. The three flight runs above completed separately.

## Remaining acceptance and lessons

Physical controller hardware and human comparison with USNF handling remain
unverified. This is an original assisted placeholder, not recovered retail
flight behavior. Combat, missions and retail aircraft import remain planned.
Linux is deferred by user decision; x64 launch and long thermal runs are untested.
Contact resolution can change across authored 30/100 m coverage. Runway sample
validation is not a proof about every terrain pixel, and camera behavior remains
an initial implementation.

Focus changes must clear held keys, including key releases targeting form
controls. Async scene construction must publish diagnostics only after its load
is accepted, or a stale load can remove the active flight diagnostics. Both have
regressions. Ground spawn must not count as a landing; actual airborne clearance
arms the counters. Render triangles alone cannot establish valid shaders or
visible aircraft: retain console-error checks and screenshot review alongside
physics assertions. Keep control-driven packaged acceptance separate from
synthetic deterministic model tests and from human feel assessment.
