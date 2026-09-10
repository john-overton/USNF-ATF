# Menu revision — 2026-09-10, Omarchy

Later CSS-only follow-up: user requested green buttons with white labels after
reviewing the beige-edged sprites. Current buttons use authored green bevels;
`extracted/menu-green.png` was visually inspected in Linux Electron. Formatting
and diff whitespace checks pass. Earlier audio/layout evidence below is unchanged;
the earlier screenshots show the superseded sprite treatment.

Source: local working-tree revision based on `fc7f315cf8823dd54d0f5a09f624d1b56d08c405`;
not a committed or packaged build. Linux 7.1.9-arch1-2, Bun 1.4.2, Node v26.8.1.
Electron development launch: `bun run dev:electron --remote-debugging-port=9333`.
Installed menu bundle: `extracted/menu-ports/usnf97/2026-09-10T17-17-05-639Z-88ed7fe1`.

Commands:

```sh
bun tools/menu/port-menu.ts --install /home/john/.config/USNF-ATF/data
bun run check
python3 -m unittest discover -s tools/retail/tests -p test_menu.py
bun extracted/menu-review.ts audit
git diff --check
```

The ignored review helper uses CDP to capture current rendered source, inspect
button bounds, and tap the real master output with an analyser. It stays local
alongside retail screenshots. Evidence: `extracted/menu-review-report.json`,
`menu-before.png`, `menu-640.png`, `menu-1280.png`, `menu-1920.png`,
`menu-quickfight.png`, `menu-aircraft.png`, `menu-loadout.png`.

Results:

- `bun run check`: 369 pass, 3 skip, 0 fail (372 total). Skips are the three
  existing imported cockpit/gun mount asset fixtures; typecheck/lint/format pass.
- Python menu export: 4 pass, no skips.
- All 10 main-menu buttons inside viewport and no horizontal label overflow at
  640×480, 1280×720 and 1920×1080. At 640×480 the first button is approximately
  `(410,104,180,30)`; Free Flight `(24,438,160,30)`; Terrain Explorer `(198,438,160,30)`.
- Original title PCM: `^MF.11K`, 677,248 samples at the existing 11,025 Hz
  convention, approximately 61.43 s. Identification comes from `TITLE95.SEQ`.
- One active menu audio context; initial measured RMS 0.0630, mute RMS 0,
  unmute RMS 0.0200. The mute test dispatches a keyboard event through the app
  handler; it is not a physical keyboard/audio-device listening test.
- Menu context stays active through quick-fight, aircraft and loadout screens;
  closes in explorer; returning creates a new running menu context (RMS 0.0124).
- Synthetic tests exercise music loop uniqueness, disposal, and malformed PCM.
- A follow-up focused-button mute assertion initially retained the old unmuted
  expectation for the shared flight service, causing that test and a cleanup
  cascade to fail. The expectation was corrected to shared mute; the final full
  check is green. M now works with a menu button focused as well as the page.

Limits: system typography is still used, not original bitmap fonts. Original
activity-menu music selection is not recovered; looping the title theme is a
remake choice. Browser autoplay may require a gesture. No package, full Linux
flight regression, physical audio listening, or original-game pixel parity is
claimed. User visual acceptance remains separate from these measurements.
