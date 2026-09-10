# Audio gap follow-up — 2026-09-10

Source checkpoint: `cd0176ba4765630beb511a287ef9514c2936681f` on `main`, already
pushed to `origin/main` before this follow-up. Measurements test the working
follow-up on that parent, not the future commit hash. Linux x64/Omarchy,
Bun1.4.2, Node26.8.1, Python3.14.7. No retail/generated output is committed.

## Preserved checkpoint

Checkpoint acceptance:415 Bun pass/3 imported-mount skips,705433 assertions;
50 targeted Python pass;16 harness cases pass. Fresh renderer `index-3aYg_lZp.js`
passed serial real Electron audio-cues, music and destruction checks. Earlier
handoff statements that no commit/push occurred are historical. Assisted flight
remains unchanged. No manual compaction API was available; the checkpoint and
explicit scope are preserved in this document and handoff.

## Changes and evidence

1. `retail.media_audit` records archive/directory SHA, exact missing entry ranges
   and partial-versus-absent bytes. Same-source replacements must preserve the
   available prefix, have an exact terminal sentinel, pass strict parsing, and
   decode newly available CB8 soundtracks. Appended garbage, bad sentinel,
   truncated/corrupt candidates fail. This is compatibility, **not authenticity
   or full movie validation**.
2. Optional `--partial-out` recovers complete packets from audited partial entries.
   Fresh S35_S yields144 MRFA packets,1,058,400 PCM8 bytes, **48 seconds**;
   1,259 incomplete trailing bytes are discarded. The7,969,071-byte available
   prefix is separately retained. Status remains `partial-embedded-audio`,
   `complete:false`; all seven movies stay in `unavailableEntries`. Fresh archive
   slices, concatenated PCM, WAV frames and SHA match exactly. PCM SHA:
   `94dac63e5f86f135f2985e064e8670a343bf7a98132d0ed72ab7073f2a2fe2e0`.
3. Runtime RPN0 pitch sensitivity honors CC101/100 selection, CC6 semitones and
   CC38 cents, including already bent notes; null/NRPN cannot modify it. Seven
   USNF tracks request12 semitones, not the prior fixed2. Generic adapter starts
   RPN-null/default2; native driver initialization is not established. Sustain64,
   sound-off120, notes-off123 and reset121 affect releases bounded by the phrase.
   Removed arbitrary12-second melodic-note cap; authored envelopes/percussion and
   32-voice limit remain. Diagnostics identify preserved-but-unrendered features.
4. Finite XMIDI FOR/NEXT expands with four-level/100,000-instruction,
   20,000-note/600-second bounds. Count1 means one total pass; NEXT<64 breaks.
   Infinite count0/malformed control flow fails explicitly. All observed local
   loop counts are1. Channel/poly pressure is preserved, not mapped arbitrarily.
5. `retail.music_midi` exports standard MIDI retaining ordered programs, controllers,
   bends and pressure. Duration-generated releases precede same-tick messages;
   explicit releases retain source order. XMIDI CC110–119 are omitted/reported,
   never mapped to GM banks. Fixed120ticks/sec and EOT pedal/notes-off cleanup are
   explicit policies. Optional selected SF2/FluidSynth WAV rendering checks format,
   complete frames, bounds and signal; records source/MIDI/bank/WAV hashes and
   synth version. This is **offline audition, not an engine instrument backend**.
   Missing dependencies, silent/truncated output or process failure cannot claim success.
6. Combat diagnostics separate missing imports, missing gameplay, unmapped native
   triggers, recovered-but-unintegrated movie audio and instrument dependency.
   No new playback triggers. ATF findings are labeled development-media audit,
   not universal installation status.

## Verification

```sh
bun run check
PYTHONPATH=tools/retail:tools/retail/tests python3 -m unittest test_audio test_audio_catalog test_music test_music_scores test_music_midi test_media_audit test_video_audio test_containers test_gun test_sh_static
bun run harness
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
# Serial GPU checks:
bun tools/flight/music-smoke.ts /home/john/.config/USNF-ATF/data
bun tools/flight/midi-controls-smoke.ts
bun tools/flight/audio-cues-smoke.ts /home/john/.config/USNF-ATF/data
bun tools/flight/destruction-smoke.ts /home/john/.config/USNF-ATF/data
```

