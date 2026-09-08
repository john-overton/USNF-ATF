# OT, NT, HUD, PTS: notes

## OT: static object type

Status: **decoded** (same `OBJ_TYPE` struct as [pt.md](pt.md), nothing
else). 110 files in USNF'97, 130 in ATF Gold, `structType` 1. Buildings,
bridges, runways, radar dishes, SAM launchers as scenery. A file is the
63/64-statement `OBJ_TYPE` header, `:ot_names` (three strings: short name,
long name, own file name) and `:shape` (the `.SH` model). `weight`,
`hitPoints`, `damage[]`, `expType` and `craterSize` are the fields that
matter. `retail.pt.load_object()` reads them.

## NT: NPC type (ships, vehicles, SAM/AAA sites)

Status: **decoded**. 64 / 66 files, `structType` 3. `OBJ_TYPE` +
`NPC_TYPE` + `:hards` exactly as in a plane, minus `PLANE_TYPE` and the
envelopes, so a ship is "a plane without a flight model": its `_maxSpeed`,
`_acc`, `maxClimb` in the movement block are non-zero and drive it. The
hardpoints are the weapon mounts: `WASP.NT` has two Phalanx mounts
(`PHALANX.JT`) with `slewLimitH` 21840 (120 degrees) and `maxItems` 32767;
`T80.NT` mounts a `125MM` round. `ctName` is `dword 0` (no cockpit).
`retail.pt.load_object()` reads them; the hardpoints come back as
`Hardpoint` records.

## HUD and PTS: Win32 code modules

Status: **identified, not decoded**. Every `.HUD` (16 / 37 files) and
`.PTS` (19 / 36) is exactly 4,096 bytes and starts with `MZ` ... `This
program cannot be run in DOS mode` ... `.reloc`: a tiny Win32 PE DLL. The
strings inside are symbol and resource names, not data:

- `F14.HUD`: `hudsym`, `~f14h`, `~f14_l`, `~f14_c`, `~f14_r`, `~f14_lh`,
  `~f14_ch`, `~f14_rh`, `~f14_p`, `~f14_w`, `BRAKE`, `winfont`: the HUD
  symbol table naming the `.PIC` overlays (left/centre/right, high variants,
  pitch ladder, warning) for that cockpit.
- `A4E.PTS`: `IIA4E.PIC`, i.e. the cockpit picture set for the aircraft.

So the per-aircraft HUD and cockpit are code plug-ins that bind picture
names to engine symbols. For the remake they are a lookup table to
reproduce by hand (aircraft -> HUD `.PIC` names -> cockpit `.PIC` names),
not something to port. `.PT` names its HUD module in `hudName` (USNF'97
only); the `.PTS` name matches the `.PT` stem for the 19 flyable USNF
aircraft (`A4E`, `A7`, `A7V`, `AC130`, `AV8`, `F104`, `F14`, `F18`, `F22`,
`F4B`, `F4J`, `F8J`, `MIG17F`, `MIG21`, `MIG21F`, `SEAHAR`, `SU33`,
`YAK141`, `~MOTH`), which is the flyable list.

## Other object-type references seen in `.PT` hardpoints

`*.SEE` (sensors: `VIS340.SEE`, `F14R.SEE`), `*.ECM`, `*.GAS` (drop tanks:
`F250.GAS`), `*.BI` (cockpit definition named by `ctName`, e.g. `f.BI`).
Not yet opened; they are small and probably the same text language.
