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
- Tap the trash-can icon on the left to discard the whole word for a two-second penalty. Tap the word or the paper-plane icon on the right to submit it.
- Tap Pause to stop the clock, effects, and letters. Switching away from the page also pauses automatically.
- Tap the collected-word strip to open its paginated collection. The round pauses while this panel is open and resumes when it closes.
- Letter keys pick the lowest fully visible matching letter. **? / \*** picks a visible blank. **Enter** submits, **Backspace** clears, **1** collects the facing side of a visible two-sided pickup, and **Escape** pauses/resumes or closes help/collection.
- **Tab / Shift+Tab** cycle the available Three.js controls. A small gold marker shows focus. **Enter / Space** activate the focused control. Enter also starts the ready screen. With no control focused, Space pauses a running round.
- Sound starts off. Settings offers separate sound effects, ambient music, haptics, and reduced-motion controls. Settings can also be opened while paused.

The single canvas has a descriptive accessibility label reflecting the current word, visible letters, effects, menus, and keyboard focus. There are no invisible HTML buttons underlying the meshes.

## Rules

- Start with **60 seconds**, with earned time capped at **60 seconds** under the current tuning. The renderer also supports an overtime layer if `timer.maxSeconds` is later raised. The current difficulty pass shortens the letter window, reduces time earned from long words, and limits the combo extension. Points, penalties, and tile supply are unchanged.
- Make new English words of **3 or more letters**. Each word earns the sum of its standard English **Scrabble letter points**; these values appear on the tiles.
- **Blank wildcards** represent any one letter and earn **zero points**. There is no letter picker: a selected blank appears as `?`, and submission resolves the whole pattern to an unused dictionary word. Blanks work at any position, and several can occur in one word. All interpretations remain available as more letters are added. If several unused words match, common English letters at the blank positions are favored; the actual word is added to the collection. If every complete match was already used, the normal repeat penalty applies. An impossible pattern still fails immediately. Time rewards and collection scores use only the points actually earned, including any normal gold-letter time bonus.
- **Three-letter words:** 0.1 seconds per point, capped at **0.5 seconds** of ordinary time. **Four letters:** 0.25 seconds per point, capped at **2 seconds**. **Five or more letters:** **1.2 seconds per point**. Gold time is added after the short-word cap.
- A repeated submission costs **2 seconds**. An impossible prefix or an incomplete submitted word costs **5 seconds**. Both clear the current word without reducing earned points. A used word may still be extended before submitting: CAT can become CATCH.
- Clear discards the whole word for **2 seconds**. Clearing an empty word does nothing. Selected tiles stay consumed.
- After each letter (including a blank), the letter countdown starts at **4.5 clock seconds**. On expiry, a **valid unused word automatically submits** with its normal points and time reward. An unfinished word is discarded for **2 seconds**; a repeated complete word gets the normal repeat penalty. Each outcome happens once. You can still tap to submit sooner or pick another letter to reset the countdown. A thin meter shows the remaining window. Pauses freeze it; hourglasses slow it to 40% speed alongside the round clock. A fresh 4.5-second letter window with a fresh 5-second hourglass lasts 7.5 real active seconds: it spends 2 clock seconds during the effect, then the remaining 2.5 at normal speed. Tune `rules.nextLetterSeconds` to change the base window.
- No validity highlight, reward preview, or repeat warning appears before submission. The tray shows the letters, a neutral automatic-submission prompt, and the countdown meter. Impossible prefixes still fail immediately.
- Missing a falling tile carries no penalty. At zero, the round ends. The high score is the highest total letter points, saved in the browser; the collected-word count remains separate.

## Quick-word combo

Complete consecutive words **less than 8 active seconds apart** to build a chain. Manual and automatic submissions both count. The third word unlocks **4.75 seconds per letter**; the fourth gives **5**, the fifth **5.25**, and each further quick word adds **0.25 seconds**, capped at **7.5 seconds**. Points and round-clock rewards stay unchanged. A small Three.js label in the word tray shows chain progress and the boosted window, without large popups or validity hints.

