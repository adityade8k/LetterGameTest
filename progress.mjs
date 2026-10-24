// Progress consumes accepted engine events. It never decides word validity or
// changes the engine's round-local used-word set.
export const STORAGE_KEY = 'clttr.progress.v1';
export const JOURNAL_PREFIX = `${STORAGE_KEY}.journal.`;
export const WINDOW_SECONDS = 20 * 60;
export const GOALS = Object.freeze([
  { id: 'discover10', title: 'Find 10 different words', target: 10 },
  { id: 'discover25', title: 'Find 25 different words', target: 25 },
  { id: 'five10', title: 'Find 10 five-letter words', target: 10, length: 5 },
  { id: 'six10', title: 'Find 10 six-letter words', target: 10, length: 6 },
  { id: 'seven5', title: 'Find 5 seven-letter words', target: 5, length: 7 },
].map(goal => Object.freeze(goal)));

const copy = value => JSON.parse(JSON.stringify(value));
const number = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
const canonical = word => typeof word === 'string' ? word.trim().toUpperCase() : '';
const validWord = word => /^[A-Z]{3,256}$/.test(word);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fresh = () => ({ version: 1, entries: {}, events: {}, rounds: {}, currentRoundId: null,
  activeSeconds: 0, unattributedActiveSeconds: 0, personalStart: 0, ruleVersion: '', dictionaryVersion: '', recent: [],
  selectedGoal: 'discover10', goalRevision: '', milestoneIds: [],
  stats: { roundsPlayed: 0, roundsCompleted: 0, bestScore: 0, bestChain: 0, totalWordsPlayed: 0, totalPoints: 0 }, lastRoundId: null });

const union = (a = [], b = []) => [...new Set([...a, ...b])];
const put = (target, key, value) => Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
const minKnown = (a, b) => a == null ? b : b == null ? a : Math.min(a, b);
const roundShell = round => Object.fromEntries(Object.entries(round).filter(([key]) => !['words', 'newWords', 'newWithoutBlankWords', 'milestones'].includes(key)));

function packOperation(operation) {
  const round = operation.round, event = operation.event;
  if (operation.kind === 'word') return { v: 1, k: 'w', i: operation.eventId,
    e: [event.roundId, event.word, event.at, event.activeSeconds, event.points, event.reward, event.requestedReward, event.withoutBlanks ? 1 : 0, event.comboCount],
    ...(operation.milestones?.length ? { m: operation.milestones.map(item => item.id) } : {}) };
  if (operation.kind === 'begin') return { v: 1, k: 'b', r: [round.roundId, round.startedAt, round.activeStart, round.previousBest, round.ruleVersion, round.dictionaryVersion] };
  if (operation.kind === 'checkpoint') return { v: 1, k: 'c', r: round?.roundId, t: round?.activeSeconds, u: operation.unattributedActiveSeconds };
  if (operation.kind === 'finish') return { v: 1, k: 'f', r: round.roundId, t: round.activeSeconds, s: round.score,
    c: round.bestChain, m: round.mistakes, a: round.abandoned, f: round.finishedAt };
  if (operation.kind === 'goal') return { v: 1, k: 'g', g: operation.goal, r: operation.revision };
  if (operation.kind === 'record') return { v: 1, k: 'r', s: operation.bestScore };
  if (operation.kind === 'context') return { v: 1, k: 'x', r: operation.ruleVersion, d: operation.dictionaryVersion, p: operation.personalStart, q: operation.revision };
  return { version: 1, ...operation };
}

function unpackOperation(operation, state) {
  if (operation?.v !== 1) return operation;
  if (operation.k === 'b' && Array.isArray(operation.r)) {
    const [roundId, startedAt, activeStart, previousBest, ruleVersion, dictionaryVersion] = operation.r;
    return { version: 1, kind: 'begin', round: { roundId, startedAt, activeStart, previousBest, ruleVersion, dictionaryVersion,
      activeSeconds: 0, points: 0, timeEarned: 0, requestedTime: 0, bestChain: 0, finished: false, abandoned: false,
      legacyPoints: 0, legacyTime: 0, legacyRequestedTime: 0 } };
  }
  if (operation.k === 'w' && Array.isArray(operation.e)) {
    const [roundId, word, at, activeSeconds, points, reward, requestedReward, withoutBlanks, comboCount] = operation.e;
    const round = Object.hasOwn(state.rounds, roundId) ? state.rounds[roundId] : null;
    if (!round) return null;
    return { version: 1, kind: 'word', eventId: operation.i,
      event: { roundId, word, at, activeSeconds, points, reward, requestedReward, withoutBlanks: Boolean(withoutBlanks), comboCount,
        ruleVersion: round.ruleVersion, dictionaryVersion: round.dictionaryVersion },
      round: { ...roundShell(round), activeSeconds: Math.max(round.activeSeconds, number(activeSeconds)) },
      milestones: (operation.m || []).map(id => GOALS.find(goal => goal.id === id)).filter(Boolean).map(({ id, title, target }) => ({ id, title, target })) };
  }
  if (operation.k === 'c') {
    const round = Object.hasOwn(state.rounds, operation.r) ? state.rounds[operation.r] : null;
    return { version: 1, kind: 'checkpoint', round: round ? { ...roundShell(round), activeSeconds: operation.t } : null, unattributedActiveSeconds: operation.u };
  }
  if (operation.k === 'f') {
    const round = Object.hasOwn(state.rounds, operation.r) ? state.rounds[operation.r] : null;
    if (!round) return null;
    return { version: 1, kind: 'finish', round: { ...roundShell(round), activeSeconds: operation.t, score: operation.s, bestChain: operation.c,
      mistakes: operation.m, abandoned: operation.a, finishedAt: operation.f, finished: true } };
  }
  if (operation.k === 'g') return { version: 1, kind: 'goal', goal: operation.g, revision: operation.r };
  if (operation.k === 'r') return { version: 1, kind: 'record', bestScore: operation.s };
  if (operation.k === 'x') return { version: 1, kind: 'context', ruleVersion: operation.r, dictionaryVersion: operation.d, personalStart: operation.p, revision: operation.q };
  return null;
}

