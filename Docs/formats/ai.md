# AI, BI: the scripted AI virtual machine

Status: **partial, in progress** (the source language is decoded and every
shipped program parses; the `.BI` bytecode opcode table is recovered; several
action argument semantics and the exact suspension model remain hypotheses).
Reader: the TypeScript parser `engine/src/sim/ai/program.ts`, exercised over
the locally extracted corpus by

    bun tools/ai/parse-scripts.ts
    bun tools/ai/parse-scripts.ts --verbose

That command parses every extracted `.AI`, reports instruction and label
counts, tallies the actions and sensors each program uses, and decodes every
`chance` literal. It skips cleanly when retail media is absent. The
interpreter is `engine/src/sim/ai/vm.ts`; its unit tests use synthetic
programs, because retail bytes are never committed.

Non-player aircraft behaviour in USNF'97 and ATF Gold is **not hardcoded**.
It is a small scripted virtual machine, and the behaviour programs ship as
readable text. This is the single most reusable thing on either disc: the
remake can run the original programs rather than approximate them.

## Naming

The executables call the language **"Chuck-Talk"**. Observed, certain: the
error strings `Chuck-Talk error: %s, line %u.`, `Unknown opcode`,
`Label too long`, `Stack overflow`, `Undefined label` and
`'Call by name' to unknown proc` sit together in `USNF.EXE`, indexed by a
13-entry dispatch table.

## The corpus

Eight programs in USNF'97, nine in ATF Gold. The eight shared files are
**byte-identical between the two games**; ATF Gold adds `F117.AI`.

| Program | Bytes | Instructions | Labels | Sensors | Used by |
|---|---|---|---|---|---|
| `F.AI` | 20,616 | 424 | 70 | 37 | 105 fighters and strike aircraft |
| `F117.AI` | 18,823 | 380 | 60 | 37 | 1 (ATF Gold only) |
| `MOTH.AI` | 18,422 | 381 | 60 | 37 | 3 |
| `H.AI` | 12,412 | 266 | 49 | 31 | 14 helicopters |
| `B.AI` | 3,970 | 69 | 11 | 21 | 9 bombers |
| `AC130.AI` | 3,728 | 59 | 9 | 17 | 2 |
| `HYDRO.AI` | 1,816 | 28 | 8 | 11 | 1 surface vessel |
| `LARGE.AI` | 960 | 12 | 2 | 5 | 10 transports and AWACS |
| `LINER.AI` | 917 | 12 | 2 | 5 | 9 airliners |

Instruction, label and sensor counts are from our own parser, so they measure
our compilation rather than the original's. Text is CP437 with CRLF endings;
every byte above 127 appears only inside the localized `maneuver` display
strings, so reading the source as latin1 round-trips it.

`MOTH.AI` and `F117.AI` are copies of `F.AI` differing only in the
ground-attack section. `LINER.AI` is `LARGE.AI` with different comments; its
own header still says `airline.ai`.

**Binding**: a `.PT` or `.NT`'s `ctName` field names the program. See the
dated correction in [object-types.md](object-types.md) — that field was
previously and wrongly documented as a cockpit definition.

## `.BI` is a bytecode container, not machine code

Correction (2026-09-09): earlier notes in this repository described `.BI` as
compiled x86. It is not.

Observed: a `.BI` is a PE32 image whose signature is `PL\0\0` rather than
`PE\0\0`, machine `0x14c`, ImageBase 0, **entry point 0, no exports**, with
sections `CODE`, `.idata` and `.reloc`. The `CODE` section holds a **custom
stack bytecode**. The only x86 in the file is a table of 6-byte `jmp [IAT]`
thunks at the end of `CODE`; the bytecode's `CALL` opcode embeds a thunk
address, which is how the VM binds sensor and action symbols through ordinary
PE import machinery, and why `.reloc` is large.

Recovered opcode table, each verified against the source line it came from:

| Op | Operand | Meaning |
|---|---|---|
| `01` | imm32 | push signed 32-bit constant |
| `02` | imm16 | push signed 16-bit constant |
| `03` | imm8 | push signed 8-bit constant |
| `04` | — | end of action / yield |
| `05` | u8 | store to variable slot |
| `06` | u8 | load variable slot |
| `07` | asciiz | push inline string literal |
| `08`–`0c` | — | MUL, DIV, MOD, ADD, SUB |
| `12`–`16` | — | GT, GE, LE, LT, EQ |
| `18`, `19` | — | AND, OR |
| `1a`–`1c` | — | ABS, NEG, NOT |
| `1d`–`1f` | — | RANDOM, PERCENT, CHANCE |
| `20` | u16 | jump to absolute `CODE` offset |
| `23` | u16 | jump if false, popping the condition |
| `24` | u8 n, n×u16 | switch jump table |
| `25` | — | end of program; appears once, last |
| `26` | ptr32 | call a VM routine through an import thunk |
| `28` | u16, u16 | source line and byte-offset debug marker |

Two consequences matter for a faithful interpreter, and both are covered by
tests in `engine/src/sim/ai/ai.test.ts`:

- **`any` is the literal `2147483647`** (`0x7FFFFFFF`), inlined by the
  original compiler. An engine symbol `_CTEval_any` exists but no `.BI`
  imports it.
- **Operands evaluate right to left with no short-circuiting.**
  `if %a > 0 && alt > 5000 && speed < minSpeed + 75` emits the rightmost
  comparison first and both `AND`s last. So in
  `if distToTgt > 3000 && betterSpeed && percent 50 goto …` the `percent 50`
  draw happens first and *always*, even when the left conditions are false.
  An interpreter that short-circuits desynchronises the random sequence and
  changes tactics.

The `28` markers show the shipped text is a slightly later revision than what
was compiled: line drift is 0 at the top of `F.AI` and grows to +23 by the
end, +6 in `AC130.AI`, and exactly 0 throughout `LARGE.AI`. Semantics are
unaffected.

## Grammar

```
program    := { line }
line       := [ label | statement | directive ] [ comment ] EOL
comment    := ';' rest-of-line
label      := IDENT ':'
directive  := '.if' cond | '.else' | '.endif' | '#DEBUG' statement
statement  := action | assignment | 'goto' IDENT | 'restart' | 'exit'
            | 'switch' expr IDENT { IDENT }
            | 'if' cond [','] ( 'goto' IDENT | statement )
assignment := VAR '=' expr
VAR        := '%' [a-d]
cond       := expr { ('&&'|'||') expr }
expr       := term { ('+'|'-'|'*'|'/'|'%') term }          ; left associative
term       := INT | VAR | sensor | 'not' term | 'neg' term | 'abs' term
            | 'random' term | 'percent' term | 'chance' INT8DIGITS
INT        := ['-'] digit+                                 ; decimal integers only
```

Observed properties of the whole corpus:

- **Case insensitive** throughout, including label references: `goto
  homeontarget` reaches `homeOnTarget:`.
- Labels are compile-time only; nothing survives into the `.BI`. Several may
  stack on consecutive lines and alias the same code, which is how
  `ir_launch:` and `radar_launch:` share a handler in five programs.
- Tabs and runs of spaces are equivalent separators.
- An optional comma may sit between an `if` condition and its statement.
- No parentheses, no `!=`, no floating point, no hexadecimal and no string
  escapes appear anywhere.
- `.if` is never nested and there is no `.elseif`. It compiles to the same
  conditional jump as `if`; it is only sugar for multi-statement blocks.
- `#DEBUG` statements — all 11 are `#DEBUG print "…"` — are **absent from the
  shipped `.BI`**, so a release build drops them. Our parser drops them too.

**Precedence**, tightest first: prefix `random`/`percent`/`chance`/`not`/
`neg`/`abs`, which bind exactly one primary, so `random 360 - 180` is
`(random 360) - 180`; then `* / %`; then `+ -`; then the comparisons; then
`&&` and `||`. The relative precedence of `&&` against `||` is **not
determinable**: no line in the corpus mixes them, so either choice is
faithful. Truthiness is non-zero.

**Argument separation is whitespace only**, which makes one lexical rule
load-bearing: a negative literal is written with no gap after the sign, as in
`homePos 0 0 -1000 -1000 6`, whereas subtraction is always spaced, as in
`h - 170`. Reading `-1000` as subtraction would silently merge two arguments
into one and change the arity.

