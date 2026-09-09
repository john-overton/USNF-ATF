# A-4E and X-31 practice flight

The sim helper's **Aircraft** dropdown selects F-14, A-4E Skyhawk or X-31 EFM.
Switching restarts the current practice flight and preserves fuel fraction. The
preserved assisted model remains the default. Select **Retail PT envelope fit
(experimental)** to use the chosen aircraft's imported mass, thrust, fuel and G
polygons. Once selected, the envelope-fit choice carries across aircraft changes.
The F-14-only recovered-native option falls back to the ordinary envelope fit
when switching to another aircraft. Practice-start links retain aircraft/model.

Both new exteriors and textures come from ATF-GOLD: `A4.SH` and `F31.SH`.
The X-31 flight profile and audio use ATF-GOLD `F31.PT`. A-4E flight data and
PT-selected audio use USNF97 `A4E.PT`: the extracted ATF-GOLD archive has no
A4E.PT, and its `A4E.PTS` is an executable module, not a BRF plane-type record.
ATF-GOLD's X-31 EFM is the game's aircraft configuration; these parameters are
not asserted to describe a real-world X-31 prototype.

## Convert and install

Run from the repo root with the extracted archives already present:

```sh
PYTHONPATH=tools/retail python3 -m retail.sh_static extracted/atf-gold/ATF_2.LIB/A4.SH --pal extracted/atf-gold/ATF_2.LIB/PALETTE.PAL --out extracted/flight/a4e.json --name 'A-4E Skyhawk' --length-metres 12.22
PYTHONPATH=tools/retail python3 -m retail.sh_static extracted/atf-gold/ATF_2.LIB/F31.SH --pal extracted/atf-gold/ATF_2.LIB/PALETTE.PAL --out extracted/flight/x31.json --name 'X-31 EFM' --length-metres 13.21
PYTHONPATH=tools/retail python3 -m retail.audio --pt extracted/usnf97/USNF_2.LIB/A4E.PT --out extracted/flight/audio/a4e.json
PYTHONPATH=tools/retail python3 -m retail.audio --pt extracted/atf-gold/ATF_2.LIB/F31.PT --out extracted/flight/audio/x31.json
PYTHONPATH=tools/retail python3 -m retail.flight --pt extracted/usnf97/USNF_2.LIB/A4E.PT --out extracted/flight/a4e-flight.json
PYTHONPATH=tools/retail python3 -m retail.flight --pt extracted/atf-gold/ATF_2.LIB/F31.PT --out extracted/flight/x31-flight.json
bun tools/flight/install-aircraft.ts extracted/flight/a4e.json "$HOME/Library/Application Support/USNF-ATF/data" extracted/flight/audio/a4e.json extracted/flight/a4e-flight.json --id a4e
bun tools/flight/install-aircraft.ts extracted/flight/x31.json "$HOME/Library/Application Support/USNF-ATF/data" extracted/flight/audio/x31.json extracted/flight/x31-flight.json --id x31
bun run dev:electron
```

Use the data root displayed by the app if different. The installer validates all
supplied files before replacing any file. Each file replacement is atomic, but
the set is not a transactional bundle. It keeps the F-14 in its existing slot.
All derived geometry, textures, PT data, PCM and previews remain in ignored
`extracted/` or local app data; none are committed or packaged.
Missing geometry is identified as a placeholder; a missing profile disables the
experimental selector. Invalid or cross-aircraft profiles fail explicitly.

## Scope and confidence

The exports contain 371 A-4 triangles and 350 X-31 triangles, with retail color
and texture data. Lengths are authored presentation scales. Static projection
is still partial: native animation, X-31 thrust vectoring, aircraft-specific
control-rate laws and cockpit art are not ported. Gear and hook presentation
remain authored approximations; the X-31 has a single original burner effect
and no hook. The A-4 has no afterburner. Both retain fixed wings, without the
F-14 sweep schedule or its authored surface rig.

The experimental force solver fits each aircraft's own G envelopes using its
own empty/fuel/payload mass and military/maximum thrust. A-4's zero `aftThrust`
is retained as raw metadata; effective maximum thrust equals military thrust so
the fit does not attempt a zero-thrust polar. Fuel rates use the selected PT
fields with the previously established USNF time/unit convention; applying that
convention to ATF remains an inference. Angular assistance, gear support,
poststall behavior and device scaling remain approximations. Some high-altitude
fits use the existing higher-G fallback. These are distinct data-calibrated
flight models, not complete native game-flight parity. The new profiles omit
the native block to avoid enabling the F-14-only recovered-envelope backend.

## Desktop acceptance

Build fresh source, then run the isolated-profile test:

```sh
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
bun tools/flight/aircraft-smoke.ts
```

This checks both actual model/audio imports, absent-asset fallback, aircraft and
flight-model dropdown navigation, A-4/X-31 burner differences, selected-profile
hash, mass, thrust and fuel burn, and advancing flight. Reports and screenshots
are written under `extracted/aircraft-smoke/`. Audio manifests are verified;
this automated test does not unlock Web Audio or certify audible mixing.
For the existing maneuver smoke, supply `--aircraft-id a4e` or `--aircraft-id x31`
along with the matching `--aircraft`, `--audio` and `--flight-profile` paths.
See [phase 4 baseline](baselines/phase-4.md) for exact source and check results.
