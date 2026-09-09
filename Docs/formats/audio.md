# USNF97 flight audio

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
