import { expect, test } from 'bun:test';
import { SourceTransition, SOURCE_FADE_MS, SOURCE_SETTLE_MS } from './transition';
import { buildPatch } from './mesh';
import { patchMorph, selectPatches } from './lod';
import type { TerrainChunk } from '../data';

const chunk: TerrainChunk = {
  lod: 0,
  x: 0,
  y: 0,
  path: '0.gz',
  originX: 0,
  originZ: 0,
  spacing: 30,
  size: 256,
  offset: 0,
  scale: 1,
  minElevation: 0,
  maxElevation: 500,
  byteLength: 1,
  sha256: 'a'.repeat(64),
};

test('source switch requires stable complete coverage and ignores changes during fade', () => {
  const transition = new SourceTransition();
  expect(transition.consider(0, false, 0)).toBe(false);
  expect(transition.consider(0, true, 10)).toBe(true);
  expect(transition.active).toBe(false);
  expect(transition.consider(1, true, 20)).toBe(false);
  expect(transition.consider(0, true, 200)).toBe(false);
  expect(transition.consider(1, true, 300)).toBe(false);
  expect(transition.consider(1, false, 300 + SOURCE_SETTLE_MS)).toBe(false);
  const start = 400 + SOURCE_SETTLE_MS;
  expect(transition.consider(1, true, start)).toBe(true);
  expect(transition.from).toBe(0);
  expect(transition.to).toBe(1);
  expect(transition.progress).toBe(0);
  expect(transition.consider(2, true, start + 1)).toBe(false);
  expect(transition.update(start + SOURCE_FADE_MS / 2)).toBe(false);
  expect(transition.progress).toBe(0.5);
  expect(transition.update(start + SOURCE_FADE_MS)).toBe(true);
  expect(transition.progress).toBe(1);
  expect(transition.completed).toBe(1);
  expect(transition.update(start + SOURCE_FADE_MS + 1)).toBe(false);
  expect(transition.consider(0, true, 2000)).toBe(false);
  expect(transition.consider(0, true, 2000 + SOURCE_SETTLE_MS)).toBe(true);
  expect(transition.from).toBe(1);
  expect(transition.to).toBe(0);
  transition.update(2000 + SOURCE_SETTLE_MS + SOURCE_FADE_MS);
  expect(transition.completed).toBe(2);
});

test('morphed child normals equal parent triangle interpolation on curved terrain', () => {
  const samples = new Float32Array(256 * 256);
  for (let z = 0; z < 256; z++)
    for (let x = 0; x < 256; x++)
      samples[z * 256 + x] = 80 * Math.sin(x / 17) + 50 * Math.cos(z / 23);
  const parent = buildPatch(chunk, samples, { x: 0, z: 0, span: 7650, depth: 0, key: 'r' });
  const child = buildPatch(chunk, samples, { x: 0, z: 0, span: 3825, depth: 1, key: 'r0' });
  const pn = parent.geometry.getAttribute('normal');
  const cn = child.geometry.getAttribute('coarseNormal');
  // Child odd/odd point lies on parent's b-c diagonal.
  const childIndex = 17 + 1;
  for (let axis = 0; axis < 3; axis++)
    expect(cn.array[childIndex * 3 + axis]).toBeCloseTo(
      (pn.array[1 * 3 + axis]! + pn.array[17 * 3 + axis]!) / 2,
      6,
    );
  expect(Array.from(cn.array).every(Number.isFinite)).toBe(true);
  parent.geometry.dispose();
  child.geometry.dispose();
});

test('geometry budget fallback retains complete source-tile coverage', () => {
  const leaves = selectPatches(chunk, { x: 3825, y: 25, z: 3825 }, 2);
  expect(leaves.length).toBeLessThanOrEqual(16);
  expect(leaves.reduce((area, p) => area + p.span ** 2, 0)).toBe(7650 ** 2);
  const built = buildPatch(chunk, new Float32Array(65536), leaves[0]!);
  // Two 1000-patch hierarchies fit inside the unchanged 96 MiB geometry cap.
  expect(built.bytes * 2000).toBeLessThan(96 * 1024 * 1024);
  built.geometry.dispose();
});

test('patch split morph agrees at the far corner and clipped theater boundary', () => {
  const samples = new Float32Array(65536);
  for (let i = 0; i < samples.length; i++)
    samples[i] = 100 * Math.sin((i % 256) * 0.23) * Math.cos(Math.floor(i / 256) * 0.17);
  const metadata = { ...chunk, minElevation: -100, maxElevation: 100 };
  const parentPatch = { x: 0, z: 0, span: 3825, depth: 1, key: 'r0' };
  const childPatch = { x: 1912.5, z: 0, span: 1912.5, depth: 2, key: 'r01' };
  const camera = { x: -5355, y: 100, z: 1912.5 };
  const parent = buildPatch(metadata, samples, parentPatch);
  const child = buildPatch(metadata, samples, childPatch);
  expect(patchMorph(metadata, parentPatch, camera)).toBe(0);
  expect(patchMorph(metadata, childPatch, camera)).toBe(1);
  expect(child.geometry.getAttribute('coarseHeight').getX(286)).toBeCloseTo(
    parent.geometry.getAttribute('position').getY(151),
    5,
  );
  parent.geometry.dispose();
  child.geometry.dispose();
  const extents = { width: 1234, height: 7650 };
  const clippedParent = buildPatch(metadata, samples, parentPatch, extents);
  const clippedChild = buildPatch(metadata, samples, { ...childPatch, x: 0 }, extents);
  expect(clippedChild.geometry.getAttribute('coarseHeight').getX(11)).toBeCloseTo(
    clippedParent.geometry.getAttribute('position').getY(6),
    5,
  );
  const coarseTint = clippedChild.geometry.getAttribute('coarseColor');
  const tint = clippedParent.geometry.getAttribute('color');
  for (let axis = 0; axis < 3; axis++)
    expect(coarseTint.array[11 * 3 + axis]).toBeCloseTo(tint.array[6 * 3 + axis]!, 6);
  clippedParent.geometry.dispose();
  clippedChild.geometry.dispose();
});
