# Environment plan: day/night, wind, shadows and volumetric clouds

Written 2026-09-09 before implementation. This is a design and sequencing
document, not a status claim. Status and evidence go in [progress.md](progress.md)
and the phase baselines once work lands. Facts about the current code below were
read from the source on this date; they are not measured behavior of new work.

## Decisions (user, 2026-09-09)

1. Default startup weather: clear sky with a light surface wind.
2. Clock runs in real time by default. Time acceleration comes later. The
   helper panel gains three controls now: a time-of-day slider, a weather
   selector and a wind selector (no wind, light wind, gusts, storm).
3. Volumetric clouds ship in the first pass, behind a quality selector, and
   their cost is measured on the packaged Mac app before anything is tuned.

## Goal

Add a simulated atmosphere on top of the finished terrain and practice flight:
a theater clock with a real sun, a wind field, aircraft and cloud shadows, and
cloud layers at authored altitudes with a ray-marched cumulus layer. The frozen
assisted flight model stays byte-for-byte identical at zero wind. Rendering must
hold the measured ~60 fps at 1440p on the M3 with clouds off, and the cloud pass
is reported as its own measured cost. Today's noon look is the acceptance
reference for lighting.

## What touches the flight model

Only wind. `aerodynamics()` in `engine/src/sim/flight/index.ts` already
subtracts an optional `FlightEnvironment.wind` vector from ground velocity
before computing dynamic pressure, lift, drag, sideslip and control authority.
`FlightLayer` builds its environment with only `sampleGround`, so wind is
always zero today. All three backends (assisted, retail-envelope,
recovered-envelope) run through that same function; the envelope helpers only
supply coefficient and thrust tables. Confirm during implementation that no
backend re-derives speed from ground velocity elsewhere.

Explicitly not flight-affecting in this plan: time of day, shadows, clouds.
Density already varies with altitude. Temperature and pressure (density
altitude) are deferred. In-cloud turbulence is deferred and would be an opt-in
flag if added.

Ground handling read from the source: the on-ground branch applies rolling
friction as `min(friction, speed/dt)` along the ground tangent, and yaw rate is
scaled by tangent speed so a parked aircraft cannot weathervane. Drag from a
15 m/s wind is roughly two orders of magnitude below rolling friction, so a
parked aircraft should stay put, but that is a harness assertion, not an
assumption.

Harness cases to add (`tools/harness`):

- Zero-wind identity: `stepFlight` with `wind: {0,0,0}` and with `wind`
  omitted produce identical state for the existing scenarios.
- Parked, gear down, brakes on, 15 m/s surface wind, 60 s: position change
  below 0.05 m, finite state.
- 10 m/s headwind versus tailwind takeoff at full throttle: headwind ground
  roll shorter, both airborne at the same airspeed within 2 m/s.
- Steady 10 m/s crosswind at 150 m/s cruise: heading and ground track differ by
  the expected drift angle (about 3.8°); airspeed constant, ground speed differs.
- Gusty preset, 60 s level hold: bounded altitude excursion, finite state, no
  stall flag. The liked assisted model must not feel twitchy: the default gust
  amplitude is low and the harness records the peak load factor.

## Coordinate conventions (from the source)

**2026-09-11 Utah correction:** Salt Lake now uses a runtime input adapter with
`worldX = width - sourceX`. DEM rows, atlas columns, polygons, contact lookup,
runway and waypoints convert together, preserving the world conventions below.
Stored manifests remain east-positive. The historical defect described below
still applies to Ukraine, which is deliberately unchanged by the Utah pass.

- World `+Y` is up, `+Z` is north, `+X` is west. The aircraft points toward `−Z`
  (south) at identity, so the HUD computes heading as `180° − yaw`
  (`headingDegreesFromYaw` in `engine/src/sim/flight/index.ts`).
- Therefore east = `−X`. A compass direction `θ` (degrees clockwise from north)
  maps to the unit vector `(x: −sin θ, y: 0, z: cos θ)`.
