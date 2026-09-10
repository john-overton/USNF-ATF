import { expect, test } from 'bun:test';
import { GameplayCueState, type GameplayCueInput } from './gameplay-cues';
const input: GameplayCueInput = {
  step: 1,
  status: 'airborne',
  destroyed: false,
  stalled: false,
  fuelKg: 100,
  gearDown: false,
  flapsDown: false,
  hookDown: false,
  damage: 0,
};
test('spawn/reset is silent; actual actuator, contact and empty-fuel edges play once', () => {
  const state = new GameplayCueState();
  expect(state.update(input)).toEqual([]);
  const next = {
    ...input,
    step: 2,
    gearDown: true,
    flapsDown: true,
    fuelKg: 0,
    status: 'grounded',
  };
  expect(state.update(next)).toEqual(['gearDown', 'flapsDown', 'outOfFuel', 'touchdown']);
  expect(state.update(next)).toEqual([]);
  state.reset();
  expect(state.update(next)).toEqual([]);
});
test('stall repeats are simulation-clock bounded; speech damage has cooldown; death stays silent', () => {
  const state = new GameplayCueState();
  state.update(input);
  expect(state.update({ ...input, step: 2, stalled: true, damage: 1 })).toEqual([
    'stall',
    'playerHit',
  ]);
  expect(state.update({ ...input, step: 721, stalled: true, damage: 2 })).toEqual([]);
  expect(state.update({ ...input, step: 722, stalled: true, damage: 3 })).toEqual(['stall']);
  expect(state.update({ ...input, step: 962, damage: 4 })).toEqual(['playerHit']);
  expect(
    state.update({ ...input, step: 2000, stalled: true, damage: 100, destroyed: true }),
  ).toEqual([]);
});
test('hook shares flap sample; missing terrain and ground stalls do not warn', () => {
  const state = new GameplayCueState();
  state.update(input);
  expect(state.update({ ...input, hookDown: true, stalled: true, status: 'grounded' })).toEqual([
    'flapsDown',
    'touchdown',
  ]);
  expect(state.update({ ...input, status: 'waiting-terrain' })).toEqual([]);
});
