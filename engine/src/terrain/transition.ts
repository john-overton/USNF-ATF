/** A source change waits for stable selection and complete decoded coverage. */
export const SOURCE_SETTLE_MS = 400;
export const SOURCE_FADE_MS = 800;
export class SourceTransition {
  from = -1;
  to = -1;
  started = 0;
  completed = 0;
  private candidate = -1;
  private candidateSince = 0;
  active = false;
  progress = 1;

  update(now: number): boolean {
    if (!this.active) return false;
    const t = Math.max(0, Math.min(1, (now - this.started) / SOURCE_FADE_MS));
    this.progress = t * t * (3 - 2 * t);
    if (t < 1) return false;
    this.active = false;
    this.completed++;
    return true;
  }

  consider(lod: number, loaded: boolean, now: number): boolean {
    if (this.active) return false;
    if (lod !== this.candidate) {
      this.candidate = lod;
      this.candidateSince = now;
    }
    if (!loaded || lod === this.to) return false;
    if (this.to < 0) {
      this.from = this.to = lod;
      return true;
    }
    if (now - this.candidateSince < SOURCE_SETTLE_MS) return false;
    this.from = this.to;
    this.to = lod;
    this.started = now;
    this.active = true;
    this.progress = 0;
    return true;
  }
}
