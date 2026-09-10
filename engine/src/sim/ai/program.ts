/**
 * Parser for the retail AI behaviour language the developers called
 * "Chuck-Talk". See `Docs/formats/ai.md`.
 *
 * The retail programs ship as plaintext `.AI` source and are compiled to a small
 * stack bytecode carried inside a PE container (`.BI`). We parse the source and
 * compile to a flat instruction list of our own, mirroring the original bytecode
 * closely enough that suspension is just an instruction pointer: every action
 * statement yields, and the program resumes at the next instruction with freshly
 * read sensors.
 *
 * Fidelity notes that are easy to get wrong and that the tests pin down:
 *   - Condition and arithmetic operands evaluate RIGHT TO LEFT with NO
 *     short-circuiting, so every `random`/`percent`/`chance` draw in a condition
 *     happens even when an earlier operand already decided the result. Getting
 *     this wrong desynchronises the sequence and changes behaviour.
 *   - `any` is the literal 2147483647, used as a "don't care" roll.
 *   - A `switch` selects only among its listed labels; a larger index falls
 *     through to the following instruction.
 *   - `#DEBUG` statements are dropped, matching the shipped programs.
 */

export type BinaryOperator =
  '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '&&' | '||';
export type UnaryOperator = 'not' | 'neg' | 'abs' | 'random' | 'percent';

export type Expression =
  | { kind: 'int'; value: number }
  | { kind: 'var'; slot: number }
  | { kind: 'sensor'; name: string }
  | { kind: 'unary'; operator: UnaryOperator; operand: Expression }
  | { kind: 'chance'; literal: number }
  | { kind: 'binary'; operator: BinaryOperator; left: Expression; right: Expression };

/** `any`, the retail "don't care" sentinel, inlined by the original compiler. */
export const ANY = 2147483647;

/**
 * Action arity, verified against the compiled bytecode. Names are matched
 * case-insensitively and stored lowercase. `maneuver` takes a single string.
 */
export const ACTION_ARITY: Readonly<Record<string, number>> = Object.freeze({
  move: 5,
  movetoalt: 4,
  homepos: 5,
  uhomepos: 5,
  homeangle: 5,
  jink: 8,
  yoyo: 3,
  immelman: 1,
  invert: 0,
  btoh: 0,
  circle: 6,
  turn: 3,
  splits: 1,
  rudder: 2,
  maneuver: 1,
  wm_break: 2,
  wm_approach: 3,
  wm_hspacing: 1,
  wm_vspacing: 1,
  wm_control: 1,
  wm_formation: 1,
  play: 1,
  print: 1,
  printnum: 1,
});
/** Actions whose single argument is the localized display-name string. */
const STRING_ACTIONS = new Set(['maneuver', 'play', 'print']);

export type Instruction =
  | { kind: 'action'; name: string; args: Expression[]; text?: string; line: number }
  | { kind: 'assign'; slot: number; value: Expression; line: number }
  | { kind: 'jump'; target: number; line: number }
  /** Evaluates `condition` and jumps to `target` when it is false. */
  | { kind: 'branch'; condition: Expression; target: number; line: number }
  | { kind: 'switch'; value: Expression; targets: number[]; line: number }
  | { kind: 'restart'; line: number }
  | { kind: 'exit'; line: number };

export interface Program {
  readonly name: string;
  readonly instructions: readonly Instruction[];
  /** Label to instruction index, for diagnostics and tests. */
  readonly labels: ReadonlyMap<string, number>;
}

class ParseError extends Error {
  constructor(message: string, line: number, name: string) {
    super(`${name}:${line}: ${message}`);
  }
}

type Token =
  | { type: 'int'; value: number; line: number }
  | { type: 'string'; value: string; line: number }
  | { type: 'word'; value: string; line: number }
  | { type: 'var'; slot: number; line: number }
  | { type: 'punct'; value: string; line: number }
  | { type: 'eol'; line: number };

