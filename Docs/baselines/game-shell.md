# Baseline: game shell (menu, modes, loadout, mocked quick fight)

Machine: Apple Silicon Mac (darwin 25.6.0), Bun 1.4.2, Node 22, Python 3.14,
Electron 44.2.0. Date: 2026-09-10.

Source commits: steps 1–7 of [game-shell-plan.md](../game-shell-plan.md), from
`7b7866f` (MissionParams) through `fd1f6b8` (mocked quick fight), plus the menu
audio scoping fix recorded below. Comparison build: `092d0d6`, the parent of the
series, built and run for the regression attributions.

Scope: what a player moves through before and after a flight. The simulation
itself is unchanged by all of it — the 120 Hz clock still runs in the viewer's own
frame loop and React still receives only a throttled diagnostics snapshot.

## Unit tests

| Suite | Before | After |
|---|---|---|
| `bun run check` | 324 | 370 |
| `python3 -m unittest discover -s tools/retail/tests` | 89 | 101 (1 skip) |

The 46 new TypeScript tests are: 10 for `MissionParams`, 9 for the screen
transitions, 7 for the menu components, 6 for the loadout view and screen, 4 for
the entity list, 5 for the menu audio, 4 for the bundle parser (covering 30
rejection cases). The 12 new Python tests are 8 for `retail.mnu` and 4 for
`retail.menu`, the media-backed ones skipping when no disc is present.

## Measured on local media

| Measurement | Value |
|---|---|
| `.MNU`/`.DLG` files decoded | 182 of 186 across both discs |
| Widget records recovered | 1,113 in 25 classes |
| Labels in the file / supplied by the host | 113 / 242 |
| Menu-bar entries | 62 |
| Files with no `CODE` section | 4 (ATF network dialogs) |
| `CHOOSEAC.DLG` rect | `(379, 80, 238, 361)`, matching the artwork's panel on three edges to the pixel |
| Menu bundle | 3 screens, 14 widgets, 3 sprite parts x 2 states, 7 sounds |
| Bundle size | `screens.json` 492 KB, `sounds.json` 64 KB |
| F-14 stock loadout, reached through the UI | 65,876 lb of a 74,349 lb maximum |
| F-14 with the Phoenix rack emptied | 61,976 lb (−3,900 = 4 × 975 lb) |
| Fuel dial at 40% | 6,296 lb, and the flight starts at `fuelFraction` 0.40 |
| Quick fight closing trace, seed 7 | 6,032 m at spawn to 740 m at 18 s, then opening |

## Electron acceptance, against a packaged build of `fd1f6b8`

Passing, unchanged from before the series: `smoke.ts` ground and takeoff,
`ground-smoke` is excluded below, `navigation-smoke`, `teleport-smoke` (all four
of its modes, including the explorer case that deep-links with no `mode` at all),
`fuel-smoke`, `aero-smoke`, `retail-smoke`, `systems-smoke`,
`flaps-neutral-smoke`, `surface-smoke`, `cockpit-gun-smoke` (f14, a4e, f14-night).

New and passing: `menu-smoke` with and without a ported menu bundle,
`loadout-smoke`, `quickfight-smoke`.

### Failures, and what they are

Three fail, and all three were **reproduced identically on a build of the parent
commit `092d0d6`**. They are pre-existing defects, not regressions, and the smoke
scripts were left unchanged rather than edited to pass:

1. `ground-smoke.ts:41` and `aircraft-smoke.ts:24` assert that the assisted model
   is the default flight model. That stopped being true in `c6069fe` on
   2026-09-09, which made the retail PT envelope the default whenever a profile is
   installed. Both fail with "Existing assisted model is not the default" and
   "F-14 profile leaked" respectively.
2. `smoke.ts --scenario approach` lands but does not brake below the 5 m/s
   threshold inside the 60 s budget: `landings: 1`, `status: "grounded"`, final
   airspeed 7.07 m/s.

One is environmental. `envelope-smoke.ts` completes its first case (F-14 retail
envelope, airborne, 4.63 peak g) and then fails to open its second Electron
session, in Electron's own sandbox bootstrap: "Cannot destructure property
'preloadScripts' of 'binding.startupData'". The same failure occurs on the
`092d0d6` build on this machine today, with no other Electron process running.
The same bootstrap error hit `flaps-neutral-smoke`, `aero-smoke` and
`surface-smoke` once each during the series and all three passed on retry.

### One real regression, found and fixed

`retail-smoke` failed once during the series with "Mixed audio graph was silent".
Its tap patches `AudioNode.prototype.connect` and attaches to the first node that
connects to a context destination. The menu audio service added in step 5 was
constructed for the whole session, so in a flight its `AudioContext` could be
created first and the tap would listen to a silent menu context instead of the
engine. The shell now constructs the menu audio only while a menu screen is
showing, which is also what a flight wants: one `AudioContext`, not two.
`retail-smoke` passes again.

## What is mocked, and stays mocked

- **The quick fight's opponents fly fixed profiles.** The AI virtual machine in
  `sim/ai/` is parsed and unit-tested against all 17 retail programs and is not
  bound to aircraft state. Nothing acquires, nothing shoots, no round does damage.
- **Stores do not affect flight.** The loadout screen displays the `.PT`
  `loadedDrag` family of penalties and says on its face that the flight model does
  not apply them.
- **A station offers only its own default and an empty rack**, because the
  hardpoint `flags` compatibility mask is undecoded. The developer toggle that
  lifts that is named after the original's own "Load anything anywhere".
- **The menu bundle carries no retail fonts and no hover or pressed button art.**
  See [menu-porting.md](../menu-porting.md) for why, and for the measurements
  behind the enabled/disabled sprite mapping.
