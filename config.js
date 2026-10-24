/* Edit these values, save, then refresh the game. All times are in seconds.
 * Rotation limits are speed magnitudes in degrees/second; direction is chosen
 * separately for each tile. Set both rotation limits to 0 to stop spinning.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LetterfallConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const defaults = {
    timer: {
      startSeconds: 60,
      maxSeconds: 60,              // Time rewards cannot fill the clock past this.
      lowTimeSeconds: 15,
    },
    rules: { minWordLength: 3 },
    opening: {
      desktopTiles: 14,
      mobileTiles: 10,              // Each opening supports 7-, 6-, 5-, 3-letter words.
      maxHeightFraction: 0.68,       // Leave room below the opening letters to fall.
    },
    rewards: {
      secondsPerPoint: 1,           // Global time-reward scale; points stay unchanged.
      threeLetterMultiplier: 0.1,
      threeLetterMaxSeconds: 0.5,   // Ordinary reward cap; gold time is added afterward.
      fourLetterMultiplier: 0.25,
      fourLetterMaxSeconds: 2,      // Ordinary reward cap; gold time is added afterward.
      longWordMultiplier: 1.5,      // Five or more letters: substantial time reward.
    },
    bonusLetters: {
      chance: 0.16,                 // Fraction of letters that are gold (0 to 1).
      timeMultiplier: 2,            // Extra letter time bypasses short-word caps; score stays normal.
      color: '#efcf79',
      borderColor: '#b89a45',
    },
    hourglass: {
      enabled: true,
      minWordLength: 5,            // Only new words of at least this length qualify.
      spawnChance: 1 / 3,          // Chance per qualifying word; 0 = never, 1 = always.
      speedMultiplier: 1.8,        // Falls from the top, faster than ordinary letters.
      durationSeconds: 5,           // Active real seconds; pausing freezes effects.
      timeScale: 0.4,               // Countdown, falling, rotation and letter supply.
      color: '#bce2d6',
    },
    smoke: {
      letterChance: 0.09,          // Fraction of letters carrying a grenade icon.
      letterSpeedMultiplier: 1.8,  // Grenade-marked letters fall faster.
      durationSeconds: 5,           // Not stretched by the hourglass effect.
      patchCount: 4,
      radiusFraction: 0.22,         // Relative to the shorter playfield dimension.
      opacity: 1,
      color: '#68716b',
    },
    penalties: {
      clearWordSeconds: 2,          // Undo / Backspace clears the entire word.
      repeatWordSeconds: 2,
      invalidWordSeconds: 5,        // Impossible prefix or unfinished submission.
    },
    falling: {
      minPixelsPerSecond: 29,       // Speed at the start of a round.
      maxPixelsPerSecond: 55,
      increasePerWord: 1.1,        // Acceleration depends on word count, not points.
      desktopSpawnSeconds: 0.54,    // Smaller intervals mean more letters.
      mobileSpawnSeconds: 0.72,
    },
    rotation: {
      minDegreesPerSecond: 8,
      maxDegreesPerSecond: 32,
      randomDirection: true,       // Mix clockwise and counterclockwise tiles.
      maxInitialAngleDegrees: 6,
      respectReducedMotion: true,  // Stop spinning when the OS requests less motion.
    },
    tiles: {
      color: '#fffef7',             // Ordinary letters; gold letters are the exception.
      textColor: '#354a33',
      pointColor: '#70815a',
      borderColor: '#cbd3bb',
      hoverBorderColor: '#6f9143',
      desktopSize: 58,
      mobileSize: 47,
      mobileBreakpoint: 500,
      gapPixels: 23,
      hitPaddingPixels: 3,
    },
    feedback: { durationSeconds: 2.2 },
    // Standard English Scrabble tile values. No board multipliers or bonuses.
    letterPoints: {
      A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1,
      J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1,
      S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
    },
  };

  function createConfig(overrides = {}) {
    const config = {};
    for (const [group, values] of Object.entries(defaults)) config[group] = { ...values, ...overrides[group] };
    const number = (group, key, minimum = 0, strict = false) => {
      const value = config[group][key];
      if (!Number.isFinite(value) || (strict ? value <= minimum : value < minimum)) {
        throw new Error(`config.js: ${group}.${key} must be a finite number ${strict ? 'greater than' : 'at least'} ${minimum}.`);
      }
    };
    for (const key of ['startSeconds', 'maxSeconds']) number('timer', key, 0, true);
    number('timer', 'lowTimeSeconds');
    for (const key of Object.keys(defaults.rewards)) number('rewards', key);
    for (const key of ['desktopTiles', 'mobileTiles']) {
      if (!Number.isInteger(config.opening[key]) || config.opening[key] < 7) throw new Error(`config.js: opening.${key} must be an integer of at least 7.`);
    }
    number('opening', 'maxHeightFraction', 0, true);
    if (config.opening.maxHeightFraction > 1) throw new Error('config.js: opening.maxHeightFraction must be at most 1.');
    number('bonusLetters', 'chance');
    number('bonusLetters', 'timeMultiplier', 1);
    if (!Number.isInteger(config.hourglass.minWordLength) || config.hourglass.minWordLength < 1) throw new Error('config.js: hourglass.minWordLength must be a positive integer.');
    number('hourglass', 'spawnChance');
    if (config.hourglass.spawnChance > 1) throw new Error('config.js: hourglass.spawnChance must be between 0 and 1.');
    number('hourglass', 'speedMultiplier', 1, true);
    number('hourglass', 'durationSeconds', 0, true);
    number('hourglass', 'timeScale', 0, true);
    number('smoke', 'durationSeconds', 0, true);
    number('smoke', 'letterChance');
    number('smoke', 'letterSpeedMultiplier', 1, true);
    number('smoke', 'radiusFraction', 0, true);
    number('smoke', 'opacity', 0, true);
    if (config.bonusLetters.chance > 1) throw new Error('config.js: bonusLetters.chance must be between 0 and 1.');
    if (config.smoke.letterChance > 1) throw new Error('config.js: smoke.letterChance must be between 0 and 1.');
    if (config.hourglass.timeScale >= 1) throw new Error('config.js: hourglass.timeScale must be greater than 0 and less than 1.');
    if (config.smoke.radiusFraction > .5 || config.smoke.opacity > 1) throw new Error('config.js: smoke.radiusFraction must be at most 0.5 and smoke.opacity at most 1.');
    if (!Number.isInteger(config.smoke.patchCount) || config.smoke.patchCount < 1) throw new Error('config.js: smoke.patchCount must be a positive integer.');
    for (const key of Object.keys(defaults.penalties)) number('penalties', key);
    for (const key of ['minPixelsPerSecond', 'maxPixelsPerSecond', 'increasePerWord']) number('falling', key);
    for (const key of ['desktopSpawnSeconds', 'mobileSpawnSeconds']) number('falling', key, 0, true);
    for (const key of ['minDegreesPerSecond', 'maxDegreesPerSecond', 'maxInitialAngleDegrees']) number('rotation', key);
    for (const key of ['desktopSize', 'mobileSize', 'mobileBreakpoint']) number('tiles', key, 0, true);
    for (const key of ['gapPixels', 'hitPaddingPixels']) number('tiles', key);
    number('feedback', 'durationSeconds');
    if (!Number.isInteger(config.rules.minWordLength) || config.rules.minWordLength < 1) throw new Error('config.js: rules.minWordLength must be a positive integer.');
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      number('letterPoints', letter, 0, true);
      if (!Number.isInteger(config.letterPoints[letter])) throw new Error(`config.js: letterPoints.${letter} must be an integer.`);
    }
    for (const [group, low, high] of [['timer', 'startSeconds', 'maxSeconds'], ['falling', 'minPixelsPerSecond', 'maxPixelsPerSecond'], ['rotation', 'minDegreesPerSecond', 'maxDegreesPerSecond']]) {
      if (config[group][low] > config[group][high]) throw new Error(`config.js: ${group}.${high} must be at least ${group}.${low}.`);
    }
    return config;
  }
  return { defaults, createConfig };
});
