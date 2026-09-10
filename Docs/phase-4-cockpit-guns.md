# Cockpit views and practice guns

The developer aircraft port now includes retail cockpit pictures and the internal
gun selected by each aircraft's PT hardpoint. This is the explicitly requested
practice-flight extension ahead of phases 5 and 6, not the in-app importer or a
complete combat implementation.

## Controls and presentation

- **F1** selects the cockpit; **F2** selects attitude-locked external view and
  **F3** horizon-up external view.
- Hold **Shift + arrows** to look around in the cockpit or orbit the aircraft
  externally. **Shift + /** centers the view. These arrows do not command pitch
  or roll; an arrow claimed for looking stays claimed until released.
- Hold **Tab** to fire. **Shift + Tab** toggles safety. Starts and resets are safe;
  release and press Tab again after changing safety. Ammunition counts actual
  individual rounds, not the original game's grouped projectiles.

The transparent cockpit frame expands to the flight viewport. Its width is
now enlarged 1.8× around the center, with full height retained, and the full HUD
fits an authored safe opening measured in each aircraft's artwork. HUD aspect
ratio is preserved. The artwork, HUD and mirror masks share the same transform
on resize and head look; side mirrors cropped in the forward view enter the
window when looking sideways. This is a flat-art cockpit, not reconstructed 3D
geometry. Side/rear cockpit geometry and working retail gauges/native HUD
execution remain unimplemented.

F14 and the A4E's shared F4 frame have three live mirrors. The exporter flood-fills
the reviewed flat mirror interiors, cuts exact alpha holes and exports bounded
RGBA masks. A single 512×256 rear scene is refreshed at 10 Hz; left/center/right
mirrors show different horizontally reflected portions. It includes the airplane,
terrain and sky. These are authored camera crops, not recovered native optics.
The rear pass reuses visible terrain and shadow maps and omits the costly
volumetric-cloud postprocess. It restores aircraft visibility and renderer state
after drawing. X31's retail frame has no visible mirrors, so none are invented.


| Aircraft | Cockpit source | Imported internal gun | Retail ammunition |
|---|---|---|---|
| F-14 | USNF97 `F14.HUD` / `~F14H.PIC` | `M61.JT`, `&FASTGUN.11K` | 675 |
| A-4E | USNF97 `A4E.PT` selects `F4.HUD` / `~F4H.PIC` | `MK12.JT`, `&SU33GUN.11K` | 400 |
| X-31 | ATF-GOLD `~F31H.PIC` | `F31.PT` selects `M61.JT`, `&FASTGUN.11K` | 740 |

The A-4E uses the game's shared F-4 cockpit, not newly invented A-4 art. Sound
filenames also need not resemble the airplane's name: the gun JT is the source
of the selection. The X-31 gun is ATF's game configuration, not evidence for
armament on the real research demonstrator. These capacities preserve retail
configuration rather than asserting a particular historical load.

## Ballistics choices and sources

Every shot starts with the aircraft's **world velocity plus the forward muzzle
velocity**, transformed by aircraft attitude. The simulation runs at 120 Hz,
including individual firing cadence and gravity. Thus forward aircraft speed
increases projectile world speed; it does not reduce muzzle-relative speed.
Rounds expire after five seconds and storage is bounded. No drag, dispersion,
recoil, terrain impacts, target collisions or damage are modeled yet.

M61 uses **1,030 m/s** and **6,000 rounds/minute**, from the
[General Dynamics M61A1/M61A2 specification](https://www.gd-ots.com/wp-content/uploads/2017/11/M6A1A1-M61A2.pdf).
The Mk 12 pair uses approximately **1,006 m/s** (3,300 ft/s); the scanned Navy
[NAVPERS 10826-B, Naval Airborne Ordnance](https://www.bulletpicker.com/pdf/NAVPERS-10826-B.pdf)
identifies this approximate velocity for ammunition used by Mk 11/Mk 12 guns.
The paired firing-rate configuration is 1,000 rpm per gun. These are authored
physical specifications, kept separate from raw JT initial/final speeds and
burst fields; they are not a claim of recovered native weapon behavior.

One round in five is rendered as a short bright tracer with a self-lit additive
glow head, visible without sunlight and without changing scene exposure. Color/cadence and muzzle
positions are authored load/presentation settings, not decoded historical belt
composition. F-14/A-4E default to red and the ATF X-31 practice belt to green;
`retail.gun --tracer-color red|green` can override the exported belt. Non-tracer rounds still consume ammunition and follow ballistics.
The gun's selected PCM is imported; looping, gain and triggering are original
Web Audio behavior. Loading a PCM buffer alone does not prove audible playback.

## Import and verification

Run the reviewed helper for each aircraft, with the local app data root shown by
the app (this Mac uses `~/Library/Application Support/USNF-ATF/data`):

```sh
bun tools/flight/port-aircraft.ts --aircraft f14 --install "$HOME/Library/Application Support/USNF-ATF/data"
bun tools/flight/port-aircraft.ts --aircraft a4e --install "$HOME/Library/Application Support/USNF-ATF/data"
bun tools/flight/port-aircraft.ts --aircraft x31 --install "$HOME/Library/Application Support/USNF-ATF/data"
```

Cockpit JSON lives at `cockpits/<id>.json`; the gun and embedded sound live at
`aircraft/<id>-gun.json`. All converted retail output stays in ignored
`extracted/` bundles and app data. Nothing is copied into `engine/public/` or
packaged application resources. Provenance and raw source fields remain in the
converted manifests.

The combined desktop smoke uses canonical `extracted/flight/<id>.json`,
`<id>-gun.json`, `audio/<id>.json` and `cockpits/<id>.json`, copying them into a
private desktop profile alongside the generated Ukraine terrain. It exercises
all three aircraft with real Electron key events and captures 1440p/720p views,
plus midnight F-14/red and X-31/green tracer runs.

```sh
bun run check
python3 -m unittest discover -s tools/retail/tests
bun run probe --fresh
bun tools/flight/cockpit-gun-smoke.ts
```

Exact measured results, source revision and limitations are recorded in
[the phase 4 baseline](baselines/phase-4.md). Linux remains deferred; Windows
launch acceptance remains phase 9. Manual cockpit familiarity and listening
acceptance are separate from parser, unit-test and desktop telemetry results.
