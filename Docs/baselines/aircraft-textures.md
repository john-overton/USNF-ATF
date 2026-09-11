# Aircraft textures, decals and landing gear — 2026-09-11

Linux/Omarchy, Bun 1.4.2, Python 3.14.7. Source base
`aa530d0c0cfada24d27594dbe345d2a2bcde5895` plus this working-tree change;
the checkout already contained unrelated uncommitted changes. Desktop bundles
were rebuilt from this working tree. No retail assets were committed or bundled.

## Confirmed defects and corrections

Native ATF executable disassembly confirmed the problems were in interpretation
and rendering, not missing texture files:

- `E0` selects a player/mission decal bitmap; retaining the preceding aircraft
  atlas placed unrelated atlas patches on fins/nose. Native unconfigured fallback
  is all-transparent `BLANK.PIC`; default export now omits those invisible faces.
- Native texture copy keys index255 for subtype bit8, but EE first paints an
  opaque Gouraud base from F6 per-vertex palette colors, and ED/CD paint a header
  palette base. The renderer now composes keyed paint over that base in one draw.
- Opposite-facing native skins were both drawn with DoubleSide. Exported winding
  now follows stored normals; front-face visibility excludes competing reverse
  artwork. Keyed overlays retain depth tests with a small polygon offset.
- V inversion is correct; native uses height-1-V. UVs now address texel centers.
  Mipmaps, linear filtering and anisotropy reduce oblique sampling shimmer.
- Flight gear had been plain box/cylinder placeholders. Selected native gear-state
  projections restore 10 F14, 18 A4, 22 X31 polygons, including textured cutout
  wheels/struts and doors. Imported gear replaces fallback geometry. Main/nose
  groups use native mounts and authored actuator interpolation.

Palette fill and paint share one shader, including damage/debris clones and cloud
shadow composition. The base airframe stays opaque while gear/frame cutouts stay
transparent. Neutral exterior bounds still own model scale and centering.

Native evidence and repeatable commands are under ignored
`extracted/aircraft-textures/native-findings.md`, `native-*.txt`, and gear branch
reports. This is static executable/data inspection, not a complete native-renderer
oracle. [Porting guide](../aircraft-porting.md) records the reusable technique.

## Verification

- `python3 -m unittest discover -s tools/retail/tests -p 'test_sh*.py'`:
  **32 passed, no skips**. Includes decal page switching, F6 shared palette state,
  one-pass skin export, winding/UV/color correspondence, gear-state merging,
  alpha-aware support, and previous flap completeness/conservation regressions.
- `bun run check`: typecheck/lint/format passed; **460 passed, 3 skipped**, zero
  failures. Skips are optional imported gun-mount cases, not texture tests.
  `extracted/aircraft-textures/check.log`.
- `bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'`:
  passed; final desktop build log `extracted/aircraft-textures/build.log`.
- `bun tools/flight/port-aircraft.ts --aircraft <a4e|f14|x31>`:
  all three complete bundles passed existing import validation. Models/port logs
  under `extracted/aircraft-textures/`; latest validated bundles remain under
  `extracted/aircraft-ports/`.
- `bun tools/flight/aircraft-texture-smoke.ts extracted/aircraft-textures/models extracted/aircraft-textures/final-views`:
  all three actual flight sessions passed G-key down/up/down actuator endpoints
  with `gearSource=retail`, then rendered five close-up views in both gear states
  without runtime errors. Live reports/screenshots and top/side/oblique/rear/
  underside captures are under `final-views/<id>/`. Reviewed A4 side and F14 rear
  views show intact painted skin, correct gear artwork, and absent full-atlas fin
  overlays. X31 underside shows both mains, nose gear, and door textures.
- `bun tools/flight/aircraft-texture-smoke.ts extracted/aircraft-textures/models extracted/aircraft-textures/ground-views runway`:
  all three settled grounded. Recorded support height/clearance:
  A4 2.600300m/~0m, F14 1.877799m/~0m, X31 1.826424m/~0m.
  The first tool assertion used an absent clearance key with a zero fallback;
  corrected to finite `altitudeAGL` and separately validated all three captured
  reports against that real field. Ground statuses and heights were real live data.
- `git diff --check`: passed; staged diff empty.

Intermediate failures were resolved: initial alpha-only EE interpretation made
skin transparent; close-up review exposed this and native base-fill recovery fixed
it. First full check caught missing diagnostic interface fields, then unbound
callback/async-test lint errors; final checks pass. The initial smoke readiness
predicate returned false instead of undefined; fixed to wait for flight steps
before calling diagnostics. Ground smoke uses the final bound callback build;
close-up smoke and shader-composition regressions establish the material behavior.

## Installation and practical limits

Only exterior `a4e.json`, `f14.json`, `x31.json` were atomically replaced in
`/home/john/.config/USNF-ATF/data/aircraft`. Old copies are retained under
`extracted/aircraft-textures/before-installed/`; installed SHA256 values are in
`installed-hashes.json`. Flight/audio/loadout imports were preserved. Fully restart
the app to load both the new runtime and new material metadata/model JSONs.

No configured squadron livery is presently selected; blank dynamic decals are
intentional native fallback, while atlas-painted insignia/text remains. Native
gear artwork is flat textured geometry, not volumetric modeled tires. Grouped
retraction, modern lighting/filtering/depth bias remain authored. Source nose/main
visible bottoms differ slightly; support height prevents penetration but does not
establish all-wheel contact or native ground pitch. No quantified temporal jitter
benchmark or claim of complete native rasterizer/lighting/animation parity is made.