- Full check:419 Bun pass/3 existing imported-mount skips,705463 assertions in62
  files; typecheck/lint/Prettier pass. Targeted Python:62 pass, no skips. Full
  media-dependent Python discovery is not claimed; ATF media remains truncated.
  Harness16/16 pass; preserved assisted source has no diff.
- All52 local USNF and102 ATF XMI decode/export SMF; independent test reader checks
  headers, track lengths, ordering and EOT for154 files. Fixtures contain no retail
  bytes. USNF41-track manifest regenerated/installed locally; previous manifest
  backed up at ignored `music-before-gap-followup.json`.
- Fresh renderer `index-DA0D68g0.js`; four serial Electron scripts pass with no
  reported renderer errors. Retail music RMS0.011264519919045915, AIR15 initially,
  AIR10 on defeat; N/M/pause/resume/reset pass. Authored controller live fixture
  schedules233.081880759Hz (default−2),130.812782650Hz (RPN−12) and extends a0.8s
  note to1.8s release. This verifies real WebAudio scheduling, not native timbre.
  Actuator/environment/actual fuel-empty speech and combat/ground breakup/camera/
  pause/reset checks also pass.
- Media audit exits2 as expected for incomplete media. AIR05 offline MIDI export
  succeeds; render readiness exits2: `FluidSynth executable unavailable: fluidsynth`
  and no selected compatible SF2. No real FluidSynth render/listening acceptance
  claimed. Render-adapter success/silence/truncation/failure tests mock process I/O.
- Interim failures corrected: Prettier flagged long new capability text; a negative
  test accidentally replaced a zero footer with identical zeros (valid candidate),
  corrected to corrupt structural bytes. Review caught permissive sentinel
  acceptance and explicit note-off ordering; both now have regression tests.

## Exact remaining scope / next steps

| Gap | Blocker / safe fallback |
|---|---|
| Seven ATF movies | Actual425,263,104 versus516,408,743 expected bytes; missing91,145,639. S35_S missing620,917; X29_D/M/S and X31_D/M/S wholly absent. No complete local alternative found. Partial48s is not another complete soundtrack. |
| Accurate instruments | Native Windows MIDI device/bank unknown; ancillary DirectX SBK does not establish game use. No selected compatible SF2/FluidSynth here. Engine remains authored oscillator approximation; optional offline audition is not native-fidelity acceptance. |
| Unsupported MIDI | Bank-dependent timbres, modulation, pressure, reverb/chorus, other RPN/NRPN, external RBRN host branches and sysex remain unrendered by oscillators. Infinite loops reject. Same-tick note/controller ordering remains approximate in flattened engine notes, unlike ordered SMF. Generic RPN initialization is not Miles parity. |
| Gameplay-triggered audio | Radar/RWR/missiles, wingmen, subsystem failures/JETDAM, ejection/OUTFUEL and carrier/sensor score host states absent. BINGO reserve and BUMP triggers unmapped. Movie playback/timing absent. ATF score opcode parity and AIR015/VALK001 resolution unverified. No unsupported chatter/fake systems added. |

```sh
PYTHONPATH=tools/retail python3 -m retail.media_audit --archive gameassets/atf-gold/ATF_10.LIB --out extracted/audio-library/atf-gold/media-audit.json --partial-out extracted/audio-library/atf-gold/partial-movie
# Add --replacement /path/to/complete-owned/ATF_10.LIB when available.
PYTHONPATH=tools/retail python3 -m retail.music_midi --source extracted/usnf97/USNF_2.LIB/AIR05.XMI --out extracted/audio-library/usnf97/midi-audition
# Optional: --soundfont /path/to/owned-compatible.sf2 --synth /path/to/fluidsynth
```

No missing bytes synthesized, bank downloaded or retail outputs bundled. Completion
means feasible recovery/correctness/diagnostics, not eliminating absent media,
instruments or gameplay systems. Follow-up commit/push is reported after Git checks.
