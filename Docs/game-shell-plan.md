# Game shell plan: main menu, modes, quick fight and loadout

Written 2026-09-10. Companion to [build-plan.md](build-plan.md), which still owns
phase numbering and exit criteria. This document covers the piece the build plan
never sequenced: the **shell around the simulation** — the screens a player moves
through before and after a flight, and the parameter object that ties them to the
sim. It also states what "mocked" means for the quick fight, so nothing here is
mistaken for the phase 6/7 combat deliverable.

Scope requested: main menu; terrain explorer as an explicit mode rather than the
default; a mocked quick fight with three aircraft; a pre-mission loadout screen
with adjustable fuel and stores; reuse of the original menu artwork, layouts and
sounds; UI and tests throughout.

---

## 1. Where the code actually is today

The app has no notion of a screen. `engine/src/main.tsx:7-13` mounts `App`, and
`engine/src/ui/App.tsx:5-9` contains the entire routing story: `?view=probe`
renders `RendererProbe`, anything else renders `TerrainViewer`. There is no
router and no router dependency (`engine/package.json` lists only react,
react-dom, three).

Everything that configures a session is read imperatively from
`window.location.search`, in seven separate places, and every mode change is a
full page reload:

| Parameter | Read at |
|---|---|
| `view` | `ui/App.tsx:5` |
| `mode`, `root`, `manifest` | `ui/TerrainViewer.tsx:21-24`, `terrain/viewer.ts:174` |
| `time`, `date`, `weather`, `wind`, `clouds`, `cloudSteps` | `sim/environment/index.ts:168-200` |
| `contrast`, `paint`, camera `x/z/y/yaw/pitch` | `terrain/viewer.ts:203,476,510`, `terrain/camera.ts:5-30` |
| `flightStart` | `flight/FlightLayer.ts:142-145` |
| `aircraft` | `flight/FlightLayer.ts:187` |
| `flightModel`, `flightFuel`, `flightPayload` | `flight/FlightLayer.ts:223-241` |

`TerrainViewer.tsx:370-379`, `:393-399` and `:446-453` change a parameter by
building a new `URL` and calling `window.location.assign`, which tears the
viewer down and rebuilds it. `FlightLayer.create(scene, manifest, platform, root,
folder)` (`flight/FlightLayer.ts:174-206`) takes no session parameters at all;
its private constructor reads them from the query itself.

Two other facts shape everything below.

**The 120 Hz loop is already correctly isolated.** `FixedStepClock`
(`sim/FixedStepClock.ts:26-95`) is driven from `FlightLayer.advance`
(`FlightLayer.ts:507-591`), inside a plain `requestAnimationFrame` chain owned by
`terrain/viewer.ts:684-882`. React receives only a diagnostics snapshot, throttled
to 30 Hz in flight (`viewer.ts:876-879`) and 2 Hz otherwise (`:867-875`).
Render smoothing is `FlightLayer.pose()` interpolation (`:609-630`), not React.
Nothing in this plan may weaken that; menus are pure React because they have no
viewer, and the explorer already runs the same frame loop with `flight ===
undefined` (`viewer.ts:699-717`).

**Thirteen Electron smoke scripts deep-link into the current query parameters and
assert on specific DOM selectors.** `tools/flight/desktop.ts:22-48` spawns a real
Electron binary and `tools/flight/smoke.ts:33-40` passes `query: Record<string,
string>` straight into the URL. The load-bearing selectors are `#terrain-canvas`,
`#terrain-manifest`, `#terrain-root`, `#terrain-load`, `#terrain-paint`,
`#aircraft-selector` (asserted to have exactly three options),
`#flight-model-selector`, `[aria-label="Minimize practice flight panel"]`,
`[data-flight-hud]`, `[data-hud-pitch]`, `[data-hud="waypoint"]`,
`[data-terrain-map]` and its siblings, `[data-cockpit-overlay]`,
`[data-gun-sight-overlay]`, `[data-gun-range-arc]`, and the `Mfd` bezel
`aria-label`s. **A menu placed in front of `TerrainViewer` breaks all of them
unless deep-linking survives.** It must survive: the URL stays the
machine-facing entry point while the menu becomes the human-facing default.

---

## 2. What the retail media gives us

