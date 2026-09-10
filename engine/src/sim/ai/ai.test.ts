import { describe, expect, test } from 'bun:test';
import { ANY, chancePercentages, parseProgram } from './program';
import {
  activityLabel,
  createAiContext,
  MAX_STATEMENTS,
  offerReason,
  reasonPriority,
  reasonSensor,
  runProgram,
  type AiActionCall,
  type AiHost,
  type AiReason,
} from './vm';

/**
 * Synthetic programs only. The retail `.AI` files are never committed; the
 * developer tool `tools/ai/parse-scripts.ts` parses the real ones from the
 * locally extracted media.
 */
function host(
  sensors: Record<string, number> = {},
  draws: number[] = [],
  reason: AiReason = 'nothing',
): AiHost & { calls: AiActionCall[]; drawn: number[] } {
  let at = 0;
  const calls: AiActionCall[] = [];
  const drawn: number[] = [];
  return {
    calls,
    drawn,
    sensor(name) {
      const dispatch = reasonSensor(reason, name);
      if (dispatch !== undefined) return dispatch;
      const value = sensors[name];
      if (value === undefined) throw new Error(`Unknown sensor ${name}`);
      return value;
    },
    random(bound) {
      // Scripted draws, so every random path is exercised deterministically.
      const value = draws[at++ % Math.max(1, draws.length)] ?? 0;
      drawn.push(value);
      return value % Math.max(1, bound);
    },
    act(call) {
      calls.push(call);
    },
  };
}
const run = (source: string, h: AiHost, reason: AiReason = 'nothing') => {
  const program = parseProgram(source, 'test');
  const context = createAiContext();
  offerReason(context, reason);
  return { program, context, result: runProgram(program, context, h) };
};

describe('parser', () => {
  test('drops comments and resolves labels to instruction indices', () => {
    const program = parseProgram(
      '; leading comment\r\ntop:\r\n\tinvert\t\t; trailing\r\nbottom:\r\n\texit\r\n',
    );
    expect(program.instructions).toHaveLength(2);
    expect(program.labels.get('top')).toBe(0);
    expect(program.labels.get('bottom')).toBe(1);
  });

  test('is case insensitive for actions, sensors and labels', () => {
    const program = parseProgram('homeOnTarget:\n\tif ALT > 100 goto homeontarget\n\tEXIT\n');
    expect(program.labels.has('homeontarget')).toBe(true);
    expect(program.instructions[0]?.kind).toBe('branch');
  });

  test('binds a prefix operator to a single primary', () => {
    // `random 360 - 180` is `(random 360) - 180`, giving -180..179.
    const program = parseProgram('\t%a = random 360 - 180\n');
    const assign = program.instructions[0];
    expect(assign?.kind).toBe('assign');
    if (assign?.kind !== 'assign') throw new Error('expected assign');
    expect(assign.value.kind).toBe('binary');
    if (assign.value.kind !== 'binary') throw new Error('expected binary');
    expect(assign.value.operator).toBe('-');
    expect(assign.value.left.kind).toBe('unary');
  });

  test('separates arguments using unspaced negative literals', () => {
    // Five arguments, two of them negative: the spacing is the only separator.
    const program = parseProgram('\thomePos 0 0 -1000 -1000 6\n');
    const action = program.instructions[0];
    if (action?.kind !== 'action') throw new Error('expected action');
    expect(action.args).toHaveLength(5);
    expect(action.args.map((a) => (a.kind === 'int' ? a.value : NaN))).toEqual([
      0, 0, -1000, -1000, 6,
    ]);
  });

  test('treats a spaced minus as subtraction, keeping the argument count', () => {
    const program = parseProgram('\tmove h - 170 engagep any corner 6\n');
    const action = program.instructions[0];
    if (action?.kind !== 'action') throw new Error('expected action');
    expect(action.args).toHaveLength(5);
    expect(action.args[0]?.kind).toBe('binary');
    // `any` is the inlined sentinel, not a sensor.
    expect(action.args[2]).toEqual({ kind: 'int', value: ANY });
  });

  test('reads a maneuver display name as one localized string', () => {
    const program = parseProgram('\tmaneuver "SPLIT-S;SPLIT-S;IMMELMANN"\n');
    const action = program.instructions[0];
    if (action?.kind !== 'action') throw new Error('expected action');
    expect(action.text).toBe('SPLIT-S;SPLIT-S;IMMELMANN');
    expect(activityLabel(action.text ?? '')).toBe('SPLIT-S');
  });

  test('drops #DEBUG statements as the shipped programs do', () => {
    const program = parseProgram('\t#DEBUG print "hello"\n\texit\n');
    expect(program.instructions).toHaveLength(1);
    expect(program.instructions[0]?.kind).toBe('exit');
  });

  test('compiles .if/.else/.endif to the same conditional jump as if', () => {
    const program = parseProgram(
      '\t.if alt > 100\n\t\tinvert\n\t.else\n\t\tbtoh\n\t.endif\n\texit\n',
    );
    // branch, invert, jump, btoh, exit
    expect(program.instructions.map((i) => i.kind)).toEqual([
      'branch',
      'action',
      'jump',
      'action',
      'exit',
    ]);
    const branch = program.instructions[0];
    if (branch?.kind !== 'branch') throw new Error('expected branch');
    expect(branch.target).toBe(3);
    const jump = program.instructions[2];
    if (jump?.kind !== 'jump') throw new Error('expected jump');
    expect(jump.target).toBe(4);
  });

  test('rejects undefined labels, bad arity and stray directives', () => {
    expect(() => parseProgram('\tgoto nowhere\n')).toThrow(/Undefined label nowhere/);
    expect(() => parseProgram('\tmove h 0\n')).toThrow(/needs 5 arguments/);
    expect(() => parseProgram('\t.else\n')).toThrow(/\.else without \.if/);
    expect(() => parseProgram('\t.if alt > 1\n\tinvert\n')).toThrow(/without \.endif/);
    expect(() => parseProgram('a:\n\tinvert\na:\n\texit\n')).toThrow(/Duplicate label a/);
    expect(() => parseProgram('\twaggle 1\n')).toThrow(/Unknown action waggle/);
  });
});

