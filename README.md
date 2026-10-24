# clttr

A 9:16 mobile word game rendered entirely in **Three.js 0.186.1**. Falling tiles, raised letters, icons, the timer, scores, buttons, the word tray, word collection, feedback, and every menu are Three.js meshes. One WebGL canvas draws the game. There are no HTML overlays, DOM buttons, HTML-to-texture captures, or CSS2D/CSS3D renderers.

## Play locally

```sh
npm start
```

Open **http://localhost:5173**. To use the current preview port, run `PORT=5188 npm start` and open **http://localhost:5188**. Use the local server, rather than opening the HTML file directly: ES modules and the bundled font load over HTTP. The server listens only on this computer. No install, API key, or internet connection is needed to play; Three.js, fonts, and the dictionary are bundled locally.

The canvas always keeps a 9:16 aspect ratio. Its logical space is 360 × 640, with a 337-unit falling field. It uses the mobile tile-count, size, and supply settings on desktop too, so the same portrait game scales consistently across screens.

## Controls

- Tap a tile to pick its letter. Tap the word tray to submit. Every visible control is a raycast target in the Three.js scene.
- Tap Undo to clear the whole word for a two-second penalty.
- Tap Pause to stop the clock, effects, and letters. Switching away from the page also pauses automatically.
- Tap the collected-word strip to open its paginated collection. The round pauses while this panel is open and resumes when it closes.
- Letter keys pick the lowest fully visible matching letter. **Enter** submits, **Backspace** clears, **1** collects a visible hourglass, and **Escape** pauses/resumes or closes help/collection.
- **Tab / Shift+Tab** cycle the available Three.js controls. A small gold marker shows focus. **Enter / Space** activate the focused control. Enter also starts the ready screen. With no control focused, Space pauses a running round.
- Sound starts off. The sound control is in the main menu, beside How to play. It is absent during a round.

The single canvas has a descriptive accessibility label reflecting the current word, visible letters, effects, menus, and keyboard focus. There are no invisible HTML buttons underlying the meshes.

## Rules

- Start with **60 seconds** and bank earned time up to **120 seconds (200%)**. Above 60 seconds, the timer shows an overtime percentage and a gold second fill. The clock drains normally back through the standard fill.
- Make new English words of **3 or more letters**. Each word earns the sum of its standard English **Scrabble letter points**; these values appear on the tiles.
- **Three-letter words:** 0.1 seconds per point, capped at **0.5 seconds** of ordinary time. **Four letters:** 0.25 seconds per point, capped at **2 seconds**. **Five or more letters:** **1.5 seconds per point**. Gold time is added after the short-word cap.
- A repeated submission costs **2 seconds**. An impossible prefix or an incomplete submitted word costs **5 seconds**. Both clear the current word without reducing earned points. A used word may still be extended before submitting: CAT can become CATCH.
- Undo clears the whole word for **2 seconds**. Empty undo does nothing. Selected tiles stay consumed.
- No validity highlight, reward preview, or repeat warning appears before submission. The tray shows only the letters, count, and neutral submit prompt. Impossible prefixes still fail immediately.
- Missing a falling tile carries no penalty. At zero, the round ends. The high score is the highest total letter points, saved in the browser; the collected-word count remains separate.

## Opening and special tiles

Each round starts with randomly scattered letters supporting a **7-, 6-, 5-, and 3-letter word**, including the needed repeated letters. These choices can share tiles. The opening set is hidden among random extra letters. Subsequent letter supply uses the original random generator until the current spelling reaches four letters, when the optional extension experiment can help.