Verified locally on 2026-09-10 against the extracted USNF'97 tree. Two of these
findings correct [formats/README.md](formats/README.md), which currently lists
`MNU`/`LAY`/`DLG` as one row of "unknown — UI".

### 2.1 `.MNU` and `.DLG` are declarative widget tables

They are not text and not the BRF language, but they are **data-only** Phar Lap
`PL\0\0` images of the same family already documented for `.FNT`
([formats/fnt.md](formats/fnt.md)) and `.HUD`. The `CODE` section holds a fixed
38-byte record array; the only x86 present is six-byte `jmp [IAT]` import thunks.
Imports resolve against `main.dll` — which, as [formats/ai.md](formats/ai.md)
established for the AI plug-ins, is the host executable's own symbol table, not a
file — and name the widget class directly: `_DrawAction`, `_DrawText`,
`_DrawRocker`, `_DrawDial`, `_DrawListBox`, `_DrawEditBox`, `_DrawCheck`,
`_DrawSliderVert`, `_DrawToggle`, `_DrawLight`, `_DrawFormattedText`,
`_DrawMissList`, `_DrawCampaignList`.

Layout recovered and independently re-verified for `CHOOSEAC.DLG`:

- Header at `CODE+0x04`: `x=379 y=80 w=238 h=361`.
- Records begin at `CODE+0x15`, stride `0x26` (38). Fields: draw-function
  pointer at `+0x00`, `x` at `+0x04`, `y` at `+0x06`, command id at `+0x11`,
  `width` at `+0x12`, label pointer at `+0x14` to inline NUL-terminated ASCII.
- Eight `_DrawAction` widgets at `x=31`, `w=180`, `y = 24, 56, 88, 120, 170,
  202, 234, 285`, labelled *Play Single Mission*, *Create Quick Mission*,
  *Create Pro Mission*, *Replay Last Mission*, *Start New Campaign*, *Continue
  Old Campaign*, *View Pilot Records*, *Reference*.

That rect and those `y` gaps match the already-converted `CHOOSEAC.png`
(640×480) pixel for pixel, including the break between the mission group and the
campaign group. **The original main menu is recoverable as data, not
re-drawn by eye.** The same holds for `LOADORD.DLG` — dialog `(115, 356, 470,
102)`, two dials, two rockers, `_DrawAction` "Fly" and "Select Plane" — and for
the 24-page quick-mission wizard (`QUIKMISS.DLG`, 62 widgets, plus
`QUICKB3..QUICKB25.DLG` and `QUICK14.DLG`).

`.MNU` files are the same container holding menu-bar trees (inline label plus
accelerator, e.g. `"Exit to Windows"` / `"Alt-F4"`), linked by relocated
next-pointers. Their submenu and flag bytes are **not** fully pinned; the widget
record above is.

### 2.2 `.LAY` is not UI at all

`DAY1.LAY`, `DAY2.LAY`, `CLOUD1.LAY`, `FOG1.LAY` and their `V` variants
reference `wave1.SH` and `ocean*06.PIC`. They are sky and sea layer plug-ins —
what [formats/mission.md](formats/mission.md)'s `layer day2.LAY 3` key selects.
There are no UI `.LAY` files. The formats index needs correcting.

### 2.3 Art, chrome and fonts already convert

`tools/retail/retail/pic.py` already decodes every `.PIC` on both discs, and
`extracted/png/` already holds 4,162 converted images. Present and usable:

- Full-screen 640×480 backgrounds: `CHOOSEAC`, `QUIKMISS`, `CAMPAIGN`,
  `SHWPILOT`, `SNGLMIS1..4`, `BRIEFSC1/3`, `DEBSC1/3`, and the ordnance screens
  `ORD_KITT`, `ORD_NIMZ`, `ORD_WASP`.
- Widget chrome as nine-slice sprites: `ACTION0L/M/R` … `ACTION3L/M/R` (four
  states), `ACTIOD*` disabled, `ACTDFLT` default, `ROCKER00..04`,
  `DIAL00..DIAL15`, `CHECK00..06`, `TOGGLE00..04`, the `SLIDE*` set,
  `LISTLFT/MID/RT/HI`, `EDITL/M/R`, `EDGE*` frame edges, `SHAD*` drop shadows,
  `MOUSEPTR`.
