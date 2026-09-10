# Development handoff — 2026-09-10

Current Mac product package is **51298fb**, at
`build/mac/mac-arm64/USNF-ATF.app`. Everything from `1057085` onward is committed
locally and unpushed. Apple Silicon, Bun 1.4.2, Electron 44.2.0. Linux testing
deferred.

The 2026-09-09 sections below are kept as written; where a decision has since
changed it is corrected in place and labelled, not silently rewritten.

## Preserve these decisions

- **Corrected 2026-09-09 (c6069fe):** the retail PT-envelope fit, not assisted, is
  now the default for every imported aircraft. Assisted remains selectable and is
  the fallback when no profile is installed; its frozen physics is unchanged and
  handling mass stays 9,000 kg while fuel burns. Empty fuel cuts thrust. Two smoke
  scripts still assert the older default and fail because of it; see the
  2026-09-10 progress entry.
- PT-envelope fit and recovered-native-envelope hybrid remain separate opt-in
  models, not a full native integrator. Switching restarts the preset and carries
  fuel; experimental mass follows fuel and payload.
- Preserve smaller retro HUD, wider pitch spacing, F2/F3 cameras, live fuel and
  minimized helper. Do not disguise a force issue by rotating the exterior model.
- Retail conversions stay ignored in extracted/ and app data, never bundles.
  The manual in Docs/reference is the user's explicit exception.

## Game shell, 2026-09-10

- The app opens on a **main menu**, not the viewer. `engine/src/sim/mission/params.ts`
  is the single description of a session and the URL is one serializer of it; every
  legacy query key must keep parsing, because thirteen Electron scripts deep-link
  with them. A query — any query — wins over the menu, which is why
  `teleport-smoke`'s explorer case still lands in the explorer with no `mode` set.
- `engine/src/ui/Shell.tsx` owns `{screen, mission}`. Menu components under
  `engine/src/ui/menu/` stay prop-driven and effect-free, because
  `renderToStaticMarkup` is the only React test tool here. Scaling is CSS alone,
  never a measured window.
- Menu geometry comes from the decoded `CHOOSEAC.DLG`, not from eye. The retail
  artwork and sounds are an **optional** bundle ported from the user's own disc;
  the app must keep working identically without one, and `menu-smoke` asserts both.
- Menu audio is constructed only while a menu is on screen. A second `AudioContext`
  sitting behind a flight took `retail-smoke`'s audio tap once already.
- What is mocked stays mocked and stays labelled in the UI: opponents fly fixed
  profiles with no AI, acquisition or damage; stores are weighed but do not affect
  flight; a station offers only its own default until the hardpoint `flags` mask is
  decoded.

## Completed MFD and navigation work

- Shared top-right MFD in explorer and all3flight backends. Plain bezel buttons
  have adjacent screen labels, compass, N-UP/HDG-UP,1×–16×zoom and NM scale.
  The latest bezel is square, with20blank buttons (five per edge) and2decorative
  lower-corner dials. Unassigned keys are cosmetic. The NM bar alternates black
  and transparent outlined segments and auto-scales to viewport width.
  At compact window heights≤540px the elevation legend hides to preserve spacing.
  Heading-up centers aircraft/camera before rotating terrain/markers together;
  north-up clamps the view. Outside-coverage corners are hatched. Controls restore
  keyboard focus. GO labels sit inside the map image and clear the distance scale.
- `[ / ]` manually wrap flight waypoints:1strip,2mountains,3coast. HUD shows
  bearing, horizontal NM range and steering cue; within100m saysARRIVED. R returns
  to waypoint1 and the original practice preset/reset fuel. No autopilot.
- GO buttons teleport in ALLmodes. Destination data must load; camera/aircraft
  height is≥1000m above the finest containing chunk maximum/raised water. Flight
  starts level at150–250m/s facing into coverage, retaining fuel, payload, model,
  engine/system commands and camera mode. State time/interpolation restart.
  Newer requests/reset/disposal supersede pending work. A prior normal-contact
  read error remains sticky and requires terrain reload.
- Latest color request is complete: fixedMSL bands green0m/yellow500m/red1500m/
  brown2500m/white3500m, interpolated and labeled. This supersedes regionalp95.
  Same height has same color across theaters. Water remains actual polygons;
  dry negative terrain stays green. These are authored bands, not formal chart
  standards. The512pixel overview uses coarsest terrain; zoom does not load finer
  map data. Non-Ukraine maps omit the fictional Ukraine strip.
- Current destinations: strip289000/392000m; mountains500483.325/72926.215m;
  coast275731.777/309799.333m. Mountain verified30m ground1467.421m, coast100m
  ground2.934m, both dry. Straight routes sampled≤1km have no missing30/100m
  coverage (384samples382.8km;85samples83.3km). Not a full-route flight claim.

## Flap/nose-attitude report and correction

User observed nearly level no-input takeoff in assisted/PTfit and recovered
nose-down/vector-up behavior. They explicitly asked for fullflaps+afterburner
with NO pitch/roll/yaw input, and suggested possible ground/speed-dependent trim.

