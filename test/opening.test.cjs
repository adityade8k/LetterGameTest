const test = require('node:test');
const assert = require('node:assert/strict');
const { lettersFor, scatter, wordSets } = require('../opening.js');
const { createConfig } = require('../config.js');
const dictionary = new Set(require('../data/words.js').map(word => word.toUpperCase()));
const seeded = initial => { let state = initial; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }; };
const canMake = (word, letters) => { const left = [...letters]; return [...word].every(letter => { const index = left.indexOf(letter); if (index < 0) return false; left.splice(index, 1); return true; }); };

test('every opening offers real 7-, 6-, 5- and 3-letter words, including repeated letters', () => {
  for (const words of wordSets) {
    assert.deepEqual(words.map(word => word.length), [7, 6, 5, 3]);
    assert.ok(words.every(word => dictionary.has(word)));
  }
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const opening = lettersFor(dictionary, 10, 'AEIOURSTLN', seeded(seed * 123));
    assert.equal(opening.letters.length, 10);
    assert.ok(opening.words.every(word => canMake(word, opening.letters)));
    seen.add(opening.words[0]);
  }
  assert.equal(seen.size, wordSets.length);
});
test('opening letters are shuffled and random fillers do not remove guaranteed letters', () => {
  const first = lettersFor(dictionary, 14, 'AEIOURSTLN', seeded(321));
  const second = lettersFor(dictionary, 14, 'AEIOURSTLN', seeded(654));
  assert.notDeepEqual(first.letters, second.letters);
  assert.ok(first.words.every(word => canMake(word, first.letters)));
  assert.ok(second.words.every(word => canMake(word, second.letters)));
});
test('opening positions are scattered, visible and do not touch on desktop and phones', () => {
  const settings = createConfig().opening;
  for (const [width,height,size,count] of [[660,430,58,14],[352,475,47,10],[282,375,47,10]]) {
    for (let seed = 1; seed <= 60; seed++) {
      const positions = scatter(count, width, height, size, settings, seeded(seed));
      assert.equal(positions.length, count);
      for (let i = 0; i < count; i++) {
        const point = positions[i];
        assert.ok(point.x >= size/2 && point.x <= width-size/2);
        assert.ok(point.y >= size/2 && point.y <= height-size/2);
        for (let j = 0; j < i; j++) assert.ok(Math.hypot(point.x-positions[j].x,point.y-positions[j].y) >= size * 1.12, `Tiles touch at ${width}px, seed ${seed}`);
      }
      assert.ok(new Set(positions.map(point => Math.round(point.y))).size > count * .7);
    }
  }
});
test('Wordnik includes broader vocabulary while rejecting impossible prefixes', () => {
  assert.equal(dictionary.size, 198294);
  for (const word of ['CATGUT','COLOUR','COLOR','QUIZZICAL','XYLOPHONE','GARDENS']) assert.ok(dictionary.has(word), word);
  assert.ok(![...dictionary].some(word => word.startsWith('CATQ')));
});
