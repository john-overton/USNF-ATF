# macOS GPU counter trace method — 2026-09-08

This is method validation, **not a final phase 3 performance baseline**. The
recorded real-Ukraine workload preceded the ocean depth fix. Geometry upload
bytes are not GPU DRAM traffic, and this attempt did not capture DRAM bandwidth.

## Observed result

Local artifact: `extracted/terrain-smoke-ukraine-gpu-trace/gpu.trace` (ignored).
`xctrace` 16.0 (17F42), Metal System Trace template, attached to this app's GPU
helper. Recording and exports exited 0 without changing permissions.

- Requested recording: 10 seconds; trace summary duration: **11.227301 seconds**.
- GPU: Apple M3.
- Template summary: counter set `(null)`, shader timeline disabled,
  induced GPU performance state Default; exported `counter-profile="0"`.
- Export contains **414,040** `metal-gpu-counter-intervals` rows.
- The only counter is **RT Unit Active**, with zero percent throughout.
- Its timestamps span 0.165143 to 11.120510 seconds; summed sample intervals
  cover 5.143332 seconds. Gaps mean summed duration is not wall time.
- **DRAM bandwidth is unavailable, not 0 GB/s.** The ray-tracing activity value
  says nothing about terrain memory traffic.

The installed Apple counter metadata defines `DRAM Bandwidth`, vendor counter
`DRAMBW`, in GB/s. Its presence in tooling is not evidence that this trace
collected it. The interval schema includes a GPU identity but no process identity;
process-exclusive attribution must not be assumed even when attaching to our
helper. Raw trace/TOC can include process and environment metadata and remain
ignored local diagnostics.

## Reproduce the extraction

```sh
xcrun xctrace export --input extracted/terrain-smoke-ukraine-gpu-trace/gpu.trace --toc --output extracted/terrain-smoke-ukraine-gpu-trace/toc.xml
xcrun xctrace export --input extracted/terrain-smoke-ukraine-gpu-trace/gpu.trace --xpath '/trace-toc/run[@number="1"]/data/table[@schema="metal-gpu-counter-intervals"]' --output extracted/terrain-smoke-ukraine-gpu-trace/counters.xml
python3 tools/terrain/gpu-trace-summary.py extracted/terrain-smoke-ukraine-gpu-trace/counters.xml --output extracted/terrain-smoke-ukraine-gpu-trace/counter-summary.json
python3 -m unittest discover -s tools/terrain -p 'test_gpu_trace_summary.py'
```

The summarizer resolves XML `id`/`ref` sharing, uses interval-duration weighting,
and explicitly distinguishes missing counters. Its two synthetic tests pass:
reference resolution/weighted mean and missing-DRAM reporting. Avoid printing raw
counter XML: this 11-second recording expands to over 100 MB of counter XML.

## Next step and limitations

Use Instruments to select a counter set that actually includes DRAM bandwidth,
save that configuration as a custom trace template, and repeat against the final
terrain workload and this app's GPU helper. Inspect the resulting counter names,
units, sampling intervals and scope before reporting any bandwidth number.
Changing counter sets may perturb the workload; record profiling conditions.
The current trace does not close the phase 3 bandwidth gate or establish a live
in-app DRAM counter.

Apple documents GPU counters as hardware metrics including memory bandwidth:
[Analyzing Apple GPU performance using counter statistics](https://developer.apple.com/documentation/xcode/analyzing-apple-gpu-performance-using-counter-statistics).
Apple also distinguishes the live Instruments timeline from detailed Metal
Debugger analysis, where profiling can serialize passes:
[Optimize Metal apps and games with GPU counters](https://developer.apple.com/videos/play/wwdc2020/10603/).

## 2026-09-08 follow-up: working native memory counter configuration

The generated Performance Limiters template now captures real hardware **GPU
Read Bandwidth**, **GPU Write Bandwidth**, and **GPU Bandwidth** on this M3.
These are distinct from the absent legacy counter named `DRAM Bandwidth`.
Apple describes the read/write counters as GPU accesses to system memory:
[Analyzing Apple GPU performance using a visual timeline](https://developer.apple.com/documentation/xcode/analyzing-apple-gpu-performance-using-a-visual-timeline/).
The installed counter metadata more cautiously describes memory external to the
GPU, potentially device memory. Preserve that qualification: this does not
isolate traffic reaching physical DRAM behind every system cache, or attribute
traffic exclusively to this process.

Reproducible local template generation (no Xcode template modification):

```sh
python3 tools/terrain/gpu-trace-template.py --output extracted/gpu-method/terrain-performance-limiters.tracetemplate
bun tools/terrain/smoke.ts --binary build/mac/mac-arm64/USNF-ATF.app/Contents/MacOS/USNF-ATF --terrain extracted/terrain/ukraine --out extracted/terrain-smoke-memory --seconds 15 --trace-gpu --trace-template extracted/gpu-method/terrain-performance-limiters.tracetemplate --camera '219144.16245100333,1800,267020.80352811713,-1.5707963267948966,-0.35'
```

The generator selects profile **13** in both archived `counterprofile` and
`counterprofileinternal` settings. This is a tooling-version-specific archive
setting, verified on Xcode Instruments **16.0 (17F42)**. The trace summary must
say **Counter Set: Performance Limiters**, Shader Timeline Disabled, Induced
GPU Performance State Default. The template generator fails if the expected
archive layout changes and refuses to overwrite an existing file. Do not ship
Apple's template bytes in the repository.

Method exploration found profile 1 and profile 3 are unsupported here. Both
recordings still returned exit 0, with a **Selected counter profile is not
supported on target device** warning. Exit status alone cannot verify native
counter capture. Profile 13 records without that warning and yielded 86 named
counters in the exploratory trace. GUI scripting was unavailable due to macOS
assistive-access restrictions; no privacy/security settings were changed.

The summary now reports external-memory counters separately from legacy DRAM
counters, including the summed sample duration divided by the timestamp span.
This ratio is not guaranteed union coverage when intervals overlap. Means remain
weighted by sampled interval duration; unobserved gaps are not zero traffic.
Exported labels say **GB/s** although Apple's static metadata uses the unit label
`GiB / Second`; report the native exported unit without silently converting.
The three summary tests and two template tests pass:

```sh
python3 -m unittest discover -s tools/terrain -p 'test_gpu_trace_*.py'
```

Exploratory all-process trace `extracted/gpu-method/profile13.trace` is method
evidence only, not a terrain baseline. Final packaged workload measurements
follow separately. Raw diagnostics remain ignored.
