# Letterfall

A small falling-letter word game built with **p5.js 1.11.11**. Everything is bundled locally: no build, install, API key, or internet connection is needed to play.

## Play

Open `index.html` in a browser, or run:

```sh
npm start
```

Then open **http://localhost:5173**. If that port is already in use, run `PORT=5188 npm start` and open http://localhost:5188. The development server listens only on your own computer.

## Rules

- Start with **60 seconds**. The bar at the top drains continuously.
- Click or tap falling letters in spelling order. Each selected tile is consumed.
- Tap the **current word box** to submit an English word of **3 or more letters**.
- Each new word earns the sum of its **Scrabble letter points**. The values are printed on the tiles. Before submission, the word box shows only the letter count and a neutral submit prompt: no valid-word highlight, reward preview, or repeat warning. Validation and reward confirmation happen after submission; impossible prefixes still fail immediately.
- **Three-letter words:** 0.1 seconds per letter point, capped at **0.5 seconds of base time**, before gold bonuses. **Four-letter words:** 0.25 seconds per point, capped at **2 seconds of base time**, before gold bonuses. **Five or more letters:** **1.5 seconds per point**, plus gold contributions. For example, `CAT` = 5 points / 0.5 seconds, `QUIZ` = 22 / 2, `STARE` = 5 / 7.5, and `CATCH` = 12 / 18. Short words are poor ways to sustain the clock; longer words earn substantial time. The round clock is still capped at 60 seconds, with full points awarded even at the cap.
- An impossible prefix fails immediately, clears the current word, and costs **5 seconds**. `CATC` can become `CATCH`; `CATQ` fails in the included dictionary.
- Submitting an unfinished spelling costs **5 seconds**. Submitting a repeated word costs **2 seconds**. Both clear the current word. Repeated words never score. You can still extend a repeated word before submitting (for example, `CAT` into `CATCH`).
- **Undo / Backspace** clears the **entire current word** for a **2-second penalty**. An empty word has no penalty. Selected tiles stay consumed; earned points and previously collected words stay intact.
- Uncaught letters simply leave the screen. There is no penalty for missing a tile.
- The game ends at zero. Your high score is the **highest total letter points** in one round and is saved in the current browser on this device. The collected-word count remains separate. Point records use a new storage key so old word-count records are not treated as points.
- Pause freezes the clock and falling letters. Switching to another tab also pauses automatically; resume explicitly to continue.
- Ordinary letters are cream; bonus letters are gold. Tiles spin in both directions at independently chosen speeds. Spinning stops when the system requests reduced motion, unless that preference is disabled in the config.

## Opening board and special tiles

- Every round starts with scattered letters, with no fixed rows or spelled-out words. A random starter set guarantees that **a 7-, 6-, 5-, and 3-letter word can each be made from the opening tiles**, with the correct counts for repeated letters. The choices can share letters; consuming one word can remove another option. Extra random letters hide the set. Later letter supply uses the existing random generator unchanged.
- **Hourglass (mint pickup):** each new valid word of **five or more letters** has a **one-in-three chance** to drop an hourglass from a random position above the playfield. It falls **1.8× faster** than ordinary letters. Catch it before it leaves the bottom to slow the countdown, falling tiles, rotation, and letter supply to **40% speed for 5 active real seconds**. Short words, repeated words and failed submissions never spawn one. At most one uncollected hourglass is kept on screen; a new drop replaces it.
- **Grenade-marked letters:** about **9%** of letter tiles show a small grenade icon. Selecting one adds its letter to the current word and immediately creates **four opaque smoke clouds at random locations for 5 active real seconds**. The letter keeps its normal score and can also be gold. Marked letters fall **1.8× faster**. There is no separate grenade pickup or grenade key. Smoke also triggers if the selected letter makes a bad prefix, unless the penalty ends the game.
- The timer, current word, and collected words remain visible through smoke. You can still click through smoke if you remember a tile's position.
- **Gold letters:** about **16%** of letters are gold and show a **×2** marker. When used in a new valid word, each earns **double its own time contribution**, with **normal Scrabble points**. CATCH with a gold first C earns **12 points and 22.5 seconds** instead of 18 seconds. For short words, cap the ordinary reward first, then add each gold letter’s extra time at the word-length rate. CAT with a gold C earns **0.8 seconds** instead of 0.5; QUIZ with a gold Q earns **4.5 seconds** instead of 2. The gold bonus is never reduced by the short-word cap. Multiple gold letters add their individual bonuses; they do not multiply the entire word. The timer cap still applies.
- A second activation refreshes an effect's timer without stacking strength. Hourglass and smoke can run together. Effect timers use unscaled active time. Pause freezes effects and falling pickups; game over or restart clears them. Missed hourglasses leave the playfield without a penalty.

Mouse, touch, and keyboard controls are supported. Press a letter key to catch the lowest fully visible matching tile, **1** to collect an available hourglass, **Enter** to submit, **Backspace** to clear the whole word for 2 seconds, or **Escape** to pause/resume. Sound is optional and starts off.

## Tune the game

Edit **`config.js`**, save, and refresh the browser. The file is commented and uses seconds, pixels/second, and degrees/second. Displayed rules, penalty messages, tile values, and the timer bar read from the same settings as the game.

