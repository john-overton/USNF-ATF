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

## Final packaged terrain captures — 2026-09-08

Machine: Apple M3, 24 GiB unified memory, macOS 26.6.2 (25G83), Instruments
16.0 (17F42). Packaged source: **12851d8**; smoke harness HEAD recorded in JSON:
**71b8caa**. These are different provenance fields: `report.sourceCommit` records
the checkout at smoke time, not an embedded binary build identifier.

Both 15-second captures attached to the GPU helper of an isolated packaged app
profile at 2560×1440. The template is the generated Performance Limiters profile
13; shader timeline disabled, GPU performance state Default. Its SHA-256 is
`d303b66953fd2e7f724818415e4530ce3952ac19b435ed98515b01751c34b515`.
Normal desktop applications remained running. Instrument counter rows identify
the M3, not a process; treat the bandwidth as GPU-wide, with the terrain workload
running, rather than exclusive application traffic.

Artifacts are ignored local folders `extracted/terrain-smoke-memory-odesa/` and
`extracted/terrain-smoke-memory-detail/`. Each contains `gpu.trace`, `toc.xml`,
`counter-summary.json`, screenshot, report and logs. The complete exported XML
filenames are `counters-complete.xml` for Odesa and `counters-parallel.xml` for
detail. An interrupted Odesa export was discarded without using its partial samples.
The native trace was unaffected; its repeat full export exited 0. A focused XPath row predicate produced an empty
query result, so full-table exports were required. Full counter exports expanded
to roughly 3.0 GiB and 6.4 GiB respectively: budget disk, memory and processing
time accordingly, and parse these sequentially on a 24 GiB Mac.

Both collection logs have no GPU-service warning, and both complete exports and
summaries succeed. There are 86 named counters, including all three GPU external
memory counters and no legacy `DRAM Bandwidth` counter. This closes the previous
RT-only measurement failure and establishes native memory-traffic evidence. It
does **not** establish a live in-app DRAM counter or physical-DRAM-only traffic
attributed to the app.

A real export also exposed an optional-label case absent from the synthetic
fixtures: detail row 8,702,089 replaces the formatted label with `<sentinel/>`
for `L1 Buffer Residency`, while retaining a valid numeric value. The parser now
accepts the missing display label and still requires valid numeric/identity
columns. A regression test covers this; the GPU tool suite now has six tests.

### Native sampled bandwidth results

All bandwidth values below use the exported **GB/s** label and are duration-
weighted means over observed sample intervals, **not whole-recording averages**.
Minimum/maximum are individual sample readings, not sustained throughput.

| Workload | Counter | Weighted mean GB/s | Minimum GB/s | Maximum GB/s |
|---|---|---:|---:|---:|
| Odesa coast | GPU Read Bandwidth | 8.859954115 | 0.000006663 | 70.164759458 |
| Odesa coast | GPU Write Bandwidth | 12.086224773 | 0.000079956 | 95.131778938 |
| Odesa coast | GPU Bandwidth (read + write) | **20.946178888** | 0.000086619 | 95.185990123 |
| Crimean detail | GPU Read Bandwidth | 5.483843424 | 0.000010721 | 59.919400534 |
| Crimean detail | GPU Write Bandwidth | 8.169101313 | 0.000128652 | 98.549459453 |
| Crimean detail | GPU Bandwidth (read + write) | **13.652944738** | 0.000139373 | 98.612071695 |

| Workload | Samples per memory counter | Summed sampled seconds | First–last sample seconds | Sample span seconds | Sum / span | Trace duration seconds |
|---|---:|---:|---|---:|---:|---:|
| Odesa coast | 59,551 | 5.819215039 | 0.164047041–15.823956333 | 15.659909292 | 37.159954% | 15.936426 |
| Crimean detail | 148,831 | 12.430199660 | 0.165302417–15.884036834 | 15.718734417 | 79.078883% | 15.910005 |

The two runs have different observed sample coverage. The lower sampled mean
in the detail run does not establish a lower whole-recording memory cost. Gaps
remain unobserved, and overlapping intervals would also affect the ratio.

Profiled rAF checks: Odesa **60.054 fps**, p95 **17.6 ms**; detail **60.036 fps**,
p95 **17.7 ms**, each 901 frames in the requested 15-second frame sample.
Both have zero runtime errors and ~1.82 km of subsequent input-driven movement.
The smoke starts xctrace asynchronously, so native trace boundaries do not align
exactly with the rAF window; capture setup and native instrumentation can perturb
measurements. Untraced performance and transitions remain the comparison
baseline in [baselines/phase-3.md](baselines/phase-3.md).

Reproduce the detail pose by replacing the coast command's output folder and
camera with:

```sh
--out extracted/terrain-smoke-memory-detail --camera '470475,1293.3447265625,49725,3.141592653589793,-0.2'
```

Reproduce the accepted summary inputs:

```sh
python3 tools/terrain/gpu-trace-summary.py extracted/terrain-smoke-memory-odesa/counters-complete.xml --output extracted/terrain-smoke-memory-odesa/counter-summary.json
python3 tools/terrain/gpu-trace-summary.py extracted/terrain-smoke-memory-detail/counters-parallel.xml --output extracted/terrain-smoke-memory-detail/counter-summary.json
python3 -m unittest discover -s tools/terrain -p 'test_gpu_trace_*.py'
```
