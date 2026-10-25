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
      // switch back to normal speed when the current ice or fire expires.
      const effectSeconds = Math.max(this.effects.hourglass, this.effects.fire);
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
      const time = this.uncappedTimeForPoints(points, length);
      if (length <= 3) return Math.min(this.config.rewards.threeLetterMaxSeconds, time);
      if (length === 4) return Math.min(this.config.rewards.fourLetterMaxSeconds, time);
      return time;
    }
    rewardFor(word) { return this.timeForPoints(this.pointsFor(word), word.length); }
    get pendingReward() {
      // Gold doubles the word score once. Time continues to use the unchanged
      // letter values and short-word caps, even with several gold letters.
      return this.isRepeat ? 0 : this.timeForPoints(this.pendingBasePoints, this.current.length);
    }
    get hasBonus() { return this.currentTiles.some(tile => tile.bonus); }
    get timeScale() { return this.effects.fire > 0 ? this.config.fire.timeScale : this.effects.hourglass > 0 ? this.config.hourglass.timeScale : 1; }
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
      // Integrate across the exact moment ice or fire expires. Only one can
      // be active, and its duration always uses real active seconds.
      const effectSeconds = Math.min(seconds, Math.max(this.effects.hourglass, this.effects.fire));
      const effectDrain = effectSeconds * this.timeScale;
      const drain = effectDrain + seconds - effectSeconds;
      const activeSeconds = this.remaining <= effectDrain
        ? this.remaining / this.timeScale
        : Math.min(seconds, effectSeconds + this.remaining - effectDrain);
      this.elapsed += activeSeconds;
      this.comboSeconds = Math.max(0, this.comboSeconds - activeSeconds);
      if (this.comboSeconds <= 1e-9) this.resetCombo(); // Ignore floating-point residue at the boundary.
      // Both countdowns spend the same scaled time; the combo and effect
      // durations continue to use real active seconds.
      if (this.current) this.letterSeconds = Math.max(0, this.letterSeconds - Math.min(drain, this.remaining));
      this.effects.hourglass = Math.max(0, this.effects.hourglass - activeSeconds);
      this.effects.smoke = Math.max(0, this.effects.smoke - activeSeconds);
      this.effects.fire = Math.max(0, this.effects.fire - activeSeconds);
      this.remaining = Math.max(0, this.remaining - drain);
      if (this.remaining === 0) { this.phase = 'over'; this.clearEffects(); return { type: 'ended' }; }
      return null;
    }
    discardHourglass() { this.hourglassOffer = false; }
    clearEffects() { this.effects.hourglass = 0; this.effects.smoke = 0; this.effects.fire = 0; this.discardHourglass(); this.resetCombo(); }
    applyEffect(effect) {
      // Temperature effects replace one another; smoke remains independent.
      if (effect === 'hourglass') this.effects.fire = 0;
      if (effect === 'fire') this.effects.hourglass = 0;
      this.effects[effect] = this.config[effect].durationSeconds;
      if (effect === 'hourglass') this.discardHourglass();
      return this.effects[effect];
    }
    activate(effect, now) {
      const end = this.advance(now);
      if (end) return end;
      if (this.phase !== 'running' || !['hourglass', 'smoke', 'fire'].includes(effect)) return { type: 'ignored' };
      // A second pickup refreshes the effect; it never multiplies its strength.
      const duration = this.applyEffect(effect);
      return { type: 'effect', effect, duration };
    }
    collectHourglass(now) { return this.collectPickup('hourglass', now); }
    collectPickup(effect, now) {
      const end = this.advance(now);
      if (end) return { ...end, consumed: false };
      if (this.phase !== 'running' || !this.hourglassOffer || !['hourglass', 'smoke'].includes(effect)) return { type: 'ignored' };
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
        result.tileEffect={effect,duration:this.applyEffect(effect)};
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
      this.remaining = Math.min(this.config.timer.maxSeconds, this.remaining + requestedReward);
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
      if (!discarded) this.mistakes++;
      const penaltyKey = discarded ? 'clearWordSeconds' : 'invalidWordSeconds';
      const penalty = this.config.penalties[penaltyKey];
      this.remaining = Math.max(0, this.remaining - penalty);
      if (this.remaining === 0) { this.phase = 'over'; this.clearEffects(); }
      return { type: 'penalty', reason, word, penalty, ended: this.phase === 'over' };
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
