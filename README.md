# CLTTR

A mobile word game rendered entirely in **Three.js 0.186.1**. Falling tiles, raised letters, icons, the timer, scores, buttons, the word tray, word collection, feedback, and every menu are Three.js meshes. One WebGL canvas draws the game. There are no HTML overlays, DOM buttons, HTML-to-texture captures, or CSS2D/CSS3D renderers.

## Play locally

```sh
npm start
```

Open **http://localhost:5173**. To use the current preview port, run `PORT=5188 npm start` and open **http://localhost:5188**. Use the local server, rather than opening the HTML file directly: ES modules and the bundled font load over HTTP. The server listens only on this computer. No install, API key, or internet connection is needed to play; Three.js, fonts, and the dictionary are bundled locally.

The game stays **tall and portrait on every device**. A centered **9:16 frame** fits desktop screens; portrait phones use the available screen height and width, with safe areas respected. The layout anchors controls to the top and bottom while extending the falling field on taller phones. Tile size and difficulty remain consistent. A soft background-colored veil gradually reveals entering letters beneath the top controls, avoiding a hard panel edge. Covered tiles cannot intercept taps or keyboard selections.

## Minimal mesh interface

The home screen shows the modeled **CLTTR** tile logo, “Catch letters,” and “Discover your next word.” Its main actions are **Let's Play**, **Word Book**, **Your Progress**, and **How to Play**, with a Settings symbol at the top. All visible UI remains skeuomorphic Three.js geometry floating in the game scene, including button caps, icons, lettering, and panels.

