const test = require('node:test');
const assert = require('node:assert/strict');
const { WordGame } = require('../engine.js');
const dictionary = require('../data/words.js');
const create = options => { const game = new WordGame(dictionary, options); game.start(0); return game; };
const spell = (game, word, now = 0) => [...word].map(letter => game.select(letter, now)).at(-1);

test('real dictionary accepts CAT and CATCH, and a viable partial spelling', () => {
  const game = create();
  spell(game, 'CATC');
  assert.equal(game.phase, 'running');
  assert.equal(game.current, 'CATC');
  assert.equal(game.isWord, false);
  game.select('H', 0);
  assert.equal(game.submit(0).type, 'word');
  assert.deepEqual(game.words, ['CATCH']);
});
test('CATQ automatically loses five seconds and clears the spelling', () => {
  const game = create();
  const result = spell(game, 'CATQ', 4000);
  assert.equal(result.type, 'penalty');
  assert.equal(result.reason, 'spelling');
  assert.equal(game.remaining, 51);
  assert.equal(game.current, '');
  assert.equal(game.score, 0);
});
test('new words earn full letter points with length-based time and can enter overtime', () => {
  const game = create();
  spell(game, 'CAT', 10000);
  assert.equal(game.submit(10000).reward, .5);
  assert.equal(game.remaining, 50.5);
  assert.equal(game.score, 5);
  assert.equal(game.wordCount, 1);
  spell(game, 'CATCH', 10000); game.submit(10000);
  spell(game, 'DOG', 10000);
  assert.equal(game.submit(10000).reward, .5);
  assert.equal(game.remaining, 69);
  assert.equal(game.score, 22);
  assert.equal(game.wordCount, 3);
});
test('repeat submissions lose time without adding another point', () => {
  const game = create();
  spell(game, 'CAT'); game.submit(0);
  spell(game, 'CAT', 1000);
  assert.equal(game.current, 'CAT');
  assert.equal(game.isRepeat, true);
  const result = game.submit(1000);
  assert.equal(result.reason, 'repeat');
  assert.equal(result.penalty, 2);
  assert.equal(game.score, 5);
  assert.equal(game.wordCount, 1);
  assert.equal(game.remaining, 57.5);
});
test('a used word can be extended into a new word', () => {
  const game = create();
  spell(game, 'CAT'); game.submit(0);
  spell(game, 'CATCH');
  assert.equal(game.submit(0).type, 'word');
  assert.deepEqual(game.words, ['CAT', 'CATCH']);
});
test('submitting a viable but unfinished word is a penalty; an empty box is harmless', () => {
  const game = create();
  assert.equal(game.submit(0).type, 'ignored');
  spell(game, 'CA');
  assert.equal(game.submit(0).reason, 'incomplete');
  assert.equal(game.remaining, 55);
  assert.equal(game.current, '');
});
test('pause freezes the clock and prevents selecting, submitting, and undoing', () => {
  const game = create();
  spell(game, 'CAT', 1000);
  game.pause(2000);
  game.advance(100000);
  game.select('S', 100000); game.submit(100000); game.undo(100000);
  assert.equal(game.remaining, 58);
  assert.equal(game.current, 'CAT');
  assert.equal(game.score, 0);
  game.resume(100000); game.advance(100500);
  assert.equal(game.remaining, 57.5);
  assert.equal(game.current, 'CAT');
});
test('expiry is based on elapsed time and late input cannot resurrect a round', () => {
  for (const action of ['submit', 'select', 'undo', 'pause']) {
    const game = create(); spell(game, 'CA');
    const result = action === 'select' ? game.select('S', 61000) : game[action](61000);
    assert.equal(result.type, 'ended');
    assert.equal(game.phase, 'over');
    assert.equal(game.remaining, 0);
    assert.equal(game.score, 0);
  }
});
test('a penalty can end the game and remaining time never goes negative', () => {
  const game = create(); spell(game, 'CA', 58000);
  assert.equal(game.submit(58000).ended, true);
  assert.equal(game.phase, 'over');
  assert.equal(game.remaining, 0);
});
test('undo clears the whole word for two seconds; restart clears all round state', () => {
  const game = create(); spell(game, 'CAT');
  const result = game.undo(0);
  assert.equal(result.reason, 'clear');
  assert.equal(result.penalty, 2);
  assert.equal(game.current, '');
  assert.equal(game.remaining, 58);
  assert.equal(game.score, 0);
  spell(game, 'CAT'); game.submit(0);
  spell(game, 'QZ'); assert.equal(game.mistakes, 1);
  game.start(1000);
  assert.equal(game.phase, 'running');
  assert.equal(game.remaining, 60);
  assert.equal(game.current, '');
  assert.equal(game.score, 0);
  assert.equal(game.wordCount, 0);
  assert.equal(game.used.size, 0);
  assert.equal(game.mistakes, 0);
});
test('lowercase is normalized; nonletters never enter the word', () => {
  const game = create(); spell(game, 'cat');
  assert.equal(game.current, 'CAT');
  assert.equal(game.select('!', 0).type, 'ignored');
  assert.equal(game.submit(0).word, 'CAT');
});

