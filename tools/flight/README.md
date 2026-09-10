# Packaged flight acceptance

For the complete development workflow and one-command conversion helper, see
[Aircraft porting](../../Docs/aircraft-porting.md).

These tests launch the real Electron renderer in an isolated profile with the
locally generated Ukraine theater. Nothing is installed into normal app data.
The virtual standard gamepad drives the product input adapter; the test does
not write aircraft state or replace the physics. It does not verify physical
controller hardware.

Build first, record the commit that was built, then run:

```sh
bun run build
bun tools/flight/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit <built-commit> --scenario ground --out extracted/flight-ground
bun tools/flight/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit <built-commit> --scenario takeoff --out extracted/flight-takeoff
bun tools/flight/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit <built-commit> --scenario approach --out extracted/flight-approach
```

`--query 'time=7.5&weather=broken&wind=gusty&clouds=half'` sets viewer parameters
such as the environment clock, weather, wind and cloud quality; invalid values
fail the load with the viewer's explicit error.

Replace `<built-commit>` with the actual hash; it is independent of the current
working-tree HEAD recorded in the report. `--terrain` defaults to
`extracted/terrain/ukraine`. The default durations are 15, 40 and 60 seconds;
`--seconds` permits 1–60 seconds, but shortening a maneuver may prevent completing
its required state change. An unpackaged Electron binary can use `--app shell`.

The ground case verifies advancing simulation and the 2560×1440 renderer. Takeoff
requires a recorded liftoff and an aircraft still above 20m ground clearance at
flying speed. Approach starts from the user-visible final-approach preset and
must touch down safely and brake below 5m/s. Every case rejects crashes, renderer
exceptions and browser console errors, including shader errors.

The feedback pilot follows the same control policy calibrated in the headless
harness. It compensates for the product axis deadzone and changes throttle through
normal trigger inputs. This controller is test tooling, not a product autopilot.

Each ignored output directory contains `initial.png`, `final.png`, `report.json`,
`runtime-errors.json` and `electron.log`. Per-frame reports preserve raw rAF
intervals, flight snapshots and terrain metrics. Screenshot capture occurs outside
the timed interval. Inspect screenshots as well as assertions: triangle counters
alone do not prove valid shaders or visible aircraft.

Like the terrain smoke, this harness suppresses physical input in its isolated
page, disables background/occlusion throttling and emulates focus through CDP.
Normal app launch settings are unchanged. `desktop.ts` owns setup and cleanup;
its initial integration probe successfully rendered the existing packaged terrain
at 1440p without errors before the flight scenarios were added.

## F-14 systems and animation checks

Pass `--aircraft extracted/flight/f14.json` to flight smoke to copy the local
conversion into the isolated profile. Use `systems-smoke.ts` for throttle presets,
engine start/stop, gear/hook intermediate and endpoint transforms, wing sweep,
burner visibility, banked F2/F3 views and audio activation/mute. That test permits
trusted CDP input, needed to unlock Web Audio, and is not a cadence benchmark.
See [F-14 setup](../../Docs/phase-4-f14.md) for conversion/install/test commands.
Screenshots supplement numeric assertions; helper text updates asynchronously,
so camera captures explicitly wait for the selected view label.

## Retail audio, surfaces and HUD

`retail-smoke.ts` runs the actual engine sample graph, records one shutdown/start
cycle to `engine-cycle.webm`, checks nonzero/nonclipping signal snapshots, tests
flap/brake/pitch/roll/rudder mesh transformations and neutral restoration, and
captures the HUD. It loads `extracted/flight/f14.json` and
`extracted/flight/audio/f14.json` by default. `--aircraft` and `--audio` override
those paths; ordinary smoke/system tools also accept optional `--audio`.

All recordings remain under ignored `extracted/`. The parallel MediaStream tap
captures the actual app graph without replacing its playback nodes; it is not
physical loopback or a subjective sound-quality judgment. The real retail sample
rates/mixing still have the uncertainty described in [audio notes](../../Docs/formats/audio.md).

## Stationary support and panel controls

```sh
bun tools/flight/ground-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit <built-commit> --out extracted/ground-support-accepted
```

This trusted-key test holds both directions of pitch/roll/yaw for three seconds
each on the runway, rejecting position/attitude drift or accumulated rotation.
It measures actual HUD screen dimensions and pitch-rung spacing, verifies no
blur filter, and collapses/restores the helper while checking canvas focus,
visible HUD and advancing simulation. It loads local F-14 geometry/audio by
default. Screenshots and the full report remain in the ignored output directory.