function mergeState(target, source) {
  for (const [word, incoming] of Object.entries(source.entries || {})) {
    const prior = target.entries[word];
    if (!prior) target.entries[word] = copy(incoming);
    else {
      prior.firstSeen = Math.min(prior.firstSeen, incoming.firstSeen);
      prior.lastSeen = Math.max(prior.lastSeen, incoming.lastSeen);
      prior.timesPlayed = Math.max(prior.timesPlayed, incoming.timesPlayed);
      prior.withoutBlanks ||= incoming.withoutBlanks;
      prior.firstWithoutBlanks = minKnown(prior.firstWithoutBlanks, incoming.firstWithoutBlanks);
      prior.bestPoints = Math.max(number(prior.bestPoints), number(incoming.bestPoints));
    }
  }
  for (const [id, event] of Object.entries(source.events || {})) {
    if (!Object.hasOwn(target.events, id) || (target.events[id].at == null && event.at != null)) put(target.events, id, copy(event));
  }
  for (const [id, incoming] of Object.entries(source.rounds || {})) {
    const prior = Object.hasOwn(target.rounds, id) ? target.rounds[id] : null;
    if (!prior) { put(target.rounds, id, copy(incoming)); continue; }
    for (const key of ['words', 'newWords', 'newWithoutBlankWords']) prior[key] = union(prior[key], incoming[key]);
    prior.milestones = [...new Map([...(prior.milestones || []), ...(incoming.milestones || [])].map(item => [item.id, item])).values()];
    for (const key of ['activeSeconds', 'points', 'timeEarned', 'requestedTime', 'bestChain', 'mistakes', 'score', 'legacyPoints', 'legacyTime', 'legacyRequestedTime']) {
      if (incoming[key] != null) prior[key] = Math.max(number(prior[key]), number(incoming[key]));
    }
    if (incoming.finished && (!prior.finished || number(incoming.finishedAt) >= number(prior.finishedAt))) {
      prior.finished = true;
      prior.finishedAt = incoming.finishedAt;
      prior.abandoned = Boolean(incoming.abandoned);
    }
  }
  for (const key of ['bestScore', 'bestChain']) target.stats[key] = Math.max(number(target.stats[key]), number(source.stats?.[key]));
  target.activeSeconds = Math.max(target.activeSeconds, number(source.activeSeconds));
  target.unattributedActiveSeconds = Math.max(number(target.unattributedActiveSeconds), number(source.unattributedActiveSeconds));
  target.milestoneIds = union(target.milestoneIds, source.milestoneIds);
  if (String(source.goalRevision || '') > String(target.goalRevision || '')) {
    target.goalRevision = source.goalRevision;
    target.selectedGoal = source.selectedGoal;
  }
  if (source.recent?.length) {
    const recent = [...target.recent, ...source.recent];
    target.recent = [...new Map(recent.map(event => [`${event.word}:${event.at}:${event.ruleVersion || ''}`, event])).values()];
  }
}