The centered, chunky play and compact replay actions with bold labels and clean faces, rounded tactile controls with clean faces, and sparse menu hierarchy take visual inspiration from the official [Candy Crush](https://www.king.com/game/candycrush) and [Temple Run](https://imangistudios.com/thegames/temple-run/) pages. These are design references only; no assets or claims about player behavior are borrowed.

## Controls

- Tap a tile to pick its letter. Tap the word tray to submit. Every visible control is a raycast target in the Three.js scene.
- Tap the trash-can icon on the left to discard the whole word for a two-second penalty. Tap the word or the paper-plane icon on the right to submit it.
- Tap Pause to stop the clock, effects, and letters. Switching away from the page also pauses automatically.
- Open **Word Book** or **Your Progress** from the home screen or the Play Again menu. The gameplay screen has no collected-word strip. Round results include a tappable list of the words found that round.
- Letter keys pick the lowest fully visible matching letter. **? / \*** picks a visible blank. **Enter** submits, **Backspace** clears, and **Escape** pauses/resumes or closes help/collection.
- **Tab / Shift+Tab** cycle the available Three.js controls. A small gold marker shows focus. **Enter / Space** activate the focused control. Enter also starts the ready screen. With no control focused, Space pauses a running round.
- Sound effects start **on for new users**; existing saved preferences are preserved. Ambient music starts off. Settings offers separate sound effects, ambient music, haptics, and reduced-motion controls, and can also be opened while paused.

The single canvas has a descriptive accessibility label reflecting the current word, visible letters, effects, menus, and keyboard focus. There are no invisible HTML buttons underlying the meshes.

## Rules

- Start with **60 seconds**, with earned time capped at **60 seconds** under the current tuning. The renderer also supports an overtime layer if `timer.maxSeconds` is later raised.
- Make new English words of **3 or more letters**. Each word earns the sum of its standard English **Scrabble letter points**; these values appear on the tiles. A gold tile doubles that word’s points once.
- **Blank wildcards** represent any one letter and earn **zero points**. There is no letter picker: a selected blank appears as `?`, and submission resolves the whole pattern to an unused dictionary word. Blanks work at any position, and several can occur in one word. All interpretations remain available as more letters are added. If several unused words match, common English letters at the blank positions are favored; the actual word is added to the collection. If every complete match was already used, the resolved repeat earns zero points and no time reward, with no penalty. An impossible pattern still fails immediately. Time rewards use the base letter points; collection scores include any gold word multiplier.
- **Three-letter words:** 0.1 seconds per point, capped at **0.5 seconds** of ordinary time. **Four letters:** 0.25 seconds per point, capped at **2 seconds**. **Five or more letters:** **1.2 seconds per point**. Gold affects score, not these time rewards.
- A repeated submission earns **0 points**, adds no time, and has **no penalty**. A gentle sound and a `+0` acknowledgement make the outcome clear. Repeats clear the current word but do not add another accepted word, advance special unlocks or density, or record another discovery/play in saved progress. An impossible prefix or an incomplete submitted word costs **5 seconds**. A used word may still be extended before submitting: CAT can become CATCH.
- Clear discards the whole word for **2 seconds**. Clearing an empty word does nothing. Selected tiles stay consumed.
- Each selection, including a blank, resets the letter countdown according to the current word length: **2 seconds for letters 1–4**, then **0.5 seconds more for every additional letter**. The fifth letter grants **2.5 seconds**, the sixth **3**, the seventh **3.5**, and so on. Quick-word combos do not change this window. On expiry, a **valid unused word automatically submits** with its normal points and time reward. An unfinished word is discarded for **2 seconds**; a repeated complete word earns zero with no reward or penalty. Each outcome happens once. Tap to submit sooner or pick another letter to reset the countdown. A thin meter shows the remaining window. Pauses freeze it; ice tiles slow it to 40% speed alongside the round clock. `rules.nextLetterSeconds`, `rules.extensionAfterLength`, and `rules.extensionSecondsPerLetter` control this progression.
- No validity highlight, reward preview, or repeat warning appears before submission. The compact tray shows the current letters, paper-plane submit control, and countdown meter. Impossible prefixes still fail immediately.
- Missing a falling tile carries no penalty. At zero, the round ends. The high score is the highest total letter points, saved in the browser; the collected-word count remains separate.

## Opening and special tiles

Each round starts with randomly scattered letters supporting a **7-, 6-, 5-, and 3-letter word**, including the needed repeated letters. These choices can share tiles. The opening scales with the exposed play area, starting at **70% of the full-density target** and growing gradually as words score. Guaranteed word letters are placed first, followed by **one blank** and filler drawn from English text frequencies. Later spawns have a **5% blank chance**; ordinary letters use the same frequency distribution, with optional continuation help beginning at four selections. Blanks are plain cream tiles with a zero in the point corner, on both faces; they do not carry gold multipliers or colored-letter effects.

Special tiles are introduced gradually **within each round**, based only on successfully scored words. The first two words use ordinary letters and blanks. At **3 words**, the next eligible letter introduces gold; at **6**, ice; at **10**, magenta smoke; at **12**, fire. Milestone introductions are guaranteed through the normal top-entry stream, with gold first even if several milestones become due before the next letter arrives. Blanks do not consume introductions. Restarting resets the progression; invalid attempts and repeats do not advance it.

- **Ice:** a pale-to-deep-blue crystalline tile with bright bevels and dark-blue lettering. Selecting it slows both clocks, falling letters, rotation and supply to **40% speed for 7.5 active real seconds**. An icy dark-blue-to-white treatment rises gently from the bottom across the field. A field of 96 softly drifting snowflakes fades in only behind the rising ice edge, and dissolves with the effect. The UI stays untouched; snow pauses with the game and remains still with reduced motion. There is no slow-time badge or popup. After introduction, the ice chance is **3%** per eligible letter.
- **Gold:** a reflective gold tile with a bright moving stripe and dark-brown gold-family lettering. A bouncing **Double Score!** ribbon and gold reward sound appear only after a valid, unused word containing gold successfully scores, whether submitted manually or automatically. Picking up gold, clearing, failing, or repeating a word does not trigger this reward. A word containing one or more gold tiles earns **2× its base points**, with no multiplier stacking; time rewards remain based on the original letter points. Clearing or failing that word loses its multiplier. After introduction, the gold chance is **16%**.
- **Magenta smoke:** the entire tile is magenta with contrasting light lettering. Selecting it releases **five seconds of smoke in the same magenta palette**. After introduction, the smoke chance is **15%**.
- **Fire:** an ice-style reflective tile with a red-to-orange-to-saturated-yellow gradient, bright bevels, and dark-brown lettering. Selecting it runs both clocks, falling letters, rotation, density transitions, and arrivals at **2× speed for 5 active real seconds**. Its first introduction is guaranteed after 12 scored words; later letters have a **3%** chance. Fire and ice replace one another: the latest consumed temperature tile wins. Smoke remains independent. A warm timer rail and a short rising sound identify the burst.
- **One special per tile:** ice, gold, smoke and fire are mutually exclusive. Ordinary letters keep neutral dark ink, and blanks have no special trait. Each probability is a draw rate after its unlock, not a quota per board.
- **No separate pickups:** all specials remain usable letter tiles. A consumed smoke, ice or fire letter triggers its effect even on an invalid spelling, unless that penalty ends the round. Paused, late or rejected inputs cannot activate a tile. Repeated effects refresh their duration rather than stacking strength: 7.5 seconds for ice, five for smoke and fire.

The gameplay UI contains a coin-marked numeric score, a modeled pause button, a thin round-time rail, and a compact current-word tray with trash and paper-plane controls. There is no gameplay title, best-score label, numeric seconds-left display, or collected-word strip. The shallow top and bottom control areas leave more room for letters. Raised edges, colored highlights, contact shadows, and moving button caps make controls feel tactile; icons use palette-colored accents instead of white. Reduced motion keeps feedback readable without bouncing or moving reflective stripes.

## Fluctuating spin difficulty and word-driven letter supply

Every round begins with **zero Y-axis spin**. Over the first **45 active seconds**, a smooth curve increases letter Y rotation to the configured maximum intensity. After that, the game picks a different random target from **0%, 25%, 50%, 75%, or 100%**, taking **8–16 active seconds** to ease toward it. Intensity can rise or fall; it never leaves 0–100%. Zero intensity stops Y spin at the current angle, with no rocking or snap to upright. All existing and newly spawned letters follow the same intensity.

Letters rotate only around **Y**, with independent starting phases, directions and speeds. Their uniform cycle speed is now **12–40°/second** at full difficulty. A curved angle mapping makes them linger near either readable face and sweep quickly through the thin edge: about **84%** of each full turn is within 45° of a face, and about **4%** shows a thin edge (less than a quarter of the face width). This raises the overall turning pace while improving readability. `rotation.faceTurnRatio` controls this bias (0.25 by default; 1 restores uniform angular motion). The renderer and collision bounds share the same mapped Y angle; X and Z stay at zero. Zero difficulty and reduced motion freeze letter rotation.

Pauses and menus freeze the curve; restarting resets the 45-second opening. It uses active play time, independent of the refillable countdown. Ice effects still slow actual tile motion to 40%, while the difficulty timeline advances in active real seconds. Reduced motion suppresses letter rotation, as before. `difficulty` in `config.js` controls the ramp, transition durations and number of target intervals; `enabled: false` keeps Y spin at zero for the whole round.

Falling speed stays at **31.32 logical pixels/second**. Letter supply, word rewards, penalties, and special-tile chances do not vary with difficulty.

Replenishment stays **one pick behind**: the first selection leaves a gap, and the second and later selections can each release one replacement **above the top edge**. Replacements fall into view at the normal configured speed. Nothing materializes in the middle of the play area or at a cleared tile position. If the top is crowded or the population budget is full, the replacement stays queued until there is safe entry space. Only the initial board is scattered within the field. At round start, hidden letters bridge the opening board all the way to the top entrance. Their vertical spacing matches the live arrival cadence, with staggered safe lanes, so the starting letters and incoming stream meet without a separate wave.

Tile density starts at **70%**. Each scored word raises its target by **3 percentage points**, capped at the previous density after **10 scored words** in the current round. The actual supply eases toward that target, covering about 95% of each increase over **three simulation seconds**, instead of switching rates immediately. The opening target follows the available field area while preserving all opening word guarantees and the blank. Supply opportunities start about **1.03 seconds** apart and shorten to the existing **0.72 seconds**. The whole-field population budget scales with the responsive field size and the same density fraction. Initial letters behind the header use the same arrival spacing as the sparse stream. Each opportunity attempts one collision-safe top entry; pick replacements share the same population cap. A blocked arrival stays due and retries as soon as there is room, without accumulating a burst. Changing density preserves progress toward the next arrival. Density changes add letters through the normal top stream, never by materializing them in the field. The visible count still varies with selections and travel behind panels.

Only successfully scored words advance density, including words known from earlier rounds; invalid submissions, same-round repeats, colored-letter effects and elapsed time do not. Restarting restores 70%. Pauses freeze arrivals and blue-letter effects slow their timing as before. `density.startFraction`, `density.wordsToFull`, and `density.transitionSeconds` control the ramp and easing; a starting fraction of 1 restores the previous supply for the whole round. All targets and rates are capped at their existing full-density settings.

Unassisted spawns use normalized English text frequencies from [Peter Norvig’s Google Books analysis](https://www.norvig.com/mayzner.html): common letters such as E, T, A, O, I, and N appear more often; rare letters remain possible. This replaces both the short-word bag and the old letter string. There is no forced word completion. `letterFrequency` in `config.js` contains all 26 editable weights. They affect supply only, not Scrabble scores.

Before the fourth selection, all new letters use these frequencies. At four letters and beyond, the existing 35% continuation-help chance takes precedence when a longer unused matching word exists; all other draws still use English frequencies. Special traits follow the 3/6/10-word introduction sequence.

## Word celebrations

Submitting a valid word makes its **+points** pop up from the word tray and take a short, curved flight into the scoreboard. The displayed score changes when those points arrive, followed by a small settling pulse. Each quick submission has an independent flight, so later words cannot cancel or prematurely credit an earlier reward. The decoration does not intercept tile taps.

The engine score, saved progress and time rewards still update immediately; only the presentation of points waits for the flight. The **+seconds** label and timer refill remain beside the clock. Time labels show only credited time; a full clock shows **MAX**. Every graphic is Three.js geometry, with no HTML overlay.

Pause freezes flights. Restart and game over clear pending decorations and show the correct actual score. Reduced motion uses stationary feedback and immediate score presentation. `celebration` controls the existing timer refill and label timings; score-flight timing is defined in `three/reward-motion.mjs`.

## Discoveries and personal progress

Every accepted spelling is saved immediately to a persistent **Wordbook** on this browser and origin. A word can score once per round, and familiar words can be played again in later rounds. “NEW” means the first time that exact spelling has been recorded on this device. A wildcard discovery is included in the Wordbook; it is marked as played without a wildcard only after a later unassisted play.

The Wordbook supports length filters, alphabetical/recent/most-played sorting, search with a mesh keyboard or physical keyboard, pagination, and individual word histories. Entries show first/last play dates, play count, best word score, and whether the word has been played without a wildcard. The supplied dictionary has no definitions; the interface does not invent them.

Round results open with an encouraging compliment matched to the number of words found, including a gentle “You've got potential!” for short rounds. The panel shows the score, accepted word count, actual round words, and any new discoveries. Players can **Play Again**, open **Word Book** or **Your Progress**, inspect the complete round list, or return home. Optional collection goals remain within progress rather than crowding the home or results screens; they have no daily deadline or loss penalty. Lifetime progress includes distinct discoveries by word length; Recent play shows distinct unassisted five-, six-, and seven-letter words in the latest 20 minutes of active play. The window grows as active time accumulates and excludes pauses. Rule/dictionary changes start a fresh comparable window without deleting the Wordbook.

**Community comparison is unavailable until real player data exists.** The local rank calculation accepts only verified, stable, sufficiently populated matching cohorts and complete observation windows. Nothing sends player data to a server. Do not display estimated percentiles or infer general vocabulary ability from game performance. A production leaderboard still needs consent, account identity, a backend, server validation, and real comparison cohorts.

`progress.mjs` saves compact, immutable journal records under `clttr.progress.v1` keys and can recover earlier versioned snapshots and backup copies. Unique event IDs prevent duplicate submissions; separate operation keys preserve discoveries from concurrent tabs. New browser history is journal-first, so accepted words do not rewrite the entire collection. Storage adapters without key enumeration retain the snapshot-and-backup fallback. Legacy best scores are imported from `letterfall.best.points.v2`. Storage failures keep play working and display an explicit session-only notice. Settings use `clttr.settings.v1`. Browser storage can be cleared and is not an account backup; different ports/domains have separate collections.

## Responsive feedback and comfort

Selected tiles take a short, non-interactive trip into the tray, retaining their letter color. Accepted words receive a brief acknowledgement, with a longer accent for a first discovery or personal record. Repeated words receive a neutral zero-point response. Menu controls depress when pressed, and game events have distinct visual and sound feedback. Score and time rewards still apply immediately; these presentation effects do not introduce input delays or change the clock.

`three/audio.mjs` synthesizes soft cues for button taps, start, pause/resume, clearing, letter selection, word achievements, repeats, misses, invalid words, gold, ice, fire, smoke, low time, and game over. Sound unlocks only after an input gesture. Effects are enabled for first-time users while saved mute choices are retained; ambient music and haptics remain opt-in. Ambient music pauses in menus while interaction feedback stays available. Hiding the document cancels all voices and haptics, and muting effects cancels pending feedback. Low-time cues have a cooldown. Reduced motion follows the device preference initially and can be changed in Settings; it suppresses decorative transfer/pulse movement and letter tumbling. Effects still activate with reduced motion enabled; pause freezes their duration.

## Experimental word extension help

Once **four letters are selected**, newly spawned letters have a **35% chance** to come from unused longer dictionary words beginning with the **entire current spelling**. The next letter receives full weight; the letter after it receives 40% weight. Each matching word contributes, so continuations shared by several words appear more often. The other 65% of spawns use the English-frequency sampler.

The candidates update as more letters are selected, including every viable interpretation of a wildcard. Help stops when the word is submitted, cleared, misspelled, or has no unused longer continuation. It depends on selected letters, not collected-word count. Existing falling tiles do not change, and no word-validity hint is shown. The opening's existing word guarantees are preserved.

Tune `wordAssist` in `config.js`: `enabled` toggles the experiment, `chance` controls its strength, `minPrefixLength` sets the trigger, `lookAhead` sets how many following positions contribute, and `nextLetterDecay` controls the weight of later positions. Set `enabled: false` or `chance: 0` to restore the original supply throughout the round.

## Tune timing and motion

Edit **`config.js`**, save, and refresh. Its comments explain the settings, units, and limits. No build is required.

| Group | Controls |
| --- | --- |
| `timer` | Starting, maximum, and low-time seconds |
| `rules` | Minimum word length; `nextLetterSeconds` base window, `extensionAfterLength` threshold, and `extensionSecondsPerLetter` growth |
| `combo` | Legacy quick-word-chain bookkeeping; no longer modifies the letter window or adds a gameplay label |
| `rewards` | Seconds per point, word-length rates, short-word base caps |
| `penalties` | Clear and misspelling penalties; the retained repeat setting is ignored by current rules |
| `opening.mobileTiles` | Minimum opening population; the full-field target can increase it |
| `wildcards` | Blank probability and guaranteed opening blank count |
| `falling` | Constant speed, minimum top-drop budget, visible-choice target and maximum, replacement fade above the screen, spawn interval; legacy p5 curve settings remain separate |
| `density` | Starting supply fraction, scored-word cap, and easing duration |
| `letterFrequency` | Relative English letter frequencies for ordinary spawns and opening filler |
| `celebration` | Reward-label duration, timer refill and score-count duration |
| `wordAssist` | Extension-help toggle, trigger length, probability, lookahead, later-letter weight |
| `rotation` | Full-intensity letter Y speed bounds, high-value point threshold, turning direction and reduced-motion preference; old tumble settings are unused |
| `difficulty` | Enable, initial ramp duration, minimum/maximum transition duration, and target intervals (`levelSteps: 4` gives five target intensities including zero and full) |
| `physics` | Contact gap, soft restitution, lateral damping, fall-speed recovery, solver passes, wall padding |
| `letterEffects` | Smoke, ice and fire probabilities after their scored-word milestones |
| `specialTiles` | Gold/ice/smoke scored-word milestones (3/6/10); legacy warmupSeconds is unused |
| `bonusLetters` | Gold chance and score multiplier |
| `hourglass` | Blue-letter effect duration and slow-time scale; independent pickup settings are legacy |
| `fire` | Speed-burst duration and world/clock multiplier |
| `smoke` | Duration, patch count, radius, opacity, fade-in/out timing and bounded drift; legacy entry/exit settings are unused by the anchored smoke |
| `tiles.mobileSize`, `tiles.gapPixels` | Tile size and supply spacing |
| `letterPoints` | Per-letter score values |
| `feedback.durationSeconds` | Feedback visibility duration |
| `engagement` | Selection transfer, word acknowledgement, discovery accent, and low-time sound cooldown |

Three.js falling speed stays at `falling.pixelsPerSecond` (31.32 by default), regardless of how long the round lasts or how many words are collected. Letter supply ramps with scored words toward the preserved 0.72-second mobile opportunity interval, constrained by the scaled population cap and available top-entry space. Countdown and effect durations keep their existing time scale. Letter cycle speed at full difficulty uses 12–40 degrees per second, with faster edge crossings and slower face-on motion. Set both letter rotation limits to zero to stop their rotation, or to the same value for a shared full-intensity speed. The legacy min/max/increase-per-word fields only affect the archived p5 prototype.

All letters rotate continuously around **Y only**, scaled by difficulty. Both faces carry correctly oriented letters, scores, and gold markings. High-value letters use the upper half of the configured speed range. Each letter keeps its turning direction, with no abrupt reversals. The former tumble chances, secondary axes, rocking, rest periods, and initial screen-plane tilt are no longer used by the Three.js renderer. Minimum and maximum speeds are validated, and viewport size does not change difficulty.

## Tile contact

The Three.js version uses projected oriented-box collision detection with a two-unit safety gap. The bounds follow letter Y rotation and include the changing projected tile thickness. Contacts separate the rotated faces, transfer a small impulse, and damp sideways motion. Tiles recover their normal falling speed gently; restitution is only 0.08. The simulation substeps at 120 Hz and solves contacts iteratively, so turning letters cannot pass through one another. The field sides also keep tiles in bounds. Pause freezes physics, and the hourglass slows the same simulation. Hover lifts a tile without enlarging its collision shape.

## Tune the art

**`three/design.js`** controls the special tile palettes, light direction, cel threshold, tile extrusion/bevel, raised-letter depth, camera layout, and maximum pixel ratio. Tiles have three-segment bevels. Magenta smoke tiles share their hue with the clouds; ice uses a blue gradient and bright bevels; gold uses a moving reflective stripe; fire uses the ice-style facets with a red-to-yellow gradient. Raised letters use matching high-contrast materials. The background now moves from light magenta through pink and peach into lemon yellow. `DESIGN.atmosphere.grainAmount` controls its subtle, static grain; `fogAmount` controls the mist. The older flat color/border settings in `config.js` apply only to the archived p5 version.

- `three/materials.js`: cel shaders for ordinary objects, crystalline ice and reflective gold shaders, and matching smoke/field-tint materials.
- `three/layout.mjs`: world bounds and panel placement within the portrait canvas, exposed-choice target.
- `three/spawn.mjs`: collision-safe top entry, one-pick-delayed top-entry replenishment, and scattered opening placement.
- `three/reward-motion.mjs`: animated score/time presentation without delaying actual rewards.
- `three/letter-supply.mjs`: English-frequency sampling, cached dictionary-prefix lookup, and optional weighted continuation spawns.
- `three/physics.mjs`: soft contacts, difficulty-controlled, face-biased Y-only letter spin.
- `three/difficulty.mjs`: active-time opening ramp and bounded random smooth transitions.
- `three/pickup-facing.mjs`: legacy standalone-pickup helper, unused by the current game.
- `three/tile-layout.mjs`: separate, scale-aware zones for the main glyph, score multiplier, and point value; each object is fitted from its actual mesh bounds.
- `three/icons.js`: one consistent set of modeled arrows, trash can, paper plane, Undo, pause, audio, hourglass, and grenade icons.
- `three/scene.js`: actual extruded tile/letter geometry, modeled icons, shared geometry, particles, full-field rendering, raycasting, and moving smoke.
- `three/ui.js`: mesh text, modeled controls, timer, menus, collection pagination, keyboard-focus marker, and UI raycasts. Text is extruded font geometry, not a bitmap or HTML texture. Beveled plinths, layered button caps, and soft contact shadows give the interface depth. CLTTR branding appears on the home screen; gameplay uses only the compact score/pause/time controls and current-word tray.
- `three/app.js`: input, round presentation, settings, audio, and collection integration; it reuses the original pure rule engine.
- `progress.mjs`: local discoveries, goals, round summaries, recent-play measurements, and conservative community-rank validation.
- `three/audio.mjs`: gesture-unlocked synthesized sound, ambient audio, and optional haptics.
- `three/style.css`: only canvas sizing and page placement. No game graphics are styled with CSS.

The references were sampled with equal per-image weight after excluding edge UI. Their overall mean is **#EEB18A**. Color-family means are cream **#FAE7B5**, peach **#F59C81**, muted plum **#8E6D73**, and mint **#A8D8AC**. The final plum pair is darker for readability. See **`three/palette-analysis.json`** for the sampling method, per-reference means, and supplied swatches. The art itself is generated with geometry and shaders; the reference images are not included as game assets.

## Shared files and licenses

- `engine.js`: tested word validation, score, time, penalties, and effects.
- `motion.js`, `opening.js`, `effects.js`: rotation, opening guarantees, and effect placement.
- `data/words.js`: **198,294** Wordnik English word-game entries. Sources, license, and rebuilding are in `data/README.md`. This is not an official Scrabble tournament dictionary.
- `vendor/three/`: pinned local Three.js and Helvetiker tile font, with their licenses and source information.
- `vendor/fonts/`: Fredoka Semibold rounded UI lettering, converted to local mesh font data, with its SIL Open Font License and source information.
- `classic.html`, `sketch.js`, `style.css`, `vendor/p5.min.js`: the previous p5 prototype, retained separately. It is not loaded by the Three.js game.
- Personal bests retain the existing `letterfall.best.points.v2` storage key.

## Verify

```sh
npm test
```

The automated tests cover dictionary and wildcard resolution, unused-match preference, zero-point blank rewards, ambiguous-prefix continuation, neutral zero-point repeats and invalid-word penalties, time caps, gold, pause/restart, colored-letter probabilities, immediate effect selection, suppression after late/paused input, special effects, anchored, fading smoke, English frequencies and word assistance, opening guarantees, portrait-world bounds, delayed top-entry replenishment across both picks and maintenance, blocked-entry queuing, continuous coverage through the opening handoff, automatic word submission, per-letter expiry and reset, length-based window growth independent of combos, late-input races, paused deadlines, hourglass-scaled letter deadlines and effect-expiry integration, collision safety, rotation, the 45-second difficulty ramp and bounded random transitions, and reward flights with arrival-timed score presentation. Engagement tests cover accepted-event metadata, discovery deduplication and recovery, concurrent-tab persistence, wildcard provenance, recent-play windows, goal completion, score migration, audio cancellation, reduced motion, and mesh-menu controls.

Browser validation checks the full-height portrait phone layout and centered desktop frame, mesh button raycasts, keyboard focus, wildcard submission and scoring, replenishment, clearing, menus, round results, collection, moving smoke, and the absence of HTML interface elements. A WebGL-capable modern browser is required.
