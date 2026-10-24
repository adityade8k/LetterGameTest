// A round's Z-spin intensity, driven by unpaused active seconds rather than
// frame count or the refillable round timer. Randomness is sampled only when
// choosing a new segment, so refresh rate cannot change the curve.
const clamp = value => Math.max(0, Math.min(1, value));
const smoothstep = value => value * value * (3 - 2 * value);
export class DifficultyCurve {
  constructor(settings, random = Math.random) {
    this.settings = settings;
    this.random = random;
    this.reset();
  }
  reset() {
    this.start = 0;
    this.end = this.settings.rampSeconds;
    this.from = 0;
    this.targetIndex = this.settings.levelSteps;
    this.to = 1;
  }
  valueAt(activeSeconds) {
    if (!this.settings.enabled) return 0;
    const time = Math.max(0, activeSeconds);
    // The opening is always calm, even when a caller queries it after a reset.
    if (time <= this.settings.rampSeconds) return smoothstep(time / this.settings.rampSeconds);
    while (time > this.end) {
      this.start = this.end;
      this.from = this.to;
      // Choose any other intensity, including exactly zero. Excluding the
      // current endpoint avoids consecutive flat segments; direction varies.
      const choice = Math.min(this.settings.levelSteps - 1, Math.floor(clamp(this.random()) * this.settings.levelSteps));
      this.targetIndex = choice >= this.targetIndex ? choice + 1 : choice;
      this.to = this.targetIndex / this.settings.levelSteps;
      this.end += this.settings.minTransitionSeconds + clamp(this.random()) *
        (this.settings.maxTransitionSeconds - this.settings.minTransitionSeconds);
    }
    const progress = clamp((time - this.start) / (this.end - this.start));
    return this.from + (this.to - this.from) * smoothstep(progress);
  }
}
