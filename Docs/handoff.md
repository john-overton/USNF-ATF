# Development handoff — 2026-09-09

The user requested a commit, push and compaction checkpoint. Stop here; resume
with acceptance before more changes. Mac Apple M3, Bun1.4.2/Electron44.2.0.
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

**Pending:** packaged fuel acceptance was interrupted by the user closing the
window. Report `extracted/flight-fuel-accepted/report.json` contains CDP timeout.
Assisted live slider/military/AB/off checks completed; empty/refill/restart and
experimental fuel/mass did not. Chained aero/approach never started. Do not claim
this run passed. Earlier4a76cc5 selector, native aero, takeoff and landing passed,
but precede final fuel/trim corrections. Automated windows now get an orange
label and clear title, to distinguish them from the user's own app; validate it.

## Resume acceptance

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
