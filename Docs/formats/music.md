# Music recovery — 2026-09-10

## Latest runtime follow-up

`FlightMusic` now runs bounded recovered USNF MUS bytecodes via `NativeScore`:
prefixes, direct/random/chance track choice, absolute/chance jumps, host flag and
stop. It advances only after the current phrase ends; SUCC stops instead of looping
its representative forever. Per-call instruction budget is 1,024, malformed jumps
into operands are rejected, and missing tracks stop with diagnostics. Original
MUS hashes and code bytes stay only in local imports. The installed five-situation
library references 41 unique XMI tracks / 34,709 notes; all nine original scripts
remain separately recovered. Legacy representative-only imports still load.

XMI channel events are now preserved and the renderer applies CC7 volume, CC10 pan,
CC11 expression, CC121 expression/bend reset and pitch bend (fixed ±2 semitones),
including changes during a note. Cached channel timelines avoid quadratic rescans.
Sustain, RPN bend sensitivity, bank selection, reverb/chorus, XMIDI branches/loops
and exact note-off/program ordering remain unsupported; exporting the events does
not imply rendering those features. Voice scheduling remains bounded to 32 voices.

Instrument samples are still **not** a recovered game-owned bank: the native game
opened Windows MIDI Mapper. No compatible soundfont/synth is installed here, and
the DirectX SBK driver files do not prove the game selected those instruments.
No new synth dependency or bank was downloaded. A chosen legally supplied MIDI
synth/bank is needed for materially better timbres; current oscillators remain
explicit approximations despite restored controller expression.

### Newly traced host dispatcher (evidence, not fully ported)

ChooseScore 0x432720 is the direct caller of ScoreOn at 0x4329ef. Table 0x4c37c8
has ascending preemption priority: NORMAL, DECK, HOME, DANGER, AIR, LAUNCH, EJECT,
SUCC, VALK. F9 sets host flag 0x4c2ee8, allowing reevaluation. AIR uses a type-4
target within native distance 0x9c4000 or active combatScoreTime; distance units
are not asserted here. DANGER checks target/lock windows/projectiles locked onto
the player; HOME and SUCC use one-shot latches, VALK an explicit flag. DECK/LAUNCH
depend on curThing+227 enum ranges (names not established); EJECT tests curThing
type !=4, which is not equivalent to a destroyed-aircraft flag.

Accordingly the remake still uses its **authored** five-situation host adapter and
deterministic RNG, not native host priority/RNG parity. Mapping defeat to EJECT is
an explicit adaptation, not a recovered ejection event. No radar-lock, carrier or
mission-success native transitions are invented for absent systems. Older text
below saying the VM itself is unwired is superseded; its host/instrument caveats remain.

Local files: USNF `USNF_2.LIB/*.XMI`, `M_*.MUS`, `SETUP.ESA/USNF.EXE` and its
SMS symbols; ATF equivalents. Original outputs remain ignored, never bundled.

## Instrument correction

No standalone game-owned instrument bank was found in the USNF archives. TIMB
contains instrument/bank IDs, not samples; AIR01 references55/127, which alone does
not establish custom sound data. `InitMusic` at0x42a4f0 calls `AIL_midiOutOpen` at
0x42a512 with deviceID−1. WAIL32 forwards to Windows WinMM MIDI output. The game
does not import the DLL's wave-synthesizer or timbre-callback exports. Thus the
configured MIDI device supplied the heard instruments; there is no single proven
disc-owned bank to extract for this build.

Two `SYNTHGM.SBK` copies per disc are present in ancillary DirectX audio-driver
directories. Cataloged/preserved, but no proof that USNF selected them. Matching a
historical instrument sound needs a chosen compatible MIDI synth/bank. The current
WebAudio oscillator renderer is still an approximation, not those original sounds.

## XMIDI

`retail.music` validates IFF XDIR/CAT/XMID, EVNT/TIMB/RBRN bounds and decodes notes,
durations and program changes. Additive delays and VLQ durations use120ticks/sec;
zero-duration notes occupy one tick. Protocol cross-check:
[ScummVM XMIDI parser](https://github.com/scummvm/scummvm/blob/master/audio/midiparser_xmidi.cpp).
Native initialization also sets AIL preference4 to120. This is an independent
format implementation, not copied source.

One linear EVNT pass is rendered. Controllers, sustain, pitch bend, branch/loop
semantics and bank-dependent instruments are not reproduced; ignored events are
reported. Original XMI bytes retain all information in the audio library. USNF has
104 archive entries/52 unique XMI files; ATF102 entries, all decoded successfully.

## Original score scripts

MUS are data-only Phar Lap CODE sections, not instrument banks. `ScoreOn`0x42a6d0
initializes offset/prefix/flag; `ScoreUpdate`0x42a730 advances only after the current
sequence finishes. Dispatch table0x42a928 confirms:

| Opcode | Operation |
|---|---|
| F9 | Set host flag; full host consequences pending |
| FA | Chance byte plus little-endian absolute CODE-offset jump |
| FB | Chance byte plus track ID |
| FC | Stop score/music |
| FD | Count byte followed by random-choice track IDs |
| FE | Absolute CODE-offset jump |
| FF | NUL-terminated filename prefix |
| Other nonzero | Track ID; zero skips |

Chance helper0x45ee50 compares `Random(100) < operand`. Track filenames append
`%02d.XMI` in USNF. ATF ScoreUpdate0x46bb30 references `%03d.XMI` at0x46bdb4;
ATF opcode parity remains independently unverified. The CFG decoder follows both
chance paths and jumps, rejects operand/overlapping jumps, terminates loops via
visited offsets, and excludes nine unreachable trailer bytes per local USNF script.
The ATF three-digit audit reports two unresolved references (AIR015/VALK001);
VALK01 exists, but the tools do not silently substitute it or assert native fallback.

Nine modules: NORMAL, AIR, DANGER, DECK, LAUNCH, HOME, EJECT, SUCC, VALK.
All USNF referenced tracks exist. SUCC randomly selects one of six tracks then
stops; EJECT has an opening choice then a looping choice group; VALK loops one.
These are recovered script facts, not proof of every host situation trigger.

The earlier AIR34-victory/AIR35-defeat presets were authored and incorrect as claims
of native assignment: those tracks occur in HOME/NORMAL respectively. Current
runtime representatives use NORMAL/AIR/DANGER/SUCC/EJECT groups; fixed selection
and treating defeat as EJECT remain authored. The complete native VM/host transition
rules are not yet wired into `FlightMusic`.

```sh
PYTHONPATH=tools/retail python3 -m retail.music_scores --source extracted/usnf97/USNF_2.LIB --out extracted/audio-library/usnf97/music-scores.json
PYTHONPATH=tools/retail python3 -m retail.music_scores --source extracted/atf-gold/ATF_2.LIB --digits 3 --out extracted/audio-library/atf-gold/music-scores.json
PYTHONPATH=tools/retail python3 -m retail.music --source extracted/usnf97/USNF_2.LIB --out extracted/audio-library/usnf97/flight-music.json
```

Install the final manifest as local `audio/flight-music.json`. N toggles music;
M shares global mute; UI exposes volume. Pause retains playhead, reset starts over,
terminal outcomes select victory/defeat. Scheduling/lookahead/voices are bounded,
and missing/invalid import falls back with explicit diagnostics. Automated desktop
signal checks establish playback, not perceptual/native music acceptance.