An invalid timeout, misspelling, repeat, unfinished submission, or manual discard resets the chain to zero and the next letter window to the base **4.5 seconds**. Going **8 active seconds without completing a new word** also resets it. Picking letters alone does not keep the chain alive. When a chain expires during a word, the current letter retains the countdown it was granted; the next pick uses the base window. Pausing freezes both countdowns. Hourglasses stretch the letter window, including combo-boosted windows, while the 8-second combo expiry continues in active real time. Starting a fresh round clears the chain.

Tune `combo` in `config.js`: `enabled`, `wordsToStart` (3), `maxGapSeconds` (8), `extraSecondsPerWord` (0.25), and `maxExtraSeconds` (3). The cap adds to `rules.nextLetterSeconds`, so changing the base window keeps the maximum boost bounded.

## Opening and special tiles

Each round starts with randomly scattered letters supporting a **7-, 6-, 5-, and 3-letter word**, including the needed repeated letters. These choices can share tiles. The opening scales with available space, starting from a target of **20 exposed choices**. Guaranteed word letters are placed first, followed by **one blank** and filler drawn from English text frequencies. Later spawns have a **5% blank chance**; ordinary letters use the same frequency distribution, with optional continuation help beginning at four selections. Blanks are plain cream tiles with a zero in the point corner, on both faces; they do not carry gold multipliers or grenades.

- **Gold:** about 16% of letters carry a ×2 time multiplier. Each adds an extra contribution for that letter after the normal reward cap, with unchanged points. CAT with a gold C earns **0.8 seconds** rather than 0.5. QUIZ with a gold Q earns **4.5 seconds** rather than 2. CATCH with a gold C earns **18 seconds** rather than 14.4. Multiple gold letters add their contributions; they do not multiply the whole word.
- **Special-tile warm-up:** the first **20 active seconds** have no two-sided pickup drops. Pausing does not advance this warm-up; restarting resets it. Gold multiplier tiles are available from the opening. After warm-up, the usual chances apply to qualifying word submissions.
- **Two-sided pickup:** after warm-up, each new word of at least five letters has a one-in-three chance to drop one from a random position above the field. One face carries an hourglass; the other carries a smoke bomb. It falls at 1.8× ordinary speed and rotates continuously around **Y only**, at **56° per second** (letter Z spin is capped at 32° per second). Each drop starts at a random angle. Tap the face currently toward you: **hourglass** slows both clocks, falling letters, rotation, and supply to 40% speed for **five active real seconds**; **smoke bomb** releases **five seconds of pink smoke**. Either face consumes the same pickup. Very nearly edge-on taps do nothing, so an unreadable rim cannot accidentally choose an effect. Keyboard **1** uses the same visible face as a tap. At most one uncollected pickup is retained; a new drop replaces it, and a missed drop has no penalty.
- **Letters have no smoke bombs:** ordinary, gold, and blank letter tiles cannot trigger smoke. Smoke only comes from the bomb face of a collected pickup.
- **Smoke:** four freshly scattered, independently shaped clouds appear around their own places in the field, fade in over 0.8 seconds, hold an opaque center, then dissolve over the final 1.2 seconds. Small, bounded drift keeps the clouds gently alive without sweeping across the board. Sizes, aspect ratios, shapes, spacing and orientation vary on each activation.
- Smoke obscures the falling field while the timer and word tray remain readable. Remembered tiles remain clickable through smoke.
- Recollecting an effect refreshes its duration without stacking strength. Both effects can run together. Their durations use unscaled active time. Pause freezes them; game over and restart clear them.

## Fluctuating spin difficulty and steady letter supply

Every round begins with **zero Z-axis spin**. Over the first **45 active seconds**, a smooth curve increases letter Z rotation to the configured maximum intensity. After that, the game picks a different random target from **0%, 25%, 50%, 75%, or 100%**, taking **8–16 active seconds** to ease toward it. Intensity can rise or fall; it never leaves 0–100%. Zero intensity stops Z spin at the current angle, with no rocking or snap to upright. All existing and newly spawned letters follow the same intensity.

Each letter retains its own turning direction and full-intensity Z speed in the configured **8–32°/second** range. Actual Z speed is that speed multiplied by intensity, so the absolute Z ceiling is **32°/second**. Existing X/Y tilts remain separate. The two-sided pickup retains its continuous **56°/second Y-only** turn and does not follow this difficulty curve.

