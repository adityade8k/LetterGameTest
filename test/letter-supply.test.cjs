const test = require('node:test');
const assert = require('node:assert/strict');
const { createConfig } = require('../config.js');
const { WordGame } = require('../engine.js');
const supplyModule = import('../three/letter-supply.mjs');
const words = ['CART', 'CARTS', 'CARTON', 'CARTER', 'CARP', 'SCARTS', 'CAT'];
const rng = (seed = 19) => () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
const weights = options => Object.fromEntries(options.map(option => [option.letter, option.weight]));
const settings = overrides => createConfig({ wordAssist: overrides }).wordAssist;

test('before four selected letters the original random generator is untouched', async () => {
  const { PrefixLetterSupply } = await supplyModule;
  const supply = new PrefixLetterSupply(words, settings(), () => { throw new Error('Assist randomness should not run'); });
  let calls = 0;
  for (const prefix of ['', 'C', 'CA', 'CAR']) {
    assert.equal(supply.next(prefix, new Set(), () => { calls++; return 'Z'; }), 'Z');
    assert.deepEqual(supply.candidates(prefix), []);
  }
  assert.equal(calls, 4);
});

test('the fourth letter favors the next two positions of strictly longer prefix matches', async () => {
  const { PrefixLetterSupply } = await supplyModule;
  const supply = new PrefixLetterSupply(words, settings());
  assert.deepEqual(weights(supply.candidates('cart')), { E: 1, R: .4, O: 1, N: .4, S: 1 });
  // No letters from CARP or SCARTS, and CART itself contributes nothing.
  assert.deepEqual(weights(supply.candidates('CARTO')), { N: 1 });
  assert.deepEqual(supply.candidates('CARTON'), []);
  assert.deepEqual(supply.candidates('ZZZZ'), []);
});

test('collected words are excluded immediately, including when the prefix is cached', async () => {
  const { PrefixLetterSupply } = await supplyModule;
  const supply = new PrefixLetterSupply(words, settings()), used = new Set(['CART']);
  assert.ok(supply.candidates('CART', used).some(option => option.letter === 'O'));
  used.add('CARTON');
  assert.deepEqual(weights(supply.candidates('CART', used)), { E: 1, R: .4, S: 1 });
  used.add('CARTER'); used.add('CARTS');
  assert.equal(supply.next('CART', used, () => 'Z'), 'Z');
  assert.deepEqual(supply.candidates('CART', new Set()), supply.candidates('CART'));
});

test('help mixes with random spawns at the configured probability instead of forcing completion', async () => {
  const { PrefixLetterSupply } = await supplyModule;
  const supply = new PrefixLetterSupply(['CARTS', 'CARTON'], settings(), rng());
  const counts = { Z: 0, S: 0, O: 0, N: 0 };
  for (let i = 0; i < 20000; i++) counts[supply.next('CART', new Set(), () => 'Z')]++;
  const assisted = 1 - counts.Z / 20000;
  assert.ok(assisted > .33 && assisted < .37, `Assisted fraction was ${assisted}`);
  assert.ok(counts.S > counts.N * 2 && counts.O > counts.N * 2);
  assert.ok(counts.N > 0);
});

test('disable, probability, prefix threshold and lookahead controls work independently', async () => {
  const { PrefixLetterSupply } = await supplyModule;
  for (const overrides of [{ enabled: false }, { chance: 0 }, { minPrefixLength: 5 }]) {
    const supply = new PrefixLetterSupply(words, settings(overrides), () => { throw new Error('Help should be inactive'); });
    assert.equal(supply.next('CART', new Set(), () => 'Z'), 'Z');
  }
  const immediate = new PrefixLetterSupply(words, settings({ chance: 1, lookAhead: 1 }), () => 0);
  assert.deepEqual(weights(immediate.candidates('CART')), { E: 1, O: 1, S: 1 });
  assert.equal(immediate.next('CART', new Set(), () => { throw new Error('Expected a helpful letter'); }), 'E');
  const noSecond = new PrefixLetterSupply(words, settings({ nextLetterDecay: 0 }));
  assert.deepEqual(noSecond.candidates('CART'), immediate.candidates('CART'));
});

test('word submission, undo, misspelling and restart all restore normal supply', async () => {
  const { PrefixLetterSupply } = await supplyModule;
  const game = new WordGame(words, { wordAssist: { chance: 1 } });
  const supply = new PrefixLetterSupply(game.dictionary, game.config.wordAssist, () => 0);
  const next = () => supply.next(game.current, game.used, () => 'Z');
  const spell = word => { for (const letter of word) game.select(letter, 0); };
  game.start(0); spell('CART'); assert.notEqual(next(), 'Z');
  game.submit(0); assert.equal(next(), 'Z');
  spell('CART'); assert.notEqual(next(), 'Z'); // A used CART can still become CARTER.
  game.undo(0); assert.equal(next(), 'Z');
  spell('CART'); game.select('X', 0); assert.equal(next(), 'Z');
  spell('CART'); game.start(0); assert.equal(next(), 'Z');
});

test('the real dictionary supplies only continuations of the whole current spelling', async () => {
  const { PrefixLetterSupply } = await supplyModule;
  const dictionary = require('../data/words.js');
  const supply = new PrefixLetterSupply(dictionary, settings());
  for (const prefix of ['TRAI', 'TRAIN', 'CLOC', 'QUIZ']) {
    const expected = new Set();
    for (const raw of dictionary) {
      const word = raw.toUpperCase();
      if (/^[A-Z]+$/.test(word) && word.startsWith(prefix) && word.length > prefix.length) {
        for (const letter of word.slice(prefix.length, prefix.length + 2)) expected.add(letter);
      }
    }
    assert.ok(expected.size > 0);
    assert.deepEqual(new Set(supply.candidates(prefix).map(option => option.letter)), expected);
  }
});

test('invalid assistance settings are rejected before a round starts', () => {
  for (const wordAssist of [{ enabled: 'yes' }, { chance: -1 }, { chance: 1.1 }, { minPrefixLength: 0 }, { lookAhead: 1.5 }, { nextLetterDecay: 1.1 }]) {
    assert.throws(() => createConfig({ wordAssist }), /wordAssist/);
  }
});
