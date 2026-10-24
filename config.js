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
  "timer": {
    "startSeconds": 60,
    "maxSeconds": 60,
    "lowTimeSeconds": 15
  },
  "rules": {
    "minWordLength": 3,
    "nextLetterSeconds": 5
  },
  "combo": {
    "enabled": true,
    "wordsToStart": 3,
    "maxGapSeconds": 8,
    "extraSecondsPerWord": 0.25,
    "maxExtraSeconds": 5
  },
  "wildcards": {
    "chance": 0.05,
    "openingTiles": 1
  },
  "opening": {
    "desktopTiles": 14,
    "mobileTiles": 16,
    "maxHeightFraction": 0.88
  },
  "rewards": {
    "secondsPerPoint": 1,
    "threeLetterMultiplier": 0.1,
    "threeLetterMaxSeconds": 0.5,
    "fourLetterMultiplier": 0.25,
    "fourLetterMaxSeconds": 2,
    "longWordMultiplier": 1.5
  },
  "bonusLetters": {
    "chance": 0.16,
    "timeMultiplier": 2,
    "color": "#efcf79",
    "borderColor": "#b89a45"
  },
  "specialTiles": {
    "warmupSeconds": 20
  },
  "hourglass": {
    "enabled": true,
    "minWordLength": 5,
    "spawnChance": 0.3333333333333333,
    "speedMultiplier": 1.8,
    "durationSeconds": 5,
    "timeScale": 0.4,
    "color": "#bce2d6"
  },
  "smoke": {
    "letterChance": 0.09,
    "letterSpeedMultiplier": 1.8,
    "durationSeconds": 5,
    "patchCount": 4,
    "radiusFraction": 0.27,
    "opacity": 1,
    "fadeInSeconds": 0.8,
    "fadeOutSeconds": 1.2,
    "enterSeconds": 1.1,
    "exitSeconds": 1.2,
    "driftPixelsPerSecond": 4,
    "color": "#e891b0"
  },
  "penalties": {
    "clearWordSeconds": 2,
    "repeatWordSeconds": 2,
    "invalidWordSeconds": 5
  },
  "falling": {
    "pixelsPerSecond": 31.32,
    "letterLimit": 26,
    "visibleLetterTarget": 20,
    "maxVisibleLetters": 48,
    "replacementFadeSeconds": 0.14,
    "minPixelsPerSecond": 29,
    "maxPixelsPerSecond": 55,
    "increasePerWord": 1.1,
    "desktopSpawnSeconds": 0.54,
    "mobileSpawnSeconds": 0.72
  },
  "letterFrequency": {
    "A": 8.04,
    "B": 1.48,
    "C": 3.34,
    "D": 3.82,
    "E": 12.49,
    "F": 2.4,
    "G": 1.87,
    "H": 5.05,
    "I": 7.57,
    "J": 0.16,
    "K": 0.54,
    "L": 4.07,
    "M": 2.51,
    "N": 7.23,
    "O": 7.64,
    "P": 2.14,
    "Q": 0.12,
    "R": 6.28,
    "S": 6.51,
    "T": 9.28,
    "U": 2.73,
    "V": 1.05,
    "W": 1.68,
    "X": 0.23,
    "Y": 1.66,
    "Z": 0.09
  },
  "celebration": {
    "durationSeconds": 1.1,
    "timerRefillSeconds": 0.65,
    "scoreCountSeconds": 0.35
  },
  "wordAssist": {
    "enabled": true,
    "minPrefixLength": 4,
    "chance": 0.35,
    "lookAhead": 2,
    "nextLetterDecay": 0.4
  },
  "rotation": {
    "minDegreesPerSecond": 8,
    "maxDegreesPerSecond": 32,
    "randomDirection": true,
    "maxInitialAngleDegrees": 6,
    "respectReducedMotion": true,
    "highValueMinPoints": 4,
    "highValueSpinChance": 0.85,
    "ordinarySpinChance": 0.12,
    "secondaryAxisWeight": 0.35,
    "rockDegrees": 7,
    "restMinSeconds": 0.8,
    "restMaxSeconds": 2.4
  },
  "physics": {
    "collisionGap": 2,
    "restitution": 0.08,
    "lateralDamping": 2.6,
    "fallRecovery": 2.2,
    "solverIterations": 16,
    "wallPadding": 6
  },
  "tiles": {
    "color": "#fffef7",
    "textColor": "#354a33",
    "pointColor": "#70815a",
    "borderColor": "#cbd3bb",
    "hoverBorderColor": "#6f9143",
    "desktopSize": 58,
    "mobileSize": 47,
    "mobileBreakpoint": 500,
    "gapPixels": 23,
    "hitPaddingPixels": 3
  },
  "feedback": {
    "durationSeconds": 2.2
  },
  "letterPoints": {
    "A": 1,
    "B": 3,
    "C": 3,
    "D": 2,
    "E": 1,
    "F": 4,
    "G": 2,
    "H": 4,
    "I": 1,
    "J": 8,
    "K": 5,
    "L": 1,
    "M": 3,
    "N": 1,
    "O": 1,
    "P": 3,
    "Q": 10,
    "R": 1,
    "S": 1,
    "T": 1,
    "U": 1,
    "V": 4,
    "W": 4,
    "X": 8,
    "Y": 4,
    "Z": 10
  },
  "engagement": {
    "selectionSeconds": 0.16,
    "successSeconds": 0.28,
    "discoverySeconds": 0.6,
    "lowWarningCooldownSeconds": 12
  }
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
    number('wildcards', 'chance');
    if (config.wildcards.chance > 1) throw new Error('config.js: wildcards.chance must be at most 1.');
    if (!Number.isInteger(config.wildcards.openingTiles) || config.wildcards.openingTiles < 0 || config.wildcards.openingTiles > 3) throw new Error('config.js: wildcards.openingTiles must be an integer from 0 to 3.');
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
    for (const key of ['enterSeconds', 'exitSeconds']) number('smoke', key, 0, true);
    if (config.smoke.enterSeconds + config.smoke.exitSeconds > config.smoke.durationSeconds) throw new Error('config.js: smoke entry and exit must fit within durationSeconds.');
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
    number('falling', 'replacementFadeSeconds', 0, true);
    for (const key of ['visibleLetterTarget', 'maxVisibleLetters']) {
      if (!Number.isInteger(config.falling[key]) || config.falling[key] < 8) throw new Error(`config.js: falling.${key} must be an integer of at least 8.`);
    }
    if (config.falling.maxVisibleLetters < config.falling.visibleLetterTarget) throw new Error('config.js: falling.maxVisibleLetters must be at least visibleLetterTarget.');
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
    for (const key of Object.keys(defaults.engagement)) number('engagement', key, 0, true);
    number('rules', 'nextLetterSeconds', 0, true);
    if (typeof config.combo.enabled !== 'boolean') throw new Error('config.js: combo.enabled must be true or false.');
    if (!Number.isInteger(config.combo.wordsToStart) || config.combo.wordsToStart < 1) throw new Error('config.js: combo.wordsToStart must be a positive integer.');
    number('combo', 'maxGapSeconds', 0, true);
    number('combo', 'extraSecondsPerWord');
    number('combo', 'maxExtraSeconds');
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
