# Development handoff — 2026-09-09

The checkpoint was committed/pushed as ac3a142. The user then resumed fuel
acceptance, which now passes. Ready for compaction and the navigation/map pass. Mac Apple M3, Bun1.4.2/Electron44.2.0.
Linux testing is explicitly deferred. All agents have finished their owned work.

## User requirements to preserve

- Keep the liked assisted flight model as the default; do not overwrite its feel.
  `engine/src/sim/flight/assisted-flight.ts` is f70e10c's implementation, unchanged
  except a provenance comment. Nominal handling mass remains9,000kg even as fuel
  burns. Fuel exhaustion still cuts engine thrust, as newly requested.
- Three in-app options: preserved assisted, PT-envelope fit, recovered-native-
  envelope hybrid. Switching restarts the preset and carries current fuel load.
  The latter two use actual PT mass/thrust/data and are opt-in. Neither is a full
  native USNF flight integrator.
- HUD is25% narrower/shorter, pitch ticks have2× screen spacing, thin retro text;
  −/+ collapses/restores helper. Ground attitude support fixes parked rotation.
- Live fuel slider, throttle/AB burn, empty cutoff and T restart after refilling.
  Experimental mass changes with fuel; default handling mass stays fixed.
- Keep local retail conversions under ignored extracted/ and app data, never in
  bundles. Full manual is already in Docs/reference per explicit user request.

## Current source and evidence

Latest product package: **8b6a2d4**, `build/mac/mac-arm64/USNF-ATF.app`, built24.6s.
The final checkpoint includes later docs, a native-power comment and test-tool
window labeling/disconnect handling; these are not changes to the product binary.
`bun run check`:110pass/5,045expects. Both14-case fixed-reference headless modes
pass at8b6a2d4 (`extracted/flight-harness/fuel-era-{retail,recovered}.json`).
240native envelope cases,3,200power/fuel/slew cases and18clock cases match actual
local x86 execution. See Docs/formats/native-flight-code.md and native-power.md.

**Fuel acceptance completed:** `extracted/flight-fuel-resume/report.json` passes
for preserved assisted and recovered-envelope modes against product source
8b6a2d4, using the test tools at ac3a142. Both measured 0.9071847400 kg/s military,
4.5359237000 kg/s AB and zero engine-off burn. Live adjustment, empty-tank thrust
cutoff, refill without auto-start and manual T restart all pass. Experimental
mass decreases exactly with consumed fuel; assisted mass stays 9,000 kg. No
renderer errors. Empty/refilled screenshots and the orange automated-test banner
were visually checked. This supersedes the interrupted fuel run only; retain its
old report as history. No product code changes or rebuild were needed.

The separate final aero/approach runs listed below remain unrun at8b6a2d4; earlier
4a76cc5 acceptance and fixed-reference headless evidence remain correctly scoped.
They were not part of this resumed fuel-only request.

## Reproduce fuel acceptance / remaining broader checks

The local PT profile is installed and available at extracted/flight/f14-flight.json.
It contains native integer envelopes and rates. Rebuild only if product source
changes; otherwise use the existing named8b6a2d4 package.

```sh
bun tools/flight/fuel-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit 8b6a2d4 --out extracted/flight-fuel-resume
bun tools/flight/aero-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit 8b6a2d4 --flight-model recovered-envelope --out extracted/flight-fuel-native-aero
bun tools/flight/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit 8b6a2d4 --flight-profile extracted/flight/f14-flight.json --flight-model recovered-envelope --aircraft extracted/flight/f14.json --audio extracted/flight/audio/f14.json --scenario approach --out extracted/flight-fuel-native-approach
```

Run GPU sessions serially. Inspect screenshots and actual diagnostics. If the
slider fails, it uses React range input through viewer.setFuelFraction, not a
writable debug-state hook. The fuel tool dispatches the actual range input event.

## Next user-requested development: navigation HUD and terrain map

Recorded for the next pass, not implemented in this fuel-acceptance task:

- Add selected-waypoint guidance to the HUD. Use **[** for previous and **]**
  for next waypoint, preserving the existing flight controls and form-focus guards.
- Waypoint 1: the current practice landing strip.
- Waypoint 2: a mountain destination inside the available Ukraine theater.
- Waypoint 3: a coastline destination inside the available Ukraine theater.
  Choose the mountain/coast coordinates from the installed dataset; verify they
  are reachable and covered before hard-coding destinations. No exact coordinates
  have been selected yet.
- Add a top-down map in the **top-right corner** so users can see their aircraft's
  location. Aircraft heading and the selected waypoint would help orient it.
- Updated user color direction: **blue water**, then **green → yellow → red →
  brown** as land elevation rises, with **white for the highest roughly 5% of
  land elevations**. Render from the existing regional heightmap and scale colors
  to its valid land elevations. A regional 95th-percentile white threshold is a
  reasonable starting interpretation; tune intermediate stops for readability.
  This is an elevation map, not aircraft-relative clearance or danger coloring.
  Exact palette/thresholds remain flexible, as the user described a visual intent.
- Reuse the actual water mask/classification; elevation alone must not turn dry
  low ground into water. Use the theater's coordinate transform consistently for
  aircraft, waypoint, terrain and water positions. Keep the map useful while the
  helper panel is minimized and avoid covering essential HUD guidance.

## Next native work

USNF.SMS supplies3,440symbols. Envelope routines at483150/4830b0 are translated;
native flap low-speed reduction is25% forabs(G)≤1. Native clock is256ticks/s;
F-14 fuel is2lb/s military and10lb/sAB with native fixed-point quantization.
Remake fuel integrates120Hz instead of native5-second batches.

Power helpers are extracted, but only fuel is wired. Resolve `_COBv` adjusted
forward bound / `_FMUpdatePlaneFields`, native full weight, force/vector/state
adapters and scheduling/wrap before integrating the rest. Oracle-test isolated
routines against local x86, then trajectories. Keep recovered routines separate
from the preserved default. Fitted high-G drag transitions and original atmosphere,
alpha response/post-stall/ground support remain fidelity gaps.
