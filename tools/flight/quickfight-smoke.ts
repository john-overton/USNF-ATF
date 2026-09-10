/**
 * The mocked quick fight, in its pre-AI form: three aircraft in the sky at once,
 * all advancing inside the one 120 Hz clock. This is the liveness probe, not a
 * combat test — the opponents fly fixed profiles, nothing acquires anything, and
 * no round does damage. See Docs/game-shell-plan.md section 8.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { openDesktop } from './desktop';

const args = process.argv.slice(2);
function option(name: string, fallback?: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? fallback : args[index + 1];
  if (!value) throw new Error(`Required: ${name}`);
  return value;
}
const out = option('--out', 'extracted/quickfight-smoke');
const session = await openDesktop({
  binary: option('--binary'),
  ...(args.includes('--app') ? { app: option('--app') } : {}),
  terrain: option('--terrain', 'extracted/terrain/ukraine'),
  aircraft: option('--aircraft', 'extracted/flight/f14.json'),
  flightProfile: option('--flight-profile', 'extracted/flight/f14-flight.json'),
  out,
  query: {
    mode: 'quick-fight',
    aircraft: 'f14',
    flightStart: 'airborne',
    opponents: '2',
    opponentAircraft: 'f14',
    seed: '7',
    wind: 'calm',
    clouds: 'off',
  },
});
const evidence: Record<string, unknown> = {};
try {
  const first = await session.poll(async () => {
    const state = await session.evaluate('window.__flightDiagnostics?.()');
    return state?.simSteps > 10 && state.status !== 'waiting-terrain' ? state : undefined;
  }, 'quick fight airborne');
  evidence.first = { entities: first.entities, simSteps: first.simSteps };
  assert.equal(first.entities.length, 2, 'Two opponents, three aircraft including the player');
  const player = first.position;
  for (const entity of first.entities) {
    assert.ok(entity.steps > 0, `Entity ${entity.id} is not stepping`);
    const range = Math.hypot(entity.position.x - player.x, entity.position.z - player.z);
    assert.ok(range > 1000 && range < 20000, `Entity ${entity.id} spawned at ${range} m`);
  }
  await session.capture('spawn');

  // All three must still be advancing a few seconds later, at the same rate.
  await Bun.sleep(4000);
  const later = await session.evaluate('window.__flightDiagnostics()');
  evidence.later = { entities: later.entities, simSteps: later.simSteps };
  const steps = later.simSteps - first.simSteps;
  assert.ok(steps > 100, `The player only advanced ${steps} steps`);
  for (const [index, entity] of later.entities.entries()) {
    const before = first.entities[index];
    assert.equal(entity.id, before.id);
    assert.equal(
      entity.steps - before.steps,
      steps,
      `Entity ${entity.id} stepped ${entity.steps - before.steps} against the player's ${steps}`,
    );
    const moved = Math.hypot(
      entity.position.x - before.position.x,
      entity.position.z - before.position.z,
    );
    // Straight and level at its own speed: distance is exactly speed x time.
    const expected = (entity.speedMps * steps) / 120;
    assert.ok(
      Math.abs(moved - expected) < 1,
      `Entity ${entity.id} moved ${moved} m against ${expected} m`,
    );
  }
  // Fly until the head-on pass is close enough to see, so the screenshot is
  // evidence that the opponents are rendered, at the terrain's floating origin,
  // and not merely that their numbers move.
  const close = await session.poll(async () => {
    const state = await session.evaluate('window.__flightDiagnostics()');
    const nearest = Math.min(
      ...state.entities.map((entity: { position: { x: number; z: number } }) =>
        Math.hypot(entity.position.x - state.position.x, entity.position.z - state.position.z),
      ),
    );
    return nearest < 1500 ? { nearest, entities: state.entities.length } : undefined;
  }, 'head-on pass', 40_000);
  evidence.close = close;
  await session.capture('flying');
  const entities = await session.evaluate('window.__flightDiagnostics().entities.length');
  assert.equal(entities, 2, 'Both opponents survive the pass');
} finally {
  await Bun.write(
    path.join(out, 'report.json'),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        buildSourceCommit: option('--build-commit', 'unrecorded'),
        mocked:
          'Opponents fly fixed profiles. No AI, no acquisition, no damage; see Docs/game-shell-plan.md section 8.',
        evidence,
        errors: session.errors,
      },
      null,
      2,
    ) + '\n',
  );
  await session.close();
}
