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
      this.effects = { hourglass: 0, smoke: 0 };
      this.hourglassOffer = false;
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
    get comboBonusSeconds() {
      if (!this.config.combo.enabled) return 0;
      const steps = Math.max(0, this.comboCount - this.config.combo.wordsToStart + 1);
      return Math.min(this.config.combo.maxExtraSeconds, steps * this.config.combo.extraSecondsPerWord);
    }
    get nextLetterWindow() { return this.config.rules.nextLetterSeconds + this.comboBonusSeconds; }
    recordComboWord() {
      if (!this.config.combo.enabled) return;
      this.comboCount++;
      this.comboSeconds = this.config.combo.maxGapSeconds;
    }
    get specialTilesUnlocked() { return this.elapsed >= this.config.specialTiles.warmupSeconds; }
    rollTileTraits(random = Math.random) {
      return {
        bonus: random() < this.config.bonusLetters.chance,
        grenade: this.specialTilesUnlocked && random() < this.config.smoke.letterChance,
      };
    }
    pointsFor(word) { return [...word.toUpperCase()].reduce((sum, letter) => sum + (this.config.letterPoints[letter] || 0), 0); }
    collectedPoints(word) { return this.wordScores.get(word) ?? this.pointsFor(word); }
    get pendingPoints() { return this.currentTiles.reduce((sum,tile)=>sum+(tile.blank?0:this.config.letterPoints[tile.letter]),0); }
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
      const bonusPoints = this.currentTiles.reduce((sum, tile) => sum + (tile.bonus && !tile.blank ? this.config.letterPoints[tile.letter] * (this.config.bonusLetters.timeMultiplier - 1) : 0), 0);
      // Short-word caps apply only to the ordinary reward. Each gold letter's
      // extra time is then added, so the cap never erases a multiplier bonus.
      return this.timeForPoints(this.pendingPoints,this.current.length) + this.uncappedTimeForPoints(bonusPoints, this.current.length);
    }
    get hasBonus() { return this.currentTiles.some(tile => tile.bonus); }
    get timeScale() { return this.effects.hourglass > 0 ? this.config.hourglass.timeScale : 1; }
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
      const untilDeadline = this.current ? this.letterSeconds : Infinity;
      const end = this.elapse(Math.min(seconds, untilDeadline));
      if (end) return end;
      if (seconds < untilDeadline) return null;
      // Use the same scoring path as a tap: blanks, repeats, gold, and pickups
      // retain their rules. An unfinished prefix keeps the discard penalty.
      const timeout = this.isWord ? this.finishWord(true) : this.penalize('timeout');
      if (this.phase === 'running') {
        const lateEnd = this.elapse(seconds - untilDeadline);
        // Preserve an auto-submission even if the rest of a delayed frame ends
        // the round, so presentation still saves its score and personal best.
        if (lateEnd) return timeout.type === 'word'
          ? { ...timeout, ended: true, hourglassOffered: false } : lateEnd;
      }
      return timeout;
    }
    elapse(seconds) {
      // Integrate across the exact moment a slow-time effect expires. Effects
      // count down in unscaled active time, even while the round clock is slow.
      const slowSeconds = Math.min(seconds, this.effects.hourglass);
      const slowDrain = slowSeconds * this.config.hourglass.timeScale;
      const drain = slowDrain + seconds - slowSeconds;
      const activeSeconds = this.remaining <= slowDrain
        ? this.remaining / this.config.hourglass.timeScale
        : Math.min(seconds, slowSeconds + this.remaining - slowDrain);
      this.elapsed += activeSeconds;
      this.comboSeconds = Math.max(0, this.comboSeconds - activeSeconds);
      if (this.comboSeconds <= 1e-9) this.resetCombo(); // Ignore floating-point residue at the boundary.
      if (this.current) this.letterSeconds = Math.max(0, this.letterSeconds - activeSeconds);
      this.effects.hourglass = Math.max(0, this.effects.hourglass - activeSeconds);
      this.effects.smoke = Math.max(0, this.effects.smoke - activeSeconds);
      this.remaining = Math.max(0, this.remaining - drain);
      if (this.remaining === 0) { this.phase = 'over'; this.clearEffects(); return { type: 'ended' }; }
      return null;
    }
    discardHourglass() { this.hourglassOffer = false; }
    clearEffects() { this.effects.hourglass = 0; this.effects.smoke = 0; this.discardHourglass(); this.resetCombo(); }
    activate(effect, now) {
      const end = this.advance(now);
      if (end) return end;
      if (this.phase !== 'running' || !['hourglass', 'smoke'].includes(effect)) return { type: 'ignored' };
      const duration = this.config[effect].durationSeconds;
      // A second pickup refreshes the effect; it never multiplies its strength.
      this.effects[effect] = duration;
      if (effect === 'hourglass') this.discardHourglass();
      return { type: 'effect', effect, duration };
    }
    collectHourglass(now) {
      const end = this.advance(now);
      if (end) return { ...end, consumed: false };
      if (this.phase !== 'running' || !this.hourglassOffer) return { type: 'ignored' };
      return this.activate('hourglass', now);
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
      this.currentTiles.push({ letter:symbol, blank, bonus:!blank && options.bonus===true, grenade:!blank && options.grenade===true });
      // Honor the window earned when this letter is selected, even if the
      // chain expires mid-countdown. The following pick uses the current boost.
      this.letterWindow = this.nextLetterWindow;
      this.letterSeconds = this.letterWindow;
      const result = next.length ? { type: 'letter', word: this.current } : this.penalize('spelling');
      // Using a marked letter releases smoke even if it creates a bad prefix.
      // It cannot revive effects after a penalty ends the round.
      if (!blank && options.grenade === true && this.phase === 'running') {
        this.effects.smoke = this.config.smoke.durationSeconds;
        result.smokeTriggered = true;
      }
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
      if (this.isRepeat) return this.penalize('repeat');
      const word = this.resolvedWord();
      const points = this.pendingPoints;
      const requestedReward = this.pendingReward;
      const bonusReward = requestedReward - this.timeForPoints(points,word.length);
      this.words.push(word);
      this.wordScores.set(word,points);
      this.totalPoints += points;
      this.used.add(word);
      this.recordComboWord();
      this.current = '';
      this.currentTiles = [];
      this.currentPrefixes = [''];
      this.letterSeconds = 0;
      const before = this.remaining;
      this.remaining = Math.min(this.config.timer.maxSeconds, this.remaining + requestedReward);
      const hourglassOffered = this.specialTilesUnlocked && this.config.hourglass.enabled && word.length >= this.config.hourglass.minWordLength && this.random() < this.config.hourglass.spawnChance;
      if (hourglassOffered) this.hourglassOffer = true;
      return { type: 'word', automatic, comboCount: this.comboCount, letterWindow: this.nextLetterWindow, word, points, requestedReward, bonusReward, reward: this.remaining - before, hourglassOffered };
    }
    penalize(reason) {
      this.resetCombo();
      const word = this.current;
      this.current = '';
      this.currentTiles = [];
      this.currentPrefixes = [''];
      this.letterSeconds = 0;
      const discarded = reason === 'clear' || reason === 'timeout';
      if (!discarded) this.mistakes++;
      const penaltyKey = reason === 'repeat' ? 'repeatWordSeconds' : discarded ? 'clearWordSeconds' : 'invalidWordSeconds';
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
