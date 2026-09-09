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
