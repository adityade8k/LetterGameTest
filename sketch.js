(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const game = new Letterfall.WordGame(LETTERFALL_WORDS);
  const config = game.config;
  const motion = LetterfallMotion;
  // Point records are separate from the original word-count records.
  const storageKey = 'letterfall.best.points.v2';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ui = Object.fromEntries(['time-value', 'timer', 'timer-fill', 'score', 'best', 'pause', 'sound', 'sound-waves', 'overlay', 'intro-card', 'pause-card', 'end-card', 'current-word', 'submit-word', 'submit-label', 'word-hint', 'undo', 'word-list', 'word-count', 'feedback', 'announcement', 'slow-status', 'smoke-status'].map(id => [id, $(id)]));
  let best = readBest();
  let roundBest = best;
  let soundOn = false;
  let audioContext;
  let feedbackUntil = 0;
  let lastPhase;
  let lastWord;
  let lastScore = -1;
  let lastSecond;
  let tiles = [];
  let particles = [];
  let smokePatches = [];
  let letterBag = [];
  let spawnClock = 0;
  let tileSize = config.tiles.desktopSize;
  let canvas;
  let sketch;
  const wordSeeds = 'CAT DOG SUN RED TOP SEA RUN MAP PEN CUP HAT BED BOX SKY ART TEA FOX JAM KEY ZIP NET WEB AIR GEM ICE JET OAK VAN WAX YES ZOO RAIN MOON STAR TREE FISH BIRD BOOK HOME LOVE PLAY SAND WAVE WIND FIRE SNOW GOLD BLUE MINT GLOW PEAR PLUM LIME RICE BEAN CAKE PINK SONG WORD CATCH LIGHT SMILE DREAM CLOUD GREEN'.split(' ');
  const weightedLetters = 'EEEEEEEEEEEEAAAAAAAAAIIIIIIIIIOOOOOOOOTTTTTTTNNNNNNRRRRRRSSSSSSLLLLDDDDUUUUCCMMFFGGPPWWYYBHVKJXQZ';

  const format = value => String(Number(value.toFixed(2)));
  const tileSizeFor = width => width < config.tiles.mobileBreakpoint ? config.tiles.mobileSize : config.tiles.desktopSize;
  function configureCopy() {
    ui.timer.setAttribute('aria-valuemax', config.timer.maxSeconds);
    $('reward-rule').textContent = '5+ letters = big time';
    $('repeat-rule').textContent = `−${format(config.penalties.repeatWordSeconds)}s repeat`;
    $('start-rules').textContent = `${format(config.timer.startSeconds)} seconds · ${config.rules.minWordLength}+ letters · no repeats`;
    $('points-instruction').textContent = `Base time: 3 letters up to ${format(config.rewards.threeLetterMaxSeconds)}s; 4 letters up to ${format(config.rewards.fourLetterMaxSeconds)}s; 5+ letters ${format(config.rewards.secondsPerPoint * config.rewards.longWordMultiplier)}s per point. Gold adds extra.`;
    $('penalties-instruction').textContent = `Undo clears your word: −${format(config.penalties.clearWordSeconds)}s. Repeat: −${format(config.penalties.repeatWordSeconds)}s.`;
    $('invalid-instruction').textContent = `Impossible or unfinished word: −${format(config.penalties.invalidWordSeconds)}s.`;
    $('time-cap').textContent = `Time is capped at ${format(config.timer.maxSeconds)} seconds.`;
    $('undo-cost').textContent = `−${format(config.penalties.clearWordSeconds)}s`;
    ui.undo.title = `Clear whole word · −${format(config.penalties.clearWordSeconds)}s · Backspace`;
    ui.undo.setAttribute('aria-label', `Clear whole word, ${format(config.penalties.clearWordSeconds)} second penalty`);
    $('special-legend').textContent = `⌛ SLOW ${format(config.hourglass.durationSeconds)}s   ·   SMOKE ${format(config.smoke.durationSeconds)}s   ·   GOLD ×${format(config.bonusLetters.timeMultiplier)} TIME`;
    $('special-legend').title = `Some new words of ${config.hourglass.minWordLength}+ letters drop an hourglass: tap it or press 1 to slow time. Grenade-marked letters release smoke when selected. Gold bonuses add extra time after short-word caps.`;
  }
  configureCopy();

  function readBest() {
    try { const value = Number(localStorage.getItem(storageKey)); return Number.isSafeInteger(value) && value >= 0 ? value : 0; }
    catch { return 0; }
  }
  function saveBest() {
    if (game.score <= best) return;
    best = game.score;
    try { localStorage.setItem(storageKey, String(best)); } catch { /* A blocked storage area must not interrupt the round. */ }
  }
  function tone(kind) {
    if (!soundOn) return;
    try {
      audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
      const notes = kind === 'word' ? [523, 659, 784] : kind === 'penalty' ? [196, 147] : [370 + game.current.length * 35];
      notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const at = audioContext.currentTime + index * .075;
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.055, at + .01); gain.gain.exponentialRampToValueAtTime(.001, at + .16);
        oscillator.connect(gain); gain.connect(audioContext.destination);
        oscillator.start(at); oscillator.stop(at + .18);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    } catch { /* Audio is an optional enhancement. */ }
  }
  function feedback(message, kind = '') {
    ui.feedback.textContent = message;
    ui.feedback.className = `feedback visible ${kind}`;
    feedbackUntil = performance.now() + config.feedback.durationSeconds * 1000;
  }
  function handle(result) {
    if (!result) return;
    if (result.type === 'word') {
      if (result.hourglassOffered) offerHourglass();
      saveBest();
      const rewardLabel = result.reward + .00001 < result.requestedReward ? 'clock topped up' : `+${format(result.reward)}s`;
      feedback(`${result.word} · +${result.points} pts · ${rewardLabel}${result.bonusReward > 0 ? ' · gold bonus' : ''}${result.hourglassOffered ? ' · ⌛ incoming' : ''}`, 'good');
      tone('word');
    } else if (result.type === 'penalty') {
      const reason = result.reason === 'repeat' ? 'already collected' : result.reason === 'clear' ? 'word cleared' : result.reason === 'spelling' ? 'no word starts that way' : 'not a complete word';
      feedback(`${result.word} — ${reason}. −${format(result.penalty)}s`, 'bad');
      const panel = document.querySelector('.word-panel');
      panel.classList.remove('shake');
      void panel.offsetWidth;
      panel.classList.add('shake');
      tone('penalty');
    } else if (result.type === 'effect') {
      if (result.effect === 'smoke') smokePatches = LetterfallEffects.smokePatches(sketch.width, sketch.height, config.smoke);
      const message = result.effect === 'hourglass' ? `Slow time · ${Math.round(config.hourglass.timeScale * 100)}% speed · ${format(result.duration)}s` : `Smoke screen · ${format(result.duration)}s`;
      feedback(message, result.effect === 'hourglass' ? 'slow' : 'smoke');
      tone(result.effect === 'hourglass' ? 'word' : 'penalty');
    } else if (result.type === 'letter') tone('letter');
    if (result.smokeTriggered) {
      smokePatches = LetterfallEffects.smokePatches(sketch.width, sketch.height, config.smoke);
      const smokeMessage = `Smoke screen · ${format(config.smoke.durationSeconds)}s`;
      feedback(result.type === 'penalty' ? `${ui.feedback.textContent} · ${smokeMessage}` : smokeMessage, result.type === 'penalty' ? 'bad' : 'smoke');
      if (result.type !== 'penalty') tone('penalty');
    }
    sync();
  }

  function sync() {
    const seconds = Math.ceil(game.remaining);
    if (seconds !== lastSecond) {
      ui['time-value'].textContent = seconds;
      ui.timer.setAttribute('aria-valuenow', seconds);
      document.querySelector('.time-panel').classList.toggle('low', game.remaining <= config.timer.lowTimeSeconds);
      lastSecond = seconds;
    }
    ui['timer-fill'].style.transform = `scaleX(${game.remaining / config.timer.maxSeconds})`;
    const slowActive = game.effects.hourglass > 0, smokeActive = game.effects.smoke > 0;
    ui['slow-status'].hidden = !slowActive;
    ui['smoke-status'].hidden = !smokeActive;
    ui['slow-status'].textContent = `⌛ Slow time · ${Math.ceil(game.effects.hourglass)}s`;
    ui['smoke-status'].textContent = `Smoke · ${Math.ceil(game.effects.smoke)}s`;
    document.querySelector('.time-panel').classList.toggle('slowed', slowActive);
    $('playfield').classList.toggle('has-effects', slowActive || smokeActive);
    if (game.current !== lastWord || game.phase !== lastPhase) {
      ui['current-word'].replaceChildren();
      if (game.current) {
        for (const tile of game.currentTiles) {
          const letter = document.createElement('span');
          letter.textContent = tile.letter;
          letter.className = tile.bonus ? 'selected-letter bonus-letter' : 'selected-letter';
          if (tile.bonus) letter.title = `×${format(config.bonusLetters.timeMultiplier)} time contribution; extra time is added after short-word caps; normal points`;
          ui['current-word'].append(letter);
        }
      }
      else {
        const placeholder = document.createElement('span');
        placeholder.className = 'word-placeholder';
        placeholder.textContent = game.phase === 'running' ? 'Catch a few letters…' : 'Your next word starts here';
        ui['current-word'].append(placeholder);
      }
      ui['current-word'].classList.toggle('long', game.current.length > 9);
      const playable = game.phase === 'running';
      ui['submit-word'].disabled = !playable || !game.current;
      ui.undo.disabled = !playable || !game.current;
      ui['submit-word'].setAttribute('aria-label', game.current ? `Submit ${game.current}` : 'Submit current word');
      ui['word-hint'].textContent = game.current ? `${game.current.length} ${game.current.length === 1 ? 'letter' : 'letters'} · tap to submit` : 'Pick letters in order';
      ui.announcement.textContent = game.current ? `Current word: ${game.current.split('').join(' ')}. ${ui['word-hint'].textContent}.` : 'Current word is empty.';
      lastWord = game.current;
    }
    if (game.score !== lastScore) {
      ui.score.textContent = String(game.score).padStart(2, '0');
      ui.best.textContent = String(best).padStart(2, '0');
      ui['word-count'].textContent = game.wordCount;
      document.querySelector('.best-stat').classList.toggle('record', game.score > roundBest);
      ui['word-list'].replaceChildren();
      if (!game.wordCount) {
        const empty = document.createElement('p'); empty.className = 'empty-collection'; empty.textContent = 'Nothing here yet. Let’s change that.'; ui['word-list'].append(empty);
      } else {
        for (const word of [...game.words].reverse()) {
          const chip = document.createElement('span'); chip.className = 'word-chip'; chip.textContent = word;
          const points = document.createElement('span'); points.className = 'word-chip-points'; points.textContent = `${game.pointsFor(word)} pts`;
          chip.append(points); ui['word-list'].append(chip);
        }
        ui['word-list'].scrollTop = 0;
      }
      lastScore = game.score;
    }
    if (game.phase !== lastPhase) {
      const phase = game.phase;
      ui.overlay.hidden = phase === 'running';
      ui['intro-card'].hidden = phase !== 'ready';
      ui['pause-card'].hidden = phase !== 'paused';
      ui['end-card'].hidden = phase !== 'over';
      ui.pause.disabled = phase === 'ready' || phase === 'over';
      ui.pause.setAttribute('aria-label', phase === 'paused' ? 'Resume game' : 'Pause game');
      ui.pause.title = phase === 'paused' ? 'Resume · Escape' : 'Pause · Escape';
      ui.pause.innerHTML = phase === 'paused' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12"/></svg>';
      if (phase === 'over') {
        tiles = tiles.filter(tile => tile.kind !== 'hourglass');
        updateCanvasLabel();
        $('final-score').textContent = game.score;
        $('final-label').textContent = game.score === 1 ? 'point earned' : 'points earned';
        $('end-eyebrow').textContent = game.score > roundBest ? '✳ A NEW PERSONAL BEST' : 'THAT’S A WRAP';
        const longest = game.words.reduce((a, b) => b.length > a.length ? b : a, '');
        $('result-detail').textContent = longest ? `${game.wordCount} ${game.wordCount === 1 ? 'word' : 'words'} · Longest: ${longest.toLowerCase()} · Best: ${best} pts` : 'A fresh page is one play away.';
        ui.announcement.textContent = `Time’s up. ${game.score} points from ${game.wordCount} words. Personal best: ${best} points.`;
        $('restart').focus({ preventScroll: true });
      }
      if (phase === 'paused') $('resume').focus({ preventScroll: true });
      lastPhase = phase;
    }
  }

  function begin() {
    roundBest = best;
    game.start(performance.now());
    particles = []; smokePatches = []; letterBag = []; spawnClock = 0;
    seedTiles();
    ui.feedback.className = 'feedback';
    feedbackUntil = 0;
    sync();
    canvas.elt.focus({ preventScroll: true });
  }
  function togglePause() {
    if (game.phase === 'running') handle(game.pause(performance.now()));
    else if (game.phase === 'paused') { game.resume(performance.now()); sync(); canvas.elt.focus({ preventScroll: true }); }
  }
  $('start').addEventListener('click', begin);
  $('restart').addEventListener('click', begin);
  $('resume').addEventListener('click', togglePause);
  ui.pause.addEventListener('click', togglePause);
  ui['submit-word'].addEventListener('click', () => { handle(game.submit(performance.now())); if (game.phase === 'running') canvas.elt.focus({ preventScroll: true }); });
  ui.undo.addEventListener('click', () => { handle(game.undo(performance.now())); if (game.phase === 'running') canvas.elt.focus({ preventScroll: true }); });
  ui.sound.addEventListener('click', () => {
    soundOn = !soundOn;
    ui.sound.setAttribute('aria-pressed', String(soundOn));
    ui.sound.setAttribute('aria-label', `Turn sound ${soundOn ? 'off' : 'on'}`);
    ui.sound.title = `Turn sound ${soundOn ? 'off' : 'on'}`;
    ui['sound-waves'].setAttribute('d', soundOn ? 'M15 8c3 2 3 6 0 8M18 5c5 4 5 10 0 14' : 'm16 9 5 6m0-6-5 6');
    if (soundOn) tone('letter');
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.phase === 'running') handle(game.pause(performance.now())); });
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (event.key === 'Escape') { event.preventDefault(); togglePause(); return; }
    if (game.phase !== 'running') return;
    if (event.key === 'Enter' && event.target.tagName !== 'BUTTON' && event.target.tagName !== 'A') { event.preventDefault(); handle(game.submit(performance.now())); }
    else if (event.key === 'Backspace') { event.preventDefault(); handle(game.undo(performance.now())); }
    else if (event.key === '1') {
      event.preventDefault();
      const hourglass = tiles.find(tile => tile.kind === 'hourglass' && tile.y > tileSize / 2 && tile.y < sketch.height - tileSize / 2);
      if (hourglass) pick(hourglass);
      else feedback(`Look out for hourglasses after ${config.hourglass.minWordLength}+ letter words.`);
    }
    else if (/^[a-z]$/i.test(event.key)) {
      event.preventDefault();
      const available = tiles.filter(tile => tile.letter === event.key.toUpperCase() && tile.y > tileSize / 2 && tile.y < sketch.height - tileSize / 2).sort((a, b) => b.y - a.y);
      if (available.length) pick(available[0]);
      else feedback(`No ${event.key.toUpperCase()} in reach yet. Keep an eye out.`);
    }
  });

  function columns() { return Math.max(4, Math.floor(sketch.width / (tileSize + config.tiles.gapPixels))); }
  function makeTile(letter, column, y) {
    return {
      letter, kind: 'letter', bonus: Math.random() < config.bonusLetters.chance,
      grenade: Math.random() < config.smoke.letterChance,
      x: (column + .5) * sketch.width / columns(), y,
      tilt: motion.radians((Math.random() * 2 - 1) * config.rotation.maxInitialAngleDegrees),
      rotationSpeed: motion.rotationSpeed(config.rotation),
    };
  }
  function seedTiles() {
    const count = sketch.width < config.tiles.mobileBreakpoint ? config.opening.mobileTiles : config.opening.desktopTiles;
    const opening = LetterfallOpening.lettersFor(game.dictionary, count, weightedLetters);
    const positions = LetterfallOpening.scatter(opening.letters.length, sketch.width, sketch.height, tileSize, config.opening);
    tiles = opening.letters.map((letter, index) => ({ ...makeTile(letter, 0, 0), ...positions[index] }));
    updateCanvasLabel();
  }
  function nextLetter() {
    if (Math.random() < .22) return weightedLetters[Math.floor(Math.random() * weightedLetters.length)];
    if (!letterBag.length) {
      letterBag = wordSeeds[Math.floor(Math.random() * wordSeeds.length)].split('');
      for (let index = letterBag.length - 1; index > 0; index--) { const other = Math.floor(Math.random() * (index + 1)); [letterBag[index], letterBag[other]] = [letterBag[other], letterBag[index]]; }
    }
    return letterBag.pop();
  }
  function spawn() {
    const count = columns();
    const available = [];
    for (let column = 0; column < count; column++) {
      const x = (column + .5) * sketch.width / count;
      if (!tiles.some(tile => Math.abs(tile.x - x) < tileSize && tile.y < tileSize * 1.7)) available.push(column);
    }
    if (!available.length) return false;
    const column = available[Math.floor(Math.random() * available.length)];
    tiles.push(makeTile(nextLetter(), column, -tileSize));
    updateCanvasLabel();
    return true;
  }
  function offerHourglass() {
    tiles = tiles.filter(tile => tile.kind !== 'hourglass');
    const position = LetterfallEffects.hourglassPosition(sketch.width, tileSize, tiles);
    tiles.push({ ...position, kind: 'hourglass', letter: null, tilt: 0, rotationSpeed: motion.rotationSpeed(config.rotation) });
    updateCanvasLabel();
  }
  function updateCanvasLabel() {
    if (!canvas) return;
    const label = `Visible tiles: ${tiles.filter(tile => tile.y > tileSize / 2 && tile.y < sketch.height - tileSize / 2).map(tile => tile.kind === 'letter' ? `${tile.letter}${tile.bonus ? ' (gold)' : ''}${tile.grenade ? ' (grenade)' : ''}` : 'hourglass pickup').join(', ')}. Press a letter key to catch it; grenade-marked letters release smoke. Some ${config.hourglass.minWordLength}+ letter words drop an hourglass; press 1 to collect it. Enter to submit.`;
    if (canvas.elt.getAttribute('aria-label') !== label) canvas.attribute('aria-label', label);
  }
  function pick(tile) {
    const result = tile.kind === 'letter' ? game.select(tile.letter, performance.now(), { bonus: tile.bonus, grenade: tile.grenade }) : game.collectHourglass(performance.now());
    if (result.type === 'letter' || result.type === 'penalty' || result.type === 'effect') {
      tiles = tiles.filter(item => item !== tile);
      if (!reducedMotion) for (let index = 0; index < 7; index++) particles.push({ x: tile.x, y: tile.y, vx: (Math.random() - .5) * 110, vy: -20 - Math.random() * 90, life: .45, color: result.type === 'penalty' ? '#b6533e' : '#7e9a44' });
      updateCanvasLabel();
    }
    handle(result);
  }
  function hit(tile, x, y) {
    return motion.hitTile(tile, x, y, tileSize, config.tiles.hitPaddingPixels);
  }

  function drawSpecialIcon(p, kind, hoverOffset) {
    p.push();
    p.translate(0, hoverOffset - 1);
    p.scale(tileSize / 58);
    p.stroke(config.tiles.textColor); p.strokeWeight(1.8); p.noFill();
    if (kind === 'hourglass') {
      p.line(-12, -16, 12, -16); p.line(-12, 16, 12, 16);
      p.beginShape();
      for (const [x, y] of [[-10,-14],[10,-14],[10,-9],[3,0],[10,9],[10,14],[-10,14],[-10,9],[-3,0],[-10,-9]]) p.vertex(x,y);
      p.endShape(p.CLOSE);
      p.noStroke(); p.fill(config.tiles.textColor);
      p.triangle(-7, -9, 7, -9, 0, -2); p.triangle(-7, 11, 7, 11, 0, 4);
    } else {
      p.ellipse(0, 4, 21, 26);
      p.rect(0, -11, 8, 5, 1);
      p.line(-2, -15, 9, -15); p.line(9, -15, 14, -5);
      p.circle(-7, -15, 5);
      p.line(-8, 1, 8, 1); p.line(-7, 8, 7, 8); p.line(0, -7, 0, 16);
    }
    p.pop();
  }
  function drawSmoke(p) {
    if (game.effects.smoke <= 0 || !smokePatches.length) return;
    const context = p.drawingContext;
    const tint = p.color(config.smoke.color);
    const rgb = `${p.red(tint)},${p.green(tint)},${p.blue(tint)}`;
    const age = config.smoke.durationSeconds - game.effects.smoke;
    const opacity = config.smoke.opacity * Math.min(1, age / .15, game.effects.smoke / .35);
    context.save();
    context.globalAlpha = opacity;
    for (const patch of smokePatches) {
      const radius = Math.min(p.width, p.height) * patch.radius;
      const drift = reducedMotion ? 0 : Math.sin(game.elapsed * .6 + patch.phase) * radius * .06;
      const x = patch.x * p.width + drift, y = patch.y * p.height;
      for (const [dx, dy, scale] of [[-.35,-.27,.72],[.38,-.15,.75],[-.18,.36,.74],[.3,.28,.66],[0,0,1]]) {
        const cx = x + dx * radius, cy = y + dy * radius, r = radius * scale;
        const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, r);
        gradient.addColorStop(0, `rgba(${rgb},1)`);
        gradient.addColorStop(.65, `rgba(${rgb},1)`);
        gradient.addColorStop(.85, `rgba(${rgb},0.92)`);
        gradient.addColorStop(1, `rgba(${rgb},0)`);
        context.fillStyle = gradient;
        context.beginPath(); context.arc(cx, cy, r, 0, Math.PI * 2); context.fill();
      }
    }
    context.restore();
  }

  sketch = new p5(p => {
    p.setup = () => {
      sketch = p;
      const host = $('canvas-host');
      canvas = p.createCanvas(host.clientWidth, host.clientHeight);
      canvas.parent(host);
      canvas.attribute('tabindex', '0');
      canvas.attribute('role', 'application');
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
      p.textFont('Avenir Next, Avenir, Segoe UI, sans-serif');
      p.textAlign(p.CENTER, p.CENTER);
      p.rectMode(p.CENTER);
      tileSize = tileSizeFor(p.width);
      seedTiles();
      sync();
      canvas.elt.addEventListener('pointerdown', event => {
        if (game.phase !== 'running' || (event.pointerType === 'mouse' && event.button !== 0)) return;
        event.preventDefault();
        canvas.elt.focus({ preventScroll: true });
        const bounds = canvas.elt.getBoundingClientRect();
        const x = (event.clientX - bounds.left) * p.width / bounds.width;
        const y = (event.clientY - bounds.top) * p.height / bounds.height;
        const tile = [...tiles].reverse().find(tile => hit(tile, x, y));
        if (tile) pick(tile);
      });
      new ResizeObserver(() => {
        const width = host.clientWidth, height = host.clientHeight;
        if (width === p.width && height === p.height) return;
        const oldWidth = p.width, oldHeight = p.height;
        tileSize = tileSizeFor(width);
        for (const tile of tiles) { tile.x = tile.x / oldWidth * width; tile.y = tile.y / oldHeight * height; }
        p.resizeCanvas(width, height);
      }).observe(host);
    };
    p.draw = () => {
      const now = performance.now();
      handle(game.advance(now));
      const dt = Math.min(p.deltaTime / 1000, .05);
      if (game.phase === 'running') {
        const worldDt = dt * game.timeScale;
        const speed = Math.min(config.falling.minPixelsPerSecond + game.wordCount * config.falling.increasePerWord, config.falling.maxPixelsPerSecond);
        for (const tile of tiles) {
          tile.y += speed * worldDt * (tile.kind === 'hourglass' ? config.hourglass.speedMultiplier : tile.grenade ? config.smoke.letterSpeedMultiplier : 1);
          if (!(reducedMotion && config.rotation.respectReducedMotion)) tile.tilt = motion.advanceAngle(tile.tilt, tile.rotationSpeed, worldDt);
        }
        if (tiles.some(tile => tile.kind === 'hourglass' && tile.y >= p.height + tileSize)) game.discardHourglass();
        tiles = tiles.filter(tile => tile.y < p.height + tileSize && (tile.kind !== 'hourglass' || game.hourglassOffer));
        spawnClock += worldDt;
        const interval = p.width < config.tiles.mobileBreakpoint ? config.falling.mobileSpawnSeconds : config.falling.desktopSpawnSeconds;
        if (spawnClock >= interval) { spawnClock = 0; spawn(); }
        updateCanvasLabel();
      }
      p.clear();
      let hovered = false;
      for (const tile of tiles) {
        const hover = game.phase === 'running' && hit(tile, p.mouseX, p.mouseY);
        hovered ||= hover;
        const hoverOffset = hover && !reducedMotion ? -2 : 0;
        const fill = tile.kind === 'hourglass' ? config.hourglass.color : tile.bonus ? config.bonusLetters.color : config.tiles.color;
        const border = tile.bonus ? config.bonusLetters.borderColor : config.tiles.borderColor;
        p.push();
        p.translate(tile.x, tile.y);
        p.rotate(tile.tilt);
        p.noStroke(); p.fill('#253e3215'); p.rect(1, 4, tileSize, tileSize, 9);
        p.stroke(hover ? config.tiles.hoverBorderColor : border); p.strokeWeight(hover ? 2 : 1); p.fill(fill); p.rect(0, hoverOffset, tileSize, tileSize, 9);
        if (tile.kind === 'letter') {
          p.noStroke(); p.fill(config.tiles.textColor); p.textSize(tileSize * .52); p.textStyle(p.NORMAL); p.text(tile.letter, -1, -2 + hoverOffset);
          p.fill(config.tiles.pointColor); p.textSize(tileSize * .18); p.textAlign(p.RIGHT, p.BOTTOM); p.text(config.letterPoints[tile.letter], tileSize / 2 - 6, tileSize / 2 - 5 + hoverOffset);
          if (tile.bonus) { p.textSize(tileSize * .16); p.textAlign(p.LEFT, p.TOP); p.text(`×${format(config.bonusLetters.timeMultiplier)}`, -tileSize / 2 + 5, -tileSize / 2 + 4 + hoverOffset); }
          if (tile.grenade) {
            p.push();
            p.translate(tileSize / 2 - 10, -tileSize / 2 + 11 + hoverOffset);
            p.noStroke(); p.fill('#e5e9de'); p.circle(0, 0, tileSize * .34);
            p.scale(.46); drawSpecialIcon(p, 'smoke', 0);
            p.pop();
          }
        } else {
          drawSpecialIcon(p, tile.kind, hoverOffset);
          p.noStroke(); p.fill(config.tiles.pointColor); p.textSize(tileSize * .14); p.textAlign(p.RIGHT, p.BOTTOM); p.text(`${format(config[tile.kind].durationSeconds)}s`, tileSize / 2 - 4, tileSize / 2 - 4 + hoverOffset);
        }
        p.pop();
      }
      if (game.phase === 'running') {
        for (const particle of particles) {
          particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 230 * dt;
          p.noStroke(); const color = p.color(particle.color); color.setAlpha(Math.max(0, particle.life / .45) * 255); p.fill(color); p.circle(particle.x, particle.y, 4);
        }
        particles = particles.filter(particle => particle.life > 0);
      }
      drawSmoke(p);
      p.cursor(hovered ? p.HAND : p.ARROW);
      if (feedbackUntil && now > feedbackUntil) { ui.feedback.classList.remove('visible'); feedbackUntil = 0; }
      sync();
    };
  });
})();
