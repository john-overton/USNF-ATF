/**
 * Developer check: parse every locally extracted retail `.AI` behaviour program
 * and report what the parser found. This is the evidence that the committed
 * grammar handles the real corpus; the committed unit tests use synthetic
 * programs only, because retail bytes never enter the repository.
 *
 * Retail media is optional. Missing files are reported as skips, never failures.
 *
 *   bun tools/ai/parse-scripts.ts
 *   bun tools/ai/parse-scripts.ts --verbose
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ACTION_ARITY, parseProgram, type Expression, type Program } from '../../engine/src/sim/ai/program';
import { chancePercentages } from '../../engine/src/sim/ai/program';

const ROOTS = [
  { game: 'usnf97', dir: 'extracted/usnf97/USNF_2.LIB' },
  { game: 'atf-gold', dir: 'extracted/atf-gold/ATF_2.LIB' },
];
const verbose = process.argv.includes('--verbose');

function walk(expression: Expression, visit: (node: Expression) => void): void {
  visit(expression);
  if (expression.kind === 'unary') walk(expression.operand, visit);
  if (expression.kind === 'binary') {
    walk(expression.left, visit);
    walk(expression.right, visit);
  }
}

interface Summary {
  actions: Map<string, number>;
  sensors: Map<string, number>;
  chances: Map<number, number>;
  maneuvers: Set<string>;
  deadLabels: string[];
}

function summarize(program: Program): Summary {
  const actions = new Map<string, number>();
  const sensors = new Map<string, number>();
  const chances = new Map<number, number>();
  const maneuvers = new Set<string>();
  const reached = new Set<number>();
  const bump = <K>(map: Map<K, number>, key: K) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const instruction of program.instructions) {
    const expressions: Expression[] = [];
    switch (instruction.kind) {
      case 'action':
        bump(actions, instruction.name);
        if (instruction.text !== undefined) maneuvers.add(instruction.text);
        expressions.push(...instruction.args);
        break;
      case 'assign':
        expressions.push(instruction.value);
        break;
      case 'branch':
        expressions.push(instruction.condition);
        reached.add(instruction.target);
        break;
      case 'switch':
        expressions.push(instruction.value);
        for (const target of instruction.targets) reached.add(target);
        break;
      case 'jump':
        reached.add(instruction.target);
        break;
      default:
        break;
    }
    for (const expression of expressions)
      walk(expression, (node) => {
        if (node.kind === 'sensor') bump(sensors, node.name);
        if (node.kind === 'chance') bump(chances, node.literal);
      });
  }
  const deadLabels = [...program.labels]
    .filter(([, index]) => !reached.has(index) && index !== 0)
    .map(([label]) => label);
  return { actions, sensors, chances, maneuvers, deadLabels };
}

let parsed = 0;
let skipped = 0;
let failed = 0;
const allActions = new Map<string, number>();
const allSensors = new Map<string, number>();
const allChances = new Map<number, number>();
const allManeuvers = new Set<string>();

for (const { game, dir } of ROOTS) {
  if (!existsSync(dir)) {
    console.log(`skip ${game}: ${dir} is not present`);
    skipped++;
    continue;
  }
  const files = readdirSync(dir)
    .filter((name) => name.toUpperCase().endsWith('.AI'))
    .sort();
  if (files.length === 0) {
    console.log(`skip ${game}: no .AI files extracted`);
    skipped++;
    continue;
  }
  for (const file of files) {
    // The originals are CP437; every byte above 127 appears only inside the
    // localized `maneuver` display strings, so latin1 round-trips the source.
    const source = readFileSync(join(dir, file), 'latin1');
    try {
      const program = parseProgram(source, `${game}/${file}`);
      const summary = summarize(program);
      parsed++;
      for (const [name, count] of summary.actions)
        allActions.set(name, (allActions.get(name) ?? 0) + count);
      for (const [name, count] of summary.sensors)
        allSensors.set(name, (allSensors.get(name) ?? 0) + count);
      for (const [literal, count] of summary.chances)
        allChances.set(literal, (allChances.get(literal) ?? 0) + count);
      for (const text of summary.maneuvers) allManeuvers.add(text);
      console.log(
        `ok   ${game}/${file.padEnd(10)} ${String(program.instructions.length).padStart(4)} instructions` +
          `  ${String(program.labels.size).padStart(3)} labels` +
          `  ${String(summary.sensors.size).padStart(2)} sensors` +
          (summary.deadLabels.length > 0 ? `  dead: ${summary.deadLabels.join(',')}` : ''),
      );
    } catch (error) {
      failed++;
      console.log(`FAIL ${game}/${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

console.log(`\nparsed ${parsed}, failed ${failed}, skipped roots ${skipped}`);
if (parsed > 0) {
  const sorted = <K>(map: Map<K, number>) => [...map].sort((a, b) => b[1] - a[1]);
  console.log(`\nactions used (${allActions.size}):`);
  for (const [name, count] of sorted(allActions))
    console.log(`  ${name.padEnd(14)} ${String(count).padStart(4)}  arity ${ACTION_ARITY[name]}`);
  console.log(`\nsensors used (${allSensors.size}):`);
  console.log(
    sorted(allSensors)
      .map(([name, count]) => `  ${name} ${count}`)
      .join(''),
  );
  console.log(`\nchance literals (${allChances.size}), decoded per skill 0..3:`);
  for (const [literal, count] of [...allChances].sort((a, b) => a[0] - b[0]))
    console.log(
      `  ${String(literal).padStart(8, '0')}  ${chancePercentages(literal).map((p) => String(p).padStart(2)).join(' / ')}   x${count}`,
    );
  if (verbose) {
    console.log(`\nmaneuver display names (${allManeuvers.size}):`);
    for (const text of [...allManeuvers].sort()) console.log(`  ${text}`);
  }
}
if (failed > 0) process.exit(1);
