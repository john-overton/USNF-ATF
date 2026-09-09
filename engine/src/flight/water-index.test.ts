import { expect, test } from 'bun:test';
import { inRing, containsWater } from './GroundSampler';
import { WaterRingIndex, WaterBodyIndex } from './WaterIndex';
import type { WaterBody } from '../data';

test('scanline index agrees with full polygon parity at vertices, boundaries, holes and outside', () => {
  const ring: [number, number][] = [];
  for (let i = 0; i < 2000; i++) {
    const angle = (i * Math.PI) / 1000,
      radius = 5000 + 1000 * Math.sin(angle * 17);
    ring.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  const body: WaterBody = {
    id: 'complex',
    elevation: 0,
    polygon: ring,
    holes: [
      [
        [-1000, -1000],
        [1000, -1000],
        [1000, 1000],
        [-1000, 1000],
      ],
    ],
  };
  const index = new WaterBodyIndex(body);
  for (let z = -7000; z <= 7000; z += 211)
    for (let x = -7000; x <= 7000; x += 197)
      expect(index.contains(x, z)).toBe(containsWater(body, x, z));
  for (const [x, z] of [...ring, ...body.holes![0]!])
    for (const offset of [-1e-7, 0, 1e-7])
      expect(index.contains(x + offset, z)).toBe(containsWater(body, x + offset, z));
  expect(index.exterior.candidateCount(0)).toBeLessThan(ring.length / 10);
});

test('long edges, duplicate closure, horizontal edges and bucket boundaries retain exact parity', () => {
  const ring: [number, number][] = [
    [0, 0],
    [100, 200000],
    [300, 100000],
    [500, 200000],
    [600, 0],
    [0, 0],
  ];
  const index = new WaterRingIndex(ring);
  for (let z = 0; z <= 200000; z += 200000 / 256)
    for (const x of [-1, 0, 50, 200, 300, 500, 600, 601])
      expect(index.contains(x, z)).toBe(inRing(ring, x, z));
});
