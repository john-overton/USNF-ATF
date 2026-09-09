# USNF97 F-14 HUD module and practice HUD

Inspected 2026-09-09 on the development Mac. This records static file evidence,
not a successful execution or reverse engineering of the native display routines.

## Retail evidence

`F14.PT` resolves its `hudName` pointer to `f14.HUD`. The locally extracted
`USNF_2.LIB/F14.HUD` is 4,096 bytes, SHA-256
`48aeb5258042d0d70db01fcf5c1bd01e98cebcfcfbe3f3855dd9053de8015724`.
It contains an MZ DOS stub, an i386 machine identifier (`0x14c`), an optional
header shaped like PE32, and `CODE` and `.reloc` sections. At the offset selected
by the DOS header's `e_lfanew`, its signature is **`PL\0\0`**, not standard
`PE\0\0`. The earlier [object-type notes](object-types.md) loosely called these
Win32 PE DLLs; this signature detail matters to any future loader/disassembler.
Do not assume an ordinary OS DLL loader can execute the file unchanged.

| Section | Virtual size | RVA | Raw size | File offset |
|---|---:|---:|---:|---:|
| CODE | 698 | 4096 | 1024 | 512 |
| .reloc | 2560 | 8192 | 2560 | 1536 |

The module contains references to F-14 cockpit picture names, `hudsym`,
`winfont`, and the annunciator strings **GEAR / FLAP / BRAKE / HOOK**.
Those four labels are directly established by the local retail module. Their
presence does not establish drawing coordinates, unit conversion routines,
warning thresholds, or animation behavior. Picture suffix interpretations in
older notes remain hypotheses until the corresponding pictures/routines are
inspected together. This is executable code plus references, not a declarative
HUD layout file to parse as JSON or a bitmap to display directly.

Reproduce the bounded inspection from the repository root:

```sh
strings extracted/usnf97/USNF_2.LIB/F14.HUD
xxd -l 432 extracted/usnf97/USNF_2.LIB/F14.HUD
shasum -a 256 extracted/usnf97/USNF_2.LIB/F14.HUD
```

All extracted files stay ignored and outside app bundles. No native code,
retail pictures, fonts or module bytes were copied into the SVG implementation.

## Runnable HUD

`engine/src/flight/FlightHud.tsx` implements an original vector flight HUD,
using the existing UI diagnostic snapshot supplied by the terrain viewer.
It does not poll simulation state, integrate dynamics, or consume input. Its
GEAR / FLAP / BRAKE / HOOK nomenclature follows the local module above.

Implemented instruments: north-referenced heading strip, attitude pitch
ladder and bank scale, aircraft datum, body-relative ground-velocity marker,
true airspeed in knots, Mach, load factor, altitude in feet MSL, terrain/gear
clearance in feet, vertical speed in feet/minute, throttle percent, afterburner,
engine state, system motion and crash/stall/missing-terrain annunciation.
Negative-pitch ladder rungs are dashed. Missing ground is shown as unavailable,
not a fabricated zero. The path marker is hidden below 5 m/s and when the
velocity points behind the aircraft; an edge-limited marker is dashed.

The heading conversion explicitly respects the engine's +Z north / -Z aircraft
nose convention: zero aircraft yaw means heading 180°, not north. Speed is
labeled **TAS**, because the current simulation supplies true airspeed rather
than instrument/calibrated airspeed. AGL presently uses the simulation's
gear-contact clearance, about 2.2 m below the reference origin, matching landing
telemetry; it is not a decoded retail radar-altimeter algorithm.

This overlay is an **aircraft attitude instrument in chase view**, identified
on screen. It stays aircraft-relative in F2 and F3 and is not a projection
through the chase camera: its horizon and velocity marker do not claim to
align with the photographed terrain. A camera-conformal cockpit HUD requires
an eye position/FOV and recovered cockpit layout. Weapon/target cues, radar,
retail HUD art/fonts, native mode logic, and exact game display parity remain
open. No fake weapon solution or target symbol is drawn.

## Verification and lessons

```sh
bun test engine/src/flight/hud.test.ts
bunx eslint engine/src/flight/hud.ts engine/src/flight/hud.test.ts engine/src/flight/FlightHud.tsx
```

Three focused tests / 51 expectations verify cardinal headings, SI conversions,
body-relative path changes during banking, reverse/slow/off-scale handling,
missing ground, and server-rendered throttle, engine/warning and system labels.
The first unit-conversion assertion incorrectly expected reference-point AGL;
it exposed the simulation's existing gear-clearance offset and was corrected
to test that actual contract. Final desktop screenshots/interactive checks
belong in the phase 4 baseline after the viewer integration is built.

The current dynamics remain original assisted dynamics. Inspecting a `.PT`
reference or using retail HUD labels does not mean the F-14's native physics or
HUD routines have been ported.
