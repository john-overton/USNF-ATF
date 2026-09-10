import { Scene } from 'three';
import { FlightLayer } from './FlightLayer';
import { expect, test } from 'bun:test';
import type { TerrainChunk, TheaterManifest, WaterBody } from '../data';
import type { Platform } from '../platform/Platform';
import { containsWater, GroundSampler } from './GroundSampler';
import { validatePractice } from './practice';
import { deadzone, updateHeldPilotKeys } from './FlightInput';
import { DEFAULT_MISSION } from '../sim/mission/params';

async function fixture(
  lod: 0 | 1,
  height: number,
): Promise<{ chunk: TerrainChunk; bytes: Uint8Array }> {
  const bytes = Bun.gzipSync(new Uint8Array(131072));
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
  return {
    bytes,
    chunk: {
      lod,
      x: 0,
      y: 0,
      path: `L${lod}/0.gz`,
      originX: 0,
      originZ: 0,
      spacing: lod === 0 ? 30 : 100,
      size: 256,
      offset: height,
      scale: 0.01,
      minElevation: height,
      maxElevation: height,
      byteLength: bytes.length,
      sha256,
    },
  };
}
const lake: WaterBody = {
  id: 'lake',
  elevation: 20,
  polygon: [
    [100, 100],
    [500, 100],
    [500, 500],
    [100, 500],
  ],
  holes: [
    [
      [200, 200],
      [400, 200],
      [400, 400],
      [200, 400],
    ],
  ],
};
test('water contact preserves dry islands and refuses elevation-only inference', () => {
  expect(containsWater(lake, 150, 150)).toBe(true);
  expect(containsWater(lake, 300, 300)).toBe(false);
  expect(containsWater(lake, 700, 700)).toBe(false);
});
test('ground sampling chooses independent finest source, waits for data and validates practice deck', async () => {
  const fine = await fixture(0, 10),
    coarse = await fixture(1, 30);
  const manifest: TheaterManifest = {
    schemaVersion: 1,
    id: 'synthetic',
    name: 'Original test',
    source: 'synthetic',
    projection: { crs: 'test', originX: 0, originY: 0 },
    extents: { width: 7650, height: 7650 },
    lods: [0, 1],
    chunks: [coarse.chunk, fine.chunk],
    waterBodies: [lake],
    attribution: [],
  };
  const reads: string[] = [];
  const platform = {
    fs: {
      readBytes: (_root: string, path: string) => {
        reads.push(path);
        return Promise.resolve(path.includes('L0') ? fine.bytes : coarse.bytes);
      },
    },
  } as unknown as Platform;
  const ground = new GroundSampler(manifest, platform, 'appData', 'terrain/');
  expect(ground.sample(300, 300)).toBeUndefined();
  await ground.ensure(300, 300);
  expect(reads).toEqual(['terrain/L0/0.gz']);
  expect(ground.sample(300, 300)).toEqual({
    height: 10,
    normal: { x: -0, y: 1, z: -0 },
    kind: 'land',
  });
  expect(ground.sample(150, 150)?.kind).toBe('water');
  expect(ground.sample(150, 150)?.height).toBe(20);
  expect(ground.sample(-1, 300)).toBeUndefined();
  await validatePractice(ground, { x: 1000, z: 1000, width: 100, length: 200, elevation: 11 });
  for (const strip of [
    { x: 150, z: 150, width: 50, length: 50, elevation: 21 },
    { x: 1000, z: 1000, width: 100, length: 200, elevation: 9 },
  ]) {
    let reason = '';
    try {
      await validatePractice(ground, strip);
    } catch (error) {
      reason = String(error);
    }
    expect(reason).toContain('dry');
  }
  expect(ground.bytes).toBeLessThanOrEqual(8 * 1024 * 1024);
  ground.dispose();
  expect(ground.bytes).toBe(0);
});
test('gamepad deadzone preserves full-scale pull and rejects nonfinite axes', () => {
  expect(deadzone(0.1)).toBe(0);
  expect(deadzone(Number.NaN)).toBe(0);
  expect(deadzone(1)).toBe(1);
  expect(deadzone(-1)).toBe(-1);
  expect(deadzone(0.56)).toBeCloseTo(0.5);
});

