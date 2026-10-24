# CLTTR

A mobile word game rendered entirely in **Three.js 0.186.1**. Falling tiles, raised letters, icons, the timer, scores, buttons, the word tray, word collection, feedback, and every menu are Three.js meshes. One WebGL canvas draws the game. There are no HTML overlays, DOM buttons, HTML-to-texture captures, or CSS2D/CSS3D renderers.

## Play locally

```sh
npm start
```

Open **http://localhost:5173**. To use the current preview port, run `PORT=5188 npm start` and open **http://localhost:5188**. Use the local server, rather than opening the HTML file directly: ES modules and the bundled font load over HTTP. The server listens only on this computer. No install, API key, or internet connection is needed to play; Three.js, fonts, and the dictionary are bundled locally.

The game uses a fixed **portrait 9:16 frame**, sized to fit the available phone screen and centered on desktop. The same 360 × 640 logical world, tile sizes, and choice density apply on every display. Device safe areas remain outside the frame. The falling field fills the whole canvas behind the Three.js interface; the header stays at the top and the word tray at the bottom. Tiles covered by panels cannot intercept taps or keyboard selections.

## Controls

- Tap a tile to pick its letter. Tap the word tray to submit. Every visible control is a raycast target in the Three.js scene.
- Tap Undo to clear the whole word for a two-second penalty.
- Tap Pause to stop the clock, effects, and letters. Switching away from the page also pauses automatically.
- Tap the collected-word strip to open its paginated collection. The round pauses while this panel is open and resumes when it closes.
- Letter keys pick the lowest fully visible matching letter. **? / \*** picks a visible blank. **Enter** submits, **Backspace** clears, **1** collects a visible hourglass, and **Escape** pauses/resumes or closes help/collection.
- **Tab / Shift+Tab** cycle the available Three.js controls. A small gold marker shows focus. **Enter / Space** activate the focused control. Enter also starts the ready screen. With no control focused, Space pauses a running round.
- Sound starts off. The sound control is in the main menu, beside How to play. It is absent during a round.

The single canvas has a descriptive accessibility label reflecting the current word, visible letters, effects, menus, and keyboard focus. There are no invisible HTML buttons underlying the meshes.

## Rules

- Start with **60 seconds** and bank earned time up to **120 seconds (200%)**. Above 60 seconds, the timer shows an overtime percentage and a gold second fill. The clock drains normally back through the standard fill.
- Make new English words of **3 or more letters**. Each word earns the sum of its standard English **Scrabble letter points**; these values appear on the tiles.
- **Blank wildcards** represent any one letter and earn **zero points**. There is no letter picker: a selected blank appears as `?`, and submission resolves the whole pattern to an unused dictionary word. Blanks work at any position, and several can occur in one word. All interpretations remain available as more letters are added. If several unused words match, common English letters at the blank positions are favored; the actual word is added to the collection. If every complete match was already used, the normal repeat penalty applies. An impossible pattern still fails immediately. Time rewards and collection scores use only the points actually earned, including any normal gold-letter time bonus.
- **Three-letter words:** 0.1 seconds per point, capped at **0.5 seconds** of ordinary time. **Four letters:** 0.25 seconds per point, capped at **2 seconds**. **Five or more letters:** **1.5 seconds per point**. Gold time is added after the short-word cap.
- A repeated submission costs **2 seconds**. An impossible prefix or an incomplete submitted word costs **5 seconds**. Both clear the current word without reducing earned points. A used word may still be extended before submitting: CAT can become CATCH.
- Undo clears the whole word for **2 seconds**. Empty undo does nothing. Selected tiles stay consumed.
- After each letter (including a blank), the letter countdown starts at **2 active seconds**. On expiry, a **valid unused word automatically submits** with its normal points and time reward. An unfinished word is discarded for **2 seconds**; a repeated complete word gets the normal repeat penalty. Each outcome happens once. You can still tap to submit sooner or pick another letter to reset the countdown. A thin meter shows the remaining window. Pauses freeze it; hourglasses do not extend it. Tune `rules.nextLetterSeconds` to change the base window.
- No validity highlight, reward preview, or repeat warning appears before submission. The tray shows the letters, a neutral automatic-submission prompt, and the countdown meter. Impossible prefixes still fail immediately.
- Missing a falling tile carries no penalty. At zero, the round ends. The high score is the highest total letter points, saved in the browser; the collected-word count remains separate.

