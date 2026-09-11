# Sky lighting and moon — 2026-09-11

## Curved phases and texture-driven glow — 2026-09-11

Same machine/source identity as the disc-size section below, plus working changes.
The projected terminator at each disc row is `(1 - 2*phase)*sqrt(1-y*y)`;
waxing/waning mirror it. Both limb and terminator have a 0.04-wide transition
in radius-normalized coordinates (2% of diameter). Glow is a bounded 12×12
quadrature of the same feathered phase mask times photograph luminance, blurred
with 0.012/0.035 rad Gaussian kernels and tapered at 0.07–0.12 rad. A new moon
has no emitting pixels. Shader skips this work outside the moon's sky region.
This is approximate texture-driven glow, not full-resolution scene bloom; tiny
crescents can be underrepresented by the finite sampling grid. Phase sides are
view-right/view-left, not a full astronomical position-angle/libration model.

```sh
bun run check
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
systemd-run --user --unit=usnf-moon-phase-review2 --same-dir /home/john/.bun/bin/bun tools/flight/moon-phase-smoke.ts
```

Checks: 455 passed, 3 existing local-import skips, 0 failed; fresh build passed.
Synthetic tests integrate illuminated area over phases, check mirrored curved
edges and both feathers, and verify the glow and disc share the mask. Desktop
captures/diagnostics are in `extracted/moon-phase-review/`, covering waxing and
waning crescents and a near-full moon in clear nighttime sky. The earlier
disc-size section's radial halo description is superseded by this convolution.
Final desktop run exited 0 at 10:44:21 local with all three phases and no renderer
errors. Inspected the crescent captures: curved cutoffs face opposite sides and
the glow is much weaker around the small emitting crescent. Short frame averages
were about 18 ms; this is not a sustained performance or all-phase certification.

## Disc-size follow-up — 2026-09-11

Linux, Bun 1.4.2, Electron 44.2.0; HEAD
`aa530d0c0cfada24d27594dbe345d2a2bcde5895` plus working changes. The user requested
5× visual disc diameter, not stronger lighting or a larger solar aureole.
Sun radius is 0.02325 rad, moon radius 0.02260 rad; moon texture coordinates
use the enlarged radius. These are artistic apparent sizes, not astronomy.
Sun atmosphere lookup and original 0.0016275 rad limb feather are unchanged.
Moon halo uses a 0.035 rad Gaussian width, tapered from 0.07–0.12 rad, with
sub-code-value spatial dither to reduce 8-bit gradient contours. Its color,
phase/night gating and lighting remain unchanged.

```sh
bun run check
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
systemd-run --user --unit=usnf-sky-disc-review2 --same-dir /home/john/.bun/bin/bun tools/flight/sky-disc-smoke.ts
```

Desktop test aims the camera at the sun and a near-full moon over Salt Lake.
Captures/diagnostics: `extracted/sky-disc-review/`. The first live run passed;
inspected images showed correct larger discs but visible 8-bit moon-halo bands,
prompting the small dither follow-up. Scope is clear sky at two times, not every
weather, lunar phase, display panel or a sustained GPU benchmark.

Final verification: 453 tests passed, 3 existing local-import skips, 0 failed;
fresh build passed. Second desktop run exited 0 at 10:12:18 local, rendering
both discs without renderer errors.

## Scope

The terrain sky layer now uses the existing astronomical `Environment.moon` direction
and phase to place a NASA/JPL/USGS Galileo full-moon photograph in the sky dome. The
photograph is a 384 px, bundled public-domain derivative; its source, license and
SHA-256 are in [ATTRIBUTIONS.md](../../ATTRIBUTIONS.md). The shader masks it with the
simulation phase and adds only a small cool halo.

At sunrise and sunset, `solarKeyIntensity` keeps the direct key at 45% of the calibrated
noon strength before its altitude ramp. This intentionally does not brighten all terrain:
Three's Lambert term still makes horizontal land receive the shallow-angle component,
while a slope facing the sun receives the key directly. Existing scattering-colour fog
provides the distance wash, so no screen-space brightness pass was introduced.

## Verification

Run from the repository root on Linux, 2026-09-11:

```sh
bun test engine/src/terrain/sky.test.ts engine/src/terrain/light-contrast.test.ts
bun run typecheck
git diff --check
bun run check
```

Results: 14 targeted tests passed, 437 assertions; all engine, shell and importer
TypeScript projects passed; `git diff --check` was clean. The full check also passed:
440 tests, 3 existing retail-import-dependent skips, no failures. No desktop visual
flight has yet been recorded for this change, so this establishes shader/model regression
coverage, not final GPU appearance acceptance.