test('Scrabble values distinguish words by letters, not only length', () => {
  const game = create();
  assert.equal(game.pointsFor('SUN'), 3);
  assert.equal(game.pointsFor('CAT'), 5);
  assert.equal(game.pointsFor('QUIZ'), 22);
  assert.equal(game.pointsFor('JAZZ'), 29);
  assert.equal(game.pointsFor('CATCH'), 12);
});
test('a higher-value valid word earns more time when there is room on the clock', () => {
  const cheap = create(); spell(cheap, 'SMILE', 30000);
  const valuable = create(); spell(valuable, 'CATCH', 30000);
  assert.equal(cheap.submit(30000).reward, 10.5);
  const result = valuable.submit(30000);
  assert.equal(result.points, 12);
  assert.equal(result.reward, 18);
  assert.equal(valuable.remaining, 48);
  assert.equal(valuable.score, 12);
});
test('empty undo is harmless and cannot repeatedly charge a player', () => {
  const game = create();
  assert.equal(game.undo(0).type, 'ignored');
  assert.equal(game.remaining, 60);
  spell(game, 'CAT'); game.undo(0); game.undo(0);
  assert.equal(game.remaining, 58);
});
test('clear and repeat penalties can end a round without reducing earned points', () => {
  for (const action of ['undo', 'submit']) {
    const game = create();
    spell(game, 'CAT'); game.submit(0);
    spell(game, 'CAT', 59000);
    const result = game[action](59000);
    assert.equal(result.ended, true);
    assert.equal(game.remaining, 0);
    assert.equal(game.phase, 'over');
    assert.equal(game.current, '');
    assert.equal(game.score, 5);
  }
});
test('custom timer, reward rate, penalties, and letter values drive the rules', () => {
  const game = create({
    timer: { startSeconds: 45, maxSeconds: 90 },
    rewards: { secondsPerPoint: .5, threeLetterMultiplier: 1, threeLetterMaxSeconds: 4 },
    penalties: { clearWordSeconds: 1.25, repeatWordSeconds: 3, invalidWordSeconds: 4 },
    letterPoints: { C: 4 },
  });
  spell(game, 'CAT');
  const result = game.submit(0);
  assert.equal(result.points, 6);
  assert.equal(result.reward, 3);
  assert.equal(game.remaining, 48);
  spell(game, 'CAT'); assert.equal(game.submit(0).penalty, 3);
  spell(game, 'CA'); assert.equal(game.undo(0).penalty, 1.25);
  assert.equal(spell(game, 'QZ').penalty, 4);
  assert.equal(game.remaining, 39.75);
  assert.equal(game.score, 6);
});
test('configurable minimum word length applies to validation', () => {
  const game = create({ rules: { minWordLength: 4 } });
  spell(game, 'CAT');
  assert.equal(game.submit(0).reason, 'incomplete');
  spell(game, 'CATCH');
  assert.equal(game.submit(0).points, 12);
});

test('three-letter words cost net time, four-letter words barely recover it, and five letters pay off', () => {
  for (const [word, elapsed, reward] of [['CAT',3000,.5],['QUIZ',2000,2],['STARE',5000,7.5]]) {
    const game = create({timer:{startSeconds:40}}); spell(game, word, elapsed);
    const result = game.submit(elapsed);
    assert.equal(result.requestedReward, reward);
    assert.equal(game.remaining, 40 - elapsed/1000 + reward);
    assert.equal(result.points, game.pointsFor(word));
  }
});
test('rare ordinary letters still obey the three- and four-letter base time caps', () => {
  for (const [word, cap] of [['ZAX',.5],['JAZZ',2]]) {
    const game = create();
    for (const letter of word) game.select(letter, 20000);
    const result = game.submit(20000);
    assert.equal(result.requestedReward, cap);
    assert.equal(result.hourglassOffered, false);
    assert.equal(game.score, game.pointsFor(word));
  }
});


test('default overtime banks rewards up to 200 percent, then drains and restarts normally',()=>{
  const game=create();
  assert.equal(game.remaining,60);assert.equal(game.config.timer.maxSeconds,120);
  for(const word of ['CATCH','SMILE','STARE','FLOWER']){spell(game,word);game.submit(0);}
  assert.equal(game.remaining,114);
  spell(game,'FLOWERS');const capped=game.submit(0);
  assert.equal(capped.reward,6);assert.equal(game.remaining,120);
  spell(game,'CAT');assert.equal(game.submit(0).reward,0);assert.equal(game.remaining,120);
  game.advance(60000);assert.equal(game.remaining,60);assert.equal(game.phase,'running');
  game.advance(120000);assert.equal(game.remaining,0);assert.equal(game.phase,'over');
  game.start(120000);assert.equal(game.remaining,60);
});
