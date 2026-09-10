/**
 * Interpreter for the retail AI behaviour programs. See `Docs/formats/ai.md`.
 *
 * The original is event driven rather than ticked: the engine decides a tactical
 * state, then runs the aircraft's program, which dispatches on that state and
 * queues a manoeuvre. Each action statement suspends the program; it resumes at
 * the following statement once the action's minimum duration has elapsed, with
 * sensors read afresh. A new state preempts the running program only when its
 * priority is strictly higher, so being hit interrupts evading but not the other
 * way round.
 *
 * Determinism is a hard requirement — the harness asserts bit-exact state across
 * render rates — so all randomness comes from the host's seeded generator and
 * nothing here reads a clock.
 */
import { chancePercentages, type Expression, type Program } from './program';

/**
 * Invocation reasons, with the recovered priority order. The numbers are the
 * retail reason codes.
 */
export const AI_REASONS = [
  'nothing',
  'evade',
  'attack',
  'radar_launch',
  'ir_launch',
  'hit',
] as const;
export type AiReason = (typeof AI_REASONS)[number];
export const reasonPriority = (reason: AiReason): number => AI_REASONS.indexOf(reason);

/** The recovered per-program statement budget, after which the program exits. */
export const MAX_STATEMENTS = 5000;

export interface AiActionCall {
  name: string;
  args: readonly number[];
  /** Present only for `maneuver`, whose argument is a display-name string. */
  text?: string;
}

export interface AiHost {
  /**
   * Read a sensor by its lowercase retail name. Must throw for an unknown name
   * rather than returning a default: a silently zero sensor changes tactics.
   */
  sensor(name: string): number;
  /** Uniform integer in `0..bound - 1`. Must be seeded and deterministic. */
  random(bound: number): number;
  /** Queue the action. The host owns how long the aircraft flies it. */
  act(call: AiActionCall): void;
}

export interface AiContext {
  /** Next instruction to run. */
  ip: number;
  /** The four scratch slots, persistent across suspension and `restart`. */
  vars: [number, number, number, number];
  reason: AiReason;
  /** Last `maneuver` string, which is what the retail target window displays. */
  activity: string;
  /** False once the program has exited and before a new reason arrives. */
  running: boolean;
}

export function createAiContext(reason: AiReason = 'nothing'): AiContext {
  return { ip: 0, vars: [0, 0, 0, 0], reason, activity: '', running: false };
}

/**
 * The `do_*` dispatch predicates, answered from the current reason. A host's
 * `sensor` should consult this before its own table.
 */
export function reasonSensor(reason: AiReason, name: string): number | undefined {
  if (!name.startsWith('do_')) return undefined;
  const asked = name.slice(3);
  return AI_REASONS.includes(asked as AiReason) ? (asked === reason ? 1 : 0) : undefined;
}

/** Retail arithmetic is 32-bit integer; division truncates toward zero. */
const int = (value: number) => Math.trunc(value);

