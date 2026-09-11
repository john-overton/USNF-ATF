# Retail-derived guns — 2026-09-10

Evidence comes from locally owned USNF/ATF executables, JT records and BULLET.SH;
no retail bytes are checked in. USNF.EXE SHA256:
`ecd3eb067f624fe48ea6547e8d4b80d1232723a9b7e0113f77d0e94fcb14caf9`.
Addresses below are static USNF virtual addresses, not native execution parity.

## Projectile mechanics

PROJSpeed `0x439600` (ATF `0x485470`) selects the clamped maximum of initial speed
and integer launcher speed times launch-retard percent. It does not add an aircraft
velocity vector. Imported M61/MK12 records give initial/max 2933 ft/s, final/min
1466 ft/s. Generic movement `0x40fa60`, `0x410f99`, `0x453350`, `0x4d5539` and
`0x497260` establish axial deceleration toward final speed; decoded `_dacc` is
7 ft/s². PROJMove `0x4399ca`–`0x439a1b` separately accumulates gravity at 32 ft/s²,
caps downward speed at 80 ft/s and subtracts the fall displacement. Gun flags
select zero initial fall. Lifetime is 40 quarter-ticks (10 seconds).

PROJFire `0x43a722` reads actual-rounds-per-game at JT+0xec: two ammo units per
representative shot. Player firing `0x40abcc`–`0x40ac12` schedules gameBurstT=1
against currentT=currentTicks>>6: four projectiles/eight ammo units per second.
There is no demonstrated twofold hit-damage multiplier, so none was added.
Runtime is a 120 Hz SI adaptation, not native integer-clock execution. Existing
authored mounts, swept capsule/terrain collision and AI pursuit/burst gating remain.

## Original bullet art

USNF_2.LIB/BULLET.SH and ATF_2.LIB/BULLET.SH contain matching 295-byte CODE.
The bounded decoder handles the near branch's eight vertices and six colored
quads (three double-sided diamond planes), preserving palette attribution.
Opcode 7a at `0x4a4ebc` emits signed XYZ; 76 at `0x4a4f0c` emits a quad;
bc at `0x4a5fa8` selects palette color. Colors 188/189/191 are yellow/pale yellow.
GRAddBrentObj `0x4a355c` and do_drawobj000 `0x4a3c30` shift Q8-foot camera/object
deltas by the header value eight: one source unit is one foot (0.3048 m).
Geometry spans 45.72 m longitudinally and 1.2192 m across. Unsupported header
scales/opcodes fail closed; synthetic fixtures contain no retail asset bytes.

The renderer uses imported near geometry, not a fabricated bitmap or billboard.
Native C8 projected-size LOD and alternate line/pixel drawing remain unported.
Opcode 72 draws a line to the next vertex; 08 is the true projected point.
No native minimum-pixel inflation is established. Missing geometry uses existing
tracers; missing native parameters uses remake physics with a diagnostic note.

## Shared pipper

HUD `0x4226e0` samples previous aiming angles using SampleInit/Update/query
`0x497d70`/`0x497e00`/`0x497e50`, rather than predicting enemy movement. Native
history has 32 samples spaced 16 ticks; delay uses range/speed, with a 64-tick
(quarter-second) fallback. Both runtime modes now share angle-history sampling;
the remake adapter includes its inherited velocity and the retail adapter its
absolute launch speed/deceleration. Contacts provide range only, not velocity lead.
History interpolation, 120 Hz storage, visual-contact ranging and a small shared
gravity/drop correction are authored adaptations; the traced native HUD has no
such drop correction. This cue is not guaranteed impact prediction during arbitrary
maneuvers. Native radar ranging and complete HUD projection are not implemented.

Re-export local aircraft gun manifests to obtain optional `native` and
`bulletGeometry` blocks. Exporter retains source and palette SHA256 provenance;
generated manifests and geometry stay in ignored extracted output/user app data.
