# Development handoff — 2026-09-09

Navigation, shared MFD and all-mode waypoint teleport are implemented locally
after the pushedac3a142 checkpoint. Latest product source is **12fc0ab**
(teleport/MFD integration10c318e, then softkey legend placement polish). Mac Apple M3, Bun 1.4.2,
Electron 44.2.0. Linux testing remains explicitly deferred.

## Preserve these decisions

- Keep the liked assisted flight model as the default. Its physics source is
  unchanged from the previous checkpoint; handling mass stays 9,000 kg while
  fuel burns. Exhaustion still cuts engine thrust.
- PT-envelope fit and recovered-native-envelope hybrid remain separate opt-in
  models, not a full native USNF integrator. Switching restarts the preset and
  carries fuel. Experimental mass changes with fuel; payload adds mass only.
- Preserve the smaller thin retro HUD, wider pitch spacing, F2/F3 chase modes,
  live fuel controls and minimized helper behavior.
- Retail conversions remain ignored in extracted/ and installed app data, never
  in bundles. The full manual in Docs/reference is the user-authorized exception.

## Current user-reported flight issue under investigation

User reports flap/velocity changes and takeoff can lift the aircraft while the
nose looks down or stays fixed, suggesting an attitude/AoA mismatch. A question
about the selected flight model is pending. Pure repro confirms strong negative
AoA/climb in recovered-envelope:15s pitch−5.26°,climb+1.29°,AoA−6.55°. Rendering
copies simulated quaternion correctly. Experimental flap-maxlift is all being
used as zero-alpha camber; separate those in the hybrid approximation. Agent
waypoint_teleport is implementing this correction; preserve assisted unchanged. Preserve the preferred assisted
baseline while establishing the cause. This is separate from completed MFD work.

## Latest map-color request in progress

User wants fixed common elevation grading because regional percentiles make
flat Ukraine look mountainous. Agentmfd_bezel is implementing fixed0green,
500yellow,1500red,2500brown,3500white metres, retaining actual water masks. These
are authored shared bands, not a claimed industry standard. Root owns docs/tests.

## Completed navigation/map request

- `[ / ]` wrap through 1 practice strip, 2 mountains, 3 coastline. Repeats and
  keys entered in forms are ignored. R selects waypoint 1 again.
- HUD shows selected destination, horizontal NM distance, north-referenced grid
  bearing and heading-tape diamond/edge steering chevron. Within 100 m it says
  ARRIVED; no automatic sequencing or autopilot. Text sits above the heading tape
  so the chase aircraft does not obscure it.
- Shared top-right MFD in explorer and every flight backend. Plain bezel keys
  have adjacent screen labels, compass, N-UP/HDG-UP orientation, −/+zoom1×–16×
  and NM scale. Heading-up centers ownship before rotating terrain and markers;
  north-up keeps the clamped viewport. Actual outside coverage is hatched.
- Three GO softkeys teleport to the destinations in all modes. Finite/bounds
  and actual destination terrain are checked first. Explorer moves its camera;
  flight starts level at150–250m/s, facing into coverage, at least1000m above
  the finest containing chunk maximum/raised water. Fuel/payload/model/system
  commands/chase mode remain; state time/interpolation restart. Unpowered stays
  unpowered. Newer requests/reload/disposal supersede pending work. R returns
  to the existing preset and selected reset fuel. Bezel controls restore focus.
- Softkey labels now align within the map image so GO3 cannot cover the NM scale.
  Non-Ukraine datasets omit the fictional Ukraine strip.
- Regional height colors: blue actual polygon water, green → yellow → red →
  brown land, white at the regional valid-land 95th percentile. Dry holes and
  below-sea-level dry land remain land. Missing terrain is dark, not zero height.
- Map is a bounded 512-pixel overview from coarsest installed terrain, generated
  once per load. Zoom enlarges that overview rather than streaming finer map
  data. At high zoom offscreen destinations remain available in HUD guidance.
- Coordinates are derived from installed data. Current mountain destination is
  east500483.325/north72926.215m, verified against 30m terrain at1467.421m;
  coast east275731.777/north309799.333m, verified against100m terrain at2.934m.
  Both are dry. Strip→mountains382.8km and strip→coast83.3km have no missing
  30/100m source coverage in ≤1km route samples. No entire route flight claimed.

Details and lessons: [phase-4-navigation.md](phase-4-navigation.md),
[progress.md](progress.md), [baseline](baselines/phase-4.md).

## Evidence and reproduction

`bun run check` at10c318e: **120pass / 5,134expectations**, type/lint/format
pass. Mac arm64+x64 packaging23.7s, onlyarm64launched. All-mode native acceptance
passes: `extracted/waypoint-teleport-settled/report.json`, product10c318e,
tool9923015. Explorer plus assisted/PT-fit/recovered modes each teleport to all3
waypoints and pass compass/orientation/focus checks; engineoff,40%fuel,model and
F2state remain. No renderer errors. Earlier120test/check and source10c evidence
remain distinct from the final label-position polish12fc0ab; see baseline for
its exact build and visual acceptance.12fc0ab fullcheck again120/5,134; Macbuild27.0s;
`extracted/mfd-final/report.json` passes including label/scale separation at720p.

```sh
bun tools/flight/teleport-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit 12fc0ab --out extracted/waypoint-teleport-current
bun tools/flight/navigation-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit 12fc0ab --out extracted/mfd-final
```

Earlier completed fuel evidence remains correctly scoped to runtime8b6a2d4 and
toolac3a142: `extracted/flight-fuel-resume/report.json`. Both assisted and recovered
modes pass military0.9071847400kg/s, AB4.5359237000kg/s, zero off burn, empty cutoff,
refill without automatic restart and T restart; experimental mass follows burn,
assisted stays9,000kg. It was not rerun for this UI-only change. Older native
oracle evidence is240envelope,3,200power and18clock cases; no native routines were
changed or re-oracled here. Fixed-reference headless suites at8b6a2d4 each pass14.

## Remaining phase4 work

Navigation request is complete. Human route flight, physical gamepad and USNF
feel comparison remain open. The broader final recovered-mode aero/approach
reruns listed in prior handoff were not part of this navigation pass; use the
actual current build hash if running them, never label the new package8b6a2d4.
Run GPU acceptance sessions serially; automated windows have orange labels.
Do not call phase4 fully accepted while these documented human gates remain.

## Next native development

USNF.SMS supplies3,440symbols. Envelope routines483150/4830b0 are translated;
native flap low-speed reduction is25% forabs(G)≤1. Clock is256ticks/s; F14fuel is
2lb/s military and10lb/s AB with fixed-point quantization. Remake integrates
fuel at120Hz rather than native5second batches.

Only fuel from the recovered power helpers is wired. Resolve `_COBv` adjusted
forward bound / `_FMUpdatePlaneFields`, native full weight, force/vector/state
adapters and scheduling/wrap before integrating other power helpers. Oracle-test
isolated routines against local x86, then trajectories. Keep all native work
separate from preserved assisted. Fitted high-G drag transitions and original
atmosphere, alpha response, post-stall and ground support remain fidelity gaps.
See Docs/formats/native-flight-code.md and native-power.md.
