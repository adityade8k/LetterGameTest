const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../three/audio.mjs');

function mockAudio(t, state = 'running') {
  const original = globalThis.AudioContext;
  const contexts = [];
  class Parameter {
    constructor() { this.value = 0; this.events = []; }
    setValueAtTime(...args) { this.events.push(['set', ...args]); }
    linearRampToValueAtTime(...args) { this.events.push(['linear', ...args]); }
    exponentialRampToValueAtTime(...args) { this.events.push(['exponential', ...args]); }
    cancelScheduledValues(...args) { this.events.push(['cancel', ...args]); }
  }
  class Node {
    constructor() { this.gain = new Parameter(); this.frequency = new Parameter(); this.detune = new Parameter(); this.stops = []; }
    connect(destination) { this.destination = destination; }
    disconnect() { this.disconnected = true; }
    start(at) { this.started = at; }
    stop(at) { this.stops.push(at); }
  }
  class AudioContext {
    constructor() { this.currentTime = 1; this.state = state; this.destination = {}; this.oscillators = []; this.resumes = 0; contexts.push(this); }
    createGain() { return new Node(); }
    createOscillator() { const oscillator = new Node(); this.oscillators.push(oscillator); return oscillator; }
    async resume() { this.resumes++; this.state = 'running'; }
    async close() { this.state = 'closed'; }
  }
  globalThis.AudioContext = AudioContext;
  t.after(() => { if (original === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = original; });
  return contexts;
}

test('audio defaults stay silent, and only a gesture unlock creates/resumes a device', async t => {
  const contexts = mockAudio(t, 'suspended');
  const { createAudio } = await modulePromise, audio = createAudio();
  assert.equal(await audio.unlock(), false); assert.equal(contexts.length, 0);
  audio.setSettings({ effects: true });
  assert.equal(audio.play('word'), false); assert.equal(contexts.length, 0);
  assert.equal(await audio.unlock(), true); assert.equal(contexts.length, 1);
  assert.equal(contexts[0].resumes, 1);
  assert.equal(audio.play('word', { length: 3 }), true);
  assert.equal(contexts[0].resumes, 1);
  audio.dispose();
});

test('a word emits one achievement phrase and coalesces duplicate achievement events', async t => {
  const contexts = mockAudio(t);
  const { createAudio } = await modulePromise, audio = createAudio({ effects: true });
  await audio.unlock();
  const context = contexts[0];
  assert.equal(audio.play('word', { length: 7, isNew: true, isRecord: true, blankCount: 1 }), true);
  assert.equal(context.oscillators.length, 8); // Four soft notes, two layers each.
  assert.equal(audio.play('newword', { length: 7 }), false);
  assert.equal(audio.play('record'), false);
  assert.equal(context.oscillators.length, 8);
  context.currentTime += .2;
  assert.equal(audio.play('word', { length: 3 }), true);
  assert.equal(context.oscillators.length, 12);
  audio.dispose();
});

test('pause cancels current and future tones and ambient; resume does not replay them', async t => {
  const contexts = mockAudio(t);
  const { createAudio } = await modulePromise, audio = createAudio({ effects: true, music: true });
  await audio.unlock();
  const context = contexts[0];
  audio.play('word', { isRecord: true });
  assert.equal(context.oscillators.length, 11);
  assert.ok(context.oscillators.some(oscillator => oscillator.started > context.currentTime));
  audio.setActive(false);
  assert.ok(context.oscillators.every(oscillator => oscillator.disconnected && oscillator.stops.at(-1) === context.currentTime));
  assert.equal(audio.play('hourglass'), false);
  assert.equal(await audio.unlock(), true);
  assert.equal(context.oscillators.length, 11);
  audio.setActive(true);
  assert.equal(context.oscillators.length, 14); // Ambient only resumes.
  audio.dispose();
});

test('effects and ambient preferences are independent, and muting cancels scheduled feedback', async t => {
  const contexts = mockAudio(t);
  const { createAudio } = await modulePromise, audio = createAudio({ effects: true, music: true });
  await audio.unlock();
  const context = contexts[0], ambient = context.oscillators.slice();
  audio.play('hourglass');
  const feedback = context.oscillators.slice(3);
  audio.setSettings({ effects: false });
  assert.ok(feedback.every(oscillator => oscillator.disconnected));
  assert.ok(ambient.every(oscillator => !oscillator.disconnected));
  assert.equal(audio.play('letter'), false);
  audio.setSettings({ music: false });
  assert.ok(ambient.every(oscillator => oscillator.disconnected));
  audio.dispose();
});

test('low-time cue is restrained and teardown cannot recreate audio', async t => {
  const contexts = mockAudio(t);
  const { createAudio } = await modulePromise, audio = createAudio({ effects: true });
  await audio.unlock();
  const context = contexts[0];
  assert.equal(audio.play('lowtime'), true);
  for (let i = 0; i < 20; i++) assert.equal(audio.play('lowtime'), false);
  assert.equal(context.oscillators.length, 4);
  audio.dispose(); audio.dispose();
  assert.equal(context.state, 'closed');
  assert.equal(await audio.unlock(), false);
  assert.equal(audio.play('word'), false);
  assert.equal(contexts.length, 1);
});

test('haptics work with sound disabled and stop on pause or preference changes', async t => {
  const contexts = mockAudio(t);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const vibrations = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { vibrate: value => vibrations.push(value) } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor); else delete globalThis.navigator; });
  const { createAudio } = await modulePromise, audio = createAudio({ haptics: true });
  audio.play('letter'); audio.play('word', { length: 6, isNew: true });
  assert.deepEqual(vibrations, [5, 12]); assert.equal(contexts.length, 0);
  audio.setActive(false); audio.setActive(false); audio.play('word');
  assert.deepEqual(vibrations, [5, 12, 0]);
  audio.setActive(true); audio.setSettings({ haptics: false }); audio.play('letter');
  assert.deepEqual(vibrations, [5, 12, 0, 0]);
  audio.dispose();
});
