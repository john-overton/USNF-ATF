# Phase 4 practice flight

Updated 2026-09-09: flight can now render a locally converted retail F-14.
Dynamics remain the original assisted model, not evidence of USNF handling parity. Linux testing
remains deferred. Packaged checks and repeatable measurements belong in the phase
4 baseline; headless maneuver assertions are separate evidence from flying the app.

## Viewer integration

The default app remains the terrain explorer. The links **Practice runway** and
**Final approach** opt into `?mode=flight` or
`?mode=flight&flightStart=approach`. Both use the installed Ukraine theater.
Flight mode draws the installed F-14 (or the original procedural fallback when absent) and a fictional practice strip;
it preserves the terrain renderer's floating origin and does not ship retail assets.

The fictional deck is centered at projected x289000/z392000, width100m,
length2800m, elevation111m. It is deliberately not labeled as a real or retail
airfield. Before enabling it, the adapter validates covered, dry terrain at 285
points on a 25×50m footprint grid, requires the surface below the deck by at most
10m, and loads the decoded data. This sampling is not a formal proof that every
subpixel feature is dry or below the deck. The measured development site also
has no overlapping water-body bounds in the root's independent survey. Other
theaters currently report that no validated practice strip exists; there is no
silent invented fallback runway. A real Ukraine validation using `GroundSampler`
and `preparePractice` passes in24.657ms and loads262144 decoded bytes on this Mac.

Runway start is x289000/z393250/y113.2 at rest, nose toward world−Z. Final approach
starts x289000/z394800/y240, airspeed100m/s, pitch−0.035rad, throttle20%. These are
repeatable practice starts, not an autopilot. `R` resets to the selected start.
**Airborne practice** (`?mode=flight&flightStart=airborne`) starts at 3000m,
150m/s and 20% throttle over the strip. Its airborne initialization does not count
as a takeoff. No terrain collision or flight state mutation is added to explorer mode.

`FlightLayer` connects the existing `FixedStepClock` to the pure flight model at
120Hz. Forces and state evolution remain independent of React and rendering.
The renderer interpolates the previous/current position and quaternion, then
rebases aircraft, deck and chase camera against the existing floating origin.
Frame deltas pass through the clock's backlog limit; clamped frames are counted.
F3 retains the world-up chase and its ground-height guard. F2 rotates the camera
position, target and up vector with the interpolated aircraft attitude. It keeps
a constant relative pose, including inverted flight, and therefore does not apply
the world-height guard; neither mode is a full camera collision solver.

## Ground contact and loading

`GroundSampler` has an independent8MiB decoded cache and uses the finest locally
available30m source, otherwise100m. Visual LOD switches never change its chosen
source resolution. Coarser300m+ terrain is insufficient for flight contact;
missing/outside coverage returns unavailable rather than zero elevation. Current
and projected aircraft positions prefetch contact data. Flight advancement pauses
while current/immediately predicted contact data is unavailable; already-created
terrain meshes may remain visible during that pause. Decode still verifies size,
checksum, gzip bounds and elevation ranges through the shared decoder.

Water contact uses manifest polygons with hole-aware point containment, indexed
by spatial cells. It is never inferred from negative elevation. Water is an unsafe
landing surface for this placeholder. The validated practice rectangle overrides
the contact surface with a flat up-normal at the rendered deck height. Land
normals come from source gradients. The fine/coarse source boundary itself can
still have a small filtering discrepancy; contact never reads geomorphed meshes.

## Controls and diagnostics

- ArrowDown pulls nose up; ArrowUp pushes down; left/right arrows bank.
- Q/E rudder left/right. W/S increases/decreases retained throttle at40%/second.
- 1/2/3/4/5 select 0/25/50/75/100% throttle. 6 selects full throttle with afterburner.
  Selecting 1–5 or reducing incremental throttle clears afterburner.
- T toggles the engine without changing the selected throttle. Cutoff removes
  thrust immediately; restart and sound use a two-second spool transition.
- G toggles gear; H toggles hook. Gear takes three seconds; hook takes 1.5 seconds.
  Safe touchdown requires gear at least 99% down. The hook does not arrest the
  aircraft: carrier decks/cables are not implemented.
- F2 selects attitude-locked chase; F3 selects world-up chase (the default).
- F toggles flaps; B toggles speed brakes and also applies wheel braking when
  grounded. Gamepad B retains the direct wheel-brake action. M mutes sounds.
  R resets the current practice start.
- A connected standard-mapping gamepad uses left-stick X for roll and positive
  left-stick Y (pull back) for pitch up. Right-stick X supplies rudder.
- Right/left triggers (buttons7/6) increase/decrease retained throttle at40%/second.
  B/button1 brakes. A12% rescaled axis deadzone preserves full-scale controls.
  Disconnect neutralizes axes; the current throttle setting is retained.