**Variables**: only `%a` (374 references), `%b` (78), `%c` (28) and `%d` (18)
occur, compiled to slots 0–3 with a `u8` index, so the VM allows up to 256.
Hypothesis, medium confidence: they are per-aircraft scratch registers that
persist across suspension and `restart`. The frame must persist across a
suspended action anyway, since `homeOnOffset` carries `%a`/`%b` across four
suspending `homePos` calls.

## Actions

Arity verified against the compiled bytecode. Angles are degrees, distances
and altitudes feet, and the trailing `time` argument is a minimum hold in
seconds — the last confirmed by source comments such as "pop up for at least
4 seconds" annotating `homeAngle 0 25 0 corner 4`.

| Action | Uses | Arguments | Notes |
|---|---|---|---|
| `move` | 253 | heading, pitch, roll, speed, time | Absolute attitude; relative turns are written `h + 170`. `roll = any` means don't care |
| `maneuver` | 140 | one string | **Display name only.** Sets the "Activity" text; no behaviour |
| `homePos` | 81 | dx, dy, dz, speed, time | Offset **from the target** in feet: dx lateral, dy vertical (positive above), dz along-track (negative behind) |
| `wm_break` | 38 | dh, dp | Order the wingman to break, relative degrees |
| `jink` | 25 | heading, pitch, hAmp, vAmp, ?, count, speed, time | `hAmp`/`vAmp` are swing amplitudes in degrees |
| `homeAngle` | 18 | dh, dp, droll, speed, time | Angular offset relative to the target line |
| `invert` | 12 | — | Roll inverted; used inside `loop` and `diveBomb` |
| `wm_approach` | 12 | dh, dp, speed | |
| `moveToAlt` | 11 | heading, alt, speed, time | Absolute feet |
| `wm_hspacing` | 7 | feet | Formation horizontal spacing |
| `btoh` | 5 | — | "Bank to heading", after the rolling part of `split_s` |
| `yoyo` | 5 | angle, speed, time | Only ever `yoyo 40 corner 8` |
| `immelman` | 5 | speed | |
| `circle` | 2 | 6 arguments | The AC-130 pylon turn; the only `circle` in the corpus |

Counts are total occurrences across all 17 extracted files, so the
near-duplicate `F`/`MOTH`/`F117` family inflates fighter tactics roughly
threefold.

`restart` (137 uses) re-enters the program from the top. `exit` (29) ends the
run. Both are control flow rather than actions.

## Sensors

39 distinct names are used. The most heavily used are `h` (243 references),
`corner` (196), `maxSpeed` (155), `alt` (92), `tgtAhead` (87), `engageP` (82)
and `distToTgt` (78). Units recovered from the executable:

| Sensor | Returns |
|---|---|
| `alt` | Own altitude minus terrain height beneath, **feet AGL** |
| `altDiff` | Own altitude minus target's, feet |
| `h`, `hToTgt` | Heading and bearing to target, degrees, normalized 0–359 |
| `p`, `b` | Own pitch and bank, signed degrees |
| `distToTgt`, `hrzDistToTgt` | Feet |
| `skill` | The raw mission `skill` byte, 0–3 |
| `cloudalt` | A hardcoded constant **10,000** — the cloud layer is not data |

The executable stores angles as 16-bit binary angles at 182.04 units per
degree and converts on the way out, which is why script angles are plain
degrees.

Open, low confidence: `corner` and `cornerSpeed` are **different** engine
symbols. `maxSpeed`, `minSpeed` and `cornerSpeed` are certainly numeric
because they appear in arithmetic (`%a = cornerSpeed + maxSpeed`), but
`corner` appears only in speed slots and never in arithmetic, so it may be a
sentinel meaning "fly at corner velocity" rather than a value.

Open: **negative speed operands**. `homePos %b %c %d -750 %a` and
`homePos 0 0 -1000 -1000 6` pass a negative speed. Candidate readings are
closure speed relative to the target, target speed minus the magnitude, or a
separate sentinel range. Only the first makes tactical sense for a pursuit.
Settle at `_CTDo_homepos`.

## Execution model

Every program opens with a straight-line chain of `if do_X goto X` followed by
a bare `exit`. The `do_*` predicates mean **the engine has already chosen the
tactical state and the script dispatches to it**; they are readable at any
point, not only at entry, and `H.AI`'s `bestMove` re-tests `do_evade`
mid-tactic.