- Proportional UI fonts as glyph strips with a 256-entry `(x, width, height)`
  table ([formats/pic.md](formats/pic.md)): `MENUFONT`, `LRGFONT`, `SMLFONT`,
  `HEADFONT`, `BODYFONT`, `BOLDFONT`, and for the loadout screen specifically
  `ARMFONT` plus `FNTWPNB`/`FNTWPNY` for weapon labels.
- Store icons: 61 `$*.PIC` sprites at 105×19, named 1:1 after the `.JT`/`.GAS`
  stores — `$AIM54C`, `$AIM9M`, `$AIM120`, `$M61`, `$F250`, `$MK82`, and
  `$NOPIC` for an empty station. Aircraft side views as `II<id>.PIC`.

### 2.4 UI sounds

Headerless unsigned 8-bit mono PCM, rate by extension
([formats/audio.md](formats/audio.md)). The `&`-prefixed set in `USNF_2.LIB` is
the menu bank: `&CLICK.11K`, `&BUTTON.11K` and `&BUTTON1..5.11K`,
`&KEYPRSS.5K`, `&TOGGLE1.5K`, `&DEFAULT.5K`, `&SQACK1/2.5K` for rejection, and
for the loadout screen `&ARMWPN.5K` (mounting a store), `&ARMBLLT.5K` (loading
rounds) and `&ARMDRIP.11K` (fuelling). All are under 4 KB.

### 2.5 Loadout data

Stations come from `.PT` `:hards` and are already parsed by
`tools/retail/retail/pt.py:64,104,226-238`. The F-14 has eight, of which three
are sensor/ECM slots identified by `flags` bit `$0008` with `maxWeight 0` and
`maxItems 1` (460 of 465 such hardpoints across all 153 `.PT` files, per
[formats/sensors.md](formats/sensors.md)) and must be filtered out of the
player-facing list. The remaining five carry `M61.JT` (675 rounds),
`AIM54C.JT` (4), `F250.GAS` (2), `AIM120.JT` (4), `AIM9M.JT` (2).

Weapons are decoded ([formats/jt.md](formats/jt.md), `tools/retail/retail/jt.py`)
with launch weight in pounds and `projsInPod` rounds per store. Drop tanks are
five-statement plain text: `F250.GAS` carries `weight 198` lb empty and `fuel
1650` lb, which is exactly 250 US gallons at 6.6 lb/gal — the unit is confirmed.
Internal fuel is `PLANE_TYPE.internalFuel` in pounds (F-14: 15,741).

**Two things are missing and they bound what v1 can honestly offer.** The
hardpoint `flags` word is the per-station compatibility mask (`$1f5`, `$605`,
`$7f5`, `$485` …) and its bit meanings are **not** decoded; `ARMPLANE.MNU`'s own
menu item *"Cheat (load anything anywhere)"* proves the original enforces a rule
we cannot yet reproduce. `maxWeight` is a byte (40 for a 985 lb AIM-54, 5 for an
AIM-9M) and is a rack or pylon class, not pounds. Section 6 says what v1 does
about that.

---

## 3. Decisions

| Decision | Choice | Why |
|---|---|---|
| Routing | A `Screen` union in React state, no dependency | AGENTS.md forbids new dependencies without concrete need; five screens do not need a router |
| Session configuration | One `MissionParams` object, with the URL as one *serializer* | Kills seven scattered `location.search` reads and keeps all 13 smoke scripts deep-linking |
| Mode changes | In-app state transition, not `location.assign` | A reload cannot carry a loadout, and reloading to leave a menu is visibly wrong |
| Retail menu assets | Optional bundle in **appData**, written by a porter | Exactly the `appData/aircraft/f14.json` pattern; AGENTS.md forbids retail bytes in the repo or `engine/public/` |
| Fallback when no disc | Original chrome, same layout constants | The app must still run without retail media, as it does today |
| Menu components | Prop-driven and effect-free | `renderToStaticMarkup` is the only React test tool in the repo (`ui/mfd.test.ts`, `flight/hud.test.ts`); effects are untestable here |
| Quick fight in this plan | **Mocked**: real screen, real params, placeholder opponents | The AI VM is not yet bound to aircraft state; calling this "combat" would misreport phase 6/7 |
| Aircraft offered | `f14`, `a4e`, `x31` | The three with imported geometry, cockpit, audio and gun (`flight/aircraft-catalog.ts:3-13`) |
| Theater | Ukraine only | `flight/practice.ts:29-33` throws for any other manifest id |

