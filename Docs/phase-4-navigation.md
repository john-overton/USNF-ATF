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

The map remains visible with the practice helper minimized. It is north-up,
with an aircraft heading marker and numbered destinations. Its MFD-style border
contains +/− zoom controls and a nautical-mile distance scale. Zoom follows the
aircraft within the theater; map controls return keyboard focus to flight.

## Terrain and color interpretation

The map uses checked local terrain chunks through the platform interface. Its
bounded overview raster comes from the coarsest installed elevation level, not
from rendered geometry or the camera's current LOD. World positions use the same
east-positive X / north-positive Z theater metres as the flight simulation;
floating-origin offsets do not enter map positioning.

Blue comes from the manifest's water polygons, with dry holes preserved.
Elevation alone never creates water. Valid land determines the regional color
scale: green → yellow → red → brown, then white at the 95th percentile. This is
elevation, not terrain clearance or threat severity. A flat region has no
artificial white peak band; ties can make the white share exceed five percent.
Missing elevation coverage is dark and excluded from destinations/statistics.

The regional map is an overview, not a surveyed landing chart. Zoom enlarges
that overview; it does not load finer terrain. Tiny waterways or narrow islands
below its sampling resolution may be omitted. Destinations are derived from the
installed dataset, so replacing the theater can change their coordinates.
Read/validation errors leave an explicit map-unavailable state and do not replace
missing data with sea-level ground or interrupt the flight model.

See [phase 4 baseline](baselines/phase-4.md) for exact tested source, destination
coordinates, local Mac results and screenshots; [handoff](handoff.md) records
remaining work. Linux testing remains deferred.
