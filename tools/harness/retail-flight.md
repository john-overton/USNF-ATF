# Imported F-14 flight acceptance

```sh
PYTHONPATH=tools/retail python3 -m retail.flight --pt extracted/usnf97/USNF_2.LIB/F14.PT --out extracted/flight/f14-flight.json
bun tools/harness/retail-flight.ts --profile extracted/flight/f14-flight.json --output extracted/flight-harness/retail-flight.json
```

This is a separate, locally supplied media acceptance tool. It is not included
in `bun run check` or the original trainer's `bun run harness`.
Missing/malformed input fails explicitly. All profile bytes and reports stay in
ignored `extracted/`; no retail fixture is committed.

Fourteen maneuvers exercise the real fixed 120 Hz solver, with feedback commands
and no mid-maneuver state or velocity edits:

- Six 600-second level accelerations: military and afterburner at 100 m, 3,000 m
  and 10,972.8 m (36,000 ft). Clean gear/flaps/airbrake, empty plus full internal
  fuel reference mass, original 52.5 m² wing-area assumption. AB equilibrium must
  approach the imported 1 G upper polygon intersection within 5%; altitude
  excursion stays below 30 m, final load factor within 3% of 1 G, final 30-second
  speed change below 1.5 m/s. AB must exceed military speed by at least 10%.
- Two equal-condition 60-second accelerations at full and empty internal fuel
  mass. The lighter airplane must accelerate faster with the same fixed polar
  calibration. This is a mass comparison, not implemented fuel consumption.
- Four equal-condition 15-second engine-off runs: clean, flaps, gear and airbrake.
  Each device must dissipate more mechanical energy than the clean airplane.
- Two four-second high-pitch demands at 65% of the imported 1 G lower speed:
  clean and flapped. Both must exhibit deep stall; flaps must show some lift
  benefit while failing to eliminate the stall.

The report includes exact Git HEAD, working-tree status, profile path and SHA,
scenario setup, metrics and one-second trajectory samples. Run again after a
source commit for a baseline with unambiguous final-source provenance. Failed
assertions leave the error in command output and do not produce a passing report.

The solver is original code calibrated against native parameter data. These tests
verify that calibration and physical trends; they do not establish native USNF97
acceleration, handling, stall, fuel, stores or damage parity. Fixed exponential
atmosphere/thrust lapse, wing area, control laws and some device semantics remain
remake assumptions. G polygons are data bounds, not captured retail flight runs.
The tests compare true speed in m/s, converted to knots only when reporting.