---

## 4. Architecture

### 4.1 `MissionParams`, the spine

New `engine/src/sim/mission/params.ts`, pure, no DOM:

```ts
export type GameMode = 'explorer' | 'free-flight' | 'quick-fight';
export type FlightStart = 'runway' | 'approach' | 'airborne';

export interface MissionParams {
  mode: GameMode;
  theater: string;                    // 'ukraine'
  aircraft: AircraftId;               // 'f14' | 'a4e' | 'x31'
  flightModel: FlightModelId;         // assisted | retail-envelope | recovered-envelope
  start: FlightStart;
  loadout: Loadout;                   // section 6
  environment: EnvironmentParams;     // time, date, weather, wind, clouds
  opponents: OpponentSlot[];          // empty except in quick fight
  seed: number;                       // deterministic RNG for AI and spawns
}

export const DEFAULT_MISSION: MissionParams;
export function parseMissionQuery(search: string): MissionParams;   // tolerant, clamps
export function missionQuery(params: MissionParams): URLSearchParams; // round-trips
export function validateMission(params: MissionParams): string[];     // human-readable problems
```

`parseMissionQuery` must accept every parameter name the smoke scripts already
pass (`mode`, `aircraft`, `flightStart`, `flightModel`, `flightFuel`,
`flightPayload`, `time`, `weather`, `wind`, `clouds`, `paint`, `contrast`,
`root`, `manifest`, camera keys) so no smoke script changes. New keys are added
alongside, never renamed.

Then delete the reads at `FlightLayer.ts:142-145,187,223-241` and thread the
object instead:

```ts
static async create(scene, manifest, platform, root, folder,
                    mission: MissionParams): Promise<FlightLayer>
```

and correspondingly `startTerrainViewer(canvas, platform, root, manifestPath,
update, mission)` in `terrain/viewer.ts:156-173`. `sim/environment/index.ts:168`
keeps its parser but gains a pure entry taking `EnvironmentParams`.

This is the single highest-value refactor here: it is what makes a loadout screen
possible at all, because a loadout cannot be expressed as a URL the user typed.

### 4.2 Screen state machine

`engine/src/ui/Shell.tsx` replaces the body of `App.tsx`:

```
main-menu ──▶ explorer ────────────────▶ main-menu        (Esc)
     │
     ├──▶ aircraft-select ──▶ loadout ──▶ flight ──▶ debrief ──▶ main-menu
     │                            ▲          │
     │                            └──────────┘  (Fly / Select Plane, per LOADORD.DLG)
     └──▶ probe                                    (?view=probe, unchanged)
```

State is `{ screen: Screen; mission: MissionParams }` in one reducer. Transitions
are pure functions in `engine/src/ui/menu/navigation.ts` so they are unit
testable without rendering anything:

```ts
export type Screen = 'main-menu' | 'explorer' | 'aircraft-select'
                   | 'loadout' | 'flight' | 'debrief' | 'probe';
export function initialScreen(search: string): Screen;   // deep-link wins
export function nextScreen(screen: Screen, action: MenuAction, mission: MissionParams): Screen;
```

`initialScreen` returns `flight` for `?mode=flight`, `explorer` for
`?mode=explore`, `probe` for `?view=probe`, and `main-menu` only when no mode is
given. That one line is what keeps every existing smoke script green.

`TerrainViewer` stays the WebGL host and is mounted by both `explorer` and
`flight`; it stops owning mode decisions and takes `mission` as a prop. Its
existing debug panel remains, unchanged, including `#aircraft-selector` and
`#flight-model-selector`, because `aircraft-smoke.ts:27,34,52,59` asserts on them.

### 4.3 Menu rendering

New directory `engine/src/ui/menu/`:

- `layout.ts` — `MenuLayout`, `MenuWidget` (`{ type, x, y, width, command,
  label }`), and `DEFAULT_LAYOUTS`, original constants matching the recovered
  retail geometry (§2.1) so the app looks right with no disc present.
- `MenuScreen.tsx` — renders a `MenuLayout` over an optional background image at
  a fixed 640×480 design box, scaled by CSS `transform` to the window. Pure props
  in, markup out.
- `MenuButton.tsx`, `MenuDial.tsx`, `MenuRocker.tsx`, `MenuList.tsx` — one
  component per recovered `_Draw*` class, each rendering original SVG/CSS chrome
  by default and the retail nine-slice sprites when a bundle is loaded.