describe('chance literals', () => {
  test('decodes four two-digit per-skill percentages', () => {
    expect(chancePercentages(16207290)).toEqual([16, 20, 72, 90]);
    // Leading-zero forms are written zero-padded in the source but are decimal.
    expect(chancePercentages(8207284)).toEqual([8, 20, 72, 84]);
    expect(chancePercentages(52240000)).toEqual([52, 24, 0, 0]);
    expect(chancePercentages(40251005)).toEqual([40, 25, 10, 5]);
  });

  test('selects by skill, so an ace takes the best move far more often', () => {
    const source = '\tif chance 11207484 goto best\n\texit\nbest:\n\tinvert\n';
    // A draw of 50 passes only where the skill percentage exceeds it.
    const rookie = run(source, host({ skill: 0 }, [50]));
    expect(rookie.result.outcome).toBe('exited');
    const ace = run(source, host({ skill: 3 }, [50]));
    expect(ace.result.outcome).toBe('suspended');
    expect(ace.result.action?.name).toBe('invert');
  });

  test('clamps an out-of-range skill rather than reading past the table', () => {
    const source = '\tif chance 11207484 goto best\n\texit\nbest:\n\tinvert\n';
    expect(run(source, host({ skill: 9 }, [50])).result.outcome).toBe('suspended');
    expect(run(source, host({ skill: -4 }, [50])).result.outcome).toBe('exited');
  });
});