## Quick-word combo

Complete consecutive words **less than 8 active seconds apart** to build a chain. Manual and automatic submissions both count. The third word unlocks **2.25 seconds per letter**; the fourth gives **2.5**, the fifth **2.75**, and the sixth and later words cap at **3 seconds**. Points and round-clock rewards stay unchanged. A small Three.js label in the word tray shows chain progress and the boosted window, without large popups or validity hints.

An invalid timeout, misspelling, repeat, unfinished submission, or manual discard resets the chain to zero and the next letter window to the base **2 seconds**. Going **8 active seconds without completing a new word** also resets it. Picking letters alone does not keep the chain alive. When a chain expires during a word, the current letter retains the countdown it was granted; the next pick uses the base window. Pausing freezes both countdowns, hourglasses do not stretch them, and starting a fresh round clears the chain.

Tune `combo` in `config.js`: `enabled`, `wordsToStart` (3), `maxGapSeconds` (8), `extraSecondsPerWord` (0.25), and `maxExtraSeconds` (1). The cap adds to `rules.nextLetterSeconds`, so changing the base window keeps the maximum boost bounded.

## Opening and special tiles

Each round starts with randomly scattered letters supporting a **7-, 6-, 5-, and 3-letter word**, including the needed repeated letters. These choices can share tiles. The opening scales with available space, starting from a target of **20 exposed choices**. Guaranteed word letters are placed first, followed by **one blank** and filler drawn from English text frequencies. Later spawns have a **5% blank chance**; ordinary letters use the same frequency distribution, with optional continuation help beginning at four selections. Blanks are plain cream tiles with a zero in the point corner, on both faces; they do not carry gold multipliers or grenades.

- **Gold:** about 16% of letters carry a ×2 time multiplier. Each adds an extra contribution for that letter after the normal reward cap, with unchanged points. CAT with a gold C earns **0.8 seconds** rather than 0.5. QUIZ with a gold Q earns **4.5 seconds** rather than 2. CATCH with a gold C earns **22.5 seconds** rather than 18. Multiple gold letters add their contributions; they do not multiply the whole word.
- **Special-tile warm-up:** the first **20 active seconds** have no grenade-marked letters or hourglass drops. Pausing does not advance this warm-up; restarting resets it. Gold multiplier tiles are available from the opening. After warm-up, the usual chances apply to newly spawned grenade letters and qualifying word submissions.
- **Hourglass:** after warm-up, each new word of at least five letters has a one-in-three chance to drop one from a random position above the field. It falls at 1.8× ordinary speed. Catch it to slow the countdown, falling letters, rotation, and supply to 40% speed for **five active real seconds**. At most one uncollected hourglass is retained. A new drop replaces it; a missed drop disappears without penalty.
- **Grenade-marked letters:** about 9% carry a small grenade and fall at 1.8× speed. Using one includes its letter normally and releases **five seconds of pink smoke** in four freshly scattered, independently shaped clouds. Clouds move in from both sides over 1.1 seconds while fading in over 0.8 seconds, hold opaque centers with gentle drift, then move and fade back out toward the sides over the final 1.2 seconds. Centers, entry/exit heights, shapes, and timing vary on every activation. A marked letter may also be gold. Smoke also triggers on a bad prefix unless that penalty ends the round.
- Smoke obscures the falling field while the timer and word tray remain readable. Remembered tiles remain clickable through smoke.
- Recollecting an effect refreshes its duration without stacking strength. Both effects can run together. Their durations use unscaled active time. Pause freezes them; game over and restart clear them.

