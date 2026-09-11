# Aircraft brakes, ATF F14 exterior and afterburners — 2026-09-11

Source: `aa530d0c0cfada24d27594dbe345d2a2bcde5895` plus the current working tree.
Machine: Linux 7.1.9-arch1-2 x86_64, Bun 1.4.2, Python 3.14.7. Local retail files
and derived evidence remain in ignored `extracted/`; nothing is bundled.

## Correction and implementation

The A4 speedbrake cut in `fixed_wing_surfaces` removed fixed fuselage skin too
far forward. Native brake-state projection adds 12 faces farther aft while
retaining every neutral face. Removed that authored cut; `sh_devices.py` now
imports original panel pairs separately from the recessed strips and braces.
X31 similarly gains its four original side-brake faces, keeping fixed backing.
ATF F14 gains four native raised brake faces. All three bypass generic surface
mixing through `nativeBrakeAngle` metadata. A4/X31 interpolate a measured open
angle; F14 uses the native raised pose with visibility switching because its
attachment edges are not collinear. This does not recover native timing.

The F14 recipe now selects ATF-GOLD F14.SH/PALETTE.PAL and explicit `F14_ATF`
rig. Exterior SHA256 is
`9cc3110b42da907111b8390ad44da1342e48042af6449bb743632992f291c85e`.
Neutral projection has 322 faces versus USNF's 194. Its rig reuses complete aft
wing strips and tailplanes, fits rudders to the ATF fin, and parents flaps to
the actual textured wing anchors. Gear mounts/state are variant-specific.
USNF F14.PT flight/audio/loadout source remains selected. At 19.1 m neutral
length, neutral span is 20.494944 m and visible-gear support height 2.557155 m;
these are presentation calibration measurements, not decoded physical units.

Native `_PLafterBurner` state adds eight F14 and four X31 crossed textured flame
faces. Original atlas UVs are preserved; the runtime renders these emissively
and suppresses procedural cones. Nozzle textures remain present in both burner
states. The old 0x44-only nozzle detection missed ATF F14 0x74 and X31 0x64.
ATF 0x5c/0x7c texture-only keyed faces receive the same overlay treatment as
0x4c/0x6c. Flames are excluded from airframe length calibration.

## Verification

```sh
python3 -m unittest discover -s tools/retail/tests -p 'test_sh*.py'
bun test tools/flight/port-aircraft.test.ts engine/src/flight/retail-aircraft.test.ts
bun run check
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
bun tools/flight/port-aircraft.ts --aircraft f14 --install "$HOME/.config/USNF-ATF/data"
bun tools/flight/port-aircraft.ts --aircraft a4e --install "$HOME/.config/USNF-ATF/data"
bun tools/flight/port-aircraft.ts --aircraft x31 --install "$HOME/.config/USNF-ATF/data"
bun tools/flight/aircraft-devices-smoke.ts "$HOME/.config/USNF-ATF/data/aircraft" extracted/aircraft-devices/final-views
bun tools/flight/aircraft-texture-smoke.ts "$HOME/.config/USNF-ATF/data/aircraft" extracted/aircraft-devices/ground-views runway
bun tools/flight/aircraft-texture-smoke.ts "$HOME/.config/USNF-ATF/data/aircraft" extracted/aircraft-devices/gear-views
bun tools/flight/flap-placement-smoke.ts "$HOME/.config/USNF-ATF/data/aircraft" extracted/aircraft-devices/flap-views
git diff --check
```

- SH suite: **41 passed**, no skips, including local ATF face/UV conservation.
- Focused TypeScript tests: **10 passed**. Full workspace: **462 passed, 3 skipped,
  0 failed**; skips are the optional imported-gun mount tests. Typecheck, lint,
  formatting and fresh desktop build passed.
- All three bundles converted, validated and installed in Linux app data.
- Device smoke passed for all three: B-key open/closed/open endpoints; Digit6
  burner-on; T engine-off removes flames; A4 has no burner. Twelve isolated
  captures per aircraft cover top/side/rear/underside and closed/half/open brakes.
  Initial top framing cropped the F14 extremities; corrected camera zoom and
  reran into `final-views`. These final captures show the complete flames.
- Ground checks passed on all three: finite grounded AGL within 0.03 m, native
  gear source selected; support heights A4 2.600300 m, F14 2.557155 m, X31 1.826424 m.
- Gear regression passed for all three: live G-key down/up/down endpoints and
  five isolated views per state. Flap regression passed for all three with
  neutral/deployed captures from four views; the new ATF F14 aft strips and
  textured deployed gear were visually reviewed. All smoke runtime-error logs
  are empty. `git diff --check` passed; staging remains empty.

The reviewed A4 rear view shows the red inner brake panel/brace at the native aft
location with intact backing. F14 rear views show mapped nozzle disks, textured
rear upper skin and aligned twin flames. X31 shows its original side panels and
single crossed flame set. Remaining plain palette-colored panels are source art,
not an invented full-page atlas projection. Independent read-only review found
no leaked wing classification, unresolved parent anchors, duplicate procedural
burners or device material/animation conflicts.

Detailed native evidence: `extracted/aircraft-devices/afterburner-findings.md`,
`afterburner-geometry.json`, `brake-branches.json`, `brake-backing-skin.json`,
`f14-atf-gear.json`, raw neutral model projections and per-aircraft port logs.
The unique bundles and provenance reports remain under `extracted/aircraft-ports/`.

## Limits and next reproduction

This accepts imported geometry, selected native state, mapped artwork and the
reviewed runtime views. It does not establish native continuous animation,
lighting, livery selection, gear schedules, hook placement parity or thrust
vectoring. Gear remains the source's flat textured strut/wheel art. Burner sheets
retain the source's visible crossed-plane appearance; nozzle artwork is preserved
even with the engine off. Restart the rebuilt desktop and start a new flight to
reload installed JSONs; use B, 6 and T to reproduce brake/burner transitions.