Six reasons, with the recovered priority order:

| Code | Reason | Notes |
|---|---|---|
| 0 | `nothing` | |
| 1 | `evade` | |
| 2 | `attack` | Two call sites |
| 3 | `radar_launch` | A radar missile was launched at this aircraft |
| 4 | `ir_launch` | An IR missile was launched |
| 5 | `hit` | |

Observed, certain: a new reason **preempts a running program only when its
number is strictly greater**, so being hit interrupts evading but evading
cannot interrupt being hit. Observed: the AI is **event driven with no fixed
tick** — the six call sites are all events, all skipped for human-flown
aircraft. A run is capped at **5,000 statements**, after which the program is
forced to exit.

`LARGE.AI` and `LINER.AI` handle only `do_hit` and `do_evade` and exit
immediately otherwise. `HYDRO.AI` handles only `do_attack`, and only against
ships.

**Actions suspend the program.** Observed: every action call is immediately
followed by opcode `04`, and `04` follows nothing else. The sensor loops
depend on it — this cannot terminate unless sensors are re-read after
`homePos` completes:

```
boring1:
	maneuver "GND ATTACK;BODENANGRIFF;ATTAQUE AU SOL"
	homePos 0 0 0 corner 1
	if tgt && hrzDistToTgt > 2000 goto boring1
```

Confidence is high that a program resumes at the following statement with
fresh sensors once the action's minimum duration elapses. What remains open
(hypothesis) is the depth: whether `04` returns after queueing one command, or
the program keeps running until a command *buffer* fills. A cancellable
command buffer exists in the engine, and multi-step sequences such as
`vertScissors`'s three identical `move`s and `loop`'s six statements read as
though they were meant to queue as a unit. Our interpreter suspends on every
action, which is the conservative reading.

## The skill model

`skill` is the mission file's per-object byte, 0–3. The Pro Mission Creator
names the levels **novice, average, good, expert**; the quick-mission screen
and the in-flight target window call the same values Novice, Average,
Experienced and Ace.

### `chance` is a per-skill probability table

Observed, confirmed from the handler's own arithmetic: `chance ABCDEFGH`
carries **four two-digit percentages, leftmost for skill 0**. The handler
divides the operand by 100 exactly `3 - skill` times, takes it modulo 100, and
tests that percentage. Extraction is decimal:

```
p[0] = n / 1000000      p[1] = (n / 10000) % 100
p[2] = (n / 100) % 100  p[3] = n % 100
```

All 14 literals in the corpus, as our tool decodes them. Every field is in
0–99 and every literal is monotone in the direction its use requires, which is
what pins the index to skill:

| Literal | 0 | 1 | 2 | 3 | Uses | Role |
|---|--:|--:|--:|--:|--:|---|
| `08207284` | 8 | 20 | 72 | 84 | 5 | best attack, target ahead and away |
| `11207484` | 11 | 20 | 74 | 84 | 7 | best attack, target ahead and facing |
| `16207284` | 16 | 20 | 72 | 84 | 7 | best attack, target behind and away |
| `16207290` | 16 | 20 | 72 | 90 | 7 | best attack, target behind and facing |
| `20507284` | 20 | 50 | 72 | 84 | 2 | helicopter equivalent |
| `35507595` | 35 | 50 | 75 | 95 | 5 | vertical jink while pursued, to spoil aim |
| `40251005` | 40 | 25 | 10 | 5 | 6 | evade: low skill just flies straight |
| `42201004` | 42 | 20 | 10 | 4 | 7 | random move instead |
| `42201406` | 42 | 20 | 14 | 6 | 7 | random move instead |
| `50341406` | 50 | 34 | 14 | 6 | 7 | random move instead |
| `52240000` | 52 | 24 | 0 | 0 | 7 | inside the random menu, fly straight |
| `72301206` | 72 | 30 | 12 | 6 | 2 | helicopter equivalent |
| `72401206` | 72 | 40 | 12 | 6 | 5 | random move instead |
| `80604010` | 80 | 60 | 40 | 10 | 2 | helicopter: skip evading |

