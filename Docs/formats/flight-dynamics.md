# USNF97 F-14 flight parameters and fidelity boundary

Research date: 2026-09-09, macOS Apple Silicon. Source: this user's locally
extracted `USNF_2.LIB/F14.PT`, decoded by `retail.pt`. The file identifies itself
as **F-14B Tomcat**. Earlier documentation comparing some numbers to F-14A book
figures does not override the game's own identity. No retail executable was run.

The previously displayed F-14 used the original trainer's 9,000 kg mass, 70 kN
sea-level military thrust and original drag tables. Its afterburner multiplier
was 1.5. Importing an exterior and sound samples did **not** import flight dynamics.
A roughly 600 kt ceiling in that implementation is therefore not evidence of
USNF97 behavior. The exact source and package of a measured flight still matter.

## 2026-09-09 correction: flap camber is not the entire maximum-lift increment

Source50d2ec4 changes only the experimental hybrid polar/trim, not the preserved
assisted model or recovered x86 helpers. The old approximation used the entire
native flap stall-speed benefit as a constant zero-AoA lift offset. Neutral trim
then countered that lift with strongly negative AoA: recovered flat-ground
full-flaps/AB t15s bodypitch−5.26°, flightpath+1.29°, AoA−6.55°.

The revised authored approximation keeps the same maximum lift at positive stall
alpha (and native1G flapped speed ratio), but separates camber from that maximum:
PT `flapsLift`51/256 is treated as an absolute zero-alpha CL offset≈0.199, bounded
by total flap gain. The remaining gain increases along the positive-alpha branch,
then fades in separated flow. Trim solves that same piecewise polar. This is an
inference for the browser hybrid, **not** a recovered PT-to-force interpretation
or Tomcat pitching-moment/trim schedule. Clean forces and imported device drag
remain unchanged.