function reconcile(state) {
  const rounds = Object.values(state.rounds).sort((a, b) => a.startedAt - b.startedAt || a.roundId.localeCompare(b.roundId));
  const offsets = new Map();
  let active = number(state.unattributedActiveSeconds);
  for (const round of rounds) {
    offsets.set(round.roundId, active);
    active += number(round.activeSeconds);
    round.words ||= []; round.newWords ||= []; round.newWithoutBlankWords ||= []; round.milestones ||= [];
    round.abandoned = Boolean(round.abandoned);
  }
  state.activeSeconds = active;
  const eventsByRound = new Map(), eventsByWord = new Map();
  const oldOwners = new Map(), oldWithoutOwners = new Map();
  for (const round of rounds) {
    for (const word of round.newWords) if (!oldOwners.has(word)) oldOwners.set(word, round.roundId);
    for (const word of round.newWithoutBlankWords) if (!oldWithoutOwners.has(word)) oldWithoutOwners.set(word, round.roundId);
    round.newWords = [];
    round.newWithoutBlankWords = [];
  }
  for (const [eventId, event] of Object.entries(state.events)) {
    if (!validWord(event.word) || !Object.hasOwn(state.rounds, event.roundId)) continue;
    const item = { ...event, eventId };
    if (!eventsByRound.has(event.roundId)) eventsByRound.set(event.roundId, []);
    eventsByRound.get(event.roundId).push(item);
    if (!eventsByWord.has(event.word)) eventsByWord.set(event.word, []);
    eventsByWord.get(event.word).push(item);
  }
  for (const [word, events] of eventsByWord) {
    events.sort((a, b) => number(a.at, state.rounds[a.roundId].startedAt) - number(b.at, state.rounds[b.roundId].startedAt) || a.eventId.localeCompare(b.eventId));
    let entry = state.entries[word];
    for (const event of events) {
      if (event.at == null) continue;
      entry ||= { word, length: word.length, firstSeen: event.at, lastSeen: event.at, timesPlayed: 0, withoutBlanks: false, firstWithoutBlanks: null, bestPoints: 0 };
      entry.firstSeen = Math.min(entry.firstSeen, event.at);
      entry.lastSeen = Math.max(entry.lastSeen, event.at);
      entry.bestPoints = Math.max(entry.bestPoints, number(event.points));
      entry.withoutBlanks ||= event.withoutBlanks;
      if (event.withoutBlanks) entry.firstWithoutBlanks = minKnown(entry.firstWithoutBlanks, event.at);
    }
    if (!entry) continue;
    entry.timesPlayed = events.length;
    state.entries[word] = entry;
    const owner = events.find(event => event.roundId === oldOwners.get(word)) || events[0];
    // All readers converge on the earliest successful event even if two tabs
    // first discover the same spelling before either receives a storage event.
    const first = events.every(event => event.at != null) ? events[0] : owner;
    const firstWithout = events.find(event => event.withoutBlanks);
    state.rounds[first.roundId].newWords.push(word);
    if (firstWithout) state.rounds[firstWithout.roundId].newWithoutBlankWords.push(word);
    else if (oldWithoutOwners.has(word)) state.rounds[oldWithoutOwners.get(word)].newWithoutBlankWords.push(word);
  }
  let points = 0, wordsPlayed = 0, bestChain = number(state.stats.bestChain), bestScore = number(state.stats.bestScore);
  for (const round of rounds) {
    const events = eventsByRound.get(round.roundId) || [];
    round.words = union(round.words, events.map(event => event.word));
    const full = events.filter(event => event.at != null);
    if (full.length) {
      round.points = number(round.legacyPoints) + full.reduce((sum, event) => sum + number(event.points), 0);
      round.timeEarned = number(round.legacyTime) + full.reduce((sum, event) => sum + number(event.reward), 0);
      round.requestedTime = number(round.legacyRequestedTime) + full.reduce((sum, event) => sum + number(event.requestedReward), 0);
    }
    round.wordCount = round.words.length;
    round.newWordCount = round.newWords.length;
    round.longestWord = round.words.reduce((longest, word) => word.length > longest.length ? word : longest, '');
    round.bestChain = Math.max(number(round.bestChain), ...full.map(event => number(event.comboCount)));
    if (round.finished) round.isPersonalBest = number(round.score, round.points) > number(round.previousBest);
    points += number(round.points); wordsPlayed += round.wordCount;
    bestChain = Math.max(bestChain, round.bestChain);
    bestScore = Math.max(bestScore, number(round.points), number(round.score));
  }
  state.stats = { ...state.stats, roundsPlayed: rounds.length, roundsCompleted: rounds.filter(round => round.finished && !round.abandoned).length,
    totalWordsPlayed: wordsPlayed, totalPoints: points, bestChain, bestScore };
  const last = rounds.filter(round => round.finished).sort((a, b) => b.finishedAt - a.finishedAt)[0];
  state.lastRoundId = last?.roundId || null;
  if (!state.currentRoundId && rounds.length) state.currentRoundId = rounds.at(-1).roundId;
  const known = Object.values(state.events).filter(event => event.at != null);
  const knownWords = new Set(known.map(event => event.word));
  const generated = known.filter(event => event.withoutBlanks && event.ruleVersion === state.ruleVersion && event.dictionaryVersion === state.dictionaryVersion)
    .map(event => ({ word: event.word, at: (offsets.get(event.roundId) || 0) + number(event.activeSeconds), ruleVersion: event.ruleVersion }));
  const legacy = state.recent.filter(event => !knownWords.has(event.word) && (!event.ruleVersion || event.ruleVersion === state.ruleVersion));
  state.recent = [...legacy, ...generated].filter(event => event.at > state.activeSeconds - WINDOW_SECONDS && event.at >= state.personalStart);
}

