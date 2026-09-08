import { describe, expect, test } from 'bun:test';

import { FixedStepClock, SIM_HZ } from './FixedStepClock';

describe('FixedStepClock', () => {
  test('defaults to 120 Hz', () => {
    const clock = new FixedStepClock();
    expect(SIM_HZ).toBe(120);
    expect(clock.stepSeconds).toBeCloseTo(1 / 120, 12);
  });

  test('a 60 Hz frame runs exactly two 120 Hz steps with alpha 0', () => {
    const clock = new FixedStepClock();
    const dts: number[] = [];
    const r = clock.advance(2 / 120, (dt) => dts.push(dt));
    expect(r.steps).toBe(2);
    expect(dts).toEqual([1 / 120, 1 / 120]);
    expect(r.alpha).toBeCloseTo(0, 9);
    expect(r.clamped).toBe(false);
  });

  test('a frame shorter than a step runs zero steps and carries alpha', () => {
    const clock = new FixedStepClock();
    const r = clock.advance(0.5 / 120, () => undefined);
    expect(r.steps).toBe(0);
    expect(r.alpha).toBeCloseTo(0.5, 9);
    expect(clock.alpha).toBeCloseTo(0.5, 9);
  });

  test('accumulates across frames and passes sim time at step start', () => {
    const clock = new FixedStepClock();
    const times: number[] = [];
    clock.advance(0.75 / 120, (_dt, t) => times.push(t));
    const r = clock.advance(0.75 / 120, (_dt, t) => times.push(t));
    expect(r.steps).toBe(1);
    expect(times).toEqual([0]);
    expect(r.alpha).toBeCloseTo(0.5, 9);
    expect(clock.steps).toBe(1);
    expect(clock.simTime).toBeCloseTo(1 / 120, 12);
  });

  test('sim time does not drift over many steps', () => {
    const clock = new FixedStepClock();
    for (let i = 0; i < 10_000; i++) clock.advance(1 / 60, () => undefined);
    expect(clock.steps).toBe(20_000);
    expect(clock.simTime).toBeCloseTo(20_000 / 120, 9);
  });

  test('clamps huge frame deltas', () => {
    const clock = new FixedStepClock({ maxFrameSeconds: 0.25 });
    const r = clock.advance(5, () => undefined);
    expect(r.clamped).toBe(true);
    expect(r.steps).toBe(30);
    expect(clock.simTime).toBeCloseTo(0.25, 9);
  });

  test('caps steps per frame and drops the backlog', () => {
    const clock = new FixedStepClock({ maxStepsPerFrame: 4 });
    const r = clock.advance(0.1, () => undefined);
    expect(r.steps).toBe(4);
    expect(r.clamped).toBe(true);
    expect(r.alpha).toBeGreaterThanOrEqual(0);
    expect(r.alpha).toBeLessThan(1);
  });

  test('ignores negative and non-finite deltas', () => {
    const clock = new FixedStepClock();
    expect(clock.advance(-1, () => undefined).steps).toBe(0);
    expect(clock.advance(Number.NaN, () => undefined).steps).toBe(0);
    expect(clock.alpha).toBe(0);
  });

  test('reset clears everything', () => {
    const clock = new FixedStepClock();
    clock.advance(1, () => undefined);
    clock.reset();
    expect(clock.steps).toBe(0);
    expect(clock.simTime).toBe(0);
    expect(clock.alpha).toBe(0);
  });

  test('rejects invalid options', () => {
    expect(() => new FixedStepClock({ stepSeconds: 0 })).toThrow(RangeError);
    expect(() => new FixedStepClock({ maxStepsPerFrame: 0 })).toThrow(RangeError);
  });
});
