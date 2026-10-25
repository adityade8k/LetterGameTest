/* Pure rules and clock, shared by Three.js, the classic p5 sketch and Node tests. */
(function (root, factory) {
  const configAPI = typeof module === 'object' && module.exports ? require('./config.js') : root.LetterfallConfig;
  const api = factory(configAPI);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Letterfall = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (configAPI) {
  'use strict';
  const { createConfig } = configAPI;
  class WordGame {
    constructor(dictionary, options = {}, random = Math.random) {
      this.config = createConfig(options);
      this.random = random;
      this.dictionary = new Set(dictionary.map(word => word.toUpperCase()).filter(word => /^[A-Z]+$/.test(word) && word.length >= this.config.rules.minWordLength));
      this.prefixes = new Set();
      for (const word of this.dictionary) {
        for (let length = 1; length <= word.length; length++) this.prefixes.add(word.slice(0, length));
      }
      this.reset();
    }
    reset() {
      this.phase = 'ready';
      this.remaining = this.config.timer.startSeconds;
      this.elapsed = 0;
      this.current = '';
      this.currentTiles = [];
      this.currentPrefixes = [''];
      this.letterSeconds = 0;
      this.letterWindow = this.config.rules.nextLetterSeconds;
      this.resetCombo();
      this.effects = { hourglass: 0, smoke: 0, fire: 0 };
      this.hourglassOffer = false;
      this.specialIntroductions = { hourglass: false, gold: false, smoke: false, fire: false };
      this.words = [];
      this.wordScores = new Map();
      this.totalPoints = 0;
      this.used = new Set();
      this.lastTime = null;
      this.mistakes = 0;
    }
    start(now) { this.reset(); this.phase = 'running'; this.lastTime = now; }
    get score() { return this.totalPoints; }
    get wordCount() { return this.words.length; }
    resetCombo() { this.comboCount = 0; this.comboSeconds = 0; }
    // Legacy renderers may read this. Chains are still tracked for personal
    // stats, but longer words are now the only source of extra letter time.
    get comboBonusSeconds() { return 0; }
    get letterWindowSeconds() {
      const { nextLetterSeconds, extensionAfterLength, extensionSecondsPerLetter } = this.config.rules;
      return nextLetterSeconds + Math.max(0, this.current.length - extensionAfterLength) * extensionSecondsPerLetter;
    }
    // Retained for older renderers. The window follows word length, never combos.
    get nextLetterWindow() { return this.letterWindowSeconds; }
    get secondsUntilWordTimeout() {
      if (!this.current) return Infinity;
      // Convert the remaining clock units into real active time, including the
      // switch back to normal speed when ice expires. Fire only speeds tiles.
      const effectSeconds = this.effects.hourglass;
      const effectDrain = effectSeconds * this.timeScale;
      return this.letterSeconds <= effectDrain
        ? this.letterSeconds / this.timeScale
        : effectSeconds + this.letterSeconds - effectDrain;
    }
    recordComboWord() {
      if (!this.config.combo.enabled) return;
      this.comboCount++;
      this.comboSeconds = this.config.combo.maxGapSeconds;
    }
    rollTileTraits(random = Math.random) {
      const neutral = { bonus: false, grenade: false, effect: null };
      if (this.phase !== 'running') return neutral;
      const { iceUnlockWords, goldUnlockWords, smokeUnlockWords, fireUnlockWords } = this.config.specialTiles;
      const stages = [['gold', goldUnlockWords], ['hourglass', iceUnlockWords], ['smoke', smokeUnlockWords], ['fire', fireUnlockWords]];
      const traitsFor = special => ({ bonus: special === 'gold', grenade: false, effect: special === 'gold' ? null : special });
      // Called only when a real, nonblank tile is spawned. Guarantee the first
      // encounter at each milestone, in order even after several fast scores.
      for (const [special, words] of stages) {
        if (this.wordCount < words) break;
        if (!this.specialIntroductions[special]) {
          this.specialIntroductions[special] = true;
          return traitsFor(special);
        }
      }
      const roll = random();
      const { blueChance, purpleChance, redChance } = this.config.letterEffects;
      const rates = [
        ['hourglass', this.wordCount >= iceUnlockWords ? blueChance : 0],
        ['gold', this.wordCount >= goldUnlockWords ? this.config.bonusLetters.chance : 0],
        ['smoke', this.wordCount >= smokeUnlockWords ? purpleChance : 0],
        ['fire', this.wordCount >= fireUnlockWords ? redChance : 0],
      ];
      let threshold = 0;
      for (const [special, chance] of rates) {
        threshold += chance;
        if (roll < threshold) return traitsFor(special);
      }
      return neutral;
    }
    pointsFor(word) { return [...word.toUpperCase()].reduce((sum, letter) => sum + (this.config.letterPoints[letter] || 0), 0); }
    collectedPoints(word) { return this.wordScores.get(word) ?? this.pointsFor(word); }
    get pendingBasePoints() { return this.currentTiles.reduce((sum,tile)=>sum+(tile.blank?0:this.config.letterPoints[tile.letter]),0); }
    get pendingScoreMultiplier() { return this.hasBonus ? this.config.bonusLetters.scoreMultiplier : 1; }
    get pendingPoints() { return this.isRepeat ? 0 : this.pendingBasePoints * this.pendingScoreMultiplier; }
    uncappedTimeForPoints(points, length) {
      const rewards = this.config.rewards;
      const base = points * rewards.secondsPerPoint;
      if (length <= 3) return base * rewards.threeLetterMultiplier;
      if (length === 4) return base * rewards.fourLetterMultiplier;
      return base * rewards.longWordMultiplier;
    }
    timeForPoints(points, length) {
      const { sixLetterTargetSeconds, sixLetterBonusSeconds } = this.config.rewards;
      const sixLetterTarget = Math.min(sixLetterTargetSeconds, this.config.timer.maxSeconds);
      if (length >= 8) return Math.max(0, this.maxTimeSeconds - this.remaining);
      if (length === 7) return Math.max(0, this.config.timer.maxSeconds - this.remaining);
      if (length === 6) return this.remaining <= sixLetterTarget
        ? Math.max(0, sixLetterTarget - this.remaining) : sixLetterBonusSeconds;
      const time = this.uncappedTimeForPoints(points, length);
      if (length <= 3) return Math.min(this.config.rewards.threeLetterMaxSeconds, time);
      if (length === 4) return Math.min(this.config.rewards.fourLetterMaxSeconds, time);
      return time;
    }
    rewardFor(word) { return this.timeForPoints(this.pointsFor(word), word.length); }
    get pendingReward() {
      // Gold only doubles the score. Time uses ordinary letter values through
      // five letters, then the same length-based refill for every word.
      return this.isRepeat ? 0 : this.timeForPoints(this.pendingBasePoints, this.current.length);
    }
    get hasBonus() { return this.currentTiles.some(tile => tile.bonus); }
    get activeEffect() { return ['hourglass', 'smoke', 'fire'].find(effect => this.effects[effect] > 0) || null; }
    get timeScale() { return this.effects.hourglass > 0 ? this.config.hourglass.timeScale : 1; }
    get timerDrainMultiplier() {
      const { mistakeGraceCount = 3, mistakeDrainStep = .01 } = this.config.timer;
      return 1 + Math.max(0, this.mistakes - mistakeGraceCount) * mistakeDrainStep;
    }
    get worldTimeScale() { return this.effects.fire > 0 ? this.config.fire.worldTimeScale : this.timeScale; }
    get maxTimeSeconds() { return this.config.timer.maxSeconds * this.config.timer.overtimeMultiplier; }
    get isWord() { return this.currentPrefixes.some(word=>this.dictionary.has(word)); }
    get isRepeat() { return this.isWord && this.currentPrefixes.filter(word=>this.dictionary.has(word)).every(word=>this.used.has(word)); }
    resolvedWord() {
      let best='',bestWeight=-Infinity,repeat='';
      for(const word of this.currentPrefixes){
        if(!this.dictionary.has(word))continue;
        if(this.used.has(word)){repeat ||= word;continue;}
        // Favor common letters at blanks; ties keep alphabetical traversal order.
        const weight=this.currentTiles.reduce((sum,tile,i)=>sum+(tile.blank?Math.log(this.config.letterFrequency[word[i]]||1e-9):0),0);
        if(weight>bestWeight){best=word;bestWeight=weight;}
      }
      return best||repeat;
    }
    advance(now) {
      if (this.phase !== 'running') return null;
      // Never cap this delta: a slow frame must not give the player free time.
      const seconds = Math.max(0, now - this.lastTime) / 1000;
      this.lastTime = Math.max(this.lastTime, now);
      // Resolve inactivity at its exact deadline, before any remaining frame time.
      const untilDeadline = this.secondsUntilWordTimeout;
      const end = this.elapse(Math.min(seconds, untilDeadline));
      if (end) return end;
      if (seconds + 1e-9 < untilDeadline) return null; // Ignore sub-nanosecond arithmetic residue.
      // Use the same scoring path as a tap: blanks, repeats, gold, and pickups
      // retain their rules. An unfinished prefix keeps the discard penalty.
      const timeout = this.isWord ? this.finishWord(true) : this.penalize('timeout');
      if (this.phase === 'running') {
        const lateEnd = this.elapse(Math.max(0, seconds - untilDeadline));
        // Preserve an auto-submission even if the rest of a delayed frame ends
        // the round, so presentation still saves its score and personal best.
        if (lateEnd) return timeout.type === 'word' || timeout.type === 'repeat'
          ? { ...timeout, ended: true, hourglassOffered: false } : lateEnd;
      }
      return timeout;
    }
    elapse(seconds) {
      // Mistakes accelerate only the round timer. Ice still slows both clocks;
      // fire affects tile motion, and effect lifetimes use real active seconds.
      const effectSeconds = Math.min(seconds, this.effects.hourglass);
      const effectDrain = effectSeconds * this.timeScale;
      const drain = effectDrain + seconds - effectSeconds;
      const multiplier = this.timerDrainMultiplier;
      const clockBudget = this.remaining / multiplier;
      const activeSeconds = clockBudget <= effectDrain
        ? clockBudget / this.timeScale
        : Math.min(seconds, effectSeconds + clockBudget - effectDrain);
      this.elapsed += activeSeconds;
      this.comboSeconds = Math.max(0, this.comboSeconds - activeSeconds);
      if (this.comboSeconds <= 1e-9) this.resetCombo(); // Ignore floating-point residue at the boundary.
      // The word deadline keeps its full budget even after mistakes. Clip its
      // elapsed time at the exact instant the faster round clock runs out.
      if (this.current) this.letterSeconds = Math.max(0, this.letterSeconds - Math.min(drain, clockBudget));
      for (const effect of ['hourglass', 'smoke', 'fire']) {
        const remaining = this.effects[effect] - activeSeconds;
        this.effects[effect] = remaining <= 1e-9 ? 0 : remaining;
      }
      this.remaining = Math.max(0, this.remaining - drain * multiplier);
      if (this.remaining === 0) { this.phase = 'over'; this.clearEffects(); return { type: 'ended' }; }
      return null;
    }
    discardHourglass() { this.hourglassOffer = false; }
    clearEffects() { this.effects.hourglass = 0; this.effects.smoke = 0; this.effects.fire = 0; this.discardHourglass(); this.resetCombo(); }
    applyEffect(effect) {
      // One timed effect owns the field until it expires. Extra colored tiles
      // still supply letters, but cannot replace, refresh, or queue an effect.
      if (this.phase !== 'running' || !['hourglass', 'smoke', 'fire'].includes(effect) || this.activeEffect) return 0;
      this.effects[effect] = this.config[effect].durationSeconds;
      if (effect === 'hourglass') this.discardHourglass();
      return this.effects[effect];
    }
    activate(effect, now) {
      const end = this.advance(now);
      if (end) return end;
      if (this.phase !== 'running' || !['hourglass', 'smoke', 'fire'].includes(effect)) return { type: 'ignored' };
      const duration = this.applyEffect(effect);
      return duration ? { type: 'effect', effect, duration } : { type: 'ignored' };
    }
    collectHourglass(now) { return this.collectPickup('hourglass', now); }
    collectPickup(effect, now) {
      const end = this.advance(now);
      if (end) return { ...end, consumed: false };
      if (this.phase !== 'running' || !this.hourglassOffer || !['hourglass', 'smoke', 'fire'].includes(effect)) return { type: 'ignored' };
      if (this.activeEffect) { this.discardHourglass(); return { type: 'ignored' }; }
      const result = this.activate(effect, now);
      if (result.type === 'effect') { this.discardHourglass(); result.consumed = true; }
      return result;
    }
    select(letter, now, options = {}) {
      const end = this.advance(now);
      if (end) return { ...end, consumed: false };
      if (this.phase !== 'running' || !/^[A-Z?]$/i.test(letter)) return { type: 'ignored' };
      const blank=letter==='?' || options.blank===true,symbol=blank?'?':letter.toUpperCase();
      const next=[];
      for(const prefix of this.currentPrefixes)for(const character of blank?'ABCDEFGHIJKLMNOPQRSTUVWXYZ':symbol){
        if(this.prefixes.has(prefix+character))next.push(prefix+character);
      }
      this.current += symbol;
      this.currentPrefixes=next;
      const effect=!blank&&['hourglass','smoke','fire'].includes(options.effect)?options.effect:null;
      const bonus=!blank&&!effect&&options.bonus===true;
      this.currentTiles.push({ letter:symbol, blank, bonus, grenade:false, effect });
      // Longer words receive another half-second per letter beyond the fourth.
      // Store the granted window so the countdown meter uses the same duration.
      this.letterWindow = this.letterWindowSeconds;
      this.letterSeconds = this.letterWindow;
      const result = next.length ? { type: 'letter', word: this.current } : this.penalize('spelling');
      if(effect&&this.phase==='running'){
        const duration=this.applyEffect(effect);
        if(duration)result.tileEffect={effect,duration};
      }
      if(bonus&&this.phase==='running')result.goldCollected=true;
      return result;
    }
    submit(now) {
      const end = this.advance(now);
      if (end) return end;
      if (this.phase !== 'running' || !this.current) return { type: 'ignored' };
      return this.finishWord();
    }
    finishWord(automatic = false) {
      if (!this.isWord) return this.penalize('incomplete');
      // Check repetition on submission so a used CAT can still become CATCH.
      if (this.isRepeat) return this.finishRepeat(automatic);
      const word = this.resolvedWord();
      const points = this.pendingPoints;
      const basePoints = this.pendingBasePoints;
      const scoreMultiplier = this.pendingScoreMultiplier;
      const requestedReward = this.pendingReward;
      const bonusReward = 0; // Legacy renderers: gold no longer grants bonus time.
      const bonusPoints = points - basePoints;
      // Presentation and lifetime history consume this confirmed event. Capture
      // the original pattern before clearing it; never infer blank use later.
      const pattern = this.current;
      const selectedTiles = this.currentTiles.map(tile => ({ ...tile }));
      const blankCount = selectedTiles.filter(tile => tile.blank).length;
      const activeSeconds = this.elapsed;
      this.words.push(word);
      this.wordScores.set(word,points);
      this.totalPoints += points;
      this.used.add(word);
      this.recordComboWord();
      this.clearCurrentWord();
      const before = this.remaining;
      // Six-letter bonuses and eight-letter refills may enter overtime. Short
      // words may replenish overtime already earned, but cannot create it.
      const cap = word.length === 6 || word.length >= 8 || before > this.config.timer.maxSeconds
        ? this.maxTimeSeconds : this.config.timer.maxSeconds;
      this.remaining += Math.max(0, Math.min(requestedReward, cap - before));
      const hourglassOffered = false; // Kept in accepted events for older renderers.
      return { type: 'word', automatic, comboCount: this.comboCount, letterWindow: this.nextLetterWindow, word, pattern, selectedTiles, blankCount, activeSeconds, wordIndex: this.words.length, points, basePoints, scoreMultiplier, bonusPoints, requestedReward, bonusReward, reward: this.remaining - before, hourglassOffered };
    }
    finishRepeat(automatic) {
      const word = this.resolvedWord();
      const pattern = this.current;
      const selectedTiles = this.currentTiles.map(tile => ({ ...tile }));
      const blankCount = selectedTiles.filter(tile => tile.blank).length;
      this.clearCurrentWord();
      // A repeat is neutral: it cannot advance discovery, add time, or refresh
      // a combo. Existing effects and the naturally expiring combo continue.
      return { type: 'repeat', reason: 'repeat', automatic, word, pattern, selectedTiles, blankCount, activeSeconds: this.elapsed, points: 0, reward: 0, requestedReward: 0, penalty: 0, comboCount: this.comboCount, letterWindow: this.letterWindowSeconds, hourglassOffered: false };
    }
    clearCurrentWord() {
      this.current = '';
      this.currentTiles = [];
      this.currentPrefixes = [''];
      this.letterSeconds = 0;
      this.letterWindow = this.letterWindowSeconds;
    }
    penalize(reason) {
      this.resetCombo();
      const word = this.current;
      this.clearCurrentWord();
      const discarded = reason === 'clear' || reason === 'timeout';
      // A deliberate delete is a mistake too; an automatic timeout is not.
      if (reason !== 'timeout') this.mistakes++;
      const penaltyKey = discarded ? 'clearWordSeconds' : 'invalidWordSeconds';
      const penalty = this.config.penalties[penaltyKey];
      this.remaining = Math.max(0, this.remaining - penalty);
      if (this.remaining === 0) { this.phase = 'over'; this.clearEffects(); }
      return { type: 'penalty', reason, word, penalty, mistakes: this.mistakes, timerDrainMultiplier: this.timerDrainMultiplier, ended: this.phase === 'over' };
    }
    undo(now) {
      const end = this.advance(now);
      if (end) return end;
      if (this.phase !== 'running' || !this.current) return { type: 'ignored' };
      return this.penalize('clear');
    }
    pause(now) {
      const end = this.advance(now);
      if (this.phase === 'running') this.phase = 'paused';
      return end || { type: 'paused' };
    }
    resume(now) {
      if (this.phase === 'paused') { this.phase = 'running'; this.lastTime = now; }
    }
  }
  return { WordGame };
});
