// Optional prefix-based help. It only changes newly spawned letters; the
// original random generator remains responsible for every unassisted spawn.
export class PrefixLetterSupply {
  constructor(dictionary, settings, random = Math.random) {
    this.words = [...new Set([...dictionary].map(word => word.toUpperCase()).filter(word => /^[A-Z]+$/.test(word)))].sort();
    this.settings = settings;
    this.random = random;
    this.cachedPrefix = null;
    this.matches = [];
  }

  matchingWords(prefix) {
    if (prefix === this.cachedPrefix) return this.matches;
    // Jump directly to the prefix's range in the real dictionary. Avoid
    // rescanning 198,000 words on each spawn or storing a second full trie.
    let low = 0, high = this.words.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.words[middle] < prefix) low = middle + 1;
      else high = middle;
    }
    const matches = [];
    for (let index = low; index < this.words.length && this.words[index].startsWith(prefix); index++) {
      if (this.words[index].length > prefix.length) matches.push(this.words[index]);
    }
    this.cachedPrefix = prefix;
    this.matches = matches;
    return matches;
  }

  candidates(current, used = new Set()) {
    const prefix = current.toUpperCase(), settings = this.settings;
    if (!settings.enabled || settings.chance === 0 || prefix.length < settings.minPrefixLength) return [];
    const weights = new Map();
    for (const word of this.matchingWords(prefix)) {
      // Already collected words cannot score again, but unused extensions can.
      if (used.has(word)) continue;
      for (let offset = 0; offset < settings.lookAhead && prefix.length + offset < word.length; offset++) {
        const letter = word[prefix.length + offset];
        const weight = settings.nextLetterDecay ** offset;
        if (weight > 0) weights.set(letter, (weights.get(letter) || 0) + weight);
      }
    }
    return [...weights].map(([letter, weight]) => ({ letter, weight }));
  }

  next(current, used, randomLetter) {
    const options = this.candidates(current, used);
    // Do not consume any assist randomness when help is inactive. In particular,
    // the first three selections retain the original random supply unchanged.
    if (!options.length || this.random() >= this.settings.chance) return randomLetter();
    let draw = this.random() * options.reduce((sum, option) => sum + option.weight, 0);
    for (const option of options) {
      draw -= option.weight;
      if (draw < 0) return option.letter;
    }
    return options.at(-1).letter;
  }
}