test('pilot keys release over forms and editing clears previously held input', () => {
  const held = new Set<string>();
  expect(updateHeldPilotKeys(held, { type: 'keydown', code: 'ArrowDown' }, false)).toBe(true);
  expect(held.has('ArrowDown')).toBe(true);
  expect(updateHeldPilotKeys(held, { type: 'keyup', code: 'ArrowDown' }, true)).toBe(true);
  expect(held.size).toBe(0);
  updateHeldPilotKeys(held, { type: 'keydown', code: 'KeyW' }, false);
  expect(updateHeldPilotKeys(held, { type: 'keydown', code: 'ArrowDown' }, true)).toBe(false);
  expect(held.size).toBe(0);
  expect(updateHeldPilotKeys(held, { type: 'keydown', code: 'KeyZ' }, false)).toBe(false);
});

test('discarded asynchronous flight layer cannot replace accepted diagnostics', async () => {
  const coarse = await fixture(1, 110);
  const manifest: TheaterManifest = {
    schemaVersion: 1,
    id: 'ukraine',
    name: 'Synthetic lifecycle test',
    source: 'synthetic',
    projection: { crs: 'test', originX: 0, originY: 0 },
    extents: { width: 561500, height: 561500 },
    lods: [1],
    chunks: [{ ...coarse.chunk, x: 11, y: 15, originX: 280500, originZ: 382500 }],
    waterBodies: [],
    attribution: [],
  };
  const target = new EventTarget();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { search: '' },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    },
  });
  let release = (): void => undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const oldPlatform = {
    fs: {
      exists: () => Promise.resolve(false),
      readBytes: async () => {
        await pending;
        return coarse.bytes;
      },
    },
  } as unknown as Platform;
  const newPlatform = {
    fs: { exists: () => Promise.resolve(false), readBytes: () => Promise.resolve(coarse.bytes) },
  } as unknown as Platform;
  let accepted: FlightLayer | undefined;
  try {
    const mission = DEFAULT_MISSION;
    const outdated = FlightLayer.create(new Scene(), manifest, oldPlatform, 'appData', '', mission);
    accepted = await FlightLayer.create(new Scene(), manifest, newPlatform, 'appData', '', mission);
    expect(window.__flightDiagnostics).toBeUndefined();
    accepted.activate();
    const snapshot = window.__flightDiagnostics;
    release();
    const discarded = await outdated;
    expect(window.__flightDiagnostics).toBe(snapshot);
    discarded.dispose();
    expect(window.__flightDiagnostics).toBe(snapshot);
    expect(window.__flightDiagnostics?.().landings).toBe(0);
    accepted.setFuelFraction(0.25);
    const before = accepted.diagnostics();
    const destination = { id: 2, x: 290000, z: 390000, elevationM: 0 };
    await accepted.teleportToWaypoint(destination);
    const jumped = accepted.diagnostics();
    expect(jumped.position).toEqual({ x: 290000, y: 1110, z: 390000 });
    expect(jumped.airspeed).toBeCloseTo(150);
    expect(jumped.waypointIndex).toBe(1);
    for (const key of [
      'fuelMassKg',
      'massKg',
      'flightModelId',
      'cameraMode',
      'engineRunning',
      'gearDown',
      'hookDown',
      'flapsDown',
      'airbrakeDown',
      'systems',
    ] as const)
      expect(jumped[key]).toEqual(before[key]);
    const oldJump = accepted.teleportToWaypoint({ ...destination, x: 291000 });
    const newJump = accepted.teleportToWaypoint({ ...destination, id: 3, x: 292000 });
    expect(await oldJump.catch(String)).toContain('superseded');
    await newJump;
    expect(accepted.diagnostics().position.x).toBe(292000);
    expect(accepted.diagnostics().waypointIndex).toBe(2);
    expect(await accepted.teleportToWaypoint({ ...destination, x: 1 }).catch(String)).toContain(
      'coverage',
    );
    expect(accepted.diagnostics().position.x).toBe(292000);
    const closingJump = accepted.teleportToWaypoint(destination);
    accepted.dispose();
    expect(await closingJump.catch(String)).toContain('superseded');
    accepted = undefined;
  } finally {
    release();
    accepted?.dispose();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
