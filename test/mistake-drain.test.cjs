const test = require('node:test');
const assert = require('node:assert/strict');
const { WordGame } = require('../engine.js');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} versus ${expected}`);
const make = (options = {}) => {
  const game = new WordGame(['CAT', 'CATCH', 'DOG'], {
    ...options,
    timer: { startSeconds: 120, maxSeconds: 120, mistakeGraceCount: 3, mistakeDrainStep: .01, ...options.timer },
    rules: { nextLetterSeconds: 2, extensionSecondsPerLetter: .5, ...options.rules },
    penalties: { invalidWordSeconds: 0, clearWordSeconds: 0, ...options.penalties },
  });
  game.start(0);
  return game;
};
const spell = (game, word, now = 0) => [...word].map(letter => game.select(letter, now)).at(-1);
const mistakes = (game, count, now = 0) => {
  for (let i = 0; i < count; i++) assert.equal(game.select('Q', now).reason, 'spelling');
};

test('three mistakes are free of extra drain, then each adds one percentage point', () => {
  const game = make();
  let expected = 120;
  for (let count = 1; count <= 8; count++) {
    const now = (count - 1) * 1000;
    const event = game.select('Q', now);
    const multiplier = 1 + Math.max(0, count - 3) / 100;
    near(game.timerDrainMultiplier, multiplier);
    near(event.timerDrainMultiplier, multiplier);
    assert.equal(event.mistakes, count);
    game.advance(now + 1000);
    expected -= multiplier;
    near(game.remaining, expected);
    near(game.timeScale, 1);
    near(game.worldTimeScale, 1);
  }
});

test('wrong words and nonempty deletes share the same mistake count', () => {
  const game = make({ penalties: { invalidWordSeconds: 5, clearWordSeconds: 2 } });
  game.select('Q', 0); // Invalid spelling.
  game.select('C', 0); assert.equal(game.submit(0).reason, 'incomplete');
  spell(game, 'CAT'); assert.equal(game.undo(0).reason, 'clear');
  near(game.timerDrainMultiplier, 1);
  game.select('C', 0); const fourth = game.undo(0);
  near(fourth.timerDrainMultiplier, 1.01);
  near(game.remaining, 106); // Original immediate penalties remain unchanged.
  game.advance(1000); near(game.remaining, 104.99);
  assert.equal(game.mistakes, 4);
});

test('empty actions, ignored input, automatic discards and repeats do not count', () => {
  const game = make(); mistakes(game, 4);
  assert.equal(game.undo(0).type, 'ignored');
  assert.equal(game.submit(0).type, 'ignored');
  assert.equal(game.select('!', 0).type, 'ignored');
  game.select('C', 0); assert.equal(game.advance(2000).reason, 'timeout');
  spell(game, 'CAT', 2000); game.submit(2000);
  spell(game, 'CAT', 2000); assert.equal(game.submit(2000).type, 'repeat');
  assert.equal(game.mistakes, 4); near(game.timerDrainMultiplier, 1.01);
});

test('correct words preserve accumulated drain until a fresh round', () => {
  const game = make(); mistakes(game, 6);
  spell(game, 'CAT'); assert.equal(game.submit(0).type, 'word');
  near(game.timerDrainMultiplier, 1.03);
  game.start(10000);
  assert.equal(game.mistakes, 0); near(game.timerDrainMultiplier, 1);
  game.advance(11000); near(game.remaining, 119);
});

test('pausing preserves the mistake rate without spending time or accepting mistakes', () => {
  const game = make(); mistakes(game, 5);
  game.activate('fire', 0);
  const duration = game.effects.fire;
  game.pause(1000); const remaining = game.remaining;
  game.advance(50000); game.select('Q', 50000); game.undo(50000);
  near(game.remaining, remaining); near(game.effects.fire, duration - 1);
  assert.equal(game.mistakes, 5);
  game.resume(50000); game.advance(51000);
  near(game.remaining, remaining - 1.02); near(game.effects.fire, duration - 2);
});

test('extra round drain never shortens the per-letter deadline', () => {
  const game = make(); mistakes(game, 6); game.select('C', 0);
  near(game.secondsUntilWordTimeout, 2);
  assert.equal(game.advance(1999), null);
  near(game.letterSeconds, .001); near(game.remaining, 120 - 1.999 * 1.03);
  assert.equal(game.advance(2000).reason, 'timeout');
  assert.equal(game.mistakes, 6); near(game.remaining, 120 - 2 * 1.03);
});

test('ice expiry and a word deadline integrate identically in long and small frames', () => {
  const run = step => {
    const game = make({ hourglass: { durationSeconds: 3, timeScale: .4 }, penalties: { clearWordSeconds: 2 } });
    mistakes(game, 4); game.select('C', 0); game.activate('hourglass', 0);
    near(game.secondsUntilWordTimeout, 3.8);
    for (let now = step; now < 5000; now += step) game.advance(now);
    game.advance(5000); return game;
  };
  const large = run(5000), small = run(20);
  near(large.remaining, 120 - (3 * .4 + 2) * 1.01 - 2);
  near(large.remaining, small.remaining); near(large.elapsed, small.elapsed);
  assert.equal(large.mistakes, 4); assert.equal(small.mistakes, 4);
  assert.equal(large.current, ''); assert.equal(small.current, '');
  assert.deepEqual(large.effects, { hourglass: 0, smoke: 0, fire: 0 });
});

test('fire keeps ordinary clock speed while mistake drain and real effect lifetime continue', () => {
  const game = make({ fire: { durationSeconds: 5, worldTimeScale: 2.5 } });
  mistakes(game, 6); game.activate('fire', 0); game.select('C', 0);
  game.advance(1000);
  near(game.remaining, 118.97); near(game.letterSeconds, 1); near(game.effects.fire, 4);
  near(game.timeScale, 1); near(game.worldTimeScale, 2.5);
  game.advance(4000);
  near(game.remaining, 120 - 4 * 1.03); near(game.effects.fire, 1);
  assert.equal(game.mistakes, 6);
  game.advance(5000); near(game.effects.fire, 0); near(game.worldTimeScale, 1);
});

test('a round ending during ice clips elapsed time and the word clock at its exact end', () => {
  const game = make({ hourglass: { durationSeconds: 5, timeScale: .4 } });
  mistakes(game, 4); game.remaining = 1.01;
  game.select('C', 0); game.activate('hourglass', 0);
  assert.equal(game.advance(10000).type, 'ended');
  near(game.elapsed, 2.5); near(game.letterSeconds, 1); near(game.remaining, 0);
  assert.equal(game.phase, 'over');
  assert.deepEqual(game.effects, { hourglass: 0, smoke: 0, fire: 0 });
});

test('a round ending after ice expiry spends only its real remaining active time', () => {
  const game = make({ rules: { nextLetterSeconds: 8 }, hourglass: { durationSeconds: 3, timeScale: .4 } });
  mistakes(game, 4); game.remaining = 3.03;
  game.select('C', 0); game.activate('hourglass', 0);
  assert.equal(game.advance(10000).type, 'ended');
  near(game.elapsed, 4.8); near(game.letterSeconds, 5); near(game.remaining, 0);
});

test('a mistake changes only future drain, never the time before the input', () => {
  const game = make(); mistakes(game, 3);
  game.select('Q', 1000); near(game.remaining, 119);
  game.select('C', 2000); near(game.remaining, 117.99);
  game.submit(2000); near(game.timerDrainMultiplier, 1.02);
  game.advance(3000); near(game.remaining, 116.97);
});

test('automatic valid-word submission keeps reward and timing identical across frame sizes', () => {
  const run = step => {
    const game = make({ hourglass: { durationSeconds: 3, timeScale: .4 } });
    mistakes(game, 6); spell(game, 'CAT'); game.activate('hourglass', 0);
    for (let now = step; now < 8000; now += step) game.advance(now);
    game.advance(8000); return game;
  };
  const large = run(8000), small = run(10);
  near(large.remaining, 120 - (3 * .4 + 5) * 1.03 + .5);
  near(large.remaining, small.remaining); near(large.comboSeconds, small.comboSeconds);
  near(large.elapsed, small.elapsed); assert.deepEqual(large.words, ['CAT']);
  assert.deepEqual(small.words, large.words); assert.equal(large.score, 5);
});

test('the grace count and linear drain step can be tuned or disabled', () => {
  const game = make({ timer: { mistakeGraceCount: 2, mistakeDrainStep: .02 } });
  mistakes(game, 4); near(game.timerDrainMultiplier, 1.04);
  game.advance(1000); near(game.remaining, 118.96);
  const disabled = make({ timer: { mistakeDrainStep: 0 } });
  mistakes(disabled, 20); near(disabled.timerDrainMultiplier, 1);
  disabled.advance(1000); near(disabled.remaining, 119);
});
