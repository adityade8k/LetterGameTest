const test = require('node:test');
const assert = require('node:assert/strict');
const api = import('../three/timer-presentation.mjs');

test('clock colors use normal capacity and include the exact half and quarter boundaries', async () => {
  const {timerStage} = await api;
  assert.equal(timerStage(80, 80), 'high');
  assert.equal(timerStage(40.01, 80), 'high');
  assert.equal(timerStage(40, 80), 'middle');
  assert.equal(timerStage(20.01, 80), 'middle');
  assert.equal(timerStage(20, 80), 'low');
  assert.equal(timerStage(-1, 80), 'low');
  assert.equal(timerStage(80.01, 80), 'overtime');
  assert.equal(timerStage(60, 0), 'low');
});

test('threshold cues fire once on downward crossings and rearm only after replenishment', async () => {
  const {TimerPresentation} = await api, clock = new TimerPresentation();
  assert.equal(clock.observe(60, 60), '');
  assert.equal(clock.observe(30, 60), 'half');
  assert.equal(clock.observe(30, 60), '');
  assert.equal(clock.observe(16, 60), '');
  assert.equal(clock.observe(15, 60), 'quarter');
  assert.equal(clock.observe(10, 60), '');
  assert.equal(clock.observe(20, 60), '');
  assert.equal(clock.observe(15, 60), 'quarter');
  assert.equal(clock.observe(40, 60), '');
  assert.equal(clock.observe(30, 60), 'half');
});

test('large drops prefer the urgent boundary and a low initial clock does not invent a crossing', async () => {
  const {TimerPresentation} = await api, clock = new TimerPresentation();
  assert.equal(clock.observe(10, 60), '');
  clock.observe(60, 60);
  assert.equal(clock.observe(9, 60), 'quarter');
  assert.equal(clock.pose().cue, 'quarter');
  assert.equal(clock.observe(NaN, 60), '');
  assert.equal(clock.observe(20, 0), '');
  assert.equal(clock.previousRatio, .15);
});

test('overtime is announced only on entry, expires while still in overtime and can recur after exit', async () => {
  const {TimerPresentation} = await api, clock = new TimerPresentation();
  clock.observe(60, 60);
  assert.equal(clock.observe(75, 60), 'overtime');
  assert.equal(clock.pose().labelVisible, true);
  clock.advance(1);
  assert.equal(clock.observe(90, 60), '');
  assert.equal(clock.age, 1, 'another overtime refill must not restart the cue');
  clock.advance(.6);
  assert.equal(clock.pose().labelVisible, false);
  clock.observe(60, 60);
  assert.equal(clock.observe(61, 60), 'overtime');
  clock.observe(60, 60);
  assert.equal(clock.pose().labelVisible, false, 'short overtime ends the label immediately');
});

test('cue motion freezes with zero active time and reduced motion keeps a stationary readable label', async () => {
  const {TimerPresentation} = await api, clock = new TimerPresentation();
  clock.observe(60, 60); clock.observe(90, 60); clock.advance(.3);
  const before = clock.pose();
  assert.ok(before.scaleY > 1);
  clock.advance(0); clock.advance(-1); clock.advance(NaN);
  assert.deepEqual(clock.pose(), before);
  const reduced = clock.pose(true);
  assert.equal(reduced.scaleX, 1); assert.equal(reduced.scaleY, 1); assert.equal(reduced.tipScale, 1); assert.equal(reduced.labelScale, 1);
  assert.equal(reduced.labelVisible, true);
  clock.advance(1.3); assert.equal(clock.pose(true).labelVisible, false);
  clock.reset(); assert.equal(clock.pose().cue, ''); assert.equal(clock.observe(15, 60), '');
});
