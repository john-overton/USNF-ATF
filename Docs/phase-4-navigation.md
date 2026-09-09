# Practice navigation and regional map

This is original practice navigation over the installed Ukraine terrain, not a
port of USNF mission navigation or native HUD routines. The existing assisted
model remains the default; no flight force or fuel routines change in this pass.

## Flying the route

`[` selects the previous waypoint and `]` the next, wrapping through:

1. The fictional practice landing strip already validated by practice flight.
2. A mountain destination selected from the highest covered land in the regional map.
3. A covered land point alongside the largest mapped water body, nearest the strip.

The HUD shows the selected name, horizontal nautical-mile range and grid bearing.
The heading tape has a diamond when the bearing is in view and an edge chevron
when a turn beyond the tape is needed. Within 100 metres, guidance says ARRIVED
and hides the steering cue because bearing at the destination is undefined.
Selection is manual, not automatic sequencing or an autopilot. Reset returns to
waypoint 1. Key repeat is ignored; typing in a form never changes the waypoint.

The map is available in the terrain explorer and every practice-flight model,
including with the practice helper minimized. Its bezel has plain buttons with
adjacent on-screen function labels, a compass, +/− zoom and a nautical-mile scale.
N-UP keeps north at the top. HDG follows the aircraft's heading (the free camera's
heading in explorer); terrain, waypoints and compass rotate together. Zoom follows
the current position within the theater. Buttons return focus to movement controls.

Use the three waypoint teleport buttons to jump to the strip, mountains or coast.
The destination's terrain must load successfully before the pose changes. Explorer
moves the free camera; practice flight establishes a level airborne pose at150–250m/s,
facing inward toward the theater center. Height is at least1,000m above the finest
containing chunk's maximum elevation (and any raised water surface), not the coarse
map pixel. It is a flight-test jump, not an airfield landing or an authentic mission
mechanic. Fuel, payload, selected flight model, engine/system commands and chase view
are retained; the new airborne state restarts simulation time/interpolation. An
engine-off or empty aircraft remains unpowered. R still returns to the original
practice start and its chosen reset fuel.

An invalid, failed or superseded teleport leaves the current pose intact. Reloading
the viewer cancels pending results. Other theater maps do not invent a Ukraine
practice-strip waypoint; only destinations available in that dataset are offered.

## Terrain and color interpretation

The map uses checked local terrain chunks through the platform interface. Its
bounded overview raster comes from the coarsest installed elevation level, not
from rendered geometry or the camera's current LOD. World positions use the same
east-positive X / north-positive Z theater metres as the flight simulation;
floating-origin offsets do not enter map positioning.

Blue comes from the manifest's water polygons, with dry holes preserved.
Elevation alone never creates water. Color now uses fixed bands shared by all
theaters: green0m, yellow500m, red1500m, brown2500m, white≥3500m above mean sea
level, interpolated between stops. The MFD legend shows those heights. These are
authored visualization defaults, not a formal aviation-chart standard. Identical
heights now have identical colors across regions, so flat Ukraine stays mostly
green. This supersedes the earlier regional95th-percentile white threshold.
Negative dry terrain stays green; missing coverage is dark and excluded from
destinations/statistics. Colors indicate elevation, not clearance or threat.

The regional map is an overview, not a surveyed landing chart. Zoom enlarges
that overview; it does not load finer terrain. Tiny waterways or narrow islands
below its sampling resolution may be omitted. Destinations are derived from the
installed dataset, so replacing the theater can change their coordinates.
Read/validation errors leave an explicit map-unavailable state and do not replace
missing data with sea-level ground or interrupt the flight model.

See [phase 4 baseline](baselines/phase-4.md) for exact tested source, destination
coordinates, local Mac results and screenshots; [handoff](handoff.md) records
remaining work. Linux testing remains deferred.
