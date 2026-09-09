# Phase 4 practice flight

Initial integration, 2026-09-09. This is an original assisted placeholder aircraft,
not an imported retail aircraft or evidence of USNF handling parity. Linux testing
remains deferred. Packaged checks and repeatable measurements belong in the phase
4 baseline; headless maneuver assertions are separate evidence from flying the app.

## Viewer integration

The default app remains the terrain explorer. The links **Practice runway** and
**Final approach** opt into `?mode=flight` or
`?mode=flight&flightStart=approach`. Both use the installed Ukraine theater.
Flight mode draws an original procedural aircraft and a fictional practice strip;
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
No terrain collision or flight state mutation is added to explorer mode.

`FlightLayer` connects the existing `FixedStepClock` to the pure flight model at
120Hz. Forces and state evolution remain independent of React and rendering.
The renderer interpolates the previous/current position and quaternion, then
rebases aircraft, deck and chase camera against the existing floating origin.
Frame deltas pass through the clock's backlog limit; clamped frames are counted.
The chase camera is kept above available ground samples, but is not a full camera
collision/occlusion solver.

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
- B applies wheel brakes. R resets the current practice start.
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
