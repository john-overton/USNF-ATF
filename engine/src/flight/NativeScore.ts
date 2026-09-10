/** Recovered USNF ScoreUpdate bytecodes; never executes native machine code.
 * Host situation choices and RNG seed remain remake policy. */
export interface ScoreProgram {
  sourceSha256: string;
  code: number[];
}
interface Instruction {
  opcode: number;
  next: number;
  prefix?: string;
  target?: number;
  chance?: number;
  tracks?: number[];
}
function instructions(code: number[]): Map<number, Instruction> {
  if (
    !Array.isArray(code) ||
    !code.length ||
    code.length > 65536 ||
    !code.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
  )
    throw new Error('Invalid score bytes');
  const pending = [0],
    covered = new Set<number>(),
    result = new Map<number, Instruction>();
  while (pending.length) {
    const start = pending.pop()!;
    if (result.has(start)) continue;
    if (covered.has(start) || start < 0 || start >= code.length)
      throw new Error('Invalid score jump');
    let cursor = start;
    const take = () => {
      if (cursor >= code.length) throw new Error('Truncated score');
      return code[cursor++]!;
    };
    const opcode = take();
    const row: Instruction = { opcode, next: 0 };
    if (opcode === 255) {
      let prefix = '',
        n = take();
      while (n) {
        if (prefix.length >= 31) throw new Error('Long score prefix');
        prefix += String.fromCharCode(n);
        n = take();
      }
      if (!/^[a-z0-9]+$/i.test(prefix)) throw new Error('Invalid score prefix');
      row.prefix = prefix;
    } else if (opcode === 254 || opcode === 250) {
      if (opcode === 250) row.chance = take();
      row.target = take() + take() * 256 + take() * 65536 + take() * 16777216;
      pending.push(row.target);
    } else if (opcode === 253) {
      const count = take();
      if (!count) throw new Error('Empty score choice');
      row.tracks = Array.from({ length: count }, take);
    } else if (opcode === 251) {
      row.chance = take();
      row.tracks = [take()];
    } else if (opcode > 0 && opcode < 249) row.tracks = [opcode];
    if (row.chance !== undefined && row.chance > 100) throw new Error('Invalid score chance');
    if (row.tracks?.some((n) => n < 1 || n >= 249)) throw new Error('Invalid score track');
    row.next = cursor;
    for (let i = start; i < cursor; i++) {
      if (covered.has(i)) throw new Error('Overlapping score');
      covered.add(i);
    }
    result.set(start, row);
    if (opcode !== 252 && opcode !== 254) pending.push(cursor);
  }
  return result;
}
export function parseScoreProgram(value: unknown): ScoreProgram {
  const program = value as ScoreProgram;
  if (
    !program ||
    typeof program.sourceSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(program.sourceSha256)
  )
    throw new Error('Invalid score provenance');
  instructions(program.code);
  return { sourceSha256: program.sourceSha256, code: [...program.code] };
}
export class NativeScore {
  private rows: Map<number, Instruction>;
  private offset = 0;
  private prefix = '';
  private seed = 0x51e7;
  stopped = false;
  hostFlag = false;
  constructor(program: ScoreProgram) {
    this.rows = instructions(program.code);
  }
  private random(count: number): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((this.seed / 0x100000000) * count);
  }
  /** Call only when the previous sequence finishes (or at score start). */
  next(): string | undefined {
    if (this.stopped) return undefined;
    for (let budget = 0; budget < 1024; budget++) {
      const row = this.rows.get(this.offset);
      if (!row) throw new Error('Missing score instruction');
      this.offset = row.next;
      if (row.prefix !== undefined) this.prefix = row.prefix;
      if (row.opcode === 249) this.hostFlag = true;
      if (row.opcode === 252) {
        this.stopped = true;
        return undefined;
      }
      const pass = row.chance === undefined || this.random(100) < row.chance;
      if (pass && row.target !== undefined) this.offset = row.target;
      if (pass && row.tracks) {
        if (!this.prefix) throw new Error('Score track before prefix');
        const track = row.tracks[row.opcode === 253 ? this.random(row.tracks.length) : 0]!;
        return `${this.prefix}${String(track).padStart(2, '0')}.XMI`.toUpperCase();
      }
    }
    this.stopped = true;
    throw new Error('Score instruction budget exceeded');
  }
}