Pauses and menus freeze the curve; restarting resets the 45-second opening. It uses active play time, independent of the refillable countdown. Hourglasses still slow actual tile motion to 40%, while the difficulty timeline advances in active real seconds. Reduced motion suppresses letter rotation, as before. `difficulty` in `config.js` controls the ramp, transition durations and number of target intervals; `enabled: false` keeps Z spin at zero for the whole round.

Falling speed stays at **31.32 logical pixels/second**. Letter supply, word rewards, penalties, and special-tile chances do not vary with difficulty.

Replenishment stays **one pick behind**: the first selection leaves a gap, and the second and later selections can each release one replacement **above the top edge**. Replacements fall into view at the normal configured speed. Nothing materializes in the middle of the play area or at a cleared tile position. If the top is crowded or the population budget is full, the replacement stays queued until there is safe entry space. Only the initial board is scattered within the field. At round start, additional staggered letters are already traveling behind the header, connecting that opening board to the incoming stream without an empty vertical stretch.

Every **0.72 seconds**, supply attempts one collision-safe top entry, also servicing any queued replacement. It does not bundle several maintenance letters into rows. The opening targets **20 exposed letters**; the later visible count varies as tiles are selected, fall behind the panels, or enter from above. Replacements use the current spelling's letter probabilities. The population budget covers the whole travel distance, including tiles behind both panels (55 letters for the default frame), and excludes hourglasses. This keeps arrivals flowing while older tiles leave. Top-entry clearance and the contact solver prevent overlaps.

