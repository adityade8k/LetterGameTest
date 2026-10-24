/* Opening-only word guarantees and scattered positions. Later supply is unchanged. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LetterfallOpening = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const wordSets = [
    ['GARDENS', 'GARDEN', 'READS', 'RED'],
    ['PLANETS', 'PLANET', 'PLANE', 'ANT'],
    ['PAINTER', 'RETAIN', 'TRAIN', 'ART'],
    ['LISTENS', 'LISTEN', 'LINES', 'SIT'],
    ['FLOWERS', 'FLOWER', 'LOWER', 'OWL'],
    ['COASTED', 'COATED', 'COAST', 'CAT'],
    ['STREAMS', 'MASTER', 'STEAM', 'SEA'],
    ['PLAYERS', 'PLAYER', 'RELAY', 'LAY'],
    ['TRAINED', 'RETAIN', 'TRADE', 'RED'],
    ['POINTER', 'ORIENT', 'POINT', 'TIP'],
    ['DANCERS', 'DANCER', 'DANCE', 'CAN'],
    ['BASKETS', 'BASKET', 'SKATE', 'BAT'],
  ];
  function lettersFor(dictionary, count, filler, random = Math.random) {
    const validSets = wordSets.filter(words => words.every(word => dictionary.has(word)));
    if (!validSets.length) throw new Error('The dictionary must contain at least one opening word set.');
    const words = validSets[Math.min(validSets.length - 1, Math.floor(random() * validSets.length))];
    const required = {};
    for (const word of words) {
      const counts = {};
      for (const letter of word) counts[letter] = (counts[letter] || 0) + 1;
      for (const [letter, number] of Object.entries(counts)) required[letter] = Math.max(required[letter] || 0, number);
    }
    const letters = Object.entries(required).flatMap(([letter, number]) => Array(number).fill(letter));
    while (letters.length < count) letters.push(filler[Math.min(filler.length - 1, Math.floor(random() * filler.length))]);
    for (let index = letters.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [letters[index], letters[other]] = [letters[other], letters[index]];
    }
    return { letters, words: [...words] };
  }
  function scatter(count, width, height, size, settings, random = Math.random) {
    const margin = size / Math.SQRT2 + 6;
    const left = Math.min(margin, width / 2), right = Math.max(left, width - margin);
    const top = Math.min(margin + 20, height / 2);
    const bottom = Math.max(top, Math.min(height - margin - 16, height * settings.maxHeightFraction));
    const separation = size * 1.2 + 5;
    let best = [], bestMinimum = -Infinity;
    // Random sampling avoids rows and columns; retries prevent touching tiles.
    for (let restart = 0; restart < 24; restart++) {
      const points = [];
      let minimum = Infinity;
      for (let index = 0; index < count; index++) {
        let point, clearance = -Infinity;
        for (let attempt = 0; attempt < 160; attempt++) {
          const candidate = { x: left + random() * (right - left), y: top + random() * (bottom - top) };
          const distance = points.reduce((nearest, other) => Math.min(nearest, Math.hypot(candidate.x - other.x, candidate.y - other.y)), Infinity);
          if (distance > clearance) { point = candidate; clearance = distance; }
          if (distance >= separation) break;
        }
        points.push(point);
        minimum = Math.min(minimum, clearance);
      }
      if (minimum > bestMinimum) { best = points; bestMinimum = minimum; }
      if (minimum >= separation) break;
    }
    return best;
  }
  return { wordSets, lettersFor, scatter };
});