- **Gold:** about 16% of letters carry a ×2 time multiplier. Each adds an extra contribution for that letter after the normal reward cap, with unchanged points. CAT with a gold C earns **0.8 seconds** rather than 0.5. QUIZ with a gold Q earns **4.5 seconds** rather than 2. CATCH with a gold C earns **22.5 seconds** rather than 18. Multiple gold letters add their contributions; they do not multiply the whole word.
- **Special-tile warm-up:** the first **10 active seconds** have no grenade-marked letters or hourglass drops. Pausing does not advance this warm-up; restarting resets it. Gold multiplier tiles are available from the opening. After warm-up, the usual chances apply to newly spawned grenade letters and qualifying word submissions.
- **Hourglass:** after warm-up, each new word of at least five letters has a one-in-three chance to drop one from a random position above the field. It falls at 1.8× ordinary speed. Catch it to slow the countdown, falling letters, rotation, and supply to 40% speed for **five active real seconds**. At most one uncollected hourglass is retained. A new drop replaces it; a missed drop disappears without penalty.
- **Grenade-marked letters:** about 9% carry a small grenade and fall at 1.8× speed. Using one includes its letter normally and releases **five seconds of pink smoke** in four freshly scattered, independently shaped clouds. The smoke blooms in over 0.5 seconds, holds opaque centers, drifts gently, then fades out over its final second. A marked letter may also be gold. Smoke also triggers on a bad prefix unless that penalty ends the round.
- Smoke obscures the falling field while the timer and word tray remain readable. Remembered tiles remain clickable through smoke.
- Recollecting an effect refreshes its duration without stacking strength. Both effects can run together. Their durations use unscaled active time. Pause freezes them; game over and restart clear them.

## Experimental word extension help

Once **four letters are selected**, newly spawned letters have a **35% chance** to come from unused longer dictionary words beginning with the **entire current spelling**. The next letter receives full weight; the letter after it receives 40% weight. Each matching word contributes, so continuations shared by several words appear more often. The other 65% of spawns keep the original random generator.

The candidates update as more letters are selected. Help stops when the word is submitted, cleared, misspelled, or has no unused longer continuation. It depends on selected letters, not collected-word count. Existing falling tiles and spawn timing do not change, and no word-validity hint is shown. The opening's existing word guarantees are preserved.

Tune `wordAssist` in `config.js`: `enabled` toggles the experiment, `chance` controls its strength, `minPrefixLength` sets the trigger, `lookAhead` sets how many following positions contribute, and `nextLetterDecay` controls the weight of later positions. Set `enabled: false` or `chance: 0` to restore the original supply throughout the round.

## Tune timing and motion

Edit **`config.js`**, save, and refresh. Its comments explain the settings, units, and limits. No build is required.

| Group | Controls |
| --- | --- |
| `timer` | Starting, maximum, and low-time seconds |
| `rules` | Minimum word length |
| `rewards` | Seconds per point, word-length rates, short-word base caps |
| `penalties` | Clear, repeat, and misspelling penalties |
| `opening.mobileTiles`, `opening.maxHeightFraction` | Opening count and scatter depth |
| `falling` | Minimum/maximum speed, acceleration per word, `mobileSpawnSeconds` supply interval |
| `wordAssist` | Extension-help toggle, trigger length, probability, lookahead, later-letter weight |
| `rotation` | Speed limits, high-value point threshold, separate turn probabilities, multi-axis strength, gentle rocking, pauses between turns, reduced-motion preference |
| `physics` | Contact gap, soft restitution, lateral damping, fall-speed recovery, solver passes, wall padding |
| `specialTiles.warmupSeconds` | Active-play delay before grenade letters and earned hourglasses unlock |
| `bonusLetters` | Gold chance and time multiplier |
| `hourglass` | Minimum word length, drop chance, falling multiplier, duration, slow-time scale |
| `smoke` | Grenade-letter chance, falling multiplier, duration, patch count, radius, opacity, fade-in/out timing, drift speed |
| `tiles.mobileSize`, `tiles.gapPixels` | Tile size and supply spacing |
| `letterPoints` | Per-letter score values |
| `feedback.durationSeconds` | Feedback visibility duration |

Falling speed is now 31.32–59.4 logical pixels per second, increasing by 1.188 per collected word: 20% faster than the previous tuning. Letter supply intervals are 0.6 seconds on mobile and 0.45 seconds in the classic desktop layout, providing 20% more spawn opportunities per second. The countdown, effect durations, and rotation tuning retain their normal time scale. Rotation limits are 5.6–22.4 degrees per second, 30% slower. Set both rotation limits to zero to stop rotation, or to the same value for a fixed turning speed.