function decode(raw) {
  const state = JSON.parse(raw);
  if (!object(state) || state.version !== 1 || !object(state.entries) || !object(state.events)
    || !object(state.rounds) || !object(state.stats) || !Array.isArray(state.recent)
    || !Array.isArray(state.milestoneIds) || number(state.activeSeconds, -1) < 0) throw new Error('Invalid progress');
  for (const [word, entry] of Object.entries(state.entries)) {
    if (!validWord(word) || !object(entry) || entry.word !== word || entry.length !== word.length
      || !Number.isInteger(entry.timesPlayed) || entry.timesPlayed < 1
      || typeof entry.withoutBlanks !== 'boolean' || number(entry.firstSeen, -1) < 0
      || number(entry.lastSeen, -1) < 0) throw new Error('Invalid word entry');
  }
  for (const round of Object.values(state.rounds)) {
    if (!object(round) || typeof round.roundId !== 'string' || !Array.isArray(round.words)
      || !Array.isArray(round.newWords) || !Array.isArray(round.newWithoutBlankWords)
      || !Array.isArray(round.milestones) || number(round.activeStart, -1) < 0) throw new Error('Invalid round');
  }
  state.recent = state.recent.filter(event => object(event) && validWord(event.word) && number(event.at, -1) >= 0);
  for (const key of ['roundsPlayed', 'bestScore', 'bestChain', 'totalWordsPlayed', 'totalPoints']) state.stats[key] = number(state.stats[key]);
  state.personalStart = Math.min(number(state.personalStart), state.activeSeconds);
  state.unattributedActiveSeconds = number(state.unattributedActiveSeconds,
    Math.max(0, state.activeSeconds - Object.values(state.rounds).reduce((sum, round) => sum + number(round.activeSeconds), 0)));
  const fullByRound = new Map();
  for (const event of Object.values(state.events)) {
    if (event.at == null) continue;
    if (!fullByRound.has(event.roundId)) fullByRound.set(event.roundId, []);
    fullByRound.get(event.roundId).push(event);
  }
  for (const round of Object.values(state.rounds)) {
    const full = fullByRound.get(round.roundId) || [];
    round.legacyPoints = number(round.legacyPoints, Math.max(0, number(round.points) - full.reduce((sum, event) => sum + number(event.points), 0)));
    round.legacyTime = number(round.legacyTime, Math.max(0, number(round.timeEarned) - full.reduce((sum, event) => sum + number(event.reward), 0)));
    round.legacyRequestedTime = number(round.legacyRequestedTime, Math.max(0, number(round.requestedTime) - full.reduce((sum, event) => sum + number(event.requestedReward), 0)));
  }
  if (state.selectedGoal !== null && !GOALS.some(goal => goal.id === state.selectedGoal)) state.selectedGoal = 'discover10';
  return state;
}

export class ProgressStore {
  constructor(storage, { now = () => Date.now(), ruleVersion = 'current', dictionaryVersion = 'bundled' } = {}) {
    this.storage = storage;
    this.now = now;
    this.ruleVersion = String(ruleVersion);
    this.dictionaryVersion = String(dictionaryVersion);
    this.actorId = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    this.operationIndex = 0;
    this.appliedJournalKeys = new Set();
    this.pendingOperations = new Map();
    this.lastSnapshotRaw = null;
    this.localRoundId = null;
    this.localRoundOffset = 0;
    this.storageStatus = { state: 'saved', message: 'Saved on this device.' };
    this.state = fresh();
    this._load();
    this._readJournal();
    if (!this.state.ruleVersion) {
      const rounds = Object.values(this.state.rounds).sort((a, b) => a.startedAt - b.startedAt || a.roundId.localeCompare(b.roundId));
      const latest = rounds.at(-1);
      if (latest) {
        this.state.ruleVersion = latest.ruleVersion;
        this.state.dictionaryVersion = latest.dictionaryVersion;
        let first = rounds.length - 1;
        while (first > 0 && rounds[first - 1].ruleVersion === latest.ruleVersion && rounds[first - 1].dictionaryVersion === latest.dictionaryVersion) first--;
        this.state.personalStart = number(rounds[first].activeStart);
      }
    }
    reconcile(this.state);
    if (this.storageStatus.state === 'reset' && Object.keys(this.state.events).length) {
      this.storageStatus = { state: 'recovered', message: 'Your saved Wordbook was recovered from its local event journal.' };
    }
    const contextChanged = this.state.ruleVersion !== this.ruleVersion || this.state.dictionaryVersion !== this.dictionaryVersion;
    if (contextChanged) {
      // A settings or dictionary change preserves the book but starts a new
      // comparable personal observation window.
      this.state.personalStart = this.state.activeSeconds;
      this.state.recent = [];
      this.state.ruleVersion = this.ruleVersion;
      this.state.dictionaryVersion = this.dictionaryVersion;
    }
    this.personalStart = this.state.personalStart;
    reconcile(this.state);
    if (contextChanged) {
      const loadStatus = this.storageStatus;
      const prior = Number(String(this.state.contextRevision || '').split(':')[0]) || 0;
      this.state.contextRevision = `${String(Math.max(number(this.now()), prior + 1)).padStart(16, '0')}:${this.actorId}`;
      this._save({ kind: 'context', ruleVersion: this.ruleVersion, dictionaryVersion: this.dictionaryVersion,
        personalStart: this.personalStart, revision: this.state.contextRevision });
      if (['reset', 'recovered'].includes(loadStatus.state) && this.storageStatus.state === 'saved') this.storageStatus = loadStatus;
    }
  }

