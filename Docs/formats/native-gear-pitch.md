# 2026-09-09 ground/gear pitch investigation

Native EXE SHA256 ecd3eb067f624fe48ea6547e8d4b80d1232723a9b7e0113f77d0e94fcb14caf9.
Names resolved from local USNF.SMS through extracted/native-flight/symbols.json.
No app physics changed for this research.

## Verified formula

_FMUpdateGearPitch@0 0x42fd40:
- Requires cp.flags at 0x4d5253 bit0x40 and _OnTheGround@0 true.
- @TakeoffSpeed@0 0x483030 selects native G=1 envelope and returns its FIRST speed uint16 (entry+8), not an altitude interpolation. F14 value170 ft/s.
- Let top=takeoffSpeed, low=top-(top>>2), v=clamp(speedF8>>8,low,top).
- target=wrap16(trunc((top-v)*wrap16(gearPitch*182)/(top-low))) if gated and top!=low; else0.
- gearPitch int16 at 0x4d5608: PLANE_TYPE base0x4d5582+0x86. env+4 and thrust+0x95 independently match previously mapped addresses.
- Local F14.PT gearPitch=0. This helper cannot supply a nonzero F14 takeoff pitch bias with that field.
- Target at0x4d52ec; current at0x4d52ea slews using @TurnTowardAngle@12 0x497210, maximum angle step abs(trunc(deltaTicks*1820/256)), signed16 wrapped target-current difference. deltaTicks signed16 at0x521658.
- Gear offset decreases to zero over ~75–100% takeoff speed, rather than growing nose-up with speed.

## Native execution evidence

tools/native/gear-pitch-oracle.py: 1000 gear cases and21 ground cases matched actual x86, including zero/negative dt, wrapped angles, speed bounds, disabled flag, terrain threshold and F14 zero field.
ONLY _T_Info@24 0x408120 replaced with explicit synthetic terrain height/orientation fixture. _OnTheGround, TakeoffSpeed, GearPitch, TurnTowardAngle, GetGround and angle conversions run actual executable instructions. Therefore conditional isolated-routine verification, not full native flight or terrain fidelity.
Output extracted/native-flight/gear-pitch-oracle.json, no binary bytes emitted.

_OnTheGround 0x4971d0 uses _T_Info height+256 >= cp.position.yF8, including equality (synthetic boundaries verified).
_GetGround@0 0x46a940 stores that predicate at0x52de20, obtains terrain orientation through_T_Info, then calls @PAToF24@4 0x499618 on returned terrain pitch and stores _groundPitch at0x52ddb8.
Conversion observed exactly trunc((signed16(pitchAngle)*1406+500)/1000), including negative rounding asymmetry. Terrain height stored0x52dddc.
_CheckLanding@0 0x4792b0 reads _groundPitch to settle/limit pitch relative to terrain slope. No takeoff-trim semantics established from that name.

## Consumers of gear current angle

- _HUDDraw@0 0x4208d0: instructions420ad2–420ae7 add currentgear0x4d52ea +additional0x4d52ee +baseorientationpitch0x4d5103 to a local target angle.
- _T_AddYourObjs@0 0x404480: instructions4045e5–4045f8 add object+0x206(currentgear) and+0x20a(additional) to a LOCAL copied orientation pitch before submitting draw objects. Base orientation copied from object+0x1d at40457c–404591.
- View helper starting492110: instructions492149–492157 add same object-relative fields to LOCAL copied orientation pitch. SMS nearest preceding _VIEWSlew@12 4920a0; do not mislabel stripped492110 as exactly VIEWSlew entry.
- No direct absolute references togearcurrent in force integration found. Indirect arbitrary pointer aliasing not exhaustively proven absent. Positive evidence supports model/HUD/view orientation offset, not an aerodynamic elevator/trim force.
- _FMInitPlane@8 430120 calls GearPitch then immediately copies target tocurrent at430284–43028b.
- PLANEMoveProc4854d0 writes additional0x4d52ee in false-argument branch only if PLANE_TYPE.flags bit0x8 and cp statebyte0x4d51c7 nonzero. Arithmetic approximates negative15degrees times speed/maxSpeed. Local F14 flags0x57 does NOT have bit0x8, so this particular additional angle writes0. Interpretation of that other-aircraft flag remains unknown.

## Manual / conclusions / next

Manual lines2995–3030 F14B tutorial explicitly catapult launch: extendflaps, press6 AB, then gearup, flapsup at200kt. It does not establish runway takeoff trim. No occurrence of literal trim found in local OCR.
Conclusion: no evidence here for automatic F14 runway nose-up/elevator bias. Do not integrate invented native trim. User's real-world trim question not resolved by these routines.
Next bounded native trace: actual pitch/control update in _FMMove/longitudinal rotation before CheckLanding, cp pitch0x4d5277 and pitch-rate0x4d526f writers, PT lowAOASpeed/lowAOAPitch and gpullAOA consumers. These remain unmapped here.

## Reproduce the isolated native check

Tool source: `29a4765`. Python compilation and diff checks pass. The existing
isolated Unicorn environment is reused; no runtime app dependency was added.

```sh
PYTHONPATH=tools/native:tools/retail extracted/native-flight/.venv/bin/python tools/native/gear-pitch-oracle.py --exe extracted/usnf97/SETUP.ESA/USNF.EXE --pt extracted/usnf97/USNF_2.LIB/F14.PT --out extracted/native-flight/gear-pitch-oracle.json
```

Keep the output ignored. This finding does not establish the real Tomcat's
stabilator takeoff-trim settings or exclude every other native longitudinal-control
path. It specifically identifies these gear/terrain-pitch routines and their
observed display consumers. No recovered takeoff-trim bias was added to the app.
