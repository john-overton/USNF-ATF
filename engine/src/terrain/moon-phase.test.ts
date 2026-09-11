import { expect, test } from 'bun:test';
import { moonVisibility, MOON_FEATHER } from './moon-phase';

test('curved waxing and waning terminators mirror and preserve lit area', () => {
  expect(MOON_FEATHER).toBe(0.02);
  expect(moonVisibility(0.4, 0, 0.25, true)).toBe(0);
  expect(moonVisibility(0.4, 0.8, 0.25, true)).toBe(1);
  for (const phase of [0, 0.05, 0.25, 0.5, 0.75, 1]) {
    let area = 0,
      disc = 0;
    for (let y = -0.99; y < 1; y += 0.02)
      for (let x = -0.99; x < 1; x += 0.02) {
        const value = moonVisibility(x, y, phase, true);
        expect(value).toBeCloseTo(moonVisibility(-x, y, phase, false), 10);
        area += value;
        if (x * x + y * y <= 1) disc++;
      }
    expect(Math.abs(area / disc - phase)).toBeLessThan(0.015);
  }
});

test('limb and terminator feather continuously; new moon has no emitting pixels', () => {
  expect(moonVisibility(0, 0, 0.5, true)).toBeCloseTo(0.5);
  expect(moonVisibility(0.01, 0, 0.5, true)).toBeGreaterThan(0.5);
  expect(moonVisibility(0.01, 0, 0.5, true)).toBeLessThan(1);
  expect(moonVisibility(1, 0, 1, true)).toBeCloseTo(0.5);
  expect(moonVisibility(1, 0, 0, true)).toBe(0);
});