Pure repro showed the experimental polar used the entire native flap maximum-
lift increase as zero-AoA camber, then its1G trim controller countered it with
large negative AoA. Source50d2ec4 separates modest camber (authored interpretation
of PT51/256) from extra maximum lift, which grows on the positive-alpha branch.
Native1G flapped maximum lift is preserved. Trim solves that same polar. This is
an improved authored hybrid approximation, not a recovered pitching-moment law.
Assisted remains byte-for-byte unchanged. Negative pitch/AoA alone is not wrong;
flaps can produce nose-down moment, but our generic trim is not a full moment model.

6-case fixed-mass headless comparison passes;123tests/5,189expectations and both
14-case experimental suites pass. Three real60second full-flaps/no-stick AB runs
at50d2ec4 verify all input conditions and finite states, zero renderer errors.
No samples show pitch<−1° with climbangle>0.2° andAGL>2m. Assisted's existing
large neutral climb arc remains. Experimental firstairborne occurs at the raised
strip end with lift<weight—rolling off the deck, NOT aerodynamic rotation.
Old report field firstLiftoff is explained/corrected to firstAirborne in the tool.
Final experimental pitch≈−0.23°, climb≈+0.21°, AoA≈−0.44° at255m/s is allowed.

## Native takeoff-trim investigation completed for this path

Tool29a4765 verifies1,000gear-pitch+21ground-pitch cases against actualUSNFx86;
only_T_Info terrain provider is a fixture. FMUpdateGearPitch42fd40 fades a gear
angle over~75–100% of TakeoffSpeed (first1G speed, F14170ft/s). F14gearPitch=0.
Model/HUD/view consumers add the offset to copied orientation; no elevator force
is established. groundPitch derives from terrain slope, not a takeoff trim
schedule. Another display-offset branch requires a PTflag theF14does not have.
No guessed automatic nose-up bias was integrated. This does not exclude every
native longitudinal-control path or determine real-world Tomcat trim settings.
See Docs/formats/native-gear-pitch.md for exact formulas, addresses and caveats.

## Current evidence and reproduction

- Square MFD runtime ce533a3: extracted/square-mfd-navigation/report.json.
  Fullcheck123tests/5,189expectations; packaged arm64 navigation/zoom checks pass,
  screenshots reviewed at1440p/720p;20keys/five per edge,2dials, square bounds,
  legends clear scale and HUD. Scale100/50/20/10/5NM at1/2/4/8/16×.
  extracted/square-mfd-teleport/report.json also passes all4modes/all3destinations,
  orientation/focus and retained flight settings; zero renderer errors.

- All-mode teleport/MFD10c318e: extracted/waypoint-teleport-settled/report.json,
  tool9923015. Fuel40%, engineoff, model andF2retained in allflightmodes.
- Final fixed-color UI50d2ec4: extracted/fixed-elevation-map/report.json;1440p/720p
  screenshots reviewed, zoom/softkeys/scale/HUD separation pass.
- Full-flaps no-stick runtime50d2ec4: extracted/flaps-neutral/report.json,
  tool6d2756f.60wallseconds after fullflaps, includes actualfuel/spool/terrain.
- Headless: extracted/flight-harness/flap-attitude-corrected.json; samephysics,
  fixedmass/flatground/instantactuators. Do not relabel it runtime fuel evidence.
- Native: extracted/native-flight/gear-pitch-oracle.json, tool29a4765.
- Earlier fuel acceptance8b6a2d4 remains valid historically (bothassisted/recovered
  burn, cutoff, refill/Trestart); not rerun as a separate fuel suite this pass.

```sh
bun tools/flight/navigation-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit 50d2ec4 --out extracted/fixed-elevation-map
bun tools/flight/flaps-neutral-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit 50d2ec4 --out extracted/flaps-neutral-current
bun tools/harness/flap-attitude.ts --output extracted/flight-harness/flap-attitude-current.json
PYTHONPATH=tools/native:tools/retail extracted/native-flight/.venv/bin/python tools/native/gear-pitch-oracle.py --exe extracted/usnf97/SETUP.ESA/USNF.EXE --pt extracted/usnf97/USNF_2.LIB/F14.PT --out extracted/native-flight/gear-pitch-oracle.json
```

Run GPU sessions serially. Automated windows have orange labels. Human route
flight, physical gamepad and USNF feel comparison remain open; phase4 is not
fully accepted. No Linux or Windows launch claim.

## Next native development

For actual longitudinal trim/control, trace _FMMove pitch-control before
_CheckLanding, writers to pitch0x4d5277/pitch-rate0x4d526f, and PTlowAOASpeed/
lowAOAPitch/gpullAOA consumers. These were identified as next leads, not decoded.
For engine-force fidelity, resolve _COBv/_FMUpdatePlaneFields adjusted forward
bound, nativeweight/forcevector/state scheduling. Only recovered fuel is wired
from power helpers. Keep oracles and new models separate from preserved assisted.