  _load() {
    try {
      if (!this.storage?.getItem || !this.storage?.setItem) throw new Error('Storage unavailable');
      const raw = this.storage.getItem(STORAGE_KEY);
      if (raw == null) return;
      try { this.state = decode(raw); this.lastSnapshotRaw = raw; }
      catch {
        const backup = this.storage.getItem(`${STORAGE_KEY}.backup`);
        try {
          if (backup == null) throw new Error('No backup');
          this.state = decode(backup);
          this.storageStatus = { state: 'recovered', message: 'Your saved Wordbook was recovered from its local backup.' };
        } catch {
          this.storageStatus = { state: 'reset', message: 'Saved progress could not be read. New progress will be saved on this device.' };
        }
      }
    } catch {
      this.storageStatus = { state: 'unavailable', message: 'Progress is available for this visit, but this browser is not saving it.' };
    }
  }

  _applyOperation(operation) {
    operation = unpackOperation(operation, this.state);
    if (!object(operation) || operation.version !== 1) return;
    if (operation.round && typeof operation.round.roundId === 'string') {
      const round = { words: [], newWords: [], newWithoutBlankWords: [], milestones: [], ...operation.round };
      mergeState(this.state, { rounds: { [round.roundId]: round } });
    }
    if (operation.event && validWord(operation.event.word) && typeof operation.eventId === 'string') {
      if (!Object.hasOwn(this.state.events, operation.eventId)) put(this.state.events, operation.eventId, operation.event);
    }
    if (operation.kind === 'goal' && String(operation.revision) > String(this.state.goalRevision || '')) {
      this.state.goalRevision = operation.revision;
      this.state.selectedGoal = operation.goal;
    }
    if (operation.kind === 'context' && String(operation.revision) > String(this.state.contextRevision || '')) {
      this.state.contextRevision = operation.revision;
      this.state.ruleVersion = operation.ruleVersion;
      this.state.dictionaryVersion = operation.dictionaryVersion;
      this.state.personalStart = number(operation.personalStart);
    }
    this.state.stats.bestScore = Math.max(this.state.stats.bestScore, number(operation.bestScore));
    this.state.unattributedActiveSeconds = Math.max(number(this.state.unattributedActiveSeconds), number(operation.unattributedActiveSeconds));
    if (operation.milestones) this.state.milestoneIds = union(this.state.milestoneIds, operation.milestones.map(item => item.id));
    if (operation.round && operation.milestones) {
      const round = this.state.rounds[operation.round.roundId];
      round.milestones = [...new Map([...round.milestones, ...operation.milestones].map(item => [item.id, item])).values()];
    }
  }

  _readJournal() {
    try {
      if (typeof this.storage?.key !== 'function') return;
      // Each key is immutable: a competing snapshot write cannot erase an
      // accepted event. A key added during enumeration is picked up next refresh.
      const keys = Array.from({ length: this.storage.length }, (_, index) => this.storage.key(index)).filter(key => key?.startsWith(JOURNAL_PREFIX));
      const operations = [];
      for (const key of keys) {
        if (this.appliedJournalKeys.has(key)) continue;
        try {
          operations.push({ key, operation: JSON.parse(this.storage.getItem(key)) });
        } catch { /* ignore a malformed journal item */ }
      }
      operations.sort((a, b) => Number(b.operation?.k === 'b' || b.operation?.kind === 'begin') - Number(a.operation?.k === 'b' || a.operation?.kind === 'begin'));
      for (const { key, operation } of operations) {
        try { this._applyOperation(operation); this.appliedJournalKeys.add(key); } catch { /* skip malformed records */ }
      }
    } catch { /* keep the in-memory ledger if storage is blocked */ }
  }