const PUNCT = ['<=', '>=', '==', '&&', '||', '+', '-', '*', '/', '%', '<', '>', '=', ',', ':'];

function tokenize(source: string, name: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let i = 0;
  // CRLF in the originals; accept either ending.
  const text = source.replace(/\r\n?/g, '\n');
  while (i < text.length) {
    const c = text[i]!;
    if (c === '\n') {
      tokens.push({ type: 'eol', line });
      line++;
      i++;
      continue;
    }
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (c === ';') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (c === '"') {
      const end = text.indexOf('"', i + 1);
      if (end < 0) throw new ParseError('Unterminated string', line, name);
      tokens.push({ type: 'string', value: text.slice(i + 1, end), line });
      i = end + 1;
      continue;
    }
    // A negative literal is written with no gap after the sign, as in
    // `homePos 0 0 -1000 -1000 6`, whereas subtraction is always spaced, as in
    // `h - 170`. Action arguments are separated only by whitespace, so this is
    // what tells one argument from the next and it is load-bearing.
    // `tools/ai/parse-scripts.ts` checks the rule against every retail program.
    if (c === '-' && /[0-9]/.test(text[i + 1] ?? '')) {
      let j = i + 1;
      while (j < text.length && /[0-9]/.test(text[j]!)) j++;
      tokens.push({ type: 'int', value: -Number(text.slice(i + 1, j)), line });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < text.length && /[0-9]/.test(text[j]!)) j++;
      tokens.push({ type: 'int', value: Number(text.slice(i, j)), line });
      i = j;
      continue;
    }
    if (c === '%' && /[a-dA-D]/.test(text[i + 1] ?? '')) {
      const slot = text[i + 1]!.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0);
      tokens.push({ type: 'var', slot, line });
      i += 2;
      continue;
    }
    if (/[A-Za-z_.#]/.test(c)) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9_.#]/.test(text[j]!)) j++;
      tokens.push({ type: 'word', value: text.slice(i, j).toLowerCase(), line });
      i = j;
      continue;
    }
    const punct = PUNCT.find((p) => text.startsWith(p, i));
    if (!punct) throw new ParseError(`Unexpected character ${JSON.stringify(c)}`, line, name);
    tokens.push({ type: 'punct', value: punct, line });
    i += punct.length;
  }
  tokens.push({ type: 'eol', line });
  return tokens;
}

/** A statement before labels are resolved to instruction indices. */
type Pending =
  | { kind: 'action'; name: string; args: Expression[]; text?: string; line: number }
  | { kind: 'assign'; slot: number; value: Expression; line: number }
  | { kind: 'jump'; label?: string; target?: number; line: number }
  | { kind: 'branch'; condition: Expression; skip: number; line: number }
  | { kind: 'switch'; value: Expression; labels: string[]; line: number }
  | { kind: 'restart'; line: number }
  | { kind: 'exit'; line: number };

const UNARY = new Set<string>(['not', 'neg', 'abs', 'random', 'percent']);
const KEYWORDS = new Set<string>([
  'if',
  'goto',
  'switch',
  'restart',
  'exit',
  'chance',
  '.if',
  '.else',
  '.endif',
  '#debug',
  ...UNARY,
]);