describe('expression evaluation', () => {
  test('evaluates operands right to left without short-circuiting', () => {
    // Both draws must be consumed even though the left operand is false, or the
    // random sequence desynchronises from the original.
    const h = host({ alt: 0 }, [90, 10]);
    const source = '\tif alt > 100 && percent 50 goto yes\n\texit\nyes:\n\tinvert\n';
    const { result } = run(source, h);
    expect(result.outcome).toBe('exited');
    expect(h.drawn).toHaveLength(1);
  });

  test('draws for every random operand in a chain', () => {
    const h = host({ alt: 0 }, [10, 10, 10]);
    run('\tif percent 50 && percent 50 && percent 50 goto y\n\texit\ny:\n\tinvert\n', h);
    expect(h.drawn).toHaveLength(3);
  });

  test('truncates integer division toward zero and guards a zero divisor', () => {
    const h = host({ alt: 7 });
    const { context } = run('\t%a = alt / 2\n\t%b = alt / 0\n\t%c = 0 - alt / 2\n\texit\n', h);
    expect(context.vars[0]).toBe(3);
    expect(context.vars[1]).toBe(0);
    expect(context.vars[2]).toBe(-3);
  });

  test('applies not, neg and abs', () => {
    const h = host({ alt: 0, pdiff: -25 });
    const { context } = run('\t%a = not alt\n\t%b = abs pdiff\n\t%c = neg pdiff\n\texit\n', h);
    expect(context.vars).toEqual([1, 25, 25, 0]);
  });

  test('refuses an unknown sensor instead of defaulting to zero', () => {
    expect(() => run('\t%a = bogus\n\texit\n', host({}))).toThrow(/Unknown sensor bogus/);
  });
});

describe('control flow', () => {
  test('a switch selects only among its listed labels and otherwise falls through', () => {
    const source =
      '\tswitch random 8 a b\n\tgoto fell\na:\n\tinvert\nb:\n\tbtoh\nfell:\n\timmelman corner\n';
    const h = host({ corner: 400 }, [0]);
    expect(run(source, h).result.action?.name).toBe('invert');
    expect(run(source, host({ corner: 400 }, [1])).result.action?.name).toBe('btoh');
    // Index 5 is past the two labels, so control reaches the following goto.
    expect(run(source, host({ corner: 400 }, [5])).result.action?.name).toBe('immelman');
  });

  test('duplicated switch labels weight the table', () => {
    const source = '\tswitch random 3 a b b\n\texit\na:\n\tinvert\nb:\n\tbtoh\n';
    expect(run(source, host({}, [0])).result.action?.name).toBe('invert');
    expect(run(source, host({}, [1])).result.action?.name).toBe('btoh');
    expect(run(source, host({}, [2])).result.action?.name).toBe('btoh');
  });

  test('an action suspends the program and resumes at the next statement', () => {
    const program = parseProgram('\tinvert\n\tbtoh\n\texit\n');
    const context = createAiContext();
    offerReason(context, 'attack');
    const h = host();
    expect(runProgram(program, context, h).action?.name).toBe('invert');
    expect(context.ip).toBe(1);
    expect(runProgram(program, context, h).action?.name).toBe('btoh');
    expect(runProgram(program, context, h).outcome).toBe('exited');
    expect(context.running).toBe(false);
  });

  test('a sensor loop around an action terminates when the sensor changes', () => {
    // The retail ground-attack loops rely on sensors being re-read after the
    // action completes, not on the values captured when the program started.
    const program = parseProgram(
      'boring1:\n\tmaneuver "GND ATTACK;BODENANGRIFF;ATTAQUE AU SOL"\n\thomePos 0 0 0 corner 1\n\tif tgt && hrzdisttotgt > 2000 goto boring1\n\trestart\n',
    );
    const context = createAiContext();
    offerReason(context, 'attack');
    const sensors = { tgt: 1, hrzdisttotgt: 5000, corner: 400 };
    const h = host(sensors);
    // maneuver, then homePos, then the loop test sends us back to the top.
    expect(runProgram(program, context, h).action?.name).toBe('maneuver');
    expect(runProgram(program, context, h).action?.name).toBe('homepos');
    expect(runProgram(program, context, h).action?.name).toBe('maneuver');
    sensors.hrzdisttotgt = 500;
    expect(runProgram(program, context, h).action?.name).toBe('homepos');
    // Now the loop test fails, `restart` runs, and the program re-dispatches.
    expect(runProgram(program, context, h).action?.name).toBe('maneuver');
    expect(context.activity).toBe('GND ATTACK;BODENANGRIFF;ATTAQUE AU SOL');
  });

  test('records the maneuver name as the displayed activity', () => {
    const program = parseProgram('\tmaneuver "PURSUIT;VERFOLGUNG;POURSUITE"\n\tinvert\n\texit\n');
    const context = createAiContext();
    offerReason(context, 'attack');
    const h = host();
    runProgram(program, context, h);
    expect(activityLabel(context.activity)).toBe('PURSUIT');
    // An action with no name of its own leaves the previous activity showing.
    runProgram(program, context, h);
    expect(activityLabel(context.activity)).toBe('PURSUIT');
  });

  test('stops at the recovered statement budget instead of spinning', () => {
    const program = parseProgram('spin:\n\tgoto spin\n');
    const context = createAiContext();
    offerReason(context, 'attack');
    const result = runProgram(program, context, host());
    expect(result.outcome).toBe('overrun');
    expect(result.statements).toBe(MAX_STATEMENTS);
    expect(context.running).toBe(false);
  });

  test('keeps scratch slots across suspension and restart', () => {
    const program = parseProgram('\t%a = 7\n\tinvert\n\t%b = %a + 1\n\texit\n');
    const context = createAiContext();
    offerReason(context, 'attack');
    const h = host();
    runProgram(program, context, h);
    expect(context.vars[0]).toBe(7);
    runProgram(program, context, h);
    expect(context.vars[1]).toBe(8);
  });
});