## Experimental PT flight model

`--flight-profile extracted/flight/f14-flight.json` copies the attributed local
flight profile into an isolated test session. Generic `smoke.ts` additionally
requires `--flight-model retail-envelope` to select it; the default remains the
preserved assisted backend. `ground-smoke.ts` loads the profile but starts with
the default, then exercises the real model selector both ways and verifies the
backend mass/source changes. Its default profile path is the one above.

```sh
bun tools/flight/aero-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit <built-commit> --out extracted/model-switcher-aero
```

The six isolated real-key cases compare clean, flap, brake and gear idle-energy
loss, then full-fuel versus quarter-fuel afterburner acceleration. Each starts
from the same airborne preset and measures ten simulated seconds after gear-up
settles. Assertions verify the actual imported backend, deployed fractions,
energy direction, added device drag, mass effect and exact PT AB/military ratio.
This is control-path acceptance, not a maximum-speed benchmark. Long level-flight
performance checks live in `tools/harness/retail-flight.ts`.

Pass `--flight-model recovered-envelope` to `aero-smoke.ts` or `smoke.ts` for the
third backend. Ground acceptance now switches through all three modes and back
to the preserved default. The headless retail runner accepts
`--model recovered-envelope`; its performance targets are still the imported
polygons, not measurements from a complete original-game flight.

## Fuel slider and consumption

```sh
bun tools/flight/fuel-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit <built-commit> --out extracted/flight-fuel
```

Both preserved assisted and recovered-envelope modes exercise the actual React
range input, military/AB consumption windows, engine-off zero burn, empty-tank
cutoff, live refill and manual restart. It verifies experimental mass loss equals
burned fuel while assisted handling mass stays 9,000 kg. The tool never directly
writes flight state. Screenshots and exact packaged-source evidence stay ignored.

## Navigation and map acceptance

```sh
bun tools/flight/navigation-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit <built-commit> --out extracted/flight-navigation
```

This short real-renderer test uses trusted CDP bracket keys, actual form focus
and product buttons. It checks all three HUD/map destinations, both wrap
directions, ignored key repeat, form-focus protection, helper minimization,
live aircraft movement, 1×–16× zoom and its NM scale, focus recovery after zoom,
and map/HUD separation at 1280×720. Screenshots also cover 2560×1440 and16×zoom.
It does not fly the entire inter-waypoint route or claim native USNF navigation
parity. The product map loads the locally installed heightmap and water polygons.

## All-mode map and waypoint teleport

```sh
bun tools/flight/teleport-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit <built-commit> --out extracted/waypoint-teleport
```

Runs explorer, assisted, PT-fit and recovered-envelope modes serially. It uses
the actual three teleport buttons, checks camera/aircraft location and selection,
verifies that flight keeps stopped engines,40%fuel, its model and F2view, then
checks zoom focus, compass and north/heading-up mode switching. Explorer movement
must continue after the jump. Mountain/coast screenshots and per-mode diagnostics
are retained. Teleport supplies a new airborne state; this is not a full route
flight or a physical gamepad test.

## Full flaps and afterburner with no stick input

```sh
bun tools/flight/flaps-neutral-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit <built-commit> --out extracted/flaps-neutral
bun tools/harness/flap-attitude.ts --output extracted/flight-harness/flap-attitude.json
```

The real-window tool runs all three flight backends for60wallseconds (or first
crash), with full flaps, gear down, AB and no pitch/roll/yaw input. It checks those
conditions and finite states, recording pitch/path/AoA and first airborne state;
it does not require an uncommanded rotation. Leaving the raised practice deck
can create an airborne state before lift supports weight. The pure six-case
harness adds airborne flap deployment at fixed mass over flat terrain, excluding
actuator transit, spool and fuel burn. Keep the two scopes distinct.

## Envelope controls and forces smoke

After `bun run probe --fresh`, run `bun tools/flight/envelope-smoke.ts`. This
uses the fresh unpackaged Electron source, locally supplied F-14/A-4E/X-31
profiles and geometry, still air, a ten-second autopilot segment, and a
ten-second full-pull input. It checks both experimental F-14 modes, the other
aircraft fitted modes, airborne continuity, F-14 G bounds and renderer errors.
Reports/screenshots stay in `extracted/flight-envelope-audit/desktop-*`. The
headless high-altitude performance audit is documented in
[retail flight acceptance](../harness/retail-flight.md).