export function parseProgram(source: string, name = 'program'): Program {
  const tokens = tokenize(source, name);
  let at = 0;
  const peek = () => tokens[at]!;
  const next = () => tokens[at++]!;
  const atEol = () => peek().type === 'eol';
  const fail = (message: string): never => {
    throw new ParseError(message, peek().line, name);
  };

  function primary(): Expression {
    const token = next();
    if (token.type === 'int') return { kind: 'int', value: token.value };
    if (token.type === 'var') return { kind: 'var', slot: token.slot };
    if (token.type === 'punct' && token.value === '-') {
      return { kind: 'unary', operator: 'neg', operand: primary() };
    }
    if (token.type !== 'word') {
      at--;
      return fail(`Expected a value, found ${token.type}`);
    }
    if (token.value === 'chance') {
      const literal = next();
      if (literal.type !== 'int') {
        at--;
        return fail('chance needs an eight-digit literal');
      }
      return { kind: 'chance', literal: literal.value };
    }
    if (UNARY.has(token.value)) {
      // Prefix operators bind exactly one primary: `random 360 - 180` is
      // `(random 360) - 180`, not `random (360 - 180)`.
      return {
        kind: 'unary',
        operator: token.value as UnaryOperator,
        operand: primary(),
      };
    }
    if (token.value === 'any') return { kind: 'int', value: ANY };
    if (KEYWORDS.has(token.value)) {
      at--;
      return fail(`Unexpected keyword ${token.value} in an expression`);
    }
    return { kind: 'sensor', name: token.value };
  }

  /**
   * Precedence climbing. `&&` and `||` share a level: no shipped program mixes
   * them, so their relative precedence is not observable and either choice is
   * faithful.
   */
  const LEVELS: readonly (readonly BinaryOperator[])[] = [
    ['&&', '||'],
    ['<', '<=', '>', '>=', '=='],
    ['+', '-'],
    ['*', '/', '%'],
  ];
  function binary(level = 0): Expression {
    if (level >= LEVELS.length) return primary();
    let left = binary(level + 1);
    for (;;) {
      const token = peek();
      if (token.type !== 'punct') break;
      const operators = LEVELS[level]!;
      if (!operators.includes(token.value as BinaryOperator)) break;
      next();
      const right = binary(level + 1);
      left = { kind: 'binary', operator: token.value as BinaryOperator, left, right };
    }
    return left;
  }
  const expression = () => binary();

  const pending: Pending[] = [];
  const labels = new Map<string, number>();
  // `.if` blocks are structured sugar over the same conditional jump.
  const blocks: { branch: number; jump?: number }[] = [];

  function action(name: string, line: number): Pending {
    const arity = ACTION_ARITY[name];
    if (arity === undefined) return fail(`Unknown action ${name}`);
    if (STRING_ACTIONS.has(name)) {
      const token = next();
      if (token.type !== 'string') {
        at--;
        return fail(`${name} needs a quoted string`);
      }
      return { kind: 'action', name, args: [], text: token.value, line };
    }
    const args: Expression[] = [];
    for (let i = 0; i < arity; i++) {
      if (atEol()) return fail(`${name} needs ${arity} arguments, found ${i}`);
      args.push(expression());
    }
    return { kind: 'action', name, args, line };
  }

  function statement(): Pending {
    const token = next();
    const line = token.line;
    if (token.type === 'var') {
      const equals = next();
      if (equals.type !== 'punct' || equals.value !== '=') {
        at--;
        return fail('Expected = after a variable');
      }
      return { kind: 'assign', slot: token.slot, value: expression(), line };
    }
    if (token.type !== 'word') {
      at--;
      return fail(`Expected a statement, found ${token.type}`);
    }
    if (token.value === 'goto') {
      const label = next();
      if (label.type !== 'word') {
        at--;
        return fail('goto needs a label');
      }
      return { kind: 'jump', label: label.value, line };
    }
    if (token.value === 'restart') return { kind: 'restart', line };
    if (token.value === 'exit') return { kind: 'exit', line };
    if (token.value === 'switch') {
      const value = expression();
      const targets: string[] = [];
      while (!atEol()) {
        const label = next();
        if (label.type !== 'word') {
          at--;
          return fail('switch takes a list of labels');
        }
        targets.push(label.value);
      }
      if (targets.length === 0) return fail('switch needs at least one label');
      return { kind: 'switch', value, labels: targets, line };
    }
    return action(token.value, line);
  }

  while (at < tokens.length) {
    if (atEol()) {
      next();
      continue;
    }
    const token = peek();
    // A label is `IDENT:` alone; several may stack and alias the same code.
    if (
      token.type === 'word' &&
      tokens[at + 1]?.type === 'punct' &&
      (tokens[at + 1] as Token & { type: 'punct' }).value === ':'
    ) {
      next();
      next();
      if (labels.has(token.value))
        throw new ParseError(`Duplicate label ${token.value}`, token.line, name);
      labels.set(token.value, pending.length);
      continue;
    }
    if (token.type === 'word' && token.value === '#debug') {
      // Dropped exactly as the shipped programs drop them.
      while (!atEol()) next();
      continue;
    }
    if (token.type === 'word' && token.value === '.if') {
      next();
      const condition = expression();
      blocks.push({ branch: pending.length });
      pending.push({ kind: 'branch', condition, skip: 0, line: token.line });
      continue;
    }
    if (token.type === 'word' && token.value === '.else') {
      next();
      const block = blocks[blocks.length - 1];
      if (!block) throw new ParseError('.else without .if', token.line, name);
      block.jump = pending.length;
      pending.push({ kind: 'jump', line: token.line });
      // The false branch resumes after this jump.
      (pending[block.branch] as Pending & { kind: 'branch' }).skip = pending.length;
      continue;
    }
    if (token.type === 'word' && token.value === '.endif') {
      next();
      const block = blocks.pop();
      if (!block) throw new ParseError('.endif without .if', token.line, name);
      const branch = pending[block.branch] as Pending & { kind: 'branch' };
      if (block.jump === undefined) branch.skip = pending.length;
      else (pending[block.jump] as Pending & { kind: 'jump' }).target = pending.length;
      continue;
    }
    if (token.type === 'word' && token.value === 'if') {
      next();
      const condition = expression();
      const comma = peek();
      if (comma.type === 'punct' && comma.value === ',') next();
      if (atEol()) throw new ParseError('if needs a statement', token.line, name);
      const branch: Pending = { kind: 'branch', condition, skip: 0, line: token.line };
      const index = pending.length;
      pending.push(branch);
      pending.push(statement());
      (pending[index] as Pending & { kind: 'branch' }).skip = pending.length;
      continue;
    }
    pending.push(statement());
  }
  if (blocks.length > 0) {
    // The token stream is exhausted here, so report the last line seen rather
    // than reading past the end.
    const last = tokens[tokens.length - 1];
    throw new ParseError('.if without .endif', last?.line ?? 0, name);
  }

  const resolve = (label: string, line: number): number => {
    const target = labels.get(label);
    if (target === undefined) throw new ParseError(`Undefined label ${label}`, line, name);
    return target;
  };
  const instructions: Instruction[] = pending.map((item): Instruction => {
    switch (item.kind) {
      case 'jump':
        return {
          kind: 'jump',
          target: item.label === undefined ? (item.target ?? 0) : resolve(item.label, item.line),
          line: item.line,
        };
      case 'branch':
        return { kind: 'branch', condition: item.condition, target: item.skip, line: item.line };
      case 'switch':
        return {
          kind: 'switch',
          value: item.value,
          targets: item.labels.map((label) => resolve(label, item.line)),
          line: item.line,
        };
      case 'action':
        return item.text === undefined
          ? { kind: 'action', name: item.name, args: item.args, line: item.line }
          : { kind: 'action', name: item.name, args: item.args, text: item.text, line: item.line };
      default:
        return item;
    }
  });
  return { name, instructions, labels };
}

/**
 * Decode a `chance` literal into its four per-skill percentages. The operand is
 * a decimal integer holding four two-digit fields, leftmost for skill 0.
 */
export function chancePercentages(literal: number): [number, number, number, number] {
  const n = Math.trunc(Math.abs(literal));
  return [
    Math.trunc(n / 1000000) % 100,
    Math.trunc(n / 10000) % 100,
    Math.trunc(n / 100) % 100,
    n % 100,
  ];
}