## Constant pace and fuller letter supply

The Three.js game keeps a **constant 31.32 logical pixels/second** falling pace and the existing rotation behavior. Neither elapsed time nor collected-word count makes it harder. The former difficulty wave is removed. The hourglass still temporarily slows motion and the clock as before.

Replenishment stays **one pick behind**: the first selection leaves a gap, and the second and later selections can each release one replacement **above the top edge**. Replacements fall into view at the normal configured speed. Nothing materializes in the middle of the play area or at a cleared tile position. If the top is crowded or the population budget is full, the replacement stays queued until there is safe entry space. Only the initial board is scattered within the field. At round start, additional staggered letters are already traveling behind the header, connecting that opening board to the incoming stream without an empty vertical stretch.

Every **0.35 seconds**, supply attempts one collision-safe top entry, also servicing any queued replacement. It does not bundle several maintenance letters into rows. The opening targets **20 exposed letters**; the later visible count varies as tiles are selected, fall behind the panels, or enter from above. Replacements use the current spelling's letter probabilities. The population budget covers the whole travel distance, including tiles behind both panels (55 letters for the default frame), and excludes hourglasses. This keeps arrivals flowing while older tiles leave. Top-entry clearance and the contact solver prevent overlaps.

Unassisted spawns use normalized English text frequencies from [Peter Norvig’s Google Books analysis](https://www.norvig.com/mayzner.html): common letters such as E, T, A, O, I, and N appear more often; rare letters remain possible. This replaces both the short-word bag and the old letter string. There is no forced word completion. `letterFrequency` in `config.js` contains all 26 editable weights. They affect supply only, not Scrabble scores.

Before the fourth selection, all new letters use these frequencies. At four letters and beyond, the existing 35% continuation-help chance takes precedence when a longer unused matching word exists; all other draws still use English frequencies. Gold is available immediately. Grenades and earned hourglasses retain their **20-active-second warm-up**, independent of pace.

## Word celebrations

Submitting a new valid word shows small **+points** and **+seconds** labels inside the header, beside the score and clock. They rise only two logical pixels and fade out after 1.1 seconds. There are no large cards, word banners, confetti, cross-screen flights, or bouncing counters. The score counts up smoothly, and the timer refills with a subdued highlight, including its gold overtime layer. The playfield stays clear.

These are Three.js meshes with cached geometry, not HTML overlays. The old success-status sentence above the word tray is gone. Penalty and effect explanations remain. Rewards apply to the real game immediately; only the displayed meters animate. Time labels show the amount actually credited, so reaching the 120-second cap cannot imply extra banked time. A full clock shows **MAX** instead of a false gain.

Animations freeze while paused and clear on restart/game over. Consecutive rewards update the same label positions instead of stacking; all points and time are still credited. Reduced-motion mode uses stationary fading labels. `celebration` in `config.js` controls label duration, score-count time, and refill time.

## Experimental word extension help

Once **four letters are selected**, newly spawned letters have a **35% chance** to come from unused longer dictionary words beginning with the **entire current spelling**. The next letter receives full weight; the letter after it receives 40% weight. Each matching word contributes, so continuations shared by several words appear more often. The other 65% of spawns use the English-frequency sampler.

The candidates update as more letters are selected, including every viable interpretation of a wildcard. Help stops when the word is submitted, cleared, misspelled, or has no unused longer continuation. It depends on selected letters, not collected-word count. Existing falling tiles do not change, and no word-validity hint is shown. The opening's existing word guarantees are preserved.

Tune `wordAssist` in `config.js`: `enabled` toggles the experiment, `chance` controls its strength, `minPrefixLength` sets the trigger, `lookAhead` sets how many following positions contribute, and `nextLetterDecay` controls the weight of later positions. Set `enabled: false` or `chance: 0` to restore the original supply throughout the round.

## Tune timing and motion

Edit **`config.js`**, save, and refresh. Its comments explain the settings, units, and limits. No build is required.

| Group | Controls |
| --- | --- |
| `timer` | Starting, maximum, and low-time seconds |
| `rules` | Minimum word length and `nextLetterSeconds` base countdown window |
| `combo` | Enable, qualifying word count, maximum gap, extra seconds per word, and cap |
| `rewards` | Seconds per point, word-length rates, short-word base caps |
| `penalties` | Clear, repeat, and misspelling penalties |
| `opening.mobileTiles` | Minimum opening population; the full-field target can increase it |
| `wildcards` | Blank probability and guaranteed opening blank count |
| `falling` | Constant speed, minimum top-drop budget, visible-choice target and maximum, replacement fade above the screen, spawn interval; legacy p5 curve settings remain separate |
| `letterFrequency` | Relative English letter frequencies for ordinary spawns and opening filler |
| `celebration` | Reward-label duration, timer refill and score-count duration |
| `wordAssist` | Extension-help toggle, trigger length, probability, lookahead, later-letter weight |
| `rotation` | Speed limits, high-value point threshold, separate turn probabilities, multi-axis strength, gentle rocking, pauses between turns, reduced-motion preference |
| `physics` | Contact gap, soft restitution, lateral damping, fall-speed recovery, solver passes, wall padding |
| `specialTiles.warmupSeconds` | Active-play delay before grenade letters and earned hourglasses unlock |
| `bonusLetters` | Gold chance and time multiplier |
| `hourglass` | Minimum word length, drop chance, falling multiplier, duration, slow-time scale |
| `smoke` | Grenade-letter chance, falling multiplier, duration, patch count, radius, opacity, fade-in/out and side-entry/exit timing, drift speed |
| `tiles.mobileSize`, `tiles.gapPixels` | Tile size and supply spacing |
| `letterPoints` | Per-letter score values |
| `feedback.durationSeconds` | Feedback visibility duration |

Three.js falling speed stays at `falling.pixelsPerSecond` (31.32 by default), regardless of how long the round lasts or how many words are collected. Letter supply uses a 0.35-second opportunity interval, constrained by the population cap and available top-entry space. Countdown and effect durations keep their existing time scale. Rotation limits remain 5.6–22.4 degrees per second. Set both rotation limits to zero to stop rotation, or to the same value for a fixed turning speed. The legacy min/max/increase-per-word fields only affect the archived p5 prototype.

By default, 85% of letters worth at least four points make intermittent 150–240° turns that emphasize Y and also tilt on X and Z. 12% of other letters tumble with Z dominant. Each tile gets its own axis mix; the combined rotation speed stays within its speed limit. `rotation.secondaryAxisWeight` controls the secondary turns (0 restores single-axis rotation). Both faces carry correctly oriented letters, scores, and special markings. High-value tiles use the upper half of the configured speed range. Other tiles gently rock; turns pause for 0.8–2.4 seconds. Minimum and maximum values are validated. Three.js motion uses logical pixels per second, so changing the viewport does not change difficulty.

## Tile contact

The Three.js version uses projected oriented-box collision detection with a two-unit safety gap. The bounds include tile thickness and expand or contract with its X/Y tilt. Contacts separate the rotated faces, transfer a small impulse, and damp sideways motion. Tiles recover their normal falling speed gently; restitution is only 0.08. The simulation substeps at 120 Hz and solves contacts iteratively, so fast grenade/hourglass tiles and turning letters cannot pass through one another. The field sides also keep tiles in bounds. Pause freezes physics, and the hourglass slows the same simulation. Hover lifts a tile without enlarging its collision shape.

## Tune the art

**`three/design.js`** controls the two-color material pairs, light direction, cel threshold, tile extrusion/bevel, raised-letter depth, camera layout, and maximum pixel ratio. Tiles have wider, three-segment bevels and a subtle satin highlight controlled by `tile.specularStrength` and `tile.shininess`; raised lettering stays in the two-tone diffuse material. The background now moves from light magenta through pink and peach into lemon yellow. `DESIGN.atmosphere.grainAmount` controls its subtle, static grain; `fogAmount` controls the mist. The older flat color/border settings in `config.js` apply only to the archived p5 version.

- `three/materials.js`: hard two-tone cel shaders for objects; separate soft gradient, fog, and smoke shaders. No outlines; a small optional specular highlight is used on tile bodies.
- `three/layout.mjs`: world bounds and panel placement within the portrait canvas, exposed-choice target.
- `three/spawn.mjs`: collision-safe top entry, one-pick-delayed top-entry replenishment, and scattered opening placement.
- `three/reward-motion.mjs`: animated score/time presentation without delaying actual rewards.
- `three/letter-supply.mjs`: English-frequency sampling, cached dictionary-prefix lookup, and optional weighted continuation spawns.
- `three/physics.mjs`: soft contact response and slower multi-axis turns with Y dominant on high-value tiles.
- `three/tile-layout.mjs`: separate, scale-aware zones for the main glyph, time multiplier, grenade, and point value; each object is fitted from its actual mesh bounds.
- `three/icons.js`: one consistent set of modeled arrows, Undo, pause, audio, hourglass, and grenade icons.
- `three/scene.js`: actual extruded tile/letter geometry, modeled icons, shared geometry, particles, full-field rendering, raycasting, and moving smoke.
- `three/ui.js`: mesh text, modeled controls, timer, menus, collection pagination, keyboard-focus marker, and UI raycasts. Text is extruded font geometry, not a bitmap or HTML texture. Beveled plinths, layered button caps, soft contact shadows, and a recessed timer give the interface depth. CLTTR sits at the top, the timer directly beneath it, then the falling field. The former top slogan and gameplay footer are removed.
- `three/app.js`: input and round presentation; it reuses the original pure rule engine.
- `three/style.css`: only canvas sizing and page placement. No game graphics are styled with CSS.

The references were sampled with equal per-image weight after excluding edge UI. Their overall mean is **#EEB18A**. Color-family means are cream **#FAE7B5**, peach **#F59C81**, muted plum **#8E6D73**, and mint **#A8D8AC**. The final plum pair is darker for readability. See **`three/palette-analysis.json`** for the sampling method, per-reference means, and supplied swatches. The art itself is generated with geometry and shaders; the reference images are not included as game assets.

## Shared files and licenses

- `engine.js`: tested word validation, score, time, penalties, and effects.
- `motion.js`, `opening.js`, `effects.js`: rotation, opening guarantees, and effect placement.
- `data/words.js`: **198,294** Wordnik English word-game entries. Sources, license, and rebuilding are in `data/README.md`. This is not an official Scrabble tournament dictionary.
- `vendor/three/`: pinned local Three.js and Helvetiker font, with their licenses and source information.
- `classic.html`, `sketch.js`, `style.css`, `vendor/p5.min.js`: the previous p5 prototype, retained separately. It is not loaded by the Three.js game.
- Personal bests retain the existing `letterfall.best.points.v2` storage key.

## Verify

```sh
npm test
```

The 114 automated tests cover dictionary and wildcard resolution, unused-match preference, zero-point blank rewards, ambiguous-prefix continuation, repeats and penalties, time caps, gold, pause/restart, warm-up and special effects, side-entering smoke, English frequencies and word assistance, opening guarantees, portrait-world bounds, delayed top-entry replenishment across both picks and maintenance, blocked-entry queuing, continuous coverage through the opening handoff, automatic word submission, per-letter expiry and reset, capped combo growth and resets, late-input races, paused deadlines, collision safety, rotation, and quiet reward animations.

Browser validation checks the centered portrait frame on phone and desktop, mesh button raycasts, keyboard focus, wildcard submission and scoring, replenishment, Undo, menus, collection, moving smoke, and the absence of HTML interface elements. A WebGL-capable modern browser is required.
