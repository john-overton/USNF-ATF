# Phase 4 headless flight acceptance

The harness advances the same pure flight model used by the app at **120 Hz**.
It uses the original placeholder aircraft and synthetic terrain; it does not
establish retail flight-data compatibility or visual/game-feel acceptance.
Linux execution is deferred by the user.

```sh
bun run harness
bun run harness --output extracted/flight-harness/report.json
```

A failed assertion exits nonzero. Successful JSON includes source commit,
working-tree status, machine/tool information and per-maneuver measurements.
The optional output is a local diagnostic; keep generated reports in `extracted/`.

## Maneuver contracts

- Level flight lasts 60 simulated seconds, holds altitude and speed within the
  documented original-placeholder tolerances and travels a substantial distance.
- A sustained bank changes **velocity heading** by at least 90 degrees while
  retaining flying speed and bounded altitude error.
- A loop must complete an actual vertical-plane velocity trajectory: aircraft
  quaternion rotation alone is insufficient. The path must include climbing,
  descending and reversed horizontal travel.
- Stall/recovery must exhibit the model's stalled state and then regain attached
  flight with sufficient speed through control/throttle commands.
- Unpowered flight must dissipate specific mechanical energy; drag cannot add it.
- Ground cases distinguish a takeoff, survivable touchdown, hard impact, water
  contact and waiting for unavailable ground samples.
- The same 7,200 steps driven by 30, 60 and 144 Hz render clocks must end in
  exactly identical model states, without dropped simulation time.

Controllers may close the loop around altitude, attitude and airspeed. They
only supply public flight controls; they never teleport an aircraft, replace
velocities mid-flight, suppress collisions or edit aerodynamic coefficients to
make an individual maneuver pass. Test initial conditions are explicit.

Finite positions/velocities/rates/energy and normalized orientation are checked
throughout. Human feel assessment and packaged real-terrain behavior are
separate acceptance evidence in the phase baseline and progress log.

## First measured pass — 2026-09-09

Pure model source `400bdf9` plus safe-contact envelope follow-up `cb038c6` on
Apple M3, macOS, Bun 1.4.2. Eleven maneuver scenarios pass. The initial report is
`extracted/flight-harness/initial.json`; its working-tree status records the
concurrent harness/integration work rather than claiming a clean released build.

- Level: initial 150 m/s at 1500 m, 60 seconds, altitude excursion about 4.04 m,
  final speed 150.90 m/s. Gates: <25 m excursion and <5 m/s final speed error.
- Turn: 35° target bank, 60 seconds, velocity-heading sweep 155.81°, altitude
  excursion 20.26 m. Gate: >=90° sweep, <100 m excursion, >80 m/s final speed.
- Loop: initial 220 m/s at 5000 m, full throttle and +0.3 pitch input. The
  velocity path completes 360° in 40.55 seconds, reaches 7270.33 m and returns
  to 4496.85 m with 1935.44 m forward displacement. Minimum sampled speed
  145.98 m/s. This is a completed imperfect loop, not a closed geometric circle;
  the acceptance envelope allows <1 km altitude error and <3 km forward error.
- Stall: +0.5 pitch with idle throttle for eight seconds from 90 m/s at 3000 m,
  then altitude/speed feedback. There are 79 stalled diagnostic samples;
  the last is at 8.61 seconds. At 40 seconds speed is 152.59 m/s, altitude
  2566.44 m; the final ten seconds remain unstalled.
- Energy: 30-second idle flight reduces specific energy from 40669.95 to
  36909.74 J/kg; sampled energy never exceeds its starting value.
- Takeoff: from rest at 2.2 m gear clearance, full throttle, +0.12 pitch above
  70 m/s until 30 m clearance, then hold 300 m / 130 m/s. At 45 seconds the
  aircraft is airborne at 237.86 m and 130.73 m/s.
- Approach matches the app preset's relative height 129 m, speed 100 m/s and
  pitch -0.035 rad. Feedback aims 20 m below the surface to descend through
  gear contact, then commands idle throttle and brakes once grounded. Soft
  touchdown is at 24.11 seconds / 2517.08 m forward; stop at 3585.77 m, inside
  the synthetic strip extending 1400–4200 m from the approach start.
- High-sink and water impacts crash. Unknown terrain freezes position/velocity
  and resumes after coverage returns.
- 30/60/144 Hz clocks produce exactly identical states after 7200 physics
  steps. Frame counts are 1800/3600/8641; the final extra 144 Hz frame collects
  a fractional accumulator remainder, not an extra model step.

Diagnostic trajectories are sampled at 10 Hz plus the final step. Numeric
finiteness and quaternion normalization are checked at every 120 Hz step.

Verification:

```sh
bun run harness --output extracted/flight-harness/initial.json
bunx tsc --noEmit --strict --skipLibCheck --moduleResolution bundler --module preserve --target ES2022 --types bun --resolveJsonModule --esModuleInterop tools/harness/index.ts
bunx prettier --ignore-path /dev/null --check tools/harness/index.ts tools/harness/flight.ts
```

The standalone TypeScript invocation without `--skipLibCheck` hit duplicate
installed Node declaration versions (24/26); with the repository's usual library
checking policy the harness source typechecks. Workspace `bun run check` excludes
these tool files from project TypeScript/lint coverage, so the explicit check is
recorded. Prettier also ignores `tools/` by default; the command above checks it
explicitly. This pass does not replace packaged real-terrain or human flight-feel
acceptance.