- `MainMenu.tsx`, `AircraftSelect.tsx`, `LoadoutScreen.tsx`,
  `QuickFightSetup.tsx`, `Debrief.tsx` — screens composed from the above.

Every one of these takes props and returns markup. No `useEffect`. Asset loading
happens once in `Shell.tsx` and is passed down as a plain object, mirroring how
`CockpitOverlay.tsx:17-22` loads cockpit art today.

Naming and `aria-label`s become the test surface, the same way the MFD bezel is:
each screen gets `data-menu-screen="<id>"` and each widget
`data-menu-command="<id>"`.

### 4.4 UI audio

`FlightAudio` (`flight/FlightAudio.ts`) is role-bound — clips are exactly `jet |
burner | start | stop` (`:4`) and `playTransition` is private (`:258`) — so it
cannot serve menus. Add `engine/src/ui/menu/UiAudio.ts`, a small one-shot
service that reuses the same hard-won rules:

- Create the `AudioContext` only inside a trusted gesture (`FlightAudio.ts:147-154`).
- Honour the existing global `M` mute, which is a window keydown listener that
  ignores form elements (`:155-176`). Factor that listener out so both share it
  rather than registering twice.
- Same PCM constraints: unsigned 8-bit mono at 5512/8000/11025, bounded length
  (`:23`).
- API: `play(name: UiSound)` where `UiSound` is `'click' | 'button' | 'toggle' |
  'reject' | 'arm-weapon' | 'arm-rounds' | 'fuel'`. Names are ours; the retail
  bundle maps them to `&CLICK`, `&BUTTON`, `&TOGGLE1`, `&SQACK1`, `&ARMWPN`,
  `&ARMBLLT`, `&ARMDRIP`. With no bundle, `play` is a no-op.

### 4.5 Retail menu bundle

Follows the aircraft porting workflow ([aircraft-porting.md](aircraft-porting.md))
exactly, because that workflow already satisfies the AGENTS.md retail rules.

1. `tools/retail/retail/mnu.py` — new. Walks the `PL` header, applies `.reloc`,
   resolves each record's draw pointer through `.idata` to a `main.dll` name, and
   emits `{header: {x,y,w,h}, widgets: [{type,x,y,width,command,label}]}`. Roughly
   150 lines. Also handles the `.MNU` menu-bar trees, marking the unresolved
   submenu/flag bytes explicitly as unknown rather than guessing.
2. `tools/retail/tests/test_mnu.py` — synthetic fixture, plus an opt-in check
   over local media that **skips** when absent, per AGENTS.md.
3. `tools/menu/port-menu.ts` — orchestrator, mirroring
   `tools/flight/port-aircraft.ts`. Produces one bundle:
   `appData/menu/screens.json` (layouts + base64 PNG backgrounds and sprites,
   CRC-validated like `RetailCockpit.ts:23-130`), `appData/menu/fonts.json`
   (glyph strips and tables), `appData/menu/sounds.json` (PCM + sha256 + rate,
   the shape `retail.audio` already emits). Writes to
   `extracted/menu-ports/<timestamp>/` and installs on `--install`.
4. `engine/src/data/retail-menu.ts` — validating parser with byte caps, in the
   style of `data/retail-gun.ts`. Engine never trusts the bundle's shape.
5. `Docs/formats/mnu.md` — new format note; `Docs/formats/README.md` row split
   into `MNU`/`DLG` (decoded) and `LAY` (environment layers, not UI).

---

## 5. Screens

### 5.1 Main menu

Layout from `CHOOSEAC.DLG` (§2.1), background `CHOOSEAC.PIC`. The retail item
list is kept, with items we cannot yet deliver **visibly disabled** rather than
hidden — the disabled sprite set `ACTIOD*` exists precisely for this, and showing
the real shape of the game is more honest than a three-item menu:

| Retail item | v1 |
|---|---|
| Play Single Mission | disabled — phase 8 |
| Create Quick Mission | **enabled** → quick fight setup |
| Create Pro Mission | disabled — phase 8 |
| Replay Last Mission | disabled |
| Start New Campaign | disabled — phase 8 |
| Continue Old Campaign | disabled |
| View Pilot Records | disabled |
| Reference | disabled — phase 8 encyclopedia |

