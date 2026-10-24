const test = require('node:test');
const assert = require('node:assert/strict');
const { WordGame } = require('../engine.js');
const { createConfig } = require('../config.js');
const { hourglassPosition, smokePatches } = require('../effects.js');
const dictionary = require('../data/words.js');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);
const create = (options, random = () => 0) => { const game = new WordGame(dictionary, options, random); game.start(0); return game; };
const spell = (game, word, now = 0, goldIndices = []) => [...word].map((letter, index) => game.select(letter, now, { bonus: goldIndices.includes(index) })).at(-1);

test('hourglass runs for five unscaled seconds and slows the clock to 40 percent', () => {
  const game = create();
  assert.equal(game.activate('hourglass', 0).duration, 5);
  assert.equal(game.timeScale, .4);
  game.advance(2000);
  near(game.remaining, 59.2);
  near(game.effects.hourglass, 3);
  game.advance(5000);
  near(game.remaining, 58);
  assert.equal(game.effects.hourglass, 0);
  assert.equal(game.timeScale, 1);
  game.advance(6000);
  near(game.remaining, 57);
});
test('a frame crossing effect expiry drains both slow and normal time accurately', () => {
  const game = create(); game.activate('hourglass', 0); game.advance(8000);
  near(game.remaining, 55);
  near(game.elapsed, 8);
  assert.equal(game.effects.hourglass, 0);
});
test('smoke and hourglass each expire after five active seconds when combined', () => {
  const game = create();
  game.activate('hourglass', 0); game.activate('smoke', 0);
  game.advance(4000);
  near(game.effects.smoke, 1);
  near(game.effects.hourglass, 1);
  game.advance(5000);
  assert.deepEqual(game.effects, { hourglass: 0, smoke: 0 });
  near(game.remaining, 58);
});
test('pause freezes both effects; resume uses only active time', () => {
  const game = create();
  game.activate('hourglass', 0); game.activate('smoke', 0);
  game.pause(2000); game.advance(100000);
  assert.equal(game.activate('smoke', 100000).type, 'ignored');
  near(game.effects.hourglass, 3); near(game.effects.smoke, 3);
  game.resume(100000); game.advance(103000);
  assert.deepEqual(game.effects, { hourglass: 0, smoke: 0 });
  near(game.remaining, 58);
  near(game.elapsed, 5);
});
test('a second pickup refreshes duration instead of stacking speed multipliers', () => {
  const game = create();
  game.activate('hourglass', 0); game.activate('hourglass', 4000);
  assert.equal(game.effects.hourglass, 5);
  assert.equal(game.timeScale, .4);
  game.advance(9000);
  near(game.remaining, 56.4);
  assert.equal(game.timeScale, 1);
});
test('effects preserve the pending word, bonus letters and points', () => {
  const game = create(); spell(game, 'CAT', 1000, [0]);
  const before = game.pendingReward;
  game.activate('hourglass', 1000); game.activate('smoke', 1000);
  assert.equal(game.current, 'CAT');
  assert.equal(game.pendingReward, before);
  assert.equal(game.score, 0);
  assert.equal(game.wordCount, 0);
});
test('slow time does not reduce fixed penalties', () => {
  const game = create(); game.activate('hourglass', 0);
  spell(game, 'CAT', 1000); game.undo(1000);
  near(game.remaining, 57.6);
  assert.equal(game.effects.hourglass, 4);
});
test('late pickups cannot revive an expired game and effects clear on game over', () => {
  const late = create();
  assert.equal(late.activate('hourglass', 60001).type, 'ended');
  assert.deepEqual(late.effects, { hourglass: 0, smoke: 0 });
  const active = create();
  active.activate('hourglass', 59000); active.activate('smoke', 59000);
  active.advance(61500);
  assert.equal(active.phase, 'over');
  assert.equal(active.remaining, 0);
  assert.deepEqual(active.effects, { hourglass: 0, smoke: 0 });
});
test('gold C in CATCH increases time to 22.5 seconds with the same twelve points', () => {
  const game = create(); spell(game, 'CATCH', 30000, [0]);
  assert.equal(game.pendingReward, 22.5);
  assert.equal(game.hasBonus, true);
  const result = game.submit(30000);
  assert.equal(result.points, 12);
  assert.equal(result.bonusReward, 4.5);
  assert.equal(result.reward, 22.5);
  assert.equal(game.remaining, 52.5);
  assert.equal(game.score, 12);
  assert.equal(game.hasBonus, false);
  assert.deepEqual(game.currentTiles, []);
});
test('multiple gold letters add their own time boosts without multiplying the whole word', () => {
  const game = create(); spell(game, 'CATCH', 30000, [0, 2]);
  assert.equal(game.pendingReward, 24);
  assert.equal(game.submit(30000).points, 12);
});
test('gold multipliers and reward rates are configurable; the timer cap still applies', () => {
  const game = create({ bonusLetters: { timeMultiplier: 3 }, rewards: { secondsPerPoint: .5 } });
  spell(game, 'CATCH', 1000, [0]);
  const result = game.submit(1000);
  assert.equal(result.requestedReward, 13.5);
  assert.equal(result.reward, 1);
  assert.equal(result.points, 12);
  assert.equal(game.remaining, 60);
});
test('gold letters add time after short-word caps, with unchanged scores and no hourglass', () => {
  for (const [word, gold, expected] of [
    ['CAT',[0],.8], ['CAT',[0,1,2],1], ['SUN',[0],.4],
    ['QUIZ',[0],4.5], ['QUIZ',[0,3],7], ['QUIZ',[0,1,2,3],7.5],
    ['ZAX',[0,1,2],2.4], ['JAZZ',[0,1,2,3],9.25],
  ]) {
    const game = create(); spell(game, word, 30000, gold);
    near(game.pendingReward, expected);
    const result = game.submit(30000);
    near(result.reward, expected);
    near(result.bonusReward, expected - game.rewardFor(word));
    assert.equal(result.points, game.pointsFor(word));
    assert.equal(game.score, game.pointsFor(word));
    assert.equal(result.hourglassOffered, false);
  }
});
test('short-word gold bonuses honor configurable rates while the round timer still caps at its maximum', () => {
  const game = create({
    bonusLetters: {timeMultiplier: 3},
    rewards: {secondsPerPoint: 2, threeLetterMultiplier: .2, threeLetterMaxSeconds: .25},
  });
  spell(game, 'CAT', 1000, [0]);
  const result = game.submit(1000);
  near(result.requestedReward, 2.65);
  near(result.bonusReward, 2.4);
  assert.equal(result.reward, 1);
  assert.equal(game.remaining, 60);
  assert.equal(result.points, 5);
});
test('clearing, misspelling and repeating gold words never grants extra time or points', () => {
  const game = create();
  spell(game, 'CAT', 0, [0]); game.undo(0);
  assert.equal(game.pendingReward, 0);
  spell(game, 'CATQ', 0, [0]);
  assert.equal(game.pendingReward, 0);
  spell(game, 'CAT'); game.submit(0);
  const before = game.remaining;
  spell(game, 'CAT', 0, [0, 1, 2]);
  assert.equal(game.submit(0).reason, 'repeat');
  assert.equal(game.remaining, before - 2);
  assert.equal(game.score, 5);
  assert.equal(game.pendingReward, 0);
});
test('restart clears effects and bonus metadata', () => {
  const game = create();
  game.activate('hourglass', 0); game.activate('smoke', 0); spell(game, 'CAT', 0, [0]);
  game.start(10000);
  assert.deepEqual(game.effects, { hourglass: 0, smoke: 0 });
  assert.deepEqual(game.currentTiles, []);
  assert.equal(game.pendingReward, 0);
  assert.equal(game.timeScale, 1);
});
test('only new words of at least five letters get a chance to drop an hourglass', () => {
  let rolls = 0;
  const game = create({}, () => { rolls++; return 0; });
  for (const word of ['CAT','CATS']) {
    spell(game, word, 1000);
    assert.equal(game.submit(1000).hourglassOffered, false);
  }
  assert.equal(rolls, 0);
  assert.equal(game.collectHourglass(1000).type, 'ignored');
  spell(game, 'CATCH', 1000);
  assert.equal(game.hourglassOffer, false);
  assert.equal(game.submit(1000).hourglassOffered, true);
  assert.equal(rolls, 1);
  assert.equal(game.effects.hourglass, 0);
  assert.equal(game.collectHourglass(2000).type, 'effect');
  assert.equal(game.hourglassOffer, false);
  assert.equal(game.effects.hourglass, 5);
  assert.equal(game.collectHourglass(2000).type, 'ignored');
  spell(game, 'CATCH', 2000);
  assert.equal(game.submit(2000).reason, 'repeat');
  spell(game, 'CATQ', 2000);
  assert.equal(game.hourglassOffer, false);
  assert.equal(rolls, 1);
});
test('hourglass chance can succeed or miss and obeys configured frequency and minimum length', () => {
  for (const [options, roll, offered] of [[{}, .2, true],[{}, .7, false],[{spawnChance:0},0,false],[{spawnChance:1},.999,true],[{enabled:false},0,false],[{minWordLength:6},0,false]]) {
    const game = create({hourglass:options}, () => roll);
    spell(game, 'CATCH');
    assert.equal(game.submit(0).hourglassOffered, offered);
    assert.equal(game.hourglassOffer, offered);
  }
});
test('falling hourglasses pause with the game, disappear when missed and clear on restart', () => {
  const game = create(); spell(game, 'CATCH'); game.submit(0);
  game.pause(3000); game.advance(100000);
  assert.equal(game.hourglassOffer, true);
  assert.equal(game.collectHourglass(100000).type, 'ignored');
  game.resume(100000);
  game.discardHourglass();
  assert.equal(game.collectHourglass(100000).type, 'ignored');
  spell(game, 'SMILE', 100000); game.submit(100000);
  assert.equal(game.hourglassOffer, true);
  game.start(200000);
  assert.equal(game.hourglassOffer, false);
});
test('hourglasses enter above the top at a random horizontal position away from other tiles', () => {
  const first = hourglassPosition(390, 47, [], () => 0);
  const second = hourglassPosition(390, 47, [], () => 1);
  assert.notEqual(first.x, second.x);
  for (const position of [first, second]) {
    assert.ok(position.x > 23.5 && position.x < 366.5);
    assert.equal(position.y, -47);
  }
  let values = [.5, 0];
  const open = hourglassPosition(390, 47, [{x:195,y:-47}], () => values.shift() ?? 0);
  assert.ok(Math.abs(open.x-195) > 47);
});
test('selecting a grenade letter immediately releases smoke and still spells and scores normally', () => {
  const game = create();
  const result = game.select('C', 20000, {grenade:true, bonus:true});
  assert.equal(result.smokeTriggered, true);
  assert.equal(game.current, 'C');
  assert.equal(game.effects.smoke, 5);
  assert.equal(game.score, 0);
  spell(game, 'ATCH', 20000);
  const word = game.submit(20000);
  assert.equal(word.points, 12);
  assert.equal(word.requestedReward, 22.5);
  assert.equal(word.reward, 20); // Limited by the remaining room in the round clock.
  assert.equal(game.effects.smoke, 5);
  game.advance(25000);
  assert.equal(game.effects.smoke, 0);
});
test('grenade letters refresh smoke, including misspellings, but cannot activate after game over', () => {
  const game = create();
  game.select('C', 0, {grenade:true});
  game.select('A', 4000, {grenade:true});
  assert.equal(game.effects.smoke, 5);
  game.select('T', 4000);
  assert.equal(game.select('Q', 4000, {grenade:true}).smokeTriggered, true);
  assert.equal(game.current, '');
  assert.equal(game.effects.smoke, 5);
  const ending = create({timer: {startSeconds:4}});
  spell(ending, 'CAT');
  assert.equal(ending.select('Q', 0, {grenade:true}).ended, true);
  assert.equal(ending.effects.smoke, 0);
  const late = create();
  assert.equal(late.select('C', 60001, {grenade:true}).type, 'ended');
  assert.equal(late.effects.smoke, 0);
});
test('smoke patches occupy separate random regions and scale with the playfield', () => {
  const settings = createConfig().smoke;
  const patches = smokePatches(390, 500, settings, () => .5);
  assert.equal(patches.length, 4);
  assert.deepEqual(patches.map(({x,y}) => [x,y]), [[.25,.25],[.75,.25],[.25,.75],[.75,.75]]);
  assert.ok(patches.every(patch => patch.radius > 0 && patch.radius < .3));
  const other = smokePatches(390, 500, settings, () => .2);
  assert.notDeepEqual(patches, other);
});
test('invalid effect settings are rejected before a round starts', () => {
  assert.throws(() => createConfig({ hourglass: { timeScale: 0 } }), /hourglass.timeScale/);
  assert.throws(() => createConfig({ hourglass: { timeScale: 1 } }), /hourglass.timeScale/);
  assert.throws(() => createConfig({ bonusLetters: { chance: 2 } }), /bonusLetters.chance/);
  assert.throws(() => createConfig({ smoke: { letterSpeedMultiplier: 1 } }), /smoke.letterSpeedMultiplier/);
  assert.throws(() => createConfig({ smoke: { letterChance: 2 } }), /smoke.letterChance/);
  assert.throws(() => createConfig({ hourglass: { spawnChance: 2 } }), /hourglass.spawnChance/);
  assert.throws(() => createConfig({ hourglass: { minWordLength: 0 } }), /hourglass.minWordLength/);
  assert.throws(() => createConfig({ hourglass: { speedMultiplier: 1 } }), /hourglass.speedMultiplier/);
});