`window.__flightDiagnostics()` returns copied state, telemetry and controls,
`simSteps`, status/reason, position/velocity/attitude, airspeed, ground clearance,
throttle, alpha, load factor/stall, simulation time, clamped frames, contact-cache
bytes/loading, gamepad connection, takeoff/landing counters and the practice-strip
rectangle. It is read-only; automated pilots use ordinary input. The first ground
contact after a stationary spawn does not count as a landing: a ground-start
flight must first exceed2m clearance. An approach start is armed for touchdown.
`window.__terrainDiagnostics()` keeps its renderer counters and adds the same
flight snapshot for the HUD; snapshots and the React panel update at different
cadences, so read the diagnostic directly for flight automation.

The initial adapter check passes engine TypeScript and scoped ESLint; three
synthetic integration tests cover finest-source selection, missing data, bounded
cache disposal, hole-aware water contact, invalid deck rejection and axis deadzone
behavior (18 expectations). The full flight model and maneuver harness have
separate tests. No packaged takeoff/landing acceptance is implied by these checks.


Integration review follow-up: recognized key releases now clear held controls
before checking whether the event target is a form. Moving focus into an input,
select or button also clears held keys, preventing a stuck elevator/throttle while
editing the manifest. A synthetic regression reproduces release over a form.
Async `FlightLayer.create` no longer publishes global diagnostics from its
constructor: the viewer explicitly activates a layer only after accepting its
load result. A delayed-old-load/new-load regression verifies that disposing the
outdated layer cannot remove the accepted layer's diagnostics. Five adapter tests
now pass (29 expectations), with TypeScript and scoped ESLint clean. Packaged
checks must rebuild after this follow-up.

## Packaged visual integration check

The macOS arm64 package built from `49a3123` was inspected at1440p in three
independent automated-input scenarios. Ground-start screenshot
`extracted/phase4-ground-final/final.png` shows the original aircraft aligned with
the marked runway and surrounding terrain; the initial contact correctly leaves
both event counters at zero. `extracted/phase4-takeoff-final/final.png` shows the
aircraft airborne above continuous land with one takeoff recorded. The final
approach screenshot `extracted/phase4-approach-final/final.png` shows the aircraft
stopped on the runway centerline, with one landing recorded. Its final state is
x289000/z391217.614/y113.2, effectively zero velocity, brakes applied and throttle
zero: inside the fictional deck, not an off-runway ground contact.

These are desktop integration checks driven through the ordinary standard-gamepad
API, not direct state mutation. Faint pre-existing terrain patch lines remain.
The original procedural aircraft has simple fixed landing gear and no retail
artwork; visual presence and successful landing do not establish historical
handling parity. The phase 4 baseline owns exact frame times, source provenance,
input recipe and the approach run's one clamped frame. Camera/renderer and sim
snapshots update at different cadences; small HUD-versus-report differences are
expected and not evidence of a second state.

## Local F-14 and moving parts

See [F-14 setup and verification](phase-4-f14.md). The new bounded static SH
exporter recovers 186 polygons / 326 triangles at nearest detail, with textures
and separate pivoted wings. It does not execute the retail x86 animation code.
The older broad SH census/OBJ path remains partial; its historical eight-face
F-14 result is not the new export path.

Gear, hook and exhaust effects are original supplementary geometry. Wing sweep
uses the recovered wing pivots with an original speed schedule: gear down holds
wings extended, then 160–340m/s increases sweep through 0–0.7rad. Thrust gets an
original 1–1.5 afterburner multiplier over 0.4s. These timings and dynamics are
not recovered F-14 performance data. Wing animations are visual; the baseline
coefficient tables do not yet change with wing sweep or gear drag. The newer
flap and airbrake forces are explicit original additions, not recovered coefficients.

`FlightAudio.create(platform)` loads PT-selected engine loop/start/stop recordings
from appData/audio/f14.json. Without this local import, filtered-noise fallback
remains available; the previous sine oscillator was removed after the user
reported buzzing. Wind and actuator/contact noises remain original. A trusted
pointer/key gesture unlocks audio; M mutes. See [audio evidence](formats/audio.md).

The [HUD](formats/hud.md) reads aircraft instruments at30Hz. The retail HUD is
an executable module, so this is an original vector implementation informed by
its references and the manual. Control surfaces reuse partitioned retail geometry
and textures with authored hinges/mixing. Flaps and airbrakes affect the original
assisted force model; the native USNF aerodynamic integrator is still unported.
Exact present-day provenance is tabulated in [F-14 setup](phase-4-f14.md) and the
current progress entry. Earlier packaged figures retain their original source.