Unassisted spawns use normalized English text frequencies from [Peter Norvig’s Google Books analysis](https://www.norvig.com/mayzner.html): common letters such as E, T, A, O, I, and N appear more often; rare letters remain possible. This replaces both the short-word bag and the old letter string. There is no forced word completion. `letterFrequency` in `config.js` contains all 26 editable weights. They affect supply only, not Scrabble scores.

Before the fourth selection, all new letters use these frequencies. At four letters and beyond, the existing 35% continuation-help chance takes precedence when a longer unused matching word exists; all other draws still use English frequencies. Gold is available immediately. Two-sided pickups retain their **20-active-second warm-up**, independent of pace.

## Word celebrations

Submitting a valid word makes its **+points** pop up from the word tray and take a short, curved flight into the scoreboard. The displayed score changes when those points arrive, followed by a small settling pulse. Each quick submission has an independent flight, so later words cannot cancel or prematurely credit an earlier reward. The decoration does not intercept tile taps.

The engine score, saved progress and time rewards still update immediately; only the presentation of points waits for the flight. The **+seconds** label and timer refill remain beside the clock. Time labels show only credited time; a full clock shows **MAX**. Every graphic is Three.js geometry, with no HTML overlay.

Pause freezes flights. Restart and game over clear pending decorations and show the correct actual score. Reduced motion uses stationary feedback and immediate score presentation. `celebration` controls the existing timer refill and label timings; score-flight timing is defined in `three/reward-motion.mjs`.

## Discoveries and personal progress

Every accepted spelling is saved immediately to a persistent **Wordbook** on this browser and origin. A word can score once per round, and familiar words can be played again in later rounds. “NEW” means the first time that exact spelling has been recorded on this device. A wildcard discovery is included in the Wordbook; it is marked as played without a wildcard only after a later unassisted play.

The Wordbook supports length filters, alphabetical/recent/most-played sorting, search with a mesh keyboard or physical keyboard, pagination, and individual word histories. Entries show first/last play dates, play count, best word score, and whether the word has been played without a wildcard. The supplied dictionary has no definitions; the interface does not invent them.

Round results show score, personal best, newly discovered words, the longest word, and a selected collection goal. Players can replay, inspect just the new words, or return home. Goals are optional and have no daily deadline or loss penalty. Lifetime progress includes distinct discoveries by word length; Recent play shows distinct unassisted five-, six-, and seven-letter words in the latest 20 minutes of active play. The window grows as active time accumulates and excludes pauses. Rule/dictionary changes start a fresh comparable window without deleting the Wordbook.

**Community comparison is unavailable until real player data exists.** The local rank calculation accepts only verified, stable, sufficiently populated matching cohorts and complete observation windows. Nothing sends player data to a server. Do not display estimated percentiles or infer general vocabulary ability from game performance. A production leaderboard still needs consent, account identity, a backend, server validation, and real comparison cohorts.

`progress.mjs` saves compact, immutable journal records under `clttr.progress.v1` keys and can recover earlier versioned snapshots and backup copies. Unique event IDs prevent duplicate submissions; separate operation keys preserve discoveries from concurrent tabs. New browser history is journal-first, so accepted words do not rewrite the entire collection. Storage adapters without key enumeration retain the snapshot-and-backup fallback. Legacy best scores are imported from `letterfall.best.points.v2`. Storage failures keep play working and display an explicit session-only notice. Settings use `clttr.settings.v1`. Browser storage can be cleared and is not an account backup; different ports/domains have separate collections.

## Responsive feedback and comfort

Selected tiles take a short, non-interactive trip into the tray; hourglasses travel toward the timer. Accepted words receive a brief acknowledgement, with a longer accent for a first discovery or personal record. Small NEW tags, chain progress, and optional goal progress connect a round to the collection. Score and time rewards still apply immediately. These feedback effects add no reward multipliers, validity hints, input delays, or game-clock changes.

`three/audio.mjs` synthesizes soft selection, word, discovery, penalty, hourglass, grenade, and low-time cues. Sound unlocks only after an input gesture. Effects, ambient music, and supported-device haptics have independent controls; pause and mute cancel pending audio. Low-time cues have a cooldown. Reduced motion follows the device preference initially and can be changed in Settings; it suppresses decorative transfer/pulse movement and letter tumbling. The two-sided pickup keeps its Y rotation because its facing determines the effect; pause still freezes it.

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
| `rotation` | Full-intensity letter Z speed bounds, high-value point threshold, X/Y turn probabilities and axis mix, pauses between X/Y turns, reduced-motion preference |
| `difficulty` | Enable, initial ramp duration, minimum/maximum transition duration, and target intervals (`levelSteps: 4` gives five target intensities including zero and full) |
| `physics` | Contact gap, soft restitution, lateral damping, fall-speed recovery, solver passes, wall padding |
| `specialTiles.warmupSeconds` | Active-play delay before two-sided pickups unlock |
| `bonusLetters` | Gold chance and time multiplier |
| `hourglass` | Minimum word length, drop chance, falling multiplier, Y rotation speed, duration, slow-time scale |
| `smoke` | Duration, patch count, radius, opacity, fade-in/out timing and bounded drift; legacy entry/exit settings are unused by the anchored smoke |
| `tiles.mobileSize`, `tiles.gapPixels` | Tile size and supply spacing |
| `letterPoints` | Per-letter score values |
| `feedback.durationSeconds` | Feedback visibility duration |
| `engagement` | Selection transfer, word acknowledgement, discovery accent, and low-time sound cooldown |

Three.js falling speed stays at `falling.pixelsPerSecond` (31.32 by default), regardless of how long the round lasts or how many words are collected. Letter supply uses the preserved 0.72-second mobile opportunity interval, constrained by the population cap and available top-entry space. Countdown and effect durations keep their existing time scale. Letter Z speed at full difficulty uses the preserved 8–32 degrees per second range. Set both letter rotation limits to zero to stop their rotation, or to the same value for a shared full-intensity speed. Two-sided pickups use `hourglass.rotationDegreesPerSecond` independently. The legacy min/max/increase-per-word fields only affect the archived p5 prototype.

By default, 85% of letters worth at least four points also make intermittent X/Y turns, with Y dominant; 12% of ordinary letters retain smaller X/Y tilts. `rotation.secondaryAxisWeight` controls this axis mix, independently of the difficulty-controlled Z turn. Both faces carry correctly oriented letters, scores, and gold markings. High-value tiles use the upper half of the configured speed range. X/Y turns pause for 0.8–2.4 seconds; Z spin follows difficulty continuously without abrupt direction reversals. Minimum and maximum values are validated. Three.js motion uses logical units, so viewport size does not change difficulty.

## Tile contact

The Three.js version uses projected oriented-box collision detection with a two-unit safety gap. The bounds include tile thickness and expand or contract with its X/Y tilt. Contacts separate the rotated faces, transfer a small impulse, and damp sideways motion. Tiles recover their normal falling speed gently; restitution is only 0.08. The simulation substeps at 120 Hz and solves contacts iteratively, so fast two-sided pickups and turning letters cannot pass through one another. The field sides also keep tiles in bounds. Pause freezes physics, and the hourglass slows the same simulation. Hover lifts a tile without enlarging its collision shape.

## Tune the art

**`three/design.js`** controls the two-color material pairs, light direction, cel threshold, tile extrusion/bevel, raised-letter depth, camera layout, and maximum pixel ratio. Tiles have wider, three-segment bevels and a subtle satin highlight controlled by `tile.specularStrength` and `tile.shininess`; raised lettering stays in the two-tone diffuse material. The background now moves from light magenta through pink and peach into lemon yellow. `DESIGN.atmosphere.grainAmount` controls its subtle, static grain; `fogAmount` controls the mist. The older flat color/border settings in `config.js` apply only to the archived p5 version.

- `three/materials.js`: hard two-tone cel shaders for objects; separate soft gradient, fog, and smoke shaders. No outlines; a small optional specular highlight is used on tile bodies.
- `three/layout.mjs`: world bounds and panel placement within the portrait canvas, exposed-choice target.
- `three/spawn.mjs`: collision-safe top entry, one-pick-delayed top-entry replenishment, and scattered opening placement.
- `three/reward-motion.mjs`: animated score/time presentation without delaying actual rewards.
- `three/letter-supply.mjs`: English-frequency sampling, cached dictionary-prefix lookup, and optional weighted continuation spawns.
- `three/physics.mjs`: soft contacts, difficulty-controlled letter Z spin, separate X/Y tilts, and Y-only pickup rotation.
- `three/difficulty.mjs`: active-time opening ramp and bounded random smooth transitions.
- `three/pickup-facing.mjs`: camera-facing effect selection, including the edge-on dead band.
- `three/tile-layout.mjs`: separate, scale-aware zones for the main glyph, time multiplier, and point value; each object is fitted from its actual mesh bounds.
- `three/icons.js`: one consistent set of modeled arrows, trash can, paper plane, Undo, pause, audio, hourglass, and grenade icons.
- `three/scene.js`: actual extruded tile/letter geometry, modeled icons, shared geometry, particles, full-field rendering, raycasting, and moving smoke.
- `three/ui.js`: mesh text, modeled controls, timer, menus, collection pagination, keyboard-focus marker, and UI raycasts. Text is extruded font geometry, not a bitmap or HTML texture. Beveled plinths, layered button caps, soft contact shadows, and a recessed timer give the interface depth. CLTTR sits at the top, the timer directly beneath it, then the falling field. The former top slogan and gameplay footer are removed.
- `three/app.js`: input, round presentation, settings, audio, and collection integration; it reuses the original pure rule engine.
- `progress.mjs`: local discoveries, goals, round summaries, recent-play measurements, and conservative community-rank validation.
- `three/audio.mjs`: gesture-unlocked synthesized sound, ambient audio, and optional haptics.
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

The automated tests cover dictionary and wildcard resolution, unused-match preference, zero-point blank rewards, ambiguous-prefix continuation, repeats and penalties, time caps, gold, pause/restart, warm-up, two-sided pickup selection and rotation, special effects, anchored, fading smoke, English frequencies and word assistance, opening guarantees, portrait-world bounds, delayed top-entry replenishment across both picks and maintenance, blocked-entry queuing, continuous coverage through the opening handoff, automatic word submission, per-letter expiry and reset, capped combo growth and resets, late-input races, paused deadlines, hourglass-scaled letter deadlines and effect-expiry integration, collision safety, rotation, the 45-second difficulty ramp and bounded random transitions, and reward flights with arrival-timed score presentation. Engagement tests cover accepted-event metadata, discovery deduplication and recovery, concurrent-tab persistence, wildcard provenance, recent-play windows, goal completion, score migration, audio cancellation, reduced motion, and mesh-menu controls.

Browser validation checks the centered portrait frame on phone and desktop, mesh button raycasts, keyboard focus, wildcard submission and scoring, replenishment, Undo, menus, collection, moving smoke, and the absence of HTML interface elements. A WebGL-capable modern browser is required.
