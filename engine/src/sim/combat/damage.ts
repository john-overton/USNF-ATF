/**
 * Damage accumulation and its effect on performance. See `Docs/formats/damage.md`.
 *
 * Retail keeps one `hitPoints` pool per object and a five-entry table on each
 * weapon giving the damage it inflicts against five target-hardness classes.
 * There is no per-object armour table: `OBJ_TYPE.damage[]` is a constant on
 * every `.PT`, `.NT` and `.OT`, so hardness selection is the weapon's business.
 *
 * The performance penalties reproduce the shape of four recovered code sites:
 * available G and the speed bound are scaled by `100 - damage*k/100`, while
 * G-pull drag and a second drag term are raised by `100 + damage*k/100`.
 * Pure and deterministic; no wall-clock, no RNG.
 */

/**
 * Retail `OBJ_TYPE.damage[0..4]`. The ordering is a hypothesis: slot 1 is the
 * hardest (roughly a tenth of the damage passes) and slots 0 and 4 the softest.
 * The decisive evidence is that the GAU-8 armour-piercing cannon keeps full
 * damage in slots 2 and 3 where the M61 keeps 28%. The mapping from these five
 * slots to the ten `obj_class` bits is NOT recoverable from the data files.
 */
export type HardnessClass = 0 | 1 | 2 | 3 | 4;
export const HARDNESS_CLASSES: readonly HardnessClass[] = [0, 1, 2, 3, 4];

export interface DamageState {
  /** Retail `hitPoints`: the pool, not a remaining count. */
  readonly hitPointsMax: number;
  /**
   * Accumulated damage in hit points. The manual is explicit that damage is a
   * percentage that may exceed 100%, so this is not clamped at the pool.
   */
  readonly accumulated: number;
  readonly destroyed: boolean;
}

export function createDamageState(hitPointsMax: number): DamageState {
  if (!Number.isFinite(hitPointsMax) || hitPointsMax < 0)
    throw new Error('Damage pool must be a finite, non-negative hit point count');
  return { hitPointsMax, accumulated: 0, destroyed: false };
}

/** Accumulated damage as a percentage of the pool. May exceed 100. */
export function damagePercent(state: DamageState): number {
  if (state.hitPointsMax <= 0) return state.destroyed ? 100 : 0;
  return (state.accumulated / state.hitPointsMax) * 100;
}

/**
 * Apply weapon damage. `amount` is the weapon's `damage[hardness]` entry, in the
 * same hit-point units as the pool, so an AIM-9M's 100 against an F-14's 153
 * takes two hits exactly as retail does.
 */
export function applyDamage(state: DamageState, amount: number): DamageState {
  if (!Number.isFinite(amount)) throw new Error('Damage amount must be finite');
  if (amount <= 0 || state.destroyed) return state;
  const accumulated = state.accumulated + amount;
  // A zero pool is scenery that cannot be hurt (roads, flags), not something
  // destroyed by the first graze.
  const destroyed = state.hitPointsMax > 0 && accumulated >= state.hitPointsMax;
  return { hitPointsMax: state.hitPointsMax, accumulated, destroyed };
}

/** Mark an object destroyed outright, e.g. terrain impact. */
export function destroy(state: DamageState): DamageState {
  return state.destroyed
    ? state
    : {
        hitPointsMax: state.hitPointsMax,
        accumulated: Math.max(state.accumulated, state.hitPointsMax),
        destroyed: true,
      };
}

/**
 * Per-aircraft-type coefficients matching the four recovered sites. The retail
 * fields exist per `.PT` but have not been located in the parsed field list, so
 * 100 — damage percent applied one-for-one — is our documented default rather
 * than a recovered value.
 */
export interface DamageCoefficients {
  /** Scales available G down. */
  turn: number;
  /** Scales the speed bound down. */
  speed: number;
  /** Raises drag while pulling G. */
  gPullDrag: number;
  /** Raises the baseline drag term. */
  drag: number;
}
export const DEFAULT_DAMAGE_COEFFICIENTS: Readonly<DamageCoefficients> = Object.freeze({
  turn: 100,
  speed: 100,
  gPullDrag: 100,
  drag: 100,
});

export interface DamageEffects {
  /** Multiplier on maximum and minimum available G. */
  gScale: number;
  /** Multiplier on the speed bound. */
  speedScale: number;
  gPullDragScale: number;
  dragScale: number;
}

/**
 * The manual also claims damaged computer opponents lose thrust. No thrust
 * reduction was found in the recovered code — `@COThrust@4` only selects
 * military or afterburner — so no thrust term is modelled here. See
 * `Docs/formats/damage.md`.
 */
export function damageEffects(
  state: DamageState,
  coefficients: DamageCoefficients = DEFAULT_DAMAGE_COEFFICIENTS,
): DamageEffects {
  const percent = Math.max(0, damagePercent(state));
  const down = (k: number) => Math.max(0, (100 - (percent * k) / 100) / 100);
  const up = (k: number) => (100 + (percent * k) / 100) / 100;
  return {
    gScale: down(coefficients.turn),
    speedScale: down(coefficients.speed),
    gPullDragScale: up(coefficients.gPullDrag),
    dragScale: up(coefficients.drag),
  };
}

/**
 * The low-skill G penalty is a separate recovered effect: novice and average AI
 * pilots lose one G on each side of the envelope, floored at plus or minus two.
 * The human-flown aircraft is exempt. Skill is the retail 0..3 byte.
 */
export function skillGLimits(
  skill: number,
  maxG: number,
  minG: number,
  humanFlown = false,
): { maxG: number; minG: number } {
  if (humanFlown || skill > 1) return { maxG, minG };
  return { maxG: Math.max(maxG - 1, 2), minG: Math.min(minG + 1, -2) };
}

/**
 * Over-G structural failure against retail `structureWarnLimit` /
 * `structureLimit`. The manual notes a damaged airframe is likely destroyed by
 * high G, which is why accumulated damage lowers the effective limit.
 */
export function structuralOverload(
  loadFactor: number,
  limits: { warn: number; fail: number },
  state?: DamageState,
): 'none' | 'warn' | 'fail' {
  const health = state ? Math.max(0, 1 - Math.max(0, damagePercent(state)) / 100) : 1;
  const g = Math.abs(loadFactor);
  if (g >= limits.fail * health) return 'fail';
  if (g >= limits.warn * health) return 'warn';
  return 'none';
}
