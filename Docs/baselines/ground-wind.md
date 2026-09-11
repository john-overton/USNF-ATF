# Ground wind assistance — 2026-09-11

Source: `aa530d0c0cfada24d27594dbe345d2a2bcde5895` plus working tree.
Linux x86_64, Bun 1.4.2. This is an authored handling adjustment requested for
slow taxi, not a recovered native wind-force law.

While state is grounded, applied wind velocity is multiplied by
`0.05 + 0.95 * min(1, horizontalGroundSpeed / (150 * 1852 / 3600))`.
Ground speed is horizontal velocity magnitude, independent of heading, vertical
speed and the weather's wind speed. Rest = 5%, 2 kt = 6.333%, 75 kt = 52.5%,
150 kt or faster = 100%. Airborne states always receive full wind.

`ground-wind.ts` produces a physics-only environment without mutating the weather
field. The retail/recovered integrator uses it for aerodynamic evaluation; true
airspeed telemetry retains the actual wind. FlightLayer supplies the same adapter
to the assisted comparison integrator and resamples its actual-air telemetry.
The preserved `assisted-flight.ts` source is unchanged. This attenuates the input
wind vector, not thrust, all aerodynamic forces, or the aircraft's ground velocity;
resulting forces still follow the existing nonlinear aerodynamics.

Verification:

```sh
bun test engine/src/sim/flight/ground-wind.test.ts engine/src/sim/flight/wind.test.ts
bun run check
bun -e 'import { buildUnpackaged } from "./shell/scripts/build.ts"; await buildUnpackaged();'
git diff --check
```

Focused tests: 8 passed, covering rest/taxi/midpoint/threshold/clamping, cross-axis
motion, airborne identity, unchanged weather and true-air telemetry, integrator
input, static tire grip and calm-wind identity. An initial lint failure for an
unbound test fixture method was corrected with an arrow forwarding function.
Full workspace check: 464 passed, 3 optional imported-gun tests skipped, 0 failed.
Typecheck, lint, formatting and fresh desktop bundle build pass. No new desktop
visual smoke was required for this physics-only adjustment; taxi feel remains a
manual assessment. Restart the built app, taxi under a crosswind and accelerate
toward 150 kt; the ramp is linear and stops applying once airborne.
