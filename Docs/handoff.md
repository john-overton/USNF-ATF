# Development handoff — 2026-09-09

Navigation/map development is implemented and committed locally after the pushed
ac3a142 checkpoint. Latest product source is **cf238d9** (map/input integration
2b5d2c9, then waypoint-text placement polish). Mac Apple M3, Bun 1.4.2,
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

## Completed navigation/map request

- `[ / ]` wrap through 1 practice strip, 2 mountains, 3 coastline. Repeats and
  keys entered in forms are ignored. R selects waypoint 1 again.
- HUD shows selected destination, horizontal NM distance, north-referenced grid
  bearing and heading-tape diamond/edge steering chevron. Within 100 m it says
  ARRIVED; no automatic sequencing or autopilot. Text sits above the heading tape
  so the chase aircraft does not obscure it.
- Top-right north-up map stays visible with the helper minimized. It has an
  aircraft heading marker, numbered destinations, MFD-style border, −/+ zoom
  (1×–16×) and a visible NM distance scale. Zoom follows the aircraft and clamps
  at theater edges; buttons return keyboard focus to flight.
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

`bun run check` at2b5d2c9: **117 pass / 5,101 expectations**, type/lint/format
pass. Sourcecf238d9 only moves the waypoint label; focused HUD/navigation checks
pass5tests/81expectations. Independent code review found no blocking defects.
The exact packaged navigation runs and visual checks are in the phase4 baseline;
latest package is rebuilt fromcf238d9 in23.2s, not the old8b6a2d4 fuel package.
`extracted/flight-navigation-settled/report.json` passes with toolc31fe2a, no
renderer errors; settled1440p and the earlier720p/16×views were visually reviewed.

```sh
bun tools/flight/navigation-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit cf238d9 --out extracted/flight-navigation-settled
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