The paired "best" and "random" literals do **not** sum to 100, and should not:
they are sequential guards, the second reached only when the first fails, with
fall-through to the state-specific tactics after both. In the target-ahead-and-
facing state that gives a novice 11% best / 44.5% random / 44.5% scripted, and
an expert 84% / 1% / 15%.

### Skill elsewhere in the scripts

Two direct uses, and no `skill >` or `skill <` comparison anywhere:

- `if skill == 0 && random 100 < 40 goto straight`, under the comment "make
  unskilled pilots easy to shoot down". `H.AI` writes the same idea as
  `percent 40`.
- The **aim-error ladder**: skill 0 sets `%a = 100`, 1 sets 50, 2 sets 30, 3
  sets 10, then `%b`/`%c`/`%d` each take `random %a` and feed a `homePos`
  offset. A novice's pursuit point is displaced up to 100 units per axis, an
  expert's up to 10. `H.AI` uses 60/50/30/10.

### Skill effects that are code, not script

Observed in the executables, so they apply regardless of which program runs:

- **G penalty.** After the available-G envelope is computed, an aircraft that
  is not human-flown and has skill 0 or 1 loses **1 G on each side, floored at
  ±2 G**. Hypothesis, medium: the exempting flag is "human-flown".
- **Missile reaction.** On a missile-launch event, a per-skill table
  `{35, 50, 75, 90}` percent gates a scheduling path. Hypothesis, medium: this
  is countermeasure release, separate from the script's `evade`, which runs
  unconditionally.

### The mission header's skill fields are a designer convenience

Observed arithmetic: the four `.M` header fields (`usAirSkill`,
`themAirSkill`, `usGroundSkill`, `themGroundSkill`) drive an editor routine
that walks matching objects and **re-rolls each one's skill with a ±1 jitter**
— 33% one level worse, 35% unchanged, 32% one level better, clamped to 0–3.
The per-object `skill` in the file is the *result*.

No read of those header globals was found in simulation code: only the editor
path and the `.M` writer. The `.M` parser does set them but does not run the
applier. Hypothesis, medium-high: **at runtime only per-object `skill`
matters**, which is consistent with the header being `1 1 1 1` in 350 of 365
full missions. See [mission.md](mission.md).

## Program personalities

- **`F.AI`** — the full air-combat library: straight, climb, dive, break left
  and right, turn around, vertical and horizontal scissors, split-S, loop,
  Immelmann, high yo-yo, horizontal and vertical jink, overshoot, reverse,
  several pursuit variants, a separation manoeuvre, and offset and overhead
  passes. A `last_ditch` weighted menu fires when something is within 5,000 ft
  dead astern. An "interesting approach" is reserved for head-on merges
  **against a human player** between 5,000 and 20,000 ft. Wingman coordination
  covers a hi-lo split and a bracket. It carries the only complete
  ground-attack suite: a straight run, a pop-up, a standoff pass that its own
  comment says "assumes we have air-to-ground missiles", and a dive-bomb
  sequence, each ending in a jinking egress to 30,000 ft before turning back.
- **`F117.AI`** — identical air combat; ground attack is reduced to a single
  high pass 5,000 ft above the target.
- **`MOTH.AI`** — an easter egg. `F.AI`'s air combat verbatim, one low ground
  run, and egress distances shrunk from 10,000/30,000 ft to 3,000/4,000 ft.
- **`H.AI`** — helicopters. No loop, split-S, Immelmann, vertical scissors or
  yo-yo; a 30° climb instead of 45°; `overshoot` turns instead of climbing,
  with its own comment noting the difference from the fighter version. Adds an
  underneath pass as the surprise option against a human.
- **`B.AI`** — bombers, with **no air-to-air behaviour at all**: its `plane`
  handler is a bare `exit` commented "this should never happen". One high
  attack pass, then egress to 50,000 ft; evasion is a skill gate, a climb
  against ground threats, or a jink away from the threat.
- **`AC130.AI`** — `B.AI` with one substitution: a left pylon turn, repeated
  until the target is destroyed.
- **`LARGE.AI` / `LINER.AI`** — hit and evade only. `hit` is a single
  wallowing descent; a commented-out `print "AIRLINER: 'Emergency!
  Emergency!'"` survives in the text.
