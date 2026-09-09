# Packaged flight acceptance

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