  refreshFromStorage() {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (raw != null && raw !== this.lastSnapshotRaw) {
        try { mergeState(this.state, decode(raw)); this.lastSnapshotRaw = raw; }
        catch {
          try { mergeState(this.state, decode(this.storage.getItem(`${STORAGE_KEY}.backup`))); } catch { /* journal remains usable */ }
        }
      }
      this._readJournal();
    } catch { /* never discard unsaved in-memory events */ }
    this.state.ruleVersion = this.ruleVersion;
    this.state.dictionaryVersion = this.dictionaryVersion;
    this.state.personalStart = this.personalStart ?? this.state.personalStart;
    if (this.localRoundId) this.state.currentRoundId = this.localRoundId;
    reconcile(this.state);
    return this.snapshot();
  }

  _save(operation = {}) {
    let journalSaved = false;
    reconcile(this.state);
    const operationKey = `${JOURNAL_PREFIX}${this.actorId}.${++this.operationIndex}`;
    this.pendingOperations.set(operationKey, JSON.stringify(packOperation(operation)));
    try {
      if (!this.storage?.setItem) throw new Error('Storage unavailable');
      if (typeof this.storage.key === 'function') {
        for (const [key, value] of this.pendingOperations) {
          this.storage.setItem(key, value);
          this.pendingOperations.delete(key);
          this.appliedJournalKeys.add(key);
        }
        journalSaved = true;
        // The journal is the durable source for new history. Existing snapshots
        // stay untouched as migration baselines. Avoid duplicating the whole
        // book (and serializing it during timed play) for every accepted event.
        this.storageStatus = { state: 'saved', message: 'Saved on this device.' };
        return true;
      }
      this.refreshFromStorage();
      const serialized = JSON.stringify(this.state);
      this.storage.setItem(STORAGE_KEY, serialized);
      this.lastSnapshotRaw = serialized;
      this.pendingOperations.clear();
      // A failed extra backup does not invalidate a successful primary write.
      try { this.storage.setItem(`${STORAGE_KEY}.backup`, serialized); } catch { /* primary is durable */ }
      this.storageStatus = { state: 'saved', message: 'Saved on this device.' };
      return true;
    } catch {
      if (journalSaved) {
        this.storageStatus = { state: 'saved', message: 'Saved on this device. The local event journal protects your progress.' };
        return true;
      }
      this.storageStatus = { state: 'unavailable', message: 'Progress is available for this visit, but could not be saved. Free browser storage or enable local storage.' };
      return false;
    }
  }

  _goal(definition) {
    const entries = Object.values(this.state.entries);
    const current = definition.length ? entries.filter(entry => entry.length === definition.length).length : entries.length;
    return { ...definition, current, progress: Math.min(1, current / definition.target), complete: current >= definition.target };
  }

  _advance(total) {
    this.state.activeSeconds = Math.max(this.state.activeSeconds, number(total, this.state.activeSeconds));
    const cutoff = this.state.activeSeconds - WINDOW_SECONDS;
    this.state.recent = this.state.recent.filter(event => event.at > cutoff);
  }

  // This setter takes absolute lifetime active REAL seconds, excluding pause.
  // Call on events/checkpoints, not on every animation frame.
  setActiveSeconds(total, { roundId = this.localRoundId, activeSeconds } = {}) {
    this.refreshFromStorage();
    const before = this.state.activeSeconds;
    const round = roundId && Object.hasOwn(this.state.rounds, roundId) ? this.state.rounds[roundId] : null;
    if (round && !round.finished) round.activeSeconds = Math.max(round.activeSeconds,
      number(activeSeconds, Math.max(0, number(total) - this.localRoundOffset)));
    else this.state.unattributedActiveSeconds += Math.max(0, number(total) - this.state.activeSeconds);
    reconcile(this.state);
    if (before !== this.state.activeSeconds) this._save({ kind: 'checkpoint', round: round ? roundShell(round) : undefined, unattributedActiveSeconds: this.state.unattributedActiveSeconds });
    return this.state.activeSeconds;
  }

  // Migrate a legacy numeric record without inventing a round or word history.
  importBestScore(value) {
    this.refreshFromStorage();
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return this.state.stats.bestScore;
    if (value > this.state.stats.bestScore) {
      this.state.stats.bestScore = value;
      this._save({ kind: 'record', bestScore: value });
    }
    return this.state.stats.bestScore;
  }

  beginRound(roundId) {
    if (typeof roundId !== 'string' || !roundId || ['__proto__', 'constructor', 'prototype'].includes(roundId)) throw new TypeError('A unique roundId is required');
    this.refreshFromStorage();
    if (this.localRoundId && this.localRoundId !== roundId && !this.state.rounds[this.localRoundId]?.finished) {
      this.finishRound({ roundId: this.localRoundId, abandoned: true });
    }
    if (!Object.hasOwn(this.state.rounds, roundId)) {
      this.state.rounds[roundId] = { roundId, startedAt: number(this.now()), activeStart: this.state.activeSeconds,
        activeSeconds: 0, words: [], newWords: [], newWithoutBlankWords: [], milestones: [],
        points: 0, timeEarned: 0, requestedTime: 0, longestWord: '', bestChain: 0,
        finished: false, abandoned: false, previousBest: this.state.stats.bestScore,
        ruleVersion: this.ruleVersion, dictionaryVersion: this.dictionaryVersion,
        legacyPoints: 0, legacyTime: 0, legacyRequestedTime: 0 };
    }
    this.localRoundId = roundId;
    this.localRoundOffset = this.state.rounds[roundId].activeStart;
    this.state.currentRoundId = roundId;
    this._save({ kind: 'begin', round: roundShell(this.state.rounds[roundId]) });
    return copy(this.state.rounds[roundId]);
  }

  // activeSeconds here is ROUND-local active real time, just like engine.elapsed.
  recordWord(result, { roundId = this.state.currentRoundId, eventId, activeSeconds = result?.activeSeconds } = {}) {
    const word = canonical(result?.word);
    if ((result?.type && result.type !== 'word') || !validWord(word)) return { ignored: true, reason: 'not-an-accepted-word' };
    this.refreshFromStorage();
    const round = Object.hasOwn(this.state.rounds, roundId) ? this.state.rounds[roundId] : null;
    if (!round) throw new Error('Call beginRound before recording accepted words');
    const id = String(eventId ?? `${roundId}:${word}`);
    if (Object.hasOwn(this.state.events, id) || round.words.includes(word)) {
      return { duplicate: true, isNew: false, newWithoutBlanks: false, entry: this.state.entries[word] ? copy(this.state.entries[word]) : null };
    }
    if (round.finished) return { ignored: true, reason: 'round-finished' };
    const at = number(this.now());
    const elapsed = number(activeSeconds, round.activeSeconds);
    round.activeSeconds = Math.max(round.activeSeconds, elapsed);
    this._advance(round.activeStart + elapsed);
    const points = number(result.points);
    const blankCount = Math.max(number(result.blankCount), (Array.isArray(result.selectedTiles) ? result.selectedTiles : []).filter(tile => tile?.blank || tile?.isBlank || tile?.letter === '?').length,
      typeof result.pattern === 'string' ? [...result.pattern].filter(letter => letter === '?').length : 0);
    const withoutBlanks = blankCount === 0;
    const existing = this.state.entries[word];
    const isNew = !existing;
    const newWithoutBlanks = withoutBlanks && !existing?.withoutBlanks;
    const entry = existing || { word, length: word.length, firstSeen: at, lastSeen: at, timesPlayed: 0,
      withoutBlanks: false, firstWithoutBlanks: null, bestPoints: 0 };
    entry.timesPlayed++;
    entry.lastSeen = Math.max(entry.lastSeen, at);
    entry.bestPoints = Math.max(number(entry.bestPoints), points);
    if (newWithoutBlanks) entry.firstWithoutBlanks = at;
    entry.withoutBlanks ||= withoutBlanks;
    this.state.entries[word] = entry;
    // Retain event IDs across reloads and rounds. Never prune this dedup ledger
    // with the rolling statistics window.
    const event = { roundId, word, at, activeSeconds: elapsed, points, reward: number(result.reward),
      requestedReward: number(result.requestedReward, number(result.reward)), withoutBlanks,
      comboCount: number(result.comboCount), ruleVersion: this.ruleVersion, dictionaryVersion: this.dictionaryVersion };
    put(this.state.events, id, event);
    round.words.push(word);
    if (isNew) round.newWords.push(word);
    if (newWithoutBlanks) round.newWithoutBlankWords.push(word);
    round.points += points;
    this.state.stats.bestScore = Math.max(this.state.stats.bestScore, round.points);
    round.timeEarned += number(result.reward);
    round.requestedTime += number(result.requestedReward, number(result.reward));
    if (word.length > round.longestWord.length) round.longestWord = word;
    round.bestChain = Math.max(round.bestChain, number(result.comboCount));
    this.state.stats.bestChain = Math.max(this.state.stats.bestChain, round.bestChain);
    this.state.stats.totalWordsPlayed++;
    this.state.stats.totalPoints += points;
    if (withoutBlanks) {
      const eventAt = round.activeStart + elapsed;
      if (eventAt > this.state.activeSeconds - WINDOW_SECONDS) this.state.recent.push({ word, at: eventAt });
    }
    const milestones = GOALS.filter(goal => !this.state.milestoneIds.includes(goal.id) && this._goal(goal).complete)
      .map(goal => ({ id: goal.id, title: goal.title, target: goal.target }));
    for (const milestone of milestones) this.state.milestoneIds.push(milestone.id);
    round.milestones.push(...milestones);
    this._save({ kind: 'word', eventId: id, event, round: roundShell(round), milestones });
    return { duplicate: false, isNew, newWithoutBlanks, entry: copy(entry),
      milestone: copy(milestones.find(item => item.id === this.state.selectedGoal) || milestones[0] || null) };
  }

  finishRound(summary = {}) {
    const roundId = summary.roundId ?? this.state.currentRoundId;
    this.refreshFromStorage();
    const round = Object.hasOwn(this.state.rounds, roundId) ? this.state.rounds[roundId] : null;
    if (!round) throw new Error('Call beginRound before finishing a round');
    if (round.finished) return copy(round);
    round.activeSeconds = Math.max(round.activeSeconds, number(summary.activeSeconds));
    this._advance(round.activeStart + round.activeSeconds);
    round.score = number(summary.score, round.points);
    round.wordCount = round.words.length;
    round.newWordCount = round.newWords.length;
    round.bestChain = Math.max(round.bestChain, number(summary.bestChain), number(summary.comboBest));
    round.mistakes = number(summary.mistakes);
    round.finishedAt = number(this.now());
    round.finished = true;
    round.abandoned = Boolean(summary.abandoned);
    round.isPersonalBest = round.score > number(round.previousBest);
    this.state.stats.bestScore = Math.max(this.state.stats.bestScore, round.score);
    this.state.stats.bestChain = Math.max(this.state.stats.bestChain, round.bestChain);
    this.state.lastRoundId = roundId;
    this._save({ kind: 'finish', round: roundShell(round), milestones: round.milestones });
    return copy(this.state.rounds[roundId]);
  }

  selectGoal(id) {
    this.refreshFromStorage();
    if (id === null) {
      this.state.selectedGoal = null;
      this.state.goalRevision = this._goalRevision();
      this._save({ kind: 'goal', goal: null, revision: this.state.goalRevision });
      return null;
    }
    const goal = GOALS.find(item => item.id === id);
    if (!goal) return null;
    this.state.selectedGoal = id;
    this.state.goalRevision = this._goalRevision();
    this._save({ kind: 'goal', goal: id, revision: this.state.goalRevision });
    return this._goal(goal);
  }

  _goalRevision() {
    const prior = Number(String(this.state.goalRevision || '').split(':')[0]) || 0;
    return `${String(Math.max(number(this.now()), prior + 1)).padStart(16, '0')}:${this.actorId}`;
  }

  snapshot() {
    const entries = Object.values(this.state.entries).sort((a, b) => a.word.localeCompare(b.word));
    const lengthCounts = {};
    for (const entry of entries) lengthCounts[entry.length] = (lengthCounts[entry.length] || 0) + 1;
    const distinct = new Set(this.state.recent.map(event => event.word));
    const distinctByLength = { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
    for (const word of distinct) distinctByLength[word.length] = (distinctByLength[word.length] || 0) + 1;
    const observedSeconds = Math.min(WINDOW_SECONDS, Math.max(0, this.state.activeSeconds - this.state.personalStart));
    const goals = GOALS.map(goal => this._goal(goal));
    return copy({ entries, totalWords: entries.length, lengthCounts,
      stats: { ...this.state.stats, activeSeconds: this.state.activeSeconds, totalActiveSeconds: this.state.activeSeconds,
        withoutBlankWords: entries.filter(entry => entry.withoutBlanks).length,
        longestWord: entries.reduce((longest, entry) => entry.length > longest.length ? entry.word : longest, ''),
        personal: { windowSeconds: WINDOW_SECONDS, observedSeconds, complete: observedSeconds >= WINDOW_SECONDS,
          distinctByLength, totalDistinct: distinct.size, ruleVersion: this.ruleVersion, dictionaryVersion: this.dictionaryVersion } },
      goal: goals.find(goal => goal.id === this.state.selectedGoal) || null, goals,
      comparison: { status: 'unavailable', label: 'Community comparison', reason: 'no-cohort',
        message: 'Not enough real player data yet. Personal progress is available now.' },
      round: this.state.rounds[this.state.lastRoundId] || null, storageStatus: this.storageStatus });
  }
}

