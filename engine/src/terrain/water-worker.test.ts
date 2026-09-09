import { expect, test } from 'bun:test';
import { Scene, type BufferGeometry } from 'three';
import { WaterLayer, waterBatches } from './water';
import { waterGeometry, type WaterBatch } from './water-geometry';
import type { WaterGeometryBuilder } from './water-worker-client';
import type { WaterBody } from '../data';

function deferredBuilder() {
  const jobs: {
    batch: WaterBatch;
    resolve: (g: BufferGeometry) => void;
    reject: (e: Error) => void;
  }[] = [];
  let disposed = false;
  const builder: WaterGeometryBuilder = {
    build: (batch) => new Promise((resolve, reject) => jobs.push({ batch, resolve, reject })),
    dispose: () => {
      disposed = true;
    },
  };
  return { builder, jobs, disposed: () => disposed };
}
const body = (x: number): WaterBody => ({
  id: String(x),
  elevation: 0,
  polygon: [
    [x, 0],
    [x + 100, 0],
    [x + 100, 100],
    [x, 100],
  ],
});

test('water jobs are bounded, stale results disposed and readiness waits for live geometry', async () => {
  const scene = new Scene(),
    queue = deferredBuilder();
  const water = new WaterLayer(scene, [body(0), body(100000)], queue.builder);
  water.select({ x: 0, y: 100, z: 0 }, 1000);
  expect(water.pending).toBe(1);
  expect(water.count).toBe(0);
  water.select({ x: 100000, y: 100, z: 0 }, 1000);
  const stale = waterGeometry(queue.jobs[0]!.batch);
  let dropped = false;
  stale.addEventListener('dispose', () => {
    dropped = true;
  });
  queue.jobs[0]!.resolve(stale);
  await Bun.sleep(0);
  expect(dropped).toBe(true);
  expect(scene.children.length).toBe(0);
  queue.jobs[1]!.resolve(waterGeometry(queue.jobs[1]!.batch));
  await Bun.sleep(0);
  expect(water.pending).toBe(0);
  expect(water.count).toBe(1);
  water.dispose();
  expect(queue.disposed()).toBe(true);
  expect(scene.children.length).toBe(0);
});

test('at most four water jobs can remain outstanding across selection ticks', async () => {
  const queue = deferredBuilder(),
    scene = new Scene();
  const water = new WaterLayer(
    scene,
    Array.from({ length: 10 }, (_, i) => body(i * 40000)),
    queue.builder,
  );
  water.select({ x: 0, y: 100, z: 0 }, 1000000);
  water.select({ x: 0, y: 100, z: 0 }, 1000000);
  expect(queue.jobs.length).toBe(4);
  water.dispose();
  for (const job of queue.jobs) job.resolve(waterGeometry(job.batch));
  await Bun.sleep(0);
  expect(scene.children.length).toBe(0);
});

test('selected water build failures remain explicit', async () => {
  const queue = deferredBuilder(),
    water = new WaterLayer(new Scene(), [body(0)], queue.builder);
  water.select({ x: 0, y: 100, z: 0 }, 1000);
  queue.jobs[0]!.reject(new Error('triangulation failed'));
  await Bun.sleep(0);
  expect(water.error).toContain('triangulation failed');
  expect(water.pending).toBe(1);
  water.dispose();
});

test('water budget includes extra triangles around holes even with uint32 indices', () => {
  const polygon: WaterBody = {
    ...body(0),
    holes: [
      [
        [10, 10],
        [20, 10],
        [15, 20],
      ],
      [
        [40, 40],
        [50, 40],
        [45, 50],
      ],
    ],
  };
  const batch = waterBatches([polygon])[0]!;
  const geometry = waterGeometry(batch);
  const worstCaseBytes =
    geometry.getAttribute('position').count * 24 + geometry.getIndex()!.count * 4;
  expect(worstCaseBytes).toBe(384);
  expect(batch.bytes).toBeGreaterThanOrEqual(worstCaseBytes);
  geometry.dispose();
});
