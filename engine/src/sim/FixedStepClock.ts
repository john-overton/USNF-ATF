/**
 * Fixed-timestep accumulator (brief 4.2). The sim advances in exact `stepSeconds`
 * increments no matter how often `advance` is called; the renderer interpolates between
 * the last two sim states using `alpha`. The sim never sees the frame rate.
 */
export const SIM_HZ = 120;

export interface FixedStepClockOptions {
  /** Simulation step in seconds. Default 1/120. */
  readonly stepSeconds?: number;
  /** Largest frame delta accepted, in seconds; larger deltas are clamped (spiral-of-death guard). */
  readonly maxFrameSeconds?: number;
  /** Upper bound on steps executed per `advance` call. */
  readonly maxStepsPerFrame?: number;
}

export interface AdvanceResult {
  /** Number of fixed steps executed during this call. */
  readonly steps: number;
  /** Fraction [0, 1) of a step left in the accumulator; use for render interpolation. */
  readonly alpha: number;
  /** True if the frame delta was clamped or the step cap was hit (sim time fell behind wall time). */
  readonly clamped: boolean;
}

export class FixedStepClock {
  readonly stepSeconds: number;
  readonly maxFrameSeconds: number;
  readonly maxStepsPerFrame: number;

  private accumulator = 0;
  private simTimeSeconds = 0;
  private stepCount = 0;

  constructor(options: FixedStepClockOptions = {}) {
    this.stepSeconds = options.stepSeconds ?? 1 / SIM_HZ;
    this.maxFrameSeconds = options.maxFrameSeconds ?? 0.25;
    this.maxStepsPerFrame =
      options.maxStepsPerFrame ?? Math.ceil(this.maxFrameSeconds / this.stepSeconds);
    if (!(this.stepSeconds > 0)) throw new RangeError('stepSeconds must be > 0');
    if (!(this.maxFrameSeconds >= this.stepSeconds))
      throw new RangeError('maxFrameSeconds must be >= stepSeconds');
    if (!(this.maxStepsPerFrame >= 1)) throw new RangeError('maxStepsPerFrame must be >= 1');
  }

  /** Total simulated time, in seconds: exactly `steps * stepSeconds`. */
  get simTime(): number {
    return this.simTimeSeconds;
  }

  /** Total number of fixed steps executed so far. */
  get steps(): number {
    return this.stepCount;
  }

  /** Current interpolation fraction without advancing. */
  get alpha(): number {
    return this.accumulator / this.stepSeconds;
  }

  /**
   * Feed one frame's wall-clock delta. `step` is invoked once per fixed step with the
   * fixed dt and the sim time at the *start* of that step.
   */
  advance(frameSeconds: number, step: (dt: number, simTime: number) => void): AdvanceResult {
    if (!Number.isFinite(frameSeconds) || frameSeconds < 0) frameSeconds = 0;
    let clamped = false;
    if (frameSeconds > this.maxFrameSeconds) {
      frameSeconds = this.maxFrameSeconds;
      clamped = true;
    }
    this.accumulator += frameSeconds;

    let steps = 0;
    while (this.accumulator >= this.stepSeconds && steps < this.maxStepsPerFrame) {
      step(this.stepSeconds, this.simTimeSeconds);
      this.accumulator -= this.stepSeconds;
      this.stepCount += 1;
      this.simTimeSeconds = this.stepCount * this.stepSeconds; // recompute, do not drift
      steps += 1;
    }
    if (this.accumulator >= this.stepSeconds) {
      // Hit the step cap: drop the backlog rather than spiral.
      this.accumulator = this.accumulator % this.stepSeconds;
      clamped = true;
    }
    return { steps, alpha: this.accumulator / this.stepSeconds, clamped };
  }

  reset(): void {
    this.accumulator = 0;
    this.simTimeSeconds = 0;
    this.stepCount = 0;
  }
}
