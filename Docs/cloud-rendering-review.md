# Cloud rendering review — 2026-09-11


**Implementation follow-up, 2026-09-11:** the approved approach is now implemented,
including separate cirrus/cumulus/stratus/cumulonimbus profiles. Current behavior
and verification are in [environment plan](environment-plan.md) and
[phase 3 baseline](baselines/phase-3.md). The analysis below describes the pre-change
renderer and is retained as the design rationale.

Historical review scope: source review and implementation proposal, not an implemented appearance
change or visual/performance acceptance. Local source: `576db2b`. Reference cloned
to `/tmp/usnf-cs2-smoke-reference` at `17f55793eaf26c18cb5dd53d95d37e2b1c1ed010`.

## What the reference actually provides

[Garrett Gunnell's project](https://github.com/GarrettGunnell/CS2-Smoke-Grenades)
is described as a Unity recreation, not recovered Valve source or demonstrated
CS2 parity. Its README explicitly labels it non-production-ready.

[RenderSmoke.compute](https://github.com/GarrettGunnell/CS2-Smoke-Grenades/blob/17f55793eaf26c18cb5dd53d95d37e2b1c1ed010/Assets/Resources/RenderSmoke.compute)
contains tiled Worley generation, density shaping (326–348), and volume/light
marches (351 onward). `getDensity` combines a trilinearly sampled voxel envelope,
ellipsoid falloff and animated noise. Animation translates the noise coordinates;
it does not solve a fluid velocity field. Voxel flood-fill supplies obstacle-aware
smoke occupancy. Bullet SDFs carve local holes. These are useful for grenade
interaction but do not directly solve atmospheric cloud shape or lighting.

The light march at 412–419 is hardcoded upward, and its phase calculation also
uses world up despite receiving a sun-direction uniform. The attenuation formula
at 407 multiplies thickness by accumulated density. Copying it would replace our
existing Beer integration with a different, art-directed model. Use the conceptual
separation of envelope/detail/lighting, not a direct shader port. No license file
was found in the inspected checkout; no source or assets were copied.

## Local findings and reproducible defects

Locations below refer to `engine/src/terrain/cloud-pass.ts` at `576db2b`.

1. **Confirmed quality-dependent lighting**, lines 359–364: powder uses
   `1-exp(-sigma*stepM*2)`, where stepM is camera span divided by cloudSteps.
   With density 0.5 and extinction 0.0025, a 50 m step gives 0.1175, while
   100 m gives 0.2212. The source lighting changes even before integration
   error is considered. Reproduce by evaluating this expression or comparing
   the same fixed view with cloudSteps=40 and cloudSteps=96.
2. **Confirmed truncated light integration**, lines 272–280: five taps cover
   0.6 layer thickness in world distance for current presets, irrespective
   of solar elevation or distance to the slab exit. A sample near the bottom
   of a 1600 m layer sees only 960 m toward the sun. Denser material above
   that is never evaluated. Reproduce analytically with a uniform test slab
   and compare against exp(-density * extinction * distanceToExit).
3. **Dimpling hypothesis**, lines 261–270: the shape is extruded 2D coverage
   with uniform subtractive 3D erosion of amplitude 0.4. The same cavities
   affect light sampling. `render/cloud-noise.ts:328` combines three noise
   scales into a single equalized channel; the 3000 m tile yields roughly
   750/375/188 m features. This can favor pits over broad convex lobes, but
   source inspection alone does not establish the cause of the user's image.
4. **Ambient limitation**, lines 361–364: unoccluded ground-to-zenith height
   tint cannot represent how much cloud shelters a sample from the sky.
5. **Sampling limitation**, lines 348–351: 40 steps over 60 km can be 1500 m
   apart, larger than the detail features. Per-pixel jitter has no temporal
   reconstruction. Apparent dimpling may include undersampling; increasing
   texture resolution alone will not resolve it.

## Proposed implementation sequence

1. Capture fixed baseline views below, beside, above and inside broken/scattered
   clouds, including the reported dimpled appearance. Save camera, weather,
   time, seed, quality and step count so shape and shading can be isolated.
2. Fix camera-step-dependent powder and integrate coarse density toward the
   actual sun-facing slab exit with bounded range and progressive spacing.
   Keep Beer transmittance and current solar direction. Test a uniform slab
   against its analytic optical depth and compare 40/96-step convergence.
3. Separate low-frequency 3D billow shape from fine erosion, retaining 2D
   weather coverage as the large-scale envelope. Use broad convex lobes,
   flatter cumulus bases and rounded rising tops. Protect dense interiors;
   fade fine erosion when the march footprint cannot resolve it. Preserve
   distinct stratus behavior. Keep histogram equalization for coverage;
   evaluate a bounded, non-equalized density distribution for shape/detail.
4. Add a coarse sky-occlusion estimate with a restrained multiple-scattering
   approximation: daylight tops receive direct sun and sky fill; deeper
   bases receive less light and cooler fill. Avoid a fixed white-top/black-base
   paint gradient so sunset, night and side lighting remain coherent.
5. Add slow, world-anchored domain deformation to evolve lobes while retaining
   wind advection. Shared simulation time must freeze when paused. This
   approximates rolling motion; it is not physical convection simulation.

Implement in WebGL2 fragment shaders with CPU-generated tiling 3D textures.
A theater-wide grenade voxel grid is unnecessary. A second 64-cubed R8 volume
would add 256 KiB of raw texture storage; texture fetches and nested light marches
are the performance concern. Add filtering/reconstruction only after measuring
the focused density/lighting changes.

## Acceptance and boundaries

- Compare fixed captures for scattered, broken, overcast and storm; noon,
  sunset and night; below/above/inside; half/full resolution and 40/96 steps.
- Preserve floating-origin stability, wind/shadow alignment, cirrus order,
  aircraft silhouettes, terrain depth occlusion and paused animation.
- Record matched cloud-off/on frame-time distributions at 1440p on Linux,
  rather than assuming the Unity example's performance transfers.
- Run `bun run check`, fresh desktop build and reproducible screenshot/performance
  captures. Existing shader-string/noise tests cannot prove visual quality.
- CPU `cloudDensityAt` and ground shadows currently approximate coverage before
  erosion. Keep that boundary explicit; if broad shape changes materially,
  update the shared approximation/contracts before claiming density parity.

Next reproducible step: capture the baseline matrix at `576db2b`, then implement
step-independent lighting and separate broad shape/edge erosion as an A/B experiment.
No new phase numbering or phase completion is implied.