- This is forced, not chosen. The scene is right-handed with `+Y` up, so once
  `+Z` is north the axis to the pilot's right when facing north is `−X`. A right
  bank drives `yaw` down (`stepFlight`'s turn term), so only `180° − yaw` counts
  the compass up through a right turn. Corrected 2026-09-09; the earlier
  `180° + yaw` ran the HUD tape, the map rotation and the waypoint bearings
  backwards, and disagreed with the sun this same document places.
- **Known defect, not fixed here.** The theater manifest's projection is
  east-positive in `x` and north-positive in `z` (Ukraine's `projection.originX`
  is `−280665`, which puts Crimea at `x ≈ 486 km` of a 561 km theater), and the
  renderer places both axes into the scene unchanged. Two axes cannot both be
  positive-east and positive-north in a right-handed frame, so the theater is
  drawn mirrored east to west, and the navigation map raster, built from the same
  chunks, inherits it. Everything downstream is self-consistent — the compass, the
  map marker, heading-up rotation and the sun all agree with what the pilot flies
  over — but the terrain is a mirror of the real place. Fixing it means negating
  theater `x` at every point where it enters the scene (contact sampling, chunk
  placement, water, waypoints, teleport, the floating origin and the map), and
  contact must move in exactly the same step as the visuals.
- The theater manifest projection is LAEA centered at 46.5° N, 31.5° E.
  Sun/moon use that single center; across the 560 km theater the sun direction
  differs by under 5°, which is invisible.
- Mesh positions are relative to the 8192 m snapped floating origin. Anything
  that samples a world-space field in a shader (cloud shadows, cloud march)
  receives the origin as a uniform and adds it back.

## Sim-side environment model (pure TypeScript, no Three.js)

New `engine/src/sim/environment/`:

- `solar.ts`: NOAA-style declination, equation of time, hour angle, sun
  elevation and azimuth from latitude, longitude, day of year and local mean
  solar time. Simplified moon position and phase, labeled approximate.
  Tests: summer solstice noon elevation at 46.5° N is about 67°, equinox about
  43.5°, midnight negative, noon azimuth south, morning azimuth east of south.
- `wind.ts`: presets `calm`, `light`, `gusty`, `storm` with surface speed
  (0 / 5 / 9 / 18 m/s), gust amplitude (0 / 0 / 4 / 7 m/s), an authored
  direction, a power-law profile to a gradient wind near 600 m, a blend toward an
  upper wind with direction veer by 3000 m, and a bounded sum-of-sines gust term
  varying in time and position. Deterministic given seed and time so headless
  runs repeat. `windAt(field, position, seconds)` returns a world Vec3.
- `clouds.ts`: weather presets `clear`, `scattered`, `broken`, `overcast`,
  `storm` defining layers `{ type, baseM, topM, coverage, density }`. Proposed
  authored values: scattered cumulus 1500–2600 m at 0.35; broken 1200–2800 m at
  0.6; overcast stratus 800–1400 m at 0.97; storm cumulus 700–4500 m at 0.85
  with high density; a cirrus sheet near 9000 m in every preset at 0.15–0.6.
  `cloudDensityAt(position)` evaluates the same coverage noise used by the
  renderer so later AI/radar rules and the fly-through fog agree with the picture.
- `index.ts`: `Environment` holding settings (latitude, longitude, year, day of
  year, time of day, rate, weather, wind, seed), `advance(seconds)`, `sun`,
  `moon`, `windAt`, `layers`, `season`. Season by date: Dec–Feb winter, Mar–May
  spring, Jun–Aug summer, Sep–Nov autumn, flipped south of the equator.

`FlightLayer` writes `environment.wind = windAt(state.position, simTime)` at
the start of every fixed step, using the flight clock's time so the harness and
the app evaluate the same field. Diagnostics gain `wind`, `groundSpeed`, and
the HUD gains a small `WIND ddd/ss` readout.

## Rendering

### Sky, sun and lighting

- Sky model in TypeScript: single-scattering Rayleigh plus Mie over a spherical
  atmosphere, integrated numerically into a small look-up table (about 96×48:
  view elevation × azimuth relative to the sun). Recomputed only when the sun
  moves more than about 0.25°. The same table feeds the sky shader, the fog
  color and the hemisphere light, so CPU and GPU colors cannot disagree.
- Sky mesh: an inverted sphere following the camera with a `ShaderMaterial`,
  no depth test or write, drawn first. Shader samples the table by view
  direction and adds a sun disc, a moon disc and a procedural star field faded
  by sun elevation.
- `DirectionalLight` follows the sun; below the horizon it follows the moon at
  low intensity and a cool tint. Color comes from the model's transmittance
  toward the sun, so low sun reddens on its own. Intensity is scaled so that
  local noon in summer reproduces today's `2.4` at color `0xfff0d0`.
- `AmbientLight(0xffffff, 1.7)` becomes a `HemisphereLight` with a sky color
  mixed only partly toward the table's zenith tint, keeping today's noon look,
  and a warm ground color. A small night floor (about 0.04) keeps terrain
  silhouettes readable.
- No tone mapping change: the current pipeline has none, and the shoreline
  swatches and seasonal palettes are calibrated to it. Day and night are pure
  intensity scaling.
- Fog color: Three's `Fog` is one color per frame, so it takes the table's
  horizon color in the camera's forward direction with light temporal
  smoothing. A per-direction fog patch is the follow-up if dawn/dusk shows a
  visible seam between fogged terrain and sky.
- Season: the paint mode follows the environment's season on load when the
  dataset has that color map; the manual Ground colors selector still wins.

### Shadows

- **Aircraft shadow onto terrain.** `renderer.shadowMap` on with PCF soft
  shadows and the sun light casting. The shadow camera is an orthographic box
  about ±120 m around the aircraft, aimed along the sun direction, with its far
  plane extended to the ground along that direction (capped near 20 km so very
  high altitude simply has no shadow). Only aircraft meshes cast, so the depth
  pass is a few hundred triangles. Terrain patches, water, shoreline and the
  deck receive. The terrain vertex patch rewrites `transformed`, which runs
  before Three's shadow-coordinate chunk, so morphed heights are used; bias
  still needs tuning per source LOD. The explorer has no aircraft and skips the
  depth pass entirely.
- **Cloud shadows.** A shared GLSL snippet and uniform set (coverage texture,
  layer base altitude, drift offset, sun direction, floating origin) added to
  the existing `onBeforeCompile` patches for terrain, water and shoreline, plus
  the aircraft and deck materials. It projects the fragment's world position
  along the sun direction to the cloud base plane, samples the same coverage
  texture the cloud pass uses, and scales `reflectedLight.direct*`. No extra
  passes. Terrain's `customProgramCacheKey` must be bumped.
- **Terrain self-shadowing: deferred.** Cascaded maps over 24–300 km would
  re-render terrain per cascade and are not viable at 60 fps in WebGL2 with the
  current patch counts; slope shading from normals stays. A single near cascade
  for low sun angles is a later, separately measured experiment.

### Volumetric clouds

- A `CloudPass` inserted in `TerrainAntialias`'s composer after the scene
  `RenderPass`, before `OutputPass` and FXAA. The composer's render targets get
  `DepthTexture`s (Three 0.185 clones the depth texture on `renderTarget.clone()`,
  and the read buffer alternates each frame, so both targets need one).
- Depth reconstruction: the scene uses the logarithmic depth buffer, where
  stored depth `d = log2(1 + w) / log2(far + 1)`, so view distance is
  `w = (far + 1)^d − 1`. A cleared depth of 1 means sky.
- Pass 1 renders the march at a selectable scale (full, half, quarter) into an
  RGBA8 target storing premultiplied color and transmittance. Pass 2 composites
  it over the full-resolution scene. The first version upsamples bilinearly;
  depth-aware upsampling is the follow-up if terrain edges smear.
- March: ray/slab intersection with the main layer, a fixed step count
  (default 40, uniform), per-pixel jitter, density from a 512² tiling coverage
  texture times a 64³ Perlin-Worley `Data3DTexture` (both generated on the CPU
  at startup), a height gradient, four to six light steps toward the sun with
  Beer's law and a powder term, Henyey-Greenstein phase, ambient from the sky
  table's zenith and ground colors, and the scene fog applied by distance so
  distant clouds sit in the same haze as terrain. Cirrus is an analytic sheet
  at its altitude sampled once. Camera inside the slab starts the march at the
  camera, which gives fly-through whiteout without extra code.
- Cloud drift uses the wind at layer altitude; the coverage offset is shared
  with the cloud-shadow uniforms.
- Performance controls: URL parameters `clouds=off|quarter|half|full` and
  `cloudSteps=N`, mirrored in the panel's quality selector. Diagnostics report
  the scale and step count. There is no GPU timer in WebGL2, so cost is the
  frame-time delta between `off` and each quality at the same viewpoint, plus
  the CPU submission time.

## Controls, parameters and diagnostics

- URL: `time=14.5` (hours), `date=07-15` or day of year, `weather=`, `wind=`,
  `clouds=`, `cloudSteps=`. Invalid values show the existing explicit error
  path rather than silently defaulting.
- Panel: Environment section with the time slider (0–24 h, shows HH:MM and sun
  elevation), Weather select, Wind select and Cloud quality select. Controls
  restore keyboard focus to the canvas like the MFD buttons do.
- `__terrainDiagnostics()` gains `environment`: time of day, day of year,
  season, sun/moon elevation and azimuth, weather, wind preset, wind at the
  camera, cloud quality and steps. `__flightDiagnostics()` gains `wind` and
  `groundSpeed`.

## Sequencing

Each step is a commit with tests, a packaged Mac screenshot set and fps numbers
recorded in a baseline entry.

1. Environment module: solar, wind, cloud presets, `Environment`. Wire wind
   into `FlightLayer`, HUD and diagnostics. Harness cases above.
2. Sky table, sky mesh, sun/moon light, hemisphere ambient, dynamic fog color,
   date-driven season, time/weather/wind controls and URL parameters.
   Acceptance: noon parity screenshots at the three waypoints, then dawn, dusk
   and night at the same viewpoints.
3. Aircraft shadow and cloud shadows.
4. Volumetric cloud pass with the quality selector, cirrus sheet, fly-through.
   Measure `off/quarter/half/full` at the coast and mountain waypoints at 1440p.
5. Tuning pass on whatever the measurements say: step count, resolution, light
   steps, or a depth-aware upsample.

Deferred: terrain cascaded shadows, precipitation, lightning, density altitude,
in-cloud turbulence, contrails, cockpit lighting, time acceleration.

## Risks

- Hemisphere lighting shifting the calibrated ground, water and shoreline
  colors; noon parity screenshots are the guard.
- Shadow acne or detachment on morphing terrain patches; bias per source LOD.
- Cloud march noise at half and quarter resolution without temporal
  reprojection; the jitter amplitude is a uniform so it can be reduced.
- Fog as a single color versus a sky that varies with azimuth; visible mostly
  at low sun.
- A second full-screen sky draw plus the cloud target at 1440p; both measured,
  and `clouds=off` keeps today's cost.
- Gusts interacting with the assisted authority curve near stall; harness
  records peak load factor and stall flags.