By default, 85% of letters worth at least four points make intermittent 150–240° turns that emphasize Y and also tilt on X and Z. 12% of other letters tumble with Z dominant. Each tile gets its own axis mix; the combined rotation speed stays within its speed limit. `rotation.secondaryAxisWeight` controls the secondary turns (0 restores single-axis rotation). Both faces carry correctly oriented letters, scores, and special markings. High-value tiles use the upper half of the configured speed range. Other tiles gently rock; turns pause for 0.8–2.4 seconds. Minimum and maximum values are validated. Three.js motion uses logical pixels per second, so changing the viewport does not change difficulty.

## Tile contact

The Three.js version uses projected oriented-box collision detection with a two-unit safety gap. The bounds include tile thickness and expand or contract with its X/Y tilt. Contacts separate the rotated faces, transfer a small impulse, and damp sideways motion. Tiles recover their normal falling speed gently; restitution is only 0.08. The simulation substeps at 120 Hz and solves contacts iteratively, so fast grenade/hourglass tiles and turning letters cannot pass through one another. The field sides also keep tiles in bounds. Pause freezes physics, and the hourglass slows the same simulation. Hover lifts a tile without enlarging its collision shape.

## Tune the art

**`three/design.js`** controls the two-color material pairs, light direction, cel threshold, tile extrusion/bevel, raised-letter depth, camera layout, and maximum pixel ratio. Tiles have wider, three-segment bevels and a subtle satin highlight controlled by `tile.specularStrength` and `tile.shininess`; raised lettering stays in the two-tone diffuse material. The background now moves from light magenta through pink and peach into lemon yellow. `DESIGN.atmosphere.grainAmount` controls its subtle, static grain; `fogAmount` controls the mist. The older flat color/border settings in `config.js` apply only to the archived p5 version.

- `three/materials.js`: hard two-tone cel shaders for objects; separate soft gradient, fog, and smoke shaders. No outlines; a small optional specular highlight is used on tile bodies.
- `three/letter-supply.mjs`: cached dictionary-prefix lookup and optional weighted continuation spawns.
- `three/physics.mjs`: soft contact response and slower multi-axis turns with Y dominant on high-value tiles.
- `three/tile-layout.mjs`: separate, scale-aware zones for the main glyph, time multiplier, grenade, and point value; each object is fitted from its actual mesh bounds.
- `three/icons.js`: one consistent set of modeled arrows, Undo, pause, audio, hourglass, and grenade icons.
- `three/scene.js`: actual extruded tile/letter geometry, modeled icons, shared geometry, particles, field clipping, raycasting, and WebGL rendering.
- `three/ui.js`: mesh text, modeled controls, timer, menus, collection pagination, keyboard-focus marker, and UI raycasts. Text is extruded font geometry, not a bitmap or HTML texture. Beveled plinths, layered button caps, soft contact shadows, and a recessed timer give the interface depth. clttr sits at the top, the timer directly beneath it, then the falling field. The former top slogan and gameplay footer are removed.
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

The 72 automated tests cover the real dictionary, prefix failures, repeats, scores, reward caps, gold contributions, undo, restart, expiry, pause, config validation, rotation, opening guarantees, hourglass probability/duration, grenade triggers, smoke placement, rotated contacts, long crowded simulations, fast-tile tunneling, reduced motion, turn probabilities, combined multi-axis speed, projected 3D bounds, smooth smoke fades, separated face-label zones, the four-letter help threshold, weighted continuation probability, real-dictionary candidates, reset/exclusion behavior, the 200% overtime cap, and special-tile warm-up across pauses and restarts.

Browser validation checks portrait sizing, mesh button raycasts, keyboard focus, word submission, scoring, Undo, menus, collection, effect status, and the absence of HTML interface elements. A WebGL-capable modern browser is required.
