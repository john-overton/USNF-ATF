# F-14 flight test on this Mac

The flight test loads the locally supplied USNF '97 F-14 exterior, including
textures and separate wings. It uses the existing original assisted flight model.
Cockpit instruments, authentic F-14 performance, weapons, carrier arresting cables
and the original executable animation program are not implemented.

## Convert and install

With your locally extracted retail files and generated Ukraine terrain present:

```sh
PYTHONPATH=tools/retail python3 -m retail.sh_static extracted/usnf97/USNF_2.LIB/F14.SH --pal extracted/usnf97/USNF_2.LIB/PALETTE.PAL --out extracted/flight/f14.json
bun tools/flight/install-aircraft.ts extracted/flight/f14.json "$HOME/Library/Application Support/USNF-ATF/data"
bun run dev:electron
```

Choose **Practice runway**, **Final approach** or **Airborne practice**. This Mac's
F-14 has already been installed at that path. If using an isolated/custom profile,
pass the data root displayed in the helper window to the installer instead.
Reload the flight view after installing. Without the import, the original
procedural aircraft remains available and the helper identifies the fallback.
Malformed imports fail explicitly rather than silently claiming an F-14 loaded.

The converter's JSON and every retail-derived preview remain ignored under
`extracted/`. Installation writes `aircraft/f14.json` into user app data. No retail
model, texture or sound is committed or packaged. Conversion source hashes and
limitations are embedded in the local JSON. See [SH format findings](formats/sh.md)
for what the bounded static projection does and does not establish.

## Controls

| Key | Action |
|---|---|
| 1 / 2 / 3 / 4 / 5 | Throttle 0 / 25 / 50 / 75 / 100% |
| 6 | Full throttle with afterburner |
| W / S | Increase / decrease retained throttle |
| T | Engine on/off; selected throttle is retained |
| G / H | Toggle landing gear / arresting hook |
| F2 | Chase camera fixed relative to aircraft attitude |
| F3 | Existing chase view with world-up camera |
| Arrows / Q,E | Pitch and bank / rudder |
| B / M / R | Wheel brakes / sound mute / reset selected start |

The helper displays throttle percentage and AFT selection separately, engine/spool,
gear/hook command and extension percentage, camera mode and sound state. The
[USNF manual](https://manualmachine.com/gamespc/janesusnavyfighters/1119546-user-manual/)
confirms 5 for full military power, 6 for afterburner and G for gear. Other bindings
here follow the user's requested layout; the complete layout has not been
independently established as an exact USNF '97 keyboard-reference reproduction.

Gear/hook transitions, speed-dependent wing sweep, spool and burner effects are
original approximations. Hook movement does not provide arresting force. Safe
terrain contact requires fully extended gear. Physical controllers continue to
use the existing standard-gamepad layout; new system toggles are keyboard commands.

Flight sounds are original Web Audio synthesis: jet spool, wind, burner, moving
gear/hook and touchdown. Press a flight key or click to unlock sound, then M to
mute/unmute. Automated context/level checks do not replace human listening.

## Reproduce packaged checks

Record the actual runtime commit passed to the build, then:

```sh
bun run check
bun run harness --output extracted/flight-harness/f14-systems.json
bun run build
bun tools/flight/systems-smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit <built-commit> --aircraft extracted/flight/f14.json --out extracted/f14-systems
bun tools/flight/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit <built-commit> --aircraft extracted/flight/f14.json --scenario takeoff --out extracted/f14-takeoff
bun tools/flight/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --build-commit <built-commit> --aircraft extracted/flight/f14.json --scenario approach --out extracted/f14-approach
```

Systems smoke uses real keyboard events through the app handlers in an isolated
profile. It checks intermediate and final mesh transforms, wing sweep, engine
cutoff/restart, afterburner thrust/visibility, all throttle presets, banked F2/F3
up vectors and audio context/mute. It captures screenshots for visual inspection.
As with earlier desktop tests, focus and background throttling are controlled;
system smoke allows trusted input so Web Audio can unlock. Avoid interacting with
that test window while it runs. Linux remains deferred.