- **`HYDRO.AI`** — a three-phase surface attack run against ships only.

## Display names

`maneuver "ENGLISH;GERMAN;FRENCH"` stores three semicolon-separated
localizations in one literal, and sets only the text the target window shows
as the aircraft's "Activity". 20 distinct triples exist. Several actions set
no name at all — the jinks, the scissors in `H.AI`, `immelman`, the yo-yo,
every `wm_*` order, the egress, and all of `HYDRO`/`LARGE`/`LINER` — so the
readout keeps whatever was set last. The French for `SPLIT-S` is `IMMELMANN`,
which looks like a retail translation error.

## Retail quirks worth preserving

Reproduced deliberately rather than fixed, because the original behaviour is
the target:

- `H.AI`'s `offset_loop` tests `if %d > 4` but never increments `%d`; the
  sibling `offset_loop2` does.
- Two `homeAngle` calls place `corner` in the roll slot and `0` in the speed
  slot, which reads as a transposition against every other use.
- `fastLittleJink` (in the `F` family) and `offset_done` (in `H`) are dead
  labels: nothing jumps to them. Our parser's reachability check finds exactly
  these two, independently.
- `brent:` is a stray developer label.

## There is no `main.dll`

Every `.BI`, `.HUD`, `.PTS` and `.MC` module names `main.dll` as its single
import source, but **no such file exists on either disc** and the string never
appears in either executable. The host executable *is* `main.dll`: an
in-process binder walks the import thunks and resolves each import name
against the executable's own symbol table, shipped beside it as `USNF.SMS`
(3,440 symbols) or `ATF.SMS` (3,615). Do not go looking for the DLL.

## Engine-side API the shipped programs never use

53 VM symbols exist in the executable but are imported by none of the nine
`.BI` files, so they are either dead or driven from elsewhere. Notable
actions: `_CTDo_splits` — the engine has a native split-S, yet `F.AI`
hand-builds one out of `move` and `btoh` — plus `turn`, `rudder`, `uhomepos`,
`wm_control`, `wm_formation`, `wm_vspacing`, `play`, `print` and `printnum`.
Notable sensors: `tgtAspectAngle`, `tgtAttackingMe`, `tgtAttackingAnyone`,
`tgtClass`, `tgtIsSam`, `tgtIsAaa`, `tgtIsBomber`, `radar`, `ir`, `time`,
`turnRate`, `twr`, `maxRange`, `bestRange`, `distToWaypoint`, `waypointAlt`
and the `wm_*_is` readbacks. `_CTEval_time` appears in the corpus only inside
a commented-out block.

Their existence is useful evidence about what the engine could answer, and a
menu for any original behaviour we add, but nothing in the shipped programs
depends on them.

## Open questions and how to settle them

Each names the routine whose disassembly would answer it. The methodology and
tooling are the ones already used in
[native-flight-code.md](native-flight-code.md).

1. Does an action return after queueing one command, or run on until a command
   buffer fills? — the program-execution entry point.
2. `move` argument order and units, and the meaning of a negative speed. —
   `_CTDo_move`.
3. `homePos` axis convention and its negative speed. — `_CTDo_homepos`.
4. `jink`'s fifth argument, which is 0 in all 25 uses. — `_CTDo_jink`.
5. `circle`'s six arguments; only one call exists, so the data cannot
   disambiguate them. — `_CTDo_circle`.
6. Is `corner` a value or a sentinel, and how does it differ from
   `cornerSpeed`? — the two distinct evaluator symbols.
7. `homeAngle`'s reference frame, and whether the apparent argument
   transposition is benign. — `_CTDo_homeangle`.
8. The exact generator behind `random`, `percent` and `chance`. These are VM
   opcodes, not engine calls, so the generator lives in the interpreter loop.
   Until it is recovered, our implementation uses the project's existing seeded
   xorshift, which reproduces a sequence exactly but is **not** the original
   sequence.
9. Whether `%a`–`%d` really persist across `restart`, and what they hold on a
   program's first run.

Parser success is not behavioural parity. Every program parsing and every
`chance` literal decoding coherently is strong evidence the language is
understood; matching the original's flown tactics is a separate milestone that
needs the action semantics above and a side-by-side comparison against actual
retail execution.