| Setting | Default | What it changes |
| --- | --- | --- |
| `timer.startSeconds` / `timer.maxSeconds` | 60 / 60 | Starting time and maximum time after rewards |
| `timer.lowTimeSeconds` | 15 | When the timer turns red |
| `rewards.secondsPerPoint` | 1 | Global scale applied before the word-length multiplier and caps |
| `rewards.threeLetterMultiplier` / `threeLetterMaxSeconds` | 0.1 / 0.5 | Three-letter time rate and base cap; gold bonuses are added afterward |
| `rewards.fourLetterMultiplier` / `fourLetterMaxSeconds` | 0.25 / 2 | Four-letter time rate and base cap; gold bonuses are added afterward |
| `rewards.longWordMultiplier` | 1.5 | Time multiplier for words of five or more letters |
| `bonusLetters.chance` | 0.16 | Proportion of gold letters, from 0 to 1 |
| `bonusLetters.timeMultiplier` | 2 | Time multiplier for each gold letter; score is unchanged |
| `bonusLetters.color` / `borderColor` | gold | Bonus tile appearance |
| `opening.desktopTiles` / `mobileTiles` | 14 / 10 | Opening tile count; at least 7 |
| `opening.maxHeightFraction` | 0.68 | Lower edge of opening scatter as a fraction of field height |
| `hourglass.enabled` | true | Enable word-earned hourglass drops |
| `hourglass.minWordLength` | 5 | Minimum word length eligible for a drop |
| `hourglass.spawnChance` | 1 / 3 | Chance per new qualifying word; 0 never, 1 always |
| `hourglass.speedMultiplier` | 1.8 | Falling speed relative to ordinary letters |
| `smoke.letterChance` | 0.09 | Fraction of letters carrying a grenade; 0 disables these |
| `smoke.letterSpeedMultiplier` | 1.8 | Grenade-letter speed relative to ordinary letters |
| `hourglass.durationSeconds` / `timeScale` | 5 / 0.4 | Slow-time duration and speed factor |
| `hourglass.color` | mint | Hourglass tile fill |
| `smoke.durationSeconds` / `patchCount` | 5 / 4 | Smoke duration and number of clouds |
| `smoke.radiusFraction` / `opacity` | 0.22 / 1 | Cloud radius relative to the shorter field dimension, and opacity |
| `smoke.color` | gray-green | Smoke cloud color |
| `penalties.clearWordSeconds` | 2 | Whole-word Undo penalty |
| `penalties.repeatWordSeconds` | 2 | Repeated-word penalty |
| `penalties.invalidWordSeconds` | 5 | Impossible-prefix / unfinished-word penalty |
| `falling.minPixelsPerSecond` / `maxPixelsPerSecond` | 29 / 55 | Starting and maximum falling speed |
| `falling.increasePerWord` | 1.1 | Speed increase per collected word |
| `falling.desktopSpawnSeconds` / `mobileSpawnSeconds` | 0.54 / 0.72 | Delay between new tiles; smaller means more tiles |
| `rotation.minDegreesPerSecond` / `maxDegreesPerSecond` | 8 / 32 | Minimum and maximum spin speed magnitude per tile |
| `rotation.randomDirection` | true | Mix clockwise and counterclockwise rotation |
| `rotation.maxInitialAngleDegrees` | 6 | Initial random tilt, in either direction |
| `rotation.respectReducedMotion` | true | Honor the OS reduced-motion setting |
| `tiles.color` | `#fffef7` | Ordinary letter tile fill |
| `feedback.durationSeconds` | 2.2 | Time to show a feedback message |
| `rules.minWordLength` | 3 | Minimum accepted length; bundled dictionary starts at 3 |
| `letterPoints` | English Scrabble values | Per-letter scores printed on tiles |

Rotation limits are nonnegative magnitudes. Set both to the same number for fixed-speed rotation, or both to 0 to disable spinning. Maximum values must be at least their corresponding minimum values. Setting errors identify the exact field in the browser console.

Letter values follow [Hasbro's English Scrabble point table](https://hasbro-new.custhelp.com/app/answers/detail/a_id/55/~/what-is-the-total-face-value-of-all-the-scrabble-tiles%3F). There are no board multipliers or seven-letter bonuses.

## Adjust the prototype

- `config.js`: all gameplay timing, penalty, score, rotation and tile settings.
- `engine.js`: validation, point totals, time rewards, penalties and clock.
- `motion.js`: rotation speeds, angle updates and hit detection for rotated tiles.
- `effects.js`: random hourglass and smoke placement.
- `opening.js`: starter word sets, letter guarantees and scattered positions.
- `sketch.js`: p5 drawing, falling speed, tile supply, input, feedback and saved high scores.
- `style.css` and `index.html`: responsive interface.
- `data/words.js`: **198,294** English word-game entries from Wordnik; see `data/README.md` for sources, license and rebuilding. It is broader than the previous frequency-filtered list, but is not an official Scrabble tournament dictionary.
- `vendor/p5.min.js`: locally bundled p5 engine. Its LGPL 2.1 license is included in `vendor/p5-LICENSE.txt`. [p5 reference](https://p5js.org/reference/).

## Verify

```sh
npm test
```

The 51 tests use the actual bundled dictionary and cover valid words, prefix failure, repeat penalties, extension of used words, Scrabble values, point-based rewards, the timer cap, incomplete/empty submission, pause, whole-word undo, restart, clock expiry, late input, config overrides and validation, rotation limits, rotated hit detection, precise effect duration, simultaneous effects, slow-time expiry, gold-letter accounting, length-based reward caps, probabilistic hourglass drops, grenade-letter triggers, smoke placement, opening word guarantees and scattered layouts.

Browser checks were also performed for clicking letters, keyboard selection, submitting words, pause/resume, penalties, high-score persistence, restart and responsive layouts.
