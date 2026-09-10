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
- `A4E.PTS`: `IIA4E.PIC`, a small aircraft silhouette sprite. Correction
  (2026-09-09): this is not a cockpit picture set; the earlier identification
  was incorrect. A4E.PT selects `f4.HUD`, whose `~f4h` reference selects the
  shared F-4 forward cockpit frame.

So the per-aircraft HUD and cockpit are code plug-ins that bind picture
names to engine symbols. For the remake they are a lookup table to
reproduce by hand (aircraft -> HUD `.PIC` names -> cockpit `.PIC` names),
not something to port. `.PT` names its HUD module in `hudName` (USNF'97
only); the `.PTS` name matches the `.PT` stem for the 19 flyable USNF
aircraft (`A4E`, `A7`, `A7V`, `AC130`, `AV8`, `F104`, `F14`, `F18`, `F22`,
`F4B`, `F4J`, `F8J`, `MIG17F`, `MIG21`, `MIG21F`, `SEAHAR`, `SU33`,
`YAK141`, `~MOTH`), which is the flyable list.

## Other object-type references seen in `.PT` hardpoints

`*.SEE` (sensors: `VIS340.SEE`, `F14R.SEE`), `*.ECM` (countermeasures),
`*.GAS` (drop tanks: `F250.GAS`). Correction (2026-09-09): these are no
longer unopened. All three are the same BRF text language, all three are
the shared `STORE_ITEM` shape, and all three are now decoded —
layouts, units, value tables and the hardpoint binding rules are in
[sensors.md](sensors.md). `.OT` files have no hardpoints at all; `.NT`
files reference `.JT` weapons and, in exactly two USNF'97 cases
(`GCI.NT` → `GCIR.SEE`, `BUTLER.NT` → `REDCR.SEE`), a `.SEE`.

## Correction (2026-09-09): `ctName` names the AI program, not a cockpit

This file previously described `*.BI` as a "cockpit definition named by
`ctName`". **That was wrong.** `ctName` (the second `NPC_TYPE` statement,
present in every `.PT` and `.NT`) selects the object's **AI program**.

- `.AI` is the plaintext source of a scripted behaviour language, and
  `.BI` is its compiled form: a small Win32 PE that imports the VM's
  action and sensor entry points. The two are the same program in two
  representations, not a cockpit and a code module.
- Observed distribution over all 153 `.PT` files, both discs:
  `f.BI` 105 (fighters and strike aircraft), `h.BI` 14 (helicopters),
  `large.BI` 10, `b.BI` 9 (bombers), `liner.BI` 9, `moth.BI` 3,
  `ac130.BI` 2, `f117.BI` 1. Certain; every `.PT` names exactly one.
- The behavioural reading is corroborated from the executables: the VM's
  error strings name the language, and its program-execution entry point
  is driven by six event call sites (nothing, evade, attack, radar
  launch, IR launch, hit) that are all skipped for human-flown aircraft.

The cockpit is a genuinely separate mechanism, documented in the
`.HUD` / `.PTS` section above: `.PT` names its HUD module in `hudName`
(USNF'97 only) and the HUD plug-in's symbols select the cockpit `.PIC`
overlays. Nothing in `ctName` touches the cockpit.

The AI VM itself — the language, the opcode shapes recovered so far, the
skill model, and the engine-side hardcoded skill effects — is documented
separately in [ai.md](ai.md); [pt.md](pt.md)'s `NPC_TYPE` note carries the
same correction. See also [damage.md](damage.md) for the
damage→performance arithmetic recovered from the same binaries.