// Pure optional boundary for a future verified service. It does not fetch data,
// infer vocabulary ability, or add comparison claims to the local Wordbook.
export function rankCommunity({ value, observedSeconds, cohort, playerId, ruleVersion, dictionaryVersion,
  metric, windowSeconds = WINDOW_SECONDS, minPlayers = 500, now = Date.now() } = {}) {
  const unavailable = reason => ({ status: 'unavailable', reason });
  if (!cohort?.verified || !Array.isArray(cohort.players)) return unavailable('no-verified-cohort');
  if (cohort.stable !== true) return unavailable('unstable-cohort');
  if (!Number.isInteger(value) || value < 0 || !metric || !ruleVersion || !dictionaryVersion
    || !Number.isFinite(windowSeconds) || windowSeconds <= 0) return unavailable('invalid-comparison');
  if (number(observedSeconds, -1) < windowSeconds) return unavailable('incomplete-personal-window');
  const latest = new Map();
  for (const peer of cohort.players) {
    if (!peer || typeof peer.playerId !== 'string' || !peer.playerId || peer.playerId === playerId
      || !Number.isInteger(peer.value) || peer.value < 0 || peer.metric !== metric
      || peer.ruleVersion !== ruleVersion || peer.dictionaryVersion !== dictionaryVersion
      || peer.windowSeconds !== windowSeconds || number(peer.observedSeconds, -1) < windowSeconds
      || !Number.isFinite(peer.updatedAt) || peer.updatedAt > now || now - peer.updatedAt > 28 * 86400000) continue;
    if (!latest.has(peer.playerId) || latest.get(peer.playerId).updatedAt < peer.updatedAt) latest.set(peer.playerId, peer);
  }
  const peers = [...latest.values()];
  const sampleSize = peers.length;
  if (sampleSize < Math.max(1, number(minPlayers, 500))) return { ...unavailable('insufficient-players'), sampleSize };
  const below = peers.filter(peer => peer.value < value).length;
  const tied = peers.filter(peer => peer.value === value).length;
  const percentile = 100 * (below + tied / 2) / sampleSize;
  // Include the player and every tie when describing a top band. A mass of zero
  // counts must never accidentally become an achievement badge.
  const conservativeTopPercent = 100 * (sampleSize - below + 1) / (sampleSize + 1);
  const topBand = value > 0 ? [10, 25, 50].find(band => conservativeTopPercent <= band) ?? null : null;
  return { status: 'available', sampleSize, percentile, below, tied, topBand,
    conservativeTopPercent, metric, windowSeconds, updatedAt: now,
    label: topBand ? `Top ${topBand}% for ${metric}` : value === 0 ? 'No words recorded for this comparison yet.' : 'Your word variety comparison',
    description: 'In-game performance among eligible recent players; not a vocabulary assessment.' };
}