function evaluate(expression: Expression, context: AiContext, host: AiHost): number {
  switch (expression.kind) {
    case 'int':
      return expression.value;
    case 'var':
      return context.vars[expression.slot] ?? 0;
    case 'sensor':
      return int(host.sensor(expression.name));
    case 'unary': {
      const operand = evaluate(expression.operand, context, host);
      switch (expression.operator) {
        case 'not':
          return operand === 0 ? 1 : 0;
        case 'neg':
          return -operand;
        case 'abs':
          return Math.abs(operand);
        case 'random':
          // `random n` is uniform over 0..n-1; a non-positive bound draws nothing.
          return operand <= 0 ? 0 : host.random(int(operand));
        case 'percent':
          return host.random(100) < operand ? 1 : 0;
      }
      break;
    }
    case 'chance': {
      // Four two-digit fields, indexed by skill 0..3.
      const skill = Math.min(3, Math.max(0, int(host.sensor('skill'))));
      const percentages = chancePercentages(expression.literal);
      return host.random(100) < (percentages[skill] ?? 0) ? 1 : 0;
    }
    case 'binary': {
      // Right to left, and never short-circuited: the original compiler emits
      // both operands unconditionally, so a `percent` on the right of a failing
      // `&&` still consumes a draw. Short-circuiting here would change tactics.
      const right = evaluate(expression.right, context, host);
      const left = evaluate(expression.left, context, host);
      switch (expression.operator) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return right === 0 ? 0 : int(left / right);
        case '%':
          return right === 0 ? 0 : left % right;
        case '<':
          return left < right ? 1 : 0;
        case '<=':
          return left <= right ? 1 : 0;
        case '>':
          return left > right ? 1 : 0;
        case '>=':
          return left >= right ? 1 : 0;
        case '==':
          return left === right ? 1 : 0;
        case '&&':
          return left !== 0 && right !== 0 ? 1 : 0;
        case '||':
          return left !== 0 || right !== 0 ? 1 : 0;
      }
    }
  }
  throw new Error('Unreachable expression');
}

export type AiRunOutcome = 'suspended' | 'exited' | 'overrun';
export interface AiRunResult {
  outcome: AiRunOutcome;
  /** Statements executed, for budget diagnostics. */
  statements: number;
  /** The action queued when the outcome is `suspended`. */
  action?: AiActionCall;
}

/**
 * Offer a new reason. The program restarts from the top only when the new reason
 * outranks the current one, or when nothing is running.
 */
export function offerReason(context: AiContext, reason: AiReason): boolean {
  if (context.running && reasonPriority(reason) <= reasonPriority(context.reason)) return false;
  context.reason = reason;
  context.ip = 0;
  context.running = true;
  return true;
}

/**
 * Run until an action suspends the program, it exits, or the statement budget is
 * exhausted. Call once per AI decision point, not once per simulation step.
 */
export function runProgram(program: Program, context: AiContext, host: AiHost): AiRunResult {
  let statements = 0;
  while (statements < MAX_STATEMENTS) {
    if (context.ip < 0 || context.ip >= program.instructions.length) {
      // Falling off the end behaves as `exit`; no shipped program relies on it.
      context.running = false;
      return { outcome: 'exited', statements };
    }
    const instruction = program.instructions[context.ip]!;
    statements++;
    switch (instruction.kind) {
      case 'action': {
        const args = instruction.args.map((argument) => evaluate(argument, context, host));
        const call: AiActionCall =
          instruction.text === undefined
            ? { name: instruction.name, args }
            : { name: instruction.name, args, text: instruction.text };
        if (instruction.name === 'maneuver' && instruction.text !== undefined)
          context.activity = instruction.text;
        context.ip++;
        host.act(call);
        return { outcome: 'suspended', statements, action: call };
      }
      case 'assign':
        context.vars[instruction.slot] = int(evaluate(instruction.value, context, host));
        context.ip++;
        break;
      case 'jump':
        context.ip = instruction.target;
        break;
      case 'branch':
        context.ip =
          evaluate(instruction.condition, context, host) !== 0
            ? context.ip + 1
            : instruction.target;
        break;
      case 'switch': {
        const index = evaluate(instruction.value, context, host);
        // Only the listed labels are selectable; a larger index falls through.
        const target =
          index >= 0 && index < instruction.targets.length ? instruction.targets[index] : undefined;
        context.ip = target ?? context.ip + 1;
        break;
      }
      case 'restart':
        context.ip = 0;
        break;
      case 'exit':
        context.running = false;
        context.ip = 0;
        return { outcome: 'exited', statements };
    }
  }
  // The original caps a run at 5000 statements and forces an exit.
  context.running = false;
  context.ip = 0;
  return { outcome: 'overrun', statements };
}

/**
 * The English half of a `maneuver` display name. Retail stores three
 * semicolon-separated localizations in one literal.
 */
export function activityLabel(activity: string): string {
  return activity.split(';')[0] ?? '';
}
