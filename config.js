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
      maxSeconds: 120,             // Overtime: up to 200% of the 60-second starting limit.
      lowTimeSeconds: 15,
    },
    rules: { minWordLength: 3 },
    opening: {
      desktopTiles: 14,
      mobileTiles: 16,              // Each opening supports 7-, 6-, 5-, 3-letter words.
      maxHeightFraction: 0.88,       // Scatter the larger opening throughout the playfield.
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
    specialTiles: {
      warmupSeconds: 20,           // Active-play delay; independent of the constant game pace.
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
      radiusFraction: 0.27,         // Relative to the shorter playfield dimension.
      opacity: 1,
      fadeInSeconds: 0.5,
      fadeOutSeconds: 1,
      driftPixelsPerSecond: 4,      // Slow billowing, independent of the hourglass.
      color: '#e891b0',
    },
    penalties: {
      clearWordSeconds: 2,          // Undo / Backspace clears the entire word.
      repeatWordSeconds: 2,
      invalidWordSeconds: 5,        // Impossible prefix or unfinished submission.
    },
    falling: {
      pixelsPerSecond: 31.32,      // Constant Three.js pace, unaffected by elapsed time or word count.
      letterLimit: 26,             // Incoming/outgoing letters included; hourglass pickups excluded.
      // Legacy p5 speed curve below; Three.js uses pixelsPerSecond above.
      minPixelsPerSecond: 31.32,
      maxPixelsPerSecond: 59.4,
      increasePerWord: 1.188,      // Acceleration depends on word count, not points.
      desktopSpawnSeconds: 0.45,    // 20% more spawn opportunities per second.
      mobileSpawnSeconds: 0.35,    // More letter choices, with collision-safe top-entry spacing.
    },
    letterFrequency: {
      // English text percentages: Peter Norvig, Google Books corpus analysis.
      // https://www.norvig.com/mayzner.html — relative weights, not scores.
      A:8.04, B:1.48, C:3.34, D:3.82, E:12.49, F:2.40, G:1.87,
      H:5.05, I:7.57, J:0.16, K:0.54, L:4.07, M:2.51, N:7.23,
      O:7.64, P:2.14, Q:0.12, R:6.28, S:6.51, T:9.28, U:2.73,
      V:1.05, W:1.68, X:0.23, Y:1.66, Z:0.09,
    },
    celebration: {
      durationSeconds: 1.1,       // Small reward labels fade beside the score and clock.
      timerRefillSeconds: 0.65,   // Visual refill only; earned time applies immediately.
      scoreCountSeconds: 0.35,
    },
    wordAssist: {
      enabled: true,              // Experimental help for extending the selected word.
      minPrefixLength: 4,         // Starts immediately after the fourth selected letter.
      chance: 0.35,               // Chance a spawn uses a useful continuation; the rest stay random.
      lookAhead: 2,               // Favor the next couple of letters in matching longer words.
      nextLetterDecay: 0.4,       // Second letter has 40% of the immediate next letter's weight.
    },
    rotation: {
      minDegreesPerSecond: 5.6,     // 30% slower; combined speed across the axes.
      maxDegreesPerSecond: 22.4,
      randomDirection: true,       // Mix clockwise and counterclockwise tiles.
      maxInitialAngleDegrees: 6,
      respectReducedMotion: true,  // Stop spinning when the OS requests less motion.
      highValueMinPoints: 4,       // High-value turns emphasize Y; others emphasize Z.
      highValueSpinChance: 0.85,
      ordinarySpinChance: 0.12,
      secondaryAxisWeight: 0.35,   // Add X/Y/Z tumble; 0 restores single-axis turns.
      rockDegrees: 7,              // Non-spinning tiles gently rock within this angle.
      restMinSeconds: 0.8,         // Pauses between slow turns (Y for high-value tiles).
      restMaxSeconds: 2.4,
    },
    physics: {
      collisionGap: 2,             // Extra separation around the rotated tile faces.
      restitution: 0.08,           // Very little bounce; contacts mostly nudge.
      lateralDamping: 2.6,
      fallRecovery: 2.2,           // How gently a nudged tile resumes its falling speed.
      solverIterations: 16,
      wallPadding: 6,
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
    number('specialTiles', 'warmupSeconds');
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
    for (const key of ['fadeInSeconds', 'fadeOutSeconds', 'driftPixelsPerSecond']) number('smoke', key);
    if (config.smoke.fadeInSeconds + config.smoke.fadeOutSeconds > config.smoke.durationSeconds) throw new Error('config.js: smoke fades must fit within durationSeconds.');
    if (config.bonusLetters.chance > 1) throw new Error('config.js: bonusLetters.chance must be between 0 and 1.');
    if (config.smoke.letterChance > 1) throw new Error('config.js: smoke.letterChance must be between 0 and 1.');
    if (config.hourglass.timeScale >= 1) throw new Error('config.js: hourglass.timeScale must be greater than 0 and less than 1.');
    if (config.smoke.radiusFraction > .5 || config.smoke.opacity > 1) throw new Error('config.js: smoke.radiusFraction must be at most 0.5 and smoke.opacity at most 1.');
    if (!Number.isInteger(config.smoke.patchCount) || config.smoke.patchCount < 1) throw new Error('config.js: smoke.patchCount must be a positive integer.');
    for (const key of Object.keys(defaults.penalties)) number('penalties', key);
    for (const key of ['minPixelsPerSecond', 'maxPixelsPerSecond', 'increasePerWord']) number('falling', key);
    for (const key of ['desktopSpawnSeconds', 'mobileSpawnSeconds']) number('falling', key, 0, true);
    number('falling', 'pixelsPerSecond', 0, true);
    if (!Number.isInteger(config.falling.letterLimit) || config.falling.letterLimit < config.opening.mobileTiles) throw new Error('config.js: falling.letterLimit must be an integer at least opening.mobileTiles.');
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') number('letterFrequency', letter);
    if (!Object.values(config.letterFrequency).some(weight => weight > 0)) throw new Error('config.js: letterFrequency needs at least one positive weight.');
    for (const key of ['durationSeconds', 'timerRefillSeconds', 'scoreCountSeconds']) number('celebration', key, 0, true);
    if (typeof config.wordAssist.enabled !== 'boolean') throw new Error('config.js: wordAssist.enabled must be true or false.');
    for (const key of ['minPrefixLength', 'lookAhead']) {
      if (!Number.isInteger(config.wordAssist[key]) || config.wordAssist[key] < 1) throw new Error(`config.js: wordAssist.${key} must be a positive integer.`);
    }
    for (const key of ['chance', 'nextLetterDecay']) {
      number('wordAssist', key);
      if (config.wordAssist[key] > 1) throw new Error(`config.js: wordAssist.${key} must be between 0 and 1.`);
    }
    for (const key of ['minDegreesPerSecond', 'maxDegreesPerSecond', 'maxInitialAngleDegrees']) number('rotation', key);
    for (const key of ['highValueMinPoints', 'rockDegrees', 'restMinSeconds', 'restMaxSeconds', 'secondaryAxisWeight']) number('rotation', key);
    if (config.rotation.secondaryAxisWeight > 1) throw new Error('config.js: rotation.secondaryAxisWeight must be between 0 and 1.');
    for (const key of ['highValueSpinChance', 'ordinarySpinChance']) {
      number('rotation', key);
      if (config.rotation[key] > 1) throw new Error(`config.js: rotation.${key} must be between 0 and 1.`);
    }
    if (config.rotation.restMaxSeconds < config.rotation.restMinSeconds) throw new Error('config.js: rotation.restMaxSeconds must be at least restMinSeconds.');
    for (const key of Object.keys(defaults.physics)) number('physics', key);
    if (config.physics.restitution > 1) throw new Error('config.js: physics.restitution must be at most 1.');
    if (!Number.isInteger(config.physics.solverIterations) || config.physics.solverIterations < 1 || config.physics.solverIterations > 64) throw new Error('config.js: physics.solverIterations must be an integer from 1 to 64.');
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
