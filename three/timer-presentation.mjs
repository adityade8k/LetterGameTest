// Presentation only: milestone cues never alter either gameplay clock.
export function timerStage(remaining, capacity) {
  const ratio = Number.isFinite(remaining) && Number.isFinite(capacity) && capacity > 0 ? Math.max(0, remaining / capacity) : 0;
  return ratio > 1 ? 'overtime' : ratio <= .25 ? 'low' : ratio <= .5 ? 'middle' : 'high';
}

export class TimerPresentation {
  constructor() { this.reset(); }
  reset() { this.previousRatio = null; this.cue = ''; this.age = Infinity; }
  observe(remaining, capacity) {
    if (!Number.isFinite(remaining) || !Number.isFinite(capacity) || capacity <= 0) return '';
    const ratio = Math.max(0, remaining / capacity), previous = this.previousRatio;
    this.previousRatio = ratio;
    if (this.cue === 'overtime' && ratio <= 1) { this.cue = ''; this.age = Infinity; }
    if (previous === null) return '';
    // A large penalty that crosses both boundaries gets the urgent cue once.
    const cue = ratio > 1 && previous <= 1 ? 'overtime'
      : ratio <= .25 && previous > .25 ? 'quarter'
      : ratio <= .5 && previous > .5 ? 'half' : '';
    if (cue) { this.cue = cue; this.age = 0; }
    return cue;
  }
  advance(dt) { if (Number.isFinite(dt) && dt > 0) this.age += dt; }
  pose(reducedMotion = false) {
    const duration = this.cue === 'overtime' ? 1.6 : .9;
    const active = Boolean(this.cue) && this.age < duration;
    const progress = Math.max(0, Math.min(1, this.age / duration));
    const beats = this.cue === 'quarter' ? 2 : 1;
    const pulse = active && !reducedMotion ? Math.sin(progress * Math.PI * beats) ** 2 * (1 - progress) : 0;
    return { cue: active ? this.cue : '', scaleX: 1 + pulse * .015, scaleY: 1 + pulse * .3,
      tipScale: 1 + pulse * .3, labelVisible: active && this.cue === 'overtime',
      labelScale: 1 + pulse * .1 };
  }
}
