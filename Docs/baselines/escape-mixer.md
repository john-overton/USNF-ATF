# Escape menu and mixer — 2026-09-10

Linux x64, Bun1.4.2; working follow-up on
`aa530d0c0cfada24d27594dbe345d2a2bcde5895`, alongside the approved FluidR3 bake.
No original retail menu-bar geometry/assets claimed: this is an authored
classic-style olive/beveled bar over the dimmed, retained flight.

Escape now opens Resume, Settings, Volume mixer, Mission brief, Debrief,
Main menu and Quit game. Bar exits request confirmation before abandoning the
flight; Cancel retains it. Quit uses the existing platform quit boundary. Mission
brief keeps both existing pages. The paused flight subtree stays inert; Tab wraps
within overlay controls, Escape resumes, and focus returns to the retained canvas.

Settings reuse real viewer setters through a portal outside the inert flight
subtree: bullet mode, time of day, weather, wind, cloud quality, available ground
colors, and music enabled. These do not recreate the world. Terrain reload,
aircraft/model changes and debug/fuel tools are not exposed as live pause settings.
Weather/graphics/gun changes are session controls; mixer levels persist separately.
Review found that music setters did not refresh UI diagnostics while paused;
they now publish diagnostics immediately. Live test toggles off and on with frozen
simulation steps. No flight dynamics changes.

Mixer routes existing outputs through additional gain nodes, preserving existing
envelopes, mute and pause. Six saved levels, each 0..1:

| Slider | Actual output |
|---|---|
| Master | Multiplies all five groups |
| In-flight music | Baked or oscillator FlightMusic |
| Engines & environment | FlightAudio engine/wind/tire and fallback sounds |
| Guns | FlightGun firing loop |
| Explosions, radio & warnings | CombatAudio destruction, speech, actuator/stall/impact cues |
| Menu sounds & title music | UiAudio clicks and title waveform |

These coarse groups are labeled honestly; radio, warnings and explosions do not
yet have independent submixes. Default100% multiplies existing gains unchanged,
including the existing flight-music volume. Mute is independent and not persisted.
Levels save to appData `settings/audio-mixer.json`. Parser rejects invalid settings,
late loads cannot overwrite user changes, writes serialize, errors are visible in
the pause panel. Gain subscriptions disconnect when each audio service is disposed.

## Verification

`bun run check`: 438 pass, 3 existing optional imported-mount skips, 705594
expectations/67 files; typecheck, lint and formatting pass. Music Python suite:
25 pass, no skips. Fresh renderer `index-r-CIhpVI.js`, CSS `index-nOkMHWsF.css`.
Synthetic tests cover mixer validation, clamp/master multiplication, actual gain
updates/unsubscription, late-load protection, menu actions, confirmations and labels.

Serial desktop checks:

Final run: all six commands below pass on the fresh build, with no renderer errors.
Destruction checks cover both combat and ground crash; gun checks cover original
yellow geometry, firing, live switching and retained menu selection. Both baked
and oscillator music paths emit signal and retain N/M/pause/reset behavior.

```sh
bun tools/flight/escape-mixer-smoke.ts /home/john/.config/USNF-ATF/data
bun tools/flight/pause-smoke.ts --binary shell/node_modules/electron/dist/electron --app shell --aircraft /home/john/.config/USNF-ATF/data/aircraft/f14.json --flight-profile /home/john/.config/USNF-ATF/data/aircraft/f14-flight.json --audio /home/john/.config/USNF-ATF/data/audio/f14.json --gun /home/john/.config/USNF-ATF/data/aircraft/f14-gun.json --menu /home/john/.config/USNF-ATF/data/menu
bun tools/flight/music-smoke.ts /home/john/.config/USNF-ATF/data extracted/music-baked/usnf97
bun tools/flight/music-smoke.ts /home/john/.config/USNF-ATF/data
bun tools/flight/destruction-smoke.ts /home/john/.config/USNF-ATF/data
bun tools/flight/retail-guns-smoke.ts /home/john/.config/USNF-ATF/data
```

Escape/mixer captures visually inspected under ignored `extracted/escape-mixer-smoke`.
Script checks retained canvas/combat clock, live gun setting, both directions of
paused music toggle, mixer gain reaching zero, M mute, confirmations/cancel,
briefing, main menu, resume and persistence through reload. Isolated profile only;
does not change the user's actual mixer levels. Actual Quit process termination is
not part of this script (confirmation/cancel and existing host routing are covered).
No Windows/macOS launch acceptance or claim of pixel-identical retail appearance.
The old pause regression initially timed out: CombatAudio stopped voices and set
zero gain but left its context running. It now suspends/resumes the context too;
unit tests assert both states. No change to event consumption or stale-cue policy.
The separate flight harness still passes all16 cases.
No commit/push in this follow-up; generated/retail outputs remain ignored.