describe('reason dispatch', () => {
  test('answers the do_ predicates from the current reason', () => {
    expect(reasonSensor('attack', 'do_attack')).toBe(1);
    expect(reasonSensor('attack', 'do_evade')).toBe(0);
    expect(reasonSensor('attack', 'alt')).toBeUndefined();
    // Not every do_ name is a reason; an unknown one must stay unhandled.
    expect(reasonSensor('attack', 'do_lunch')).toBeUndefined();
  });

  test('orders priority so being hit outranks evading', () => {
    expect(reasonPriority('hit')).toBeGreaterThan(reasonPriority('ir_launch'));
    expect(reasonPriority('ir_launch')).toBeGreaterThan(reasonPriority('radar_launch'));
    expect(reasonPriority('radar_launch')).toBeGreaterThan(reasonPriority('attack'));
    expect(reasonPriority('attack')).toBeGreaterThan(reasonPriority('evade'));
    expect(reasonPriority('evade')).toBeGreaterThan(reasonPriority('nothing'));
  });

  test('preempts only for a strictly higher reason', () => {
    const context = createAiContext();
    expect(offerReason(context, 'attack')).toBe(true);
    context.ip = 12;
    // Equal or lower priority must not restart a running program.
    expect(offerReason(context, 'attack')).toBe(false);
    expect(offerReason(context, 'evade')).toBe(false);
    expect(context.ip).toBe(12);
    expect(offerReason(context, 'hit')).toBe(true);
    expect(context.ip).toBe(0);
    expect(context.reason).toBe('hit');
  });

  test('accepts any reason once the program has exited', () => {
    const context = createAiContext();
    offerReason(context, 'hit');
    context.running = false;
    expect(offerReason(context, 'nothing')).toBe(true);
    expect(context.reason).toBe('nothing');
  });

  test('dispatches to the block matching the reason', () => {
    const source =
      '\tif do_nothing goto nothing\n\tif do_evade goto evade\n\tif do_attack goto attack\n\texit\nnothing:\n\texit\nevade:\n\tbtoh\n\trestart\nattack:\n\tinvert\n\trestart\n';
    const program = parseProgram(source);
    for (const [reason, action] of [
      ['evade', 'btoh'],
      ['attack', 'invert'],
    ] as const) {
      const context = createAiContext();
      offerReason(context, reason);
      const h: AiHost = {
        sensor: (name) => reasonSensor(reason, name) ?? 0,
        random: () => 0,
        act: () => undefined,
      };
      expect(runProgram(program, context, h).action?.name).toBe(action);
    }
    // `nothing` exits without queueing anything, leaving the aircraft as it was.
    const idle = createAiContext();
    offerReason(idle, 'nothing');
    const result = runProgram(program, idle, {
      sensor: (name) => reasonSensor('nothing', name) ?? 0,
      random: () => 0,
      act: () => undefined,
    });
    expect(result.outcome).toBe('exited');
    expect(result.action).toBeUndefined();
  });
});
