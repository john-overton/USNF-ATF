# FluidR3 listening baseline — 2026-09-10

## Follow-up: approved bank, complete bake, runtime playback

User listened to all three previews, approved their sound, and requested the same
process for all music. This supersedes the listening-pending/runtime-unchanged
snapshot below. No claim of a proven original Windows MIDI device or bank.

`retail.music_bake` now runs the existing converter/render validation for every
local XMI. All 52 USNF files and 102 ATF files rendered successfully. USNF has 51
distinct source hashes (identical source bytes deduplicate); ATF has 102.
Separate manifests retain game identity and source/WAV/bank hashes. Full per-file
MIDI/render provenance remains alongside the exports. Runtime WAV payload totals:
USNF 225,714,116 bytes; ATF 417,793,416 bytes (about 614 MiB combined, excluding
duplicate provenance previews). No instrument remapping or normalization added.
The early generated bake-report counts hash entries; the tool now distinguishes
successful input-file count from unique source hashes.

New optional `audio/flight-music-baked.json` maps original XMI hashes to validated
`audio/music-baked/<WAV SHA-256>.wav`. Runtime verifies size/hash before decoding,
checks decoded duration/channels, retains at most two cached phrases and permits
only one pending read/decode. Cold loading holds phrase time to retain downbeats;
async completion only caches data, never starts stale playback. Missing/corrupt
renders fall back to oscillators with diagnostics, without repeated read failures.
Pause suspends the audio clock; N/M stop voices and later seek to the phrase position;
reset/disposal clear playback. Situation transitions retain the existing MUS VM and
authored host adapter. Phrase boundaries use original XMI duration, not FluidSynth's
added release tail (20ms stop fade; situation changes retain 80ms fade).
Decoded audio runs on the audio clock between fixed-step service calls; this is not
native integer-clock parity or a claim about behavior through prolonged frame stalls.

Installed USNF sidecar/WAV directory into `/home/john/.config/USNF-ATF/data/audio`;
existing `flight-music.json` and all other audio left unchanged. Every one of its
41 active library tracks plus five representatives has a matching bake. Remaining
USNF tracks and all ATF tracks are converted, not arbitrarily inserted into runtime
score groups. ATF native score naming/opcode gaps remain. Original waveform/menu
audio is not MIDI and was not re-synthesized.

```sh
PYTHONPATH=tools/retail python3 -m retail.music_bake --source extracted/usnf97/USNF_2.LIB --out extracted/music-baked/usnf97 --soundfont /usr/share/soundfonts/FluidR3_GM.sf2
PYTHONPATH=tools/retail python3 -m retail.music_bake --source extracted/atf-gold/ATF_2.LIB --out extracted/music-baked/atf-gold --soundfont /usr/share/soundfonts/FluidR3_GM.sf2
PYTHONPATH=tools/retail:tools/retail/tests python3 -m unittest test_music test_music_midi test_music_scores test_music_bake
bun run check
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
bun tools/flight/music-smoke.ts /home/john/.config/USNF-ATF/data extracted/music-baked/usnf97
bun tools/flight/music-smoke.ts /home/john/.config/USNF-ATF/data
```

Verification: 25 targeted Python tests pass; every rendered hash/size and PCM frame
length independently checked; all active library hashes covered. Full check passes
433 Bun tests, three existing imported-mount skips; typecheck/lint/format pass.
Fresh desktop baked and legacy oscillator acceptance pass: actual output signal,
N/M, pause/resume, defeat selection and reset, no renderer errors. Independent review
identified cold-decode downbeat loss; fixed with a clock hold and synthetic regression.
Initial typecheck caught an exact-optional field assignment and lint caught async
test stubs without awaits; fixed before final checks. No physics changes or claim of
new cross-platform acceptance. Final fresh build/live results recorded at handoff.

End-user conversion remains a developer CLI workflow until the in-app importer is
implemented. Runtime needs neither FluidSynth nor an SF2 after baking. Proposed
future packaging: private pinned converter and separately licensed bank, optional
cleanup of importer-owned tools only; never uninstall a user's system FluidSynth.
No third-party source/build/bank bundled or installed/uninstalled by this pass.
Missing retail media and native host/gameplay gaps are unaffected.

## Earlier three-phrase audition

Final combined Escape/mixer build is `index-r-CIhpVI.js`; baked and legacy music
smokes rerun successfully alongside four menu/combat/gun checks. Combined full
suite is now438 Bun pass/3 skips,25 music Python pass,16 harness pass; see
[final UI/audio acceptance](escape-mixer.md).

Source: `aa530d0c0cfada24d27594dbe345d2a2bcde5895`, Linux x64.
User installed FluidSynth 2.6.0 and soundfont-fluid 3.1-5 after requesting
instrument/arrangement auditions. No runtime code or appData manifests changed.

Bank: `/usr/share/soundfonts/FluidR3_GM.sf2`, SHA-256
`74594e8f4250680adf590507a306655a299935343583256f3b722c48a1bc1cb0`.
Installed license credits Frank Wen; license retained in the system package.
FluidR3 is a selected comparison bank, not recovered native instrument identity.

Existing `retail.music_midi.export` rendered three original USNF phrases with
unchanged MIDI program assignments and its documented conversion policy. These
are current runtime representative selections, not proof of native host dispatch.
Output: ignored `extracted/music-audition-fluidr3/{situation}-{track}/`.
Each directory contains hashed MIDI, WAV and provenance JSON including source,
bank, MIDI and WAV hashes and synth version. FluidSynth default effects/gain used;
no added program remapping, normalization, tempo change or new arrangement yet.

| Representative | Track | Render seconds | Peak / full scale | RMS / full scale |
|---|---|---:|---:|---:|
| Cruise | AIR02 | 123.713 | 0.55481 | 0.05026 |
| Combat | AIR04 | 29.457 | 0.56882 | 0.04482 |
| Danger | AIR01 | 115.101 | 0.84750 | 0.06685 |

All three exports report `rendered-user-bank-not-native-fidelity`: complete
22,050 Hz PCM16 WAV frames, nonzero signal; independent sample scan finds zero
samples at either PCM16 rail. This is render validation, not listening acceptance.
XMIDI CC114 is omitted/reported (15/6/10 events respectively); TIMB/branches and
device initialization remain limitations. No original-bank fidelity claim.
`fluidsynth --version` emits ALSA enumeration warnings but exits successfully;
offline rendering succeeds without opening an interactive playback session.

Reproduce each track (substitute situation/track as above):

```sh
PYTHONPATH=tools/retail python3 -m retail.music_midi --source extracted/usnf97/USNF_2.LIB/AIR02.XMI --out extracted/music-audition-fluidr3/cruise-AIR02 --soundfont /usr/share/soundfonts/FluidR3_GM.sf2
PYTHONPATH=tools/retail:tools/retail/tests python3 -m unittest test_music test_music_midi test_music_scores
```

Targeted tests: 22 pass, no skips. No engine changes, so full engine/GPU checks
were not rerun. Generated files verified ignored. User's `Docs/synths.md` untouched.
Next: listen to these baselines, then select balance/effects or instrument changes
for separately attributed variants. Live SoundFont integration remains future work;
missing ATF movies and unsupported native host/gameplay systems remain unchanged.