Negative pitch or AoA is not independently proof of bad physics. Flaps may create
a nose-down wing pitching moment, while the whole-aircraft response also depends
on tail/downwash/trim. See [FAA Use of Flaps](https://www.faasafety.gov/files/gslac/courses/content/35/376/Use%20of%20Flaps.pdf).
Our current attitude augmentation is a1G-AoA controller, not such a moment model.
Do not add automatic nose-up rotation merely to make the image look familiar.

`tools/harness/flap-attitude.ts` records full-flaps/AB with neutral pitch/roll/yaw
in all3backends plus airborne flap deployment. Fixed full-fuel mass, flat110m
terrain, instantaneous actuator/thrust settings; not packaged fuel/spool behavior.
Normal pilot rotation is tested separately. Tiny negative AoA at excessive speed
is allowed. Actual runtime observations and exact source attribution live in the
[phase4baseline](../baselines/phase-4.md). The local manual's F14training takeoff
is a catapult launch, not evidence of an automatic runway takeoff trim schedule.
Native `_FMUpdateGearPitch` and `_groundPitch` were subsequently traced and
verified in1,021isolated x86 cases: the former produces a display gear-angle offset
(F14PTvaluezero), the latter terrain slope. They do not establish an automatic
F14takeoff-trim force. See[native-gear-pitch.md](native-gear-pitch.md); no guessed
nose-up bias was integrated.

## Confirmed data and unit assumptions

Names in USNF97 are mapped by the existing parser's strict statement-kind
alignment to the labelled ATF Gold sibling. USNF97 and ATF Gold values must remain
separate: they differ even when the field layout matches.

| Property | USNF97 F-14 | Interpretation |
|---|---:|---|
| Empty weight | 40,104 | Pounds, strongly corroborated across aircraft |
| Internal fuel capacity | 15,741 | Pounds, strongly corroborated |
| Maximum takeoff weight | 74,349 | Pounds, strongly corroborated |
| Military thrust | 28,435 | lbf, all engines combined |
| Afterburning thrust | 41,800 | lbf, all engines combined |
| Engine count | 2 | Explicit field; do not multiply the total thrust again |
| G-envelope rows | -4 through 9 | Fourteen integer-G polygons |
| Flap / gear drag | 153 / 153 | Probable 8.8 fixed-point modifier; exact application unknown |
| Airbrake / wheel-brake drag | 320 / 10 | Same semantic uncertainty |
| Base / G-pull drag | 256 / 17 | Same semantic uncertainty |
| Flap lift | 51 | Probable 8.8 fixed-point modifier |
| Fuel consumption military / AB | 2 / 10 | Probable lb/s; throttle scaling unknown |
| Throttle acceleration / deceleration | 40 / 60 | Units and runtime law unknown |
| Stall warning / stall delay | 512 / 768 | Fixed-point timing plausible, not established |
| Stall severity / pitch-down | 256 / 30 | Field identity established; runtime use unknown |

Exact conversions used by the exporter: 1 lb = 0.45359237 kg,
1 lbf = 4.4482216152605 N, 1 ft = 0.3048 m. Empty mass becomes
18,190.86840648 kg, empty plus full internal fuel 25,330.86590265 kg;
military thrust is 126,485.18162993231 N and AB thrust 185,935.6635178889 N.
The AB/military ratio is approximately 1.470019. A fuel fraction is a selected
scenario condition, not something recoverable from the aircraft's capacity.

The named `_bv`, `_brv`, rudder and spin fields are exported raw with unknown
units. They should not be silently treated as SI limits or as recovered handling
laws. Crash forward/side/vertical fields are 330/51/95; interpreting them as ft/s
is plausible, but using them directly as landing thresholds needs native-code
confirmation. These are notably different from the remake's safety thresholds.

## Envelope geometry

Only the first `count` points of each twenty-slot block are meaningful. Keep
closed polygon semantics and duplicate points; do not mistake unused slots for
valid envelope vertices. Speeds are strongly corroborated as ft/s and altitudes
as feet. The interpretation as sustained-G envelopes is well supported by the
G labels, polygons and design-area comments, but their use inside the executable
has not yet been recovered.

Horizontal intersections of the **1 G** polygon give:

| Altitude | Minimum speed | Maximum speed |
|---|---:|---:|
| Sea level | 100.722 kt | 799.853 kt |
| 3,000 m (practice start) | 129.880 kt | 858.168 kt |
| 18,000 ft | 155.641 kt | 906.500 kt |
| 36,000 ft | 239.318 kt | 1,344.938 kt |
| 50,000 ft | 350.158 kt | 1,182.005 kt |
| 56,000 ft | 515.461 kt | 515.461 kt (polygon tip) |

These are geometric data bounds, **not measured retail simulator maximum
speeds**. Whether the original assumes a particular load/fuel/thrust setting
for the envelope remains unknown. A calibrated remake can explicitly choose a
clean afterburning reference condition; that choice does not establish parity.
True versus indicated airspeed and altitude must be stated when comparing a
600 kt HUD reading to these bounds.

The header fields named `stallLift` and `maxSpeed` contain small index-like values
(e.g. 5 and 8 for 1 G), not physical lift or velocity. Derive physical speed
bounds from the polygon; do not use the header's `maxSpeed` as a speed limit.
The -4, 8 and 9 G rows have nearly degenerate, duplicated-point shapes close to
sea level. Their design comments round the relative areas to zero. Treating
`envMax = 9` as unrestricted sustained 9 G everywhere would discard the data.
The existing Python `Envelope.vmax_at()` uses a nearest-vertex altitude tolerance,
not polygon intersection, and is unsuitable for arbitrary-altitude calibration.

**Corrections to the older [PT notes](pt.md):** the table's device values
20/320/40/76/23 are the ATF sibling values, not USNF97's 17/320/10/153/153.
The USNF97 1 G lower sea-level vertex is **170 ft/s**, not 230; 230 appears in
the 2 G and -1 G rows. Its maximum 2,270 ft/s vertex is at **36,000 ft**, not
34,000 ft. The 34,000 ft point belongs to another G row. The older statement
that the table *is* the entire aerodynamic model overstates what static data
establishes: thrust, stall, device, load and control fields also exist.

## Native code availability

The local `USNF.EXE` is PE32 x86. Its COFF symbol table pointer and count are
both zero. Strings include an old `D:\\usnf95\\Release\\USNF.pdb` path and network
source filenames, but the installer ESA lists no `.pdb`, `.map`, `.c`, `.cpp` or
`.h` payload. A debug pathname is not available source code. The PT symbol
`_PLANEProc` names the native update routine; this investigation has not located
or reconstructed its force/control implementation. Aircraft PTS/HUD modules do
not provide the entire flight solver. Faithful native runtime reproduction needs
further disassembly and/or comparative retail execution, not an unsupported claim
that parameter importing completes it.

## Reproducible local export

```sh
PYTHONPATH=tools/retail python3 -m retail.flight --pt extracted/usnf97/USNF_2.LIB/F14.PT --out extracted/flight/aircraft/f14-flight.json
python3 -m unittest discover -s tools/retail/tests -p test_flight.py
```

Schema version 1 contains `source {game,file,sha256}`, `name`, SI mass/capacity/
thrust scalars, all fourteen `envelopes [{g,points:[{speedMps,altitudeM}]}]`,
and `rawFields {name:{value,unit,confidence}}`. The converter requires the
unlabelled F14.PT variant, typeSize 632 and -4..9 rows; it refuses the ATF variant.
This is a bounded local export, not general media detection. Hash provenance
identifies the actual input. Converted data goes to appData at installation;
it must never enter the repo or public packaged assets.

Four synthetic tests pass: exact conversion and point counts, source-variant
rejection, invalid/missing rows and coordinates, duplicate preservation. Actual
local export succeeds with fourteen rows. Full raw research output and computed
horizontal intersections are ignored at `extracted/flight/f14-dynamics-research.json`;
the textual reader dump is `extracted/flight/f14-pt-research.txt`.

## Defensible implementation scope

Import the identified mass, fuel, thrust and envelope data; retain the original
120 Hz solver as a clearly labelled envelope-calibrated approximation. State the
reference fuel/load/device/thrust condition. Calibrate level equilibrium across
several altitudes against horizontal polygon intersections, then separately
verify sustained turns, acceleration, glide, stalls, and drag/lift devices.
Do not impose a hard airspeed clamp: thrust/drag balance should produce level
limits while gravity still accelerates a dive. Do not overwrite raw uncertain
fields with guessed SI interpretations. Native timing, transients, post-stall
behavior and damage/load effects remain parity work even after these tests pass.
