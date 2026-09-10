# USNF97 flight audio

## Follow-up: gameplay cues and movie audio (2026-09-10)

This section supersedes the earlier “unused speech/events” and “video audio unknown”
status below. `audio/combat.json` now supplies optional gameplay cues as well as
destruction samples; legacy seven-clip imports still work. Missing optional cues
stay silent, not synthesized speech. `audio/environment.json` supplies wind/tire
loops independently of the aircraft's PT engine import.

| Implemented event | Sample | Native association / remake boundary |
|---|---|---|
| Gear extension/retraction | &GEARDWN / &GEARUP .5K | FMGear 0x4304a0, state transitions |
| Flaps and hook extension/retraction | &FLAPOPN / &FLAPCLS .5K | FMFlaps 0x4303a0, FMHook 0x430440; hook deployment does **not** use &HOOK |
| Actual airborne stall | &STALL.5K | FMFlight 0x46ada4; six-second repetition is authored, not native LoopSound |
| Player receives survivable damage | ^IMHIT1.5K | PLANESayProc 0x48ef6d, subtitle/resource table 0x4d43a0; eight-second cooldown authored |
| Credited player gun kill | ^SPLBNDT.5K | PLANESayProc subtitle/resource pair 0x4d42e8 (“Splash one bandit!”); no enemy kill announcements |
| Fuel changes from positive to zero | ^OUTGAS.5K | SAYLowFuelMessage 0x48fa00, text/resource pair 0x4d44b0 (“We're out of gas”) |
| Airborne-to-grounded contact | &SQUEAL.5K | ServiceSounds ground-entry/gear branch; no initial-spawn sound |
| Aircraft wind | &WIND.11K | ServiceSounds 0x42c5f7; levels and loop crossfade authored |
| Moving on wheels | &TIRES.5K | ServiceSounds 0x42c516, OnTheGround/gear branch; gain uses actual ground speed |
| Bullet strikes land | &BULLTS1 / &BULLTS4 .5K | M61/MK12 JT land expType15, native effect table |
| Bullet strikes water | &SPLASH3.11K | JT water expType17; shared terrain water classification, never elevation inference |

The gun firing imports already use JT-selected samples: M61 FASTGUN.11K and MK12
SU33GUN.11K. PROJFireSound 0x43ab10 reads fireSound+0x12b, maxSndDist+0x12f and
freqAdj+0x131; full original spatial/pitch mixing is not implemented.

Cues use the fixed simulation clock, suppress spawn/reset/dead-aircraft chatter,
share M/gesture/pause/disposal, and never queue stale speech. One speech voice at a
time; a busy speech clip drops a new line. Total combat voices remain eight; bullet
impact aggregates are limited to one audible cue per 12 simulation steps. Native
radio ownership/priority/randomness are not claimed. Existing synthetic actuator
and touchdown noise is suppressed when corresponding retail cues are installed.

Deliberately unbound: RWR/radar/missile clips, wingman commands, subsystem-specific
JETDAM, eject sounds, and low-fuel reserve/BINGO thresholds. Those systems or their
trigger meanings are missing. ^OUTFUEL explicitly announces ejection and therefore
is **not** used merely when fuel reaches zero. &BUMP has no established executable
reference; &FALLWND belongs to non-aircraft states, not normal cockpit wind.

### CB8 embedded audio and VDO sidecars

`retail.video_audio` reads current disc archives, not prior extracted movie copies.
Complete source ranges are hashed; output records each MRFA source/sample offset,
source SHA-256, raw PCM SHA-256, exact raw PCM and bounded WAV preview. No resampling
or silence insertion changes the recovered samples.

| Available disc | Complete CB8 ranges | Soundtracks | Silent movies | PCM bytes |
|---|---:|---:|---:|---:|
| USNF97 | 23 | 22 | 1 | 45,195,150 |
| ATF Gold | 28 | 27 | 1 | 41,483,400 |

DRBC header: 64 bytes, flags u32+4, frame timing u16+8=150, audio rate u16+10=22050,
version u32+12=101. Chunks have 24-byte headers; u32+4 is total chunk length including
header. MRFA audio fields u32+8..20=(128,0,8,1), with 7,350 payload bytes per chunk.
Observed other tags are VooM and MRFI. InitCobra 0x40175d and MainLoop 0x401f98
establish header reads; native 0x80 silence at 0x40186c supports unsigned PCM8 mono.
Parser requires one VooM and at least one MRFI and rejects unknown formats, invalid
sizes, partial chunks and advertised-but-absent audio. This is conservative audio
demux, **not full video/index/timing validation**. Silent movies are JANELOGO.CB8
(USNF) and ATF.CB8. No in-engine movie player is added in this pass.

All 355 USNF VDO segments map to 105 existing standalone speech assets, zero missing.
Native BuildVDOList 0x42df70 appends A..Z to a group base for VDO/FBC names; native
StartVDOAudio 0x42e160 uses that original group base plus .11K (IQC uses .5K).
Thus AACA..AACE.VDO share AAC.11K; IQCA.VDO uses IQC.5K. Catalog grouping removes
the segment letter as the inverse of native construction, not as guessed audio.
VDO/FBC video decoding is still separate; their sound was already in the standalone library.

**Missing media:** ATF_10.LIB is still 91,145,639 bytes short. Seven CB8 source ranges
remain unavailable: S35_S, X29_D, X29_M, X29_S, X31_D, X31_M, X31_S. Even if old
extracted copies exist, this pass does not substitute them or claim fresh recovery.
Supply a complete legally owned archive to recover these soundtracks. Unrecognized
formats or full native playback parity are not established by the audio census.

```sh
PYTHONPATH=tools/retail python3 -m retail.combat_audio --source extracted/usnf97/USNF_2.LIB --out extracted/audio-library/usnf97/combat.json
PYTHONPATH=tools/retail python3 -m retail.environment_audio --source extracted/usnf97/USNF_2.LIB --out extracted/audio-library/usnf97/environment.json
PYTHONPATH=tools/retail python3 -m retail.video_audio --media gameassets/usnf97 --out extracted/audio-library/usnf97/video
PYTHONPATH=tools/retail python3 -m retail.video_audio --media gameassets/atf-gold --out extracted/audio-library/atf-gold/video
```

Install the two gameplay manifests under local appData/audio. All movie/retail
outputs remain ignored and unbundled. Live acceptance and explicitly untested hooks
are recorded in [phase 6 evidence](../baselines/phase-6.md).

## 2026-09-10: whole-library recovery and original combat effects

The previous notes below describe the narrower PT engine-audio pass. New
`retail.audio_catalog` reads every embedded/root archive and loose audio files,
retains source bytes by hash, creates PCM WAV previews and records archive/entry
identity. Duplicate names/entries remain independently attributed; identical blobs
deduplicate. Original filenames never become output paths. Audio output must be
outside the source tree. All retail outputs remain local/ignored.

| Available media | Waveform entries | XMI entries | MUS | Ancillary SBK |
|---|---:|---:|---:|---:|
| USNF97 | 809 | 104 (52 unique files) | 9 | 2 |
| ATF Gold | 1,037 | 102 | 9 | 2 |

USNF's waveform count includes loose ADPCM `AUTORUN.WAV`; the other808 are .5K,
.8K and .11K. ATF's1,037 are those game extensions. Eight USNF/fifteen ATF .5K
files are actually RIFF PCM8 mono. Header rates override suffixes: WATHIT3 is11025,
TOWEST5510. Structural RIFF/chunk/frame validation rejects truncated input; an
observed final odd data chunk without padding is accepted only exactly at EOF.
Optional installed FFmpeg decodes AUTORUN ADPCM, then a seekable WAV writer fixes
streaming size sentinels. Original compressed bytes remain preserved. No new
dependency installed. Unknown formats/banks are preserved, not mislabeled playable.

**Native raw-rate correction:** SoundOn0x42aec1..42af6f maps .5K/.8K/.11K to
pitch128/186/256. SetVolPitchPan0x42d1ff..42d22b computes `(pitch*11025)>>8`, giving
5512/**8010**/11025Hz. Previous8000Hz .8K assumption is superseded; validators retain
8000 for legacy manifests. StartVoice0x42d1b9 supplies sample type/flags0,0 to AIL,
consistent with unsigned8-bit mono. Gain/pitch variations and original mixing remain
partly inferred, not settled by the nominal rate.

**ATF partial media:** current ATF_10.LIB is91,145,639 bytes short of its sentinel.
Strict archive parsing still rejects it. Explicit salvage requires a complete,
ordered directory and individually in-range entries; all56 standalone .11K entries
are intact. Seven later CB8 entries cross/fall beyond EOF and are reported missing.
No bytes are synthesized, and old extracted copies are not used as fresh evidence.
USNF733 and ATF28 intact multimedia/sidecar entries remain audio-demux-unverified;
seven additional ATF video entries unavailable. VDO/RATVID, CB8/DRBC and FBC are not
decoded audio. Thus this is **all identified standalone audio**, not a claim that
every possible video soundtrack or original playback rule is recovered.

### Combat hookup

`retail.combat_audio` exports seven clips into `audio/combat.json`:

| Remake event | Original samples | Evidence |
|---|---|---|
| Aircraft hit | BULLTS2.8K/BULLTS3.5K | M61/MK12 JT expType18 |
| Aircraft destruction | AIREXP1/2.11K | F14/A4 PT expType30 |
| Ground crash | CRASH.5K | ServiceSounds0x42c4da, FMFlight0x46bbb8 |
| Water crash | WTREXP1/2.5K | Native effect34; event assignment authored |

Names above have the literal `&` prefix on disc. GRAPHICAddExp0x424700 reads
48-byte records from0x4c0de8, up to eight sample pointers at+10, randomly chooses
a sample and calls SoundOn. Native random substitutions/full event dispatch are
not reproduced. Remake variant choice is deterministic event-ID selection; distance,
gain and endpoint fades remain authored. Missing imports retain labeled synth
fallback. Installed retail playback is verified for F14/A4 combat and ground crash.

Remaining clips (speech, warnings, environmental cues and unused weapons) are
recovered in the library but not all mapped to gameplay events. Music recovery is
documented [separately](music.md).

```sh
PYTHONPATH=tools/retail python3 -m retail.audio_catalog --media gameassets/usnf97 --out extracted/audio-library/usnf97
PYTHONPATH=tools/retail python3 -m retail.audio_catalog --media gameassets/atf-gold --out extracted/audio-library/atf-gold
PYTHONPATH=tools/retail python3 -m retail.combat_audio --source extracted/usnf97/USNF_2.LIB --out extracted/audio-library/usnf97/combat.json
```

Each `catalog.json` maps original names to `original/` and playable `wav/` blobs.
Only combat/music manifests are installed for the current runtime; the complete
library stays in extracted for subsequent event hookup. No asset bytes enter the
repository, public assets or packaged application.

## Earlier PT-only investigation (rate uncertainty superseded above)

Investigated 2026-09-09 against locally extracted `USNF_2.LIB`.
The previous flight implementation used only original synthesized noise and a
65–220 Hz sine oscillator. No retail flight sound was used. The sine is now
removed; it is a plausible source of the reported buzz, not a confirmed listening
diagnosis of the user's audio device.

## Observed aircraft mapping

The existing labelled BRF/PT reader decodes these **F14.PT references**, without
executing the retail game:

| PT field | Referenced resource | Bytes | Playback role |
|---|---|---:|---|
| loopSound | `&JET1N.11K` | 28,672 | Continuous engine |
| secondSound | `&JET1A.11K` | 21,760 | Afterburner layer (remake assignment) |
| engineOnSound | `&POWERUP.5K` | 31,876 | One-shot engine start |
| engineOffSound | `&POWERDN.5K` | 22,399 | One-shot engine shutdown |

These files have no RIFF/VOC header. Values around 128 represent quiet portions;
unsigned 8-bit mono PCM is consistent with those portions and the waveforms.
The `.11K` → 11,025 Hz and `.5K` → 5,512 Hz rates use the conventional extension
interpretation; the original executable's mixer setup has **not** been recovered.
The `.8K` → 8,000 Hz branch is synthetic-test coverage only. The PT field establishes
which sample belongs to each role, but does not establish original gain, pitch,
loop points, start scheduling, or that `secondSound` means afterburner. Those are
explicit approximation boundaries. No source-code audio mixer is available here.

## Local conversion and runtime

```sh
PYTHONPATH=tools/retail python3 -m retail.audio --pt extracted/usnf97/USNF_2.LIB/F14.PT --out extracted/flight/audio/f14.json
python3 -m unittest discover -s tools/retail/tests -p test_audio.py
bun test engine/src/flight/FlightAudio.test.ts
```

The export contains original unsigned PCM samples, filename, SHA-256, PT field,
rate and encoding in a bounded schemaVersion 1 JSON file. Install that file as
`audio/f14.json` under the platform's appData root. Missing files select the
original filtered-noise fallback. Invalid installed files report the error through
audio diagnostics and fall back; they do not prevent flight. No retail bytes are
committed, copied into public assets or bundled into installers.

The runtime removes DC offset, crossfades 40 ms at continuous loop boundaries,
and fades 6 ms at the endpoints of one-shots. Loop endpoints are equal after the
crossfade. Source PCM remains unchanged in the exported file. Linear resampling
to the context rate is necessary because Web Audio cannot create 5,512 Hz buffers.
The continuous retail layer has a 4 kHz lowpass; transition playback has a 2.6 kHz
lowpass. Gains are remake choices. Wind, contact and actuator noises remain
original, and fallback engine start/stop are distinct noise envelopes. A real T
toggle triggers one start/stop event; initial spawning does not play a transition.
Rapid opposite toggles fade the preceding event, preventing stacked recordings.
M muting, trusted-gesture unlocking and scene cleanup still apply.

## Verification and limits

- Six Bun tests / 28 assertions cover PCM validation, silence/burner shutdown,
  engine toggle edges, loop continuity/DC, one-shot fades and 5K resampling.
- Three Python tests pass, including the locally supplied F14.PT references to
  four distinct PCM hashes. The retail integration test explicitly skips when
  locally extracted media is unavailable; no retail bytes are test fixtures.
- An initial endpoint test exposed signed zero (`-0`) after fading negative PCM;
  endpoints now explicitly normalize to positive zero. This was a numeric test
  issue, not audible signal energy.
- Programmatic continuity is not listening acceptance. Packaged playback and
  offline rendered signal evidence belong in the phase 4 baseline.