Two items are added below the retail group, clearly ours, not retail: **Free
Flight** (today's practice flight) and **Terrain Explorer**. `AR_DLG.DLG` shows
the original itself had a "Free Flight" action, so the idiom is in keeping.

### 5.2 Terrain explorer mode

Behaviourally what the app does now with `?mode=explore`: free camera, no
aircraft, `ExplorerNavigationOverlay` and its MFD map. The change is that it is
entered from the menu and can be left with `Esc` back to the menu without a
reload, and that the environment controls in the debug panel write into
`mission.environment` instead of the URL.

Exit criterion: the existing `navigation-smoke.ts` and `teleport-smoke.ts` pass
unchanged.

### 5.3 Quick fight — **mocked**

This is a mock and the plan is explicit about it. What is real: the setup screen,
`MissionParams.opponents`, the spawn plumbing, and three aircraft existing in the
world at once. What is **not** real yet: the AI VM driving them, sensors,
acquisition, damage from rounds. Those are section 8.

Setup screen, modelled on the wizard pages (`QUICKB3..QUICKB25.DLG`) but reduced
to one page for v1:

- Your aircraft: `f14` / `a4e` / `x31`.
- Opponent aircraft: same three.
- Opponent count: 1 or 2 (giving three aircraft in the sky including you).
- Skill: Novice / Average / Experienced / Ace — the retail 0..3 already modelled
  in `sim/ai/vm.ts` and `sim/combat/damage.ts` (`skillGLimits`).
- Start: co-altitude head-on, or offset behind.
- Weather and time of day, reusing `EnvironmentParams`.

Implementation: a new `engine/src/sim/world/entities.ts` holding an entity list
the 120 Hz step advances alongside the player. For the mock, opponents fly a
fixed profile — straight and level on a heading, at a set speed — through the
same `stepFlight` path as the player where possible, so that when the AI host
lands (§8) it replaces one function rather than a system. Rendering reuses
`RetailAircraft` instances and must respect the floating origin
(`AGENTS.md`: "Preserve the terrain renderer's floating origin when adding
aircraft rendering").

Determinism is a hard requirement: entities step inside the existing fixed step,
spawns come from `MissionParams.seed`, and the harness must produce bit-identical
results across render rates, as `render-rate-determinism` already asserts for the
player.

### 5.4 Loadout screen

Layout from `LOADORD.DLG` (dialog `(115, 356, 470, 102)`, two dials, two rockers,
"Fly" and "Select Plane") over `ORD_KITT.PIC`, with the station diagram above it
and `$*.PIC` store icons per station. Font `ARMFONT`, weapon labels
`FNTWPNB`/`FNTWPNY`, sounds `&ARMWPN`, `&ARMBLLT`, `&ARMDRIP`.

Contents:

- **Stations**, from the aircraft's `.PT` `:hards` with sensor/ECM slots
  (`flags & $0008`, `maxWeight 0`, `maxItems 1`) filtered out. Each shows its
  icon, store name, and a rocker for count up to `maxItems`.
- **Fuel**, a dial over internal fuel in pounds (`internalFuel`), plus any
  `.GAS` tanks mounted, shown as a total and as a fraction. This replaces
  `?flightFuel`, which `FlightLayer.ts:230-231` currently clamps to 0..1.
- **Weight readout**: empty mass + fuel + stores against `maxTakeoffMassKg`, with
  the over-weight case rejected by `validateMission` and sounded with `&SQACK1`.
  `data/retail-flight.ts:76-79,133` already asserts `emptyMassKg +
  fuelCapacityKg <= maxTakeoffMassKg`, so the invariant exists to build on.
- **Performance note**: `.PT` carries `loadedDrag`, `loadedGpullDrag`,
  `loadedElevator`, `loadedAileron`, `loadedRudder` as percentage corrections
  ([formats/pt.md](formats/pt.md)). v1 *displays* the penalty. Wiring stores into
  the flight model is listed as follow-up work, not claimed here.

**On compatibility.** Because the `flags` mask is undecoded (§2.5), v1 offers per
station: the station's `defaultTypeName`, `$NOPIC` (empty), and — only when the
developer toggle is on — any store. The toggle is labelled after the retail one,
*"Load anything anywhere"*, and defaults off. This is restrictive but never
wrong, and it is honest about what we know. Decoding the mask is a research task
in §8, and it is the one thing that would let the screen offer real choices.

**Landed 2026-09-10.** The data half of this screen is implemented and
verified: `python3 -m retail.loadout` exports a `.PT`'s stations and stores,
`engine/src/data/retail-loadout.ts` is the validating contract and the weight
arithmetic, and the aircraft port helper produces and installs an
`<id>-loadout.json` alongside the existing bundle files. What remains is the
screen itself. The shipped contract is:

```ts
export function parseRetailLoadout(value: unknown): RetailLoadout;
export function defaultLoadout(loadout: RetailLoadout): Loadout;
export function selectableStations(loadout: RetailLoadout): Station[];
export function allowedStores(l: RetailLoadout, s: Station, unrestricted?: boolean): string[];
export function storeLabel(store: StoreDefinition): string;
export function storesWeightLb(l: RetailLoadout, chosen: Loadout): number;
export function externalFuelLb(l: RetailLoadout, chosen: Loadout): number;
export function totalFuelLb(l: RetailLoadout, chosen: Loadout): number;
export function grossWeightLb(l: RetailLoadout, chosen: Loadout): number;
export function validateLoadout(l, chosen, options?): string[];
export const poundsToKilograms: (lb: number) => number;
```

Store icons are not part of this contract. The `$*.PIC` sprites belong to the
menu bundle in §4.5, keyed by the same store file names.

### 5.5 Debrief

Minimal for v1: time aloft, rounds fired, fuel remaining, and whether the
aircraft was destroyed once damage is wired. Background `DEBSC1.PIC`. It exists
mainly so `flight` has somewhere to exit to that is not a reload.

---

## 6. Tests

New unit tests, all in the existing `bun test` style, no new dependencies:

| File | Covers |
|---|---|
| `engine/src/sim/mission/params.test.ts` | Round-trip `missionQuery ∘ parseMissionQuery`; every legacy query key still parses; clamping of fuel, payload, opponent count; `validateMission` messages |
| `engine/src/ui/menu/navigation.test.ts` | `initialScreen` for each deep-link, including `?mode=flight` → `flight` and no-query → `main-menu`; every `nextScreen` transition, including that disabled menu items do not transition |
| `engine/src/ui/menu/menu.test.ts` | `renderToStaticMarkup` of `MainMenu`, `LoadoutScreen`, `QuickFightSetup`: widget count, DOM order, `data-menu-command` values, disabled state, that no retail asset is required to render |
| `engine/src/data/retail-loadout.test.ts` | Parser rejection cases (bad kinds, negative weights, oversize icons) in the style of `data/retail-flight.test.ts`; weight and fuel arithmetic; sensor stations filtered out |
| `engine/src/data/retail-menu.test.ts` | Bundle parser rejection cases and byte caps |
| `engine/src/sim/world/entities.test.ts` | Deterministic spawn from a seed; three entities step at exactly 120 Hz; bit-identical state across differing render rates (`assert.deepEqual`, matching `render-rate-determinism`) |
| `engine/src/ui/menu/ui-audio.test.ts` | Mute state machine and one-shot mapping, with the `AudioContext` stubbed the way `platform/browser.test.ts:1-30` stubs `localStorage` |
| `tools/retail/tests/test_mnu.py` | Synthetic `PL` fixture: header, 38-byte stride, label resolution, import-name resolution; media-backed check skips when absent |

New Electron smoke scripts under `tools/flight/` (same `openDesktop` harness):

- `menu-smoke.ts` — app launches with **no** query and shows `data-menu-screen="main-menu"`; the enabled items are exactly the three we deliver; clicking Terrain Explorer reaches the explorer without a page reload (assert the same `window` object survives).
- `loadout-smoke.ts` — reach the loadout screen, change fuel and one station, click Fly, and assert `window.__flightDiagnostics()` reports the chosen fuel and aircraft.
- `quickfight-smoke.ts` — assert three entities exist and all three advance, i.e. the liveness probe the brief asks for, in its pre-AI form.

Regression obligation: **all 13 existing smoke scripts must pass unchanged.**
That is the acceptance gate for §4.1 and §4.2 and should be run before anything
in §5 is written.

---

## 7. Work order

Each step ends green on `bun run check` and is committed separately.

1. **`MissionParams` + parser/serializer, with tests.** No UI change. Thread it
   through `startTerrainViewer` and `FlightLayer.create`, deleting the seven
   scattered query reads. Gate: all 13 smoke scripts pass unchanged.
   **Landed 2026-09-10** in `engine/src/sim/mission/params.ts`. `initialCamera`
   now takes parsed overrides rather than a query string; `isProbeQuery` keeps
   the probe deep link. Gate met apart from three failures that reproduce
   identically at the parent commit; see the progress entry.
2. **Screen state machine and `Shell.tsx`.** Menu is a placeholder list; deep
   links still win. Gate: smoke scripts pass; `menu-smoke.ts` added.
   **Landed 2026-09-10** in `engine/src/ui/menu/navigation.ts`,
   `engine/src/ui/Shell.tsx` and `engine/src/ui/menu/PlaceholderMenu.tsx`. The
   deep-link rule is sharper than the plan assumed: any query at all wins, and
   the menu appears only on a launch with an empty query, because the explorer
   cases of `teleport-smoke.ts` pass no `mode`. `desktop.ts` gained a
   `bareLaunch` option so one script can test that, leaving the others
   untouched.
3. **`tools/retail/retail/mnu.py` + `Docs/formats/mnu.md` + formats index
   correction (`LAY` is not UI).** Pure research, no engine change.
   **Landed 2026-09-10.** 182 of 186 tables decode; record boundaries come from
   `.reloc` rather than a fixed stride, because the stride differs by widget
   class. The claim in section 2.1 that `CHOOSEAC.DLG` matches the converted art
   pixel for pixel holds for the rect and not for the button rows; see the
   progress entry.
4. **Menu components and layouts**, original chrome only, no retail bundle.
   Main menu, aircraft select, debrief. Gate: menu unit tests.
5. **Retail menu bundle**: `port-menu.ts`, `retail-menu.ts`, `UiAudio`. The app
   must still run identically with no bundle installed.
6. **Loadout screen** on the `retail-loadout.ts` contract landed on
   2026-09-10; fuel and stores feed `MissionParams`; weight validation and
   display-only performance penalty. Store icons come from the §4.5 bundle.
7. **`sim/world/entities.ts`** and the mocked quick fight: three aircraft,
   deterministic spawn, fixed profiles, rendered with the floating origin
   preserved. Gate: `quickfight-smoke.ts` and the determinism test.
8. **Progress and baseline entries** per AGENTS.md, stating plainly which parts
   are mocked.

Steps 1–2 are the risky ones and are worth doing alone. Steps 3–5 can proceed in
parallel with 6 if desired, since they touch disjoint files.

---

## 8. What this plan deliberately does not do

Listed so the progress snapshot can stay honest.

- **No AI.** The VM in `engine/src/sim/ai/` is not bound to aircraft state. The
  quick fight's opponents fly fixed profiles. Binding the `AiHost` sensors and
  actions to real entities is the next combat step and is not in this plan.
- **No target acquisition.** `FlightLayer.setGunTarget` remains uncalled;
  `sim/combat/sensors.ts` is not driven by anything.
- **No damage from rounds.** `sim/combat/hits.ts` and `damage.ts` are not wired
  to the gun.
- **No HUD target box, pointer or range readout**, and no target MFD page,
  though `ui/Mfd.tsx` was extracted to host one.
- **No missions or campaign.** The single-mission, pro-mission, campaign,
  pilot-record and reference menu items are disabled placeholders.
- **No wingman commands**, deferred by the user.
- **Stores do not affect flight.** The loadout screen shows the `loadedDrag`
  family of penalties; it does not apply them.

Open research questions, in the order they would unblock the most:

1. Hardpoint `flags` bitmask semantics — blocks real per-station store choice.
   Approach: cluster the ~1,200 weapon stations across 153 `.PT` files by flags
   value and correlate with the store classes of their defaults.
2. `maxWeight` units — a byte, roughly monotone in store weight ÷ 25, probably a
   pylon or rack class.
3. `.MNU` submenu and flag bytes — the widget record is solid, the menu-bar tree
   is about 80% clear.
4. Whether the quick-mission templates (`~Q[KUV]*.M`, 29 in USNF'97) can drive
   our setup screen directly; they are plain text with `type <tank>` placeholders
   the retail builder substitutes.
5. `.XMI` music, still undecoded, for menu background music.
