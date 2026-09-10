/** Verified gameplay state; timing and speech arbitration are remake policy. */
export const GAMEPLAY_CUES = [
  'gearDown',
  'gearUp',
  'flapsDown',
  'flapsUp',
  'stall',
  'outOfFuel',
  'playerHit',
  'playerKill',
  'touchdown',
  'terrainGround',
  'terrainWater',
] as const;
export type GameplayCue = (typeof GAMEPLAY_CUES)[number];
export interface GameplayCueInput {
  step: number;
  status: string;
  destroyed: boolean;
  stalled: boolean;
  fuelKg: number;
  gearDown: boolean;
  flapsDown: boolean;
  hookDown: boolean;
  damage: number;
}
export class GameplayCueState {
  private previous: GameplayCueInput | undefined;
  private last = new Map<GameplayCue, number>();
  update(input: GameplayCueInput): GameplayCue[] {
    const previous = this.previous;
    this.previous = { ...input };
    if (!previous || input.destroyed || input.status === 'waiting-terrain') return [];
    const result: GameplayCue[] = [];
    const emit = (cue: GameplayCue, cooldown = 0) => {
      if (input.step - (this.last.get(cue) ?? -Infinity) < cooldown) return;
      this.last.set(cue, input.step);
      result.push(cue);
    };
    if (previous.gearDown !== input.gearDown) emit(input.gearDown ? 'gearDown' : 'gearUp');
    if (previous.flapsDown !== input.flapsDown) emit(input.flapsDown ? 'flapsDown' : 'flapsUp');
    // Native FMHook shares flap actuator samples, not the arresting-hook impact sample.
    if (previous.hookDown !== input.hookDown) emit(input.hookDown ? 'flapsDown' : 'flapsUp');
    if (input.status === 'airborne' && input.stalled) emit('stall', 720);
    if (previous.fuelKg > 0 && input.fuelKg === 0) emit('outOfFuel');
    if (input.damage > previous.damage) emit('playerHit', 960);
    if (previous.status === 'airborne' && input.status === 'grounded') emit('touchdown', 120);
    return result;
  }
  reset(): void {
    this.previous = undefined;
    this.last.clear();
  }
}
