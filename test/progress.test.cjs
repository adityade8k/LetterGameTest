const test = require('node:test');
const assert = require('node:assert/strict');
const api = import('../progress.mjs');

function memoryStorage() {
  const values = new Map();
  return { values, fail: false,
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { if (this.fail) throw new Error('blocked'); return values.get(key) ?? null; },
    setItem(key, value) { if (this.fail) throw new Error('quota'); values.set(key, value); } };
}
function word(value, extra = {}) {
  return { type: 'word', word: value, points: 8, reward: 1, requestedReward: 12,
    selectedTiles: [...value].map(letter => ({ letter, blank: false })), blankCount: 0, ...extra };
}

test('accepted events save before results; reload and durable event IDs cannot duplicate progress', async () => {
  const { ProgressStore } = await api;
  const storage = memoryStorage();
  let store = new ProgressStore(storage, { now: () => 100 });
  store.beginRound('round-1');
  assert.equal(store.recordWord(word('planet'), { eventId: 'event-1', activeSeconds: 4 }).isNew, true);
  store = new ProgressStore(storage, { now: () => 200 });
  assert.equal(store.snapshot().totalWords, 1);
  assert.equal(store.snapshot().entries[0].word, 'PLANET');
  assert.equal(store.recordWord(word('PLANET'), { eventId: 'event-1', activeSeconds: 4 }).duplicate, true);
  assert.equal(store.snapshot().entries[0].timesPlayed, 1);
  store.finishRound({ score: 8, activeSeconds: 10 });
  store.beginRound('round-2');
  const repeated = store.recordWord(word('PLANET'), { eventId: 'event-2', activeSeconds: 2 });
  assert.equal(repeated.isNew, false);
  assert.equal(repeated.entry.timesPlayed, 2);
  assert.equal(repeated.entry.firstSeen, 100);
  assert.equal(repeated.entry.lastSeen, 200);
  assert.equal(store.snapshot().stats.activeSeconds, 12);
});

test('automatic wildcard words enter the book; a later no-blank play upgrades one entry', async () => {
  const { ProgressStore } = await api;
  const store = new ProgressStore(memoryStorage(), { now: () => 50 });
  store.beginRound('one');
  const found = store.recordWord(word('NIGHT', { automatic: true, blankCount: 1, pattern: '?IGHT' }), { eventId: 'a', activeSeconds: 3 });
  assert.equal(found.isNew, true);
  assert.equal(found.newWithoutBlanks, false);
  assert.equal(found.entry.withoutBlanks, false);
  assert.equal(store.snapshot().stats.personal.distinctByLength[5], 0);
  store.finishRound();
  store.beginRound('two');
  const upgraded = store.recordWord(word('NIGHT'), { eventId: 'b', activeSeconds: 1 });
  assert.equal(upgraded.isNew, false);
  assert.equal(upgraded.newWithoutBlanks, true);
  assert.equal(upgraded.entry.firstWithoutBlanks, 50);
  assert.equal(store.snapshot().totalWords, 1);
  assert.equal(store.snapshot().stats.personal.distinctByLength[5], 1);
  assert.deepEqual(store.finishRound().newWithoutBlankWords, ['NIGHT']);
});

test('penalties never collect; a second delivery under a different ID in the same round is harmless', async () => {
  const { ProgressStore } = await api;
  const store = new ProgressStore(memoryStorage());
  store.beginRound('r');
  assert.equal(store.recordWord({ type: 'penalty', word: 'CAT' }).ignored, true);
  assert.equal(store.recordWord(word('CA?')).ignored, true);
  store.recordWord(word('CAT'), { eventId: 'one' });
  assert.equal(store.recordWord(word('CAT'), { eventId: 'two' }).duplicate, true);
  assert.equal(store.snapshot().stats.totalWordsPlayed, 1);
});

test('round summary is idempotent and distinguishes credited time from requested reward', async () => {
  const { ProgressStore } = await api;
  const store = new ProgressStore(memoryStorage());
  store.beginRound('r');
  store.recordWord(word('EARTH'), { eventId: 'e', activeSeconds: 2 });
  const first = store.finishRound({ score: 8, activeSeconds: 40, comboBest: 4, mistakes: 2 });
  assert.equal(first.timeEarned, 1);
  assert.equal(first.requestedTime, 12);
  assert.equal(first.bestChain, 4);
  assert.equal(store.snapshot().stats.bestChain, 4);
  assert.equal(first.wordCount, 1);
  assert.equal(first.newWordCount, 1);
  assert.equal(first.isPersonalBest, true);
  assert.deepEqual(store.finishRound({ score: 900, activeSeconds: 900 }), first);
  assert.equal(store.snapshot().stats.roundsPlayed, 1);
  assert.equal(store.snapshot().stats.bestScore, 8);
  assert.equal(store.snapshot().stats.activeSeconds, 40);
  assert.equal(store.recordWord(word('APPLE'), { eventId: 'late' }).reason, 'round-finished');
});

test('rolling personal window uses real active time, distinct words, and survives round boundaries', async () => {
  const { ProgressStore, WINDOW_SECONDS } = await api;
  const store = new ProgressStore(memoryStorage());
  store.beginRound('one');
  store.recordWord(word('APPLE'), { eventId: 'a', activeSeconds: 0 });
  store.recordWord(word('PLANET'), { eventId: 'b', activeSeconds: 10 });
  store.recordWord(word('ORCHARD', { blankCount: 1 }), { eventId: 'c', activeSeconds: 20 });
  store.finishRound({ activeSeconds: 30 });
  store.beginRound('two');
  store.recordWord(word('APPLE'), { eventId: 'd', activeSeconds: 20 });
  assert.equal(store.snapshot().stats.personal.distinctByLength[5], 1);
  store.setActiveSeconds(WINDOW_SECONDS + 10);
  let stats = store.snapshot().stats.personal;
  assert.equal(stats.complete, true);
  assert.equal(stats.distinctByLength[5], 1);
  assert.equal(stats.distinctByLength[6], 0); // exact left boundary excluded
  assert.equal(stats.distinctByLength[7], 0); // wildcard never entered comparison
  store.setActiveSeconds(WINDOW_SECONDS + 50);
  assert.equal(store.snapshot().stats.personal.totalDistinct, 0);
  store.setActiveSeconds(0);
  assert.equal(store.snapshot().stats.activeSeconds, WINDOW_SECONDS + 50);
  assert.equal(store.recordWord(word('APPLE'), { eventId: 'a' }).duplicate, true);
});

test('rule-version changes preserve the Wordbook but restart comparable observation time', async () => {
  const { ProgressStore } = await api;
  const storage = memoryStorage();
  const before = new ProgressStore(storage, { ruleVersion: 'old' });
  before.beginRound('r');
  before.recordWord(word('APPLE'), { activeSeconds: 10 });
  before.finishRound({ activeSeconds: 60 });
  const after = new ProgressStore(storage, { ruleVersion: 'new' });
  assert.equal(after.snapshot().totalWords, 1);
  assert.equal(after.snapshot().stats.personal.observedSeconds, 0);
  assert.equal(after.snapshot().stats.personal.totalDistinct, 0);
  after.setActiveSeconds(70);
  assert.equal(after.snapshot().stats.personal.observedSeconds, 10);
  const again = new ProgressStore(storage, { ruleVersion: 'new' });
  assert.equal(again.snapshot().stats.personal.observedSeconds, 10);
  assert.equal(again.snapshot().stats.personal.totalDistinct, 0);
});

test('journal-only reload retains exact personal windows, imported record and disabled goal without full snapshots', async () => {
  const { ProgressStore, STORAGE_KEY } = await api;
  const storage = memoryStorage();
  const store = new ProgressStore(storage, { ruleVersion: 'r', dictionaryVersion: 'd' });
  store.importBestScore(100);
  store.selectGoal(null);
  store.beginRound('r');
  store.recordWord(word('PLANET'), { activeSeconds: 10 });
  store.recordWord(word('APPLE'), { activeSeconds: 15 });
  store.finishRound({ activeSeconds: 25 });
  const before = store.snapshot();
  assert.equal(storage.getItem(STORAGE_KEY), null);
  const after = new ProgressStore(storage, { ruleVersion: 'r', dictionaryVersion: 'd' }).snapshot();
  assert.deepEqual(after.stats.personal, before.stats.personal);
  assert.equal(after.stats.activeSeconds, 25);
  assert.equal(after.stats.bestScore, 100);
  assert.equal(after.goal, null);
});

test('corrupt cache JSON recovers a backup or event journal; unrecoverable data starts safely', async () => {
  const { ProgressStore, STORAGE_KEY, JOURNAL_PREFIX } = await api;
  const storage = memoryStorage();
  const original = new ProgressStore(storage);
  original.beginRound('r');
  original.recordWord(word('APPLE'));
  storage.values.set(STORAGE_KEY, '{broken');
  const recovered = new ProgressStore(storage);
  assert.equal(recovered.snapshot().totalWords, 1);
  assert.equal(recovered.snapshot().storageStatus.state, 'recovered');
  storage.values.set(`${STORAGE_KEY}.backup`, '{}');
  assert.equal(new ProgressStore(storage).snapshot().totalWords, 1);
  for (const key of storage.values.keys()) if (key.startsWith(JOURNAL_PREFIX)) storage.values.delete(key);
  const reset = new ProgressStore(storage);
  assert.equal(reset.snapshot().totalWords, 0);
  assert.equal(reset.snapshot().storageStatus.state, 'reset');
});

test('blocked or full storage retains in-memory play and can save after recovery', async () => {
  const { ProgressStore } = await api;
  const storage = memoryStorage();
  storage.fail = true;
  const store = new ProgressStore(storage);
  store.beginRound('r');
  store.recordWord(word('APPLE'), { eventId: 'a', activeSeconds: 1 });
  assert.equal(store.snapshot().totalWords, 1);
  assert.equal(store.snapshot().storageStatus.state, 'unavailable');
  storage.fail = false;
  store.recordWord(word('GRAPE'), { eventId: 'b', activeSeconds: 2 });
  assert.equal(store.snapshot().storageStatus.state, 'saved');
  assert.equal(new ProgressStore(storage).snapshot().totalWords, 2);
});

test('selected finite goals persist and milestones are earned once without changing rewards', async () => {
  const { ProgressStore } = await api;
  const storage = memoryStorage();
  const store = new ProgressStore(storage);
  assert.equal(store.selectGoal('seven5').target, 5);
  store.beginRound('r');
  let last;
  for (const value of ['ORCHARD', 'LANTERN', 'RAINBOW', 'CABINET', 'JOURNEY']) last = store.recordWord(word(value));
  assert.equal(last.milestone.id, 'seven5');
  assert.equal(store.snapshot().goal.complete, true);
  assert.equal(store.snapshot().goal.progress, 1);
  assert.equal(store.selectGoal('unknown'), null);
  assert.equal(new ProgressStore(storage).snapshot().goal.id, 'seven5');
  store.finishRound();
  store.beginRound('again');
  assert.equal(store.recordWord(word('ORCHARD')).milestone, null);
});

test('a disabled goal survives reload and chain records survive an unfinished round', async () => {
  const { ProgressStore } = await api;
  const storage = memoryStorage();
  const store = new ProgressStore(storage);
  store.selectGoal(null);
  assert.equal(store.snapshot().goal, null);
  store.beginRound('unfinished');
  store.recordWord(word('APPLE', { comboCount: 7 }), { eventId: 'saved-before-crash' });
  const reloaded = new ProgressStore(storage);
  assert.equal(reloaded.snapshot().goal, null);
  assert.equal(reloaded.snapshot().stats.bestChain, 7);
  assert.equal(reloaded.snapshot().stats.bestScore, 8);
  assert.equal(reloaded.snapshot().totalWords, 1);
  assert.equal(reloaded.snapshot().stats.roundsPlayed, 1);
  assert.equal(reloaded.snapshot().stats.roundsCompleted, 0);
  assert.equal(reloaded.finishRound({ roundId: 'unfinished', score: 8 }).isPersonalBest, true);
});

test('legacy numeric best scores migrate without invented history or reduced records', async () => {
  const { ProgressStore } = await api;
  const storage = memoryStorage();
  const store = new ProgressStore(storage);
  assert.equal(store.importBestScore(40), 40);
  for (const invalid of ['99', NaN, Infinity, -1, null, {}, undefined]) assert.equal(store.importBestScore(invalid), 40);
  assert.equal(store.importBestScore(20), 40);
  const reloaded = new ProgressStore(storage);
  assert.equal(reloaded.snapshot().stats.bestScore, 40);
  assert.equal(reloaded.snapshot().stats.roundsPlayed, 0);
  assert.equal(reloaded.snapshot().stats.totalPoints, 0);
  assert.equal(reloaded.snapshot().totalWords, 0);
  reloaded.beginRound('after-import');
  reloaded.recordWord(word('APPLE', { points: 41 }));
  assert.equal(new ProgressStore(storage).snapshot().stats.bestScore, 41);
  assert.equal(reloaded.finishRound({ score: 41 }).isPersonalBest, true);
  reloaded.beginRound('tied-record');
  reloaded.recordWord(word('APPLE', { points: 41 }));
  assert.equal(reloaded.finishRound({ score: 41 }).isPersonalBest, false);
});

test('snapshots cannot mutate persistence, and local play never invents community claims', async () => {
  const { ProgressStore, rankCommunity } = await api;
  const store = new ProgressStore(memoryStorage());
  store.beginRound('r');
  store.recordWord(word('APPLE'));
  const snapshot = store.snapshot();
  snapshot.entries[0].word = 'FAKE';
  assert.equal(store.snapshot().entries[0].word, 'APPLE');
  assert.equal(snapshot.comparison.status, 'unavailable');
  assert.equal(rankCommunity({ value: 99 }).reason, 'no-verified-cohort');
});

test('two preexisting tabs merge different words and round durations without losing either book', async () => {
  const { ProgressStore } = await api;
  const storage = memoryStorage();
  const a = new ProgressStore(storage, { now: () => 100 });
  const b = new ProgressStore(storage, { now: () => 200 });
  a.beginRound('a');
  a.recordWord(word('CAT', { points: 5 }), { eventId: 'cat', activeSeconds: 10 });
  b.beginRound('b');
  b.recordWord(word('DOG', { points: 5 }), { eventId: 'dog', activeSeconds: 7 });
  a.setActiveSeconds(20, { roundId: 'a', activeSeconds: 20 });
  b.setActiveSeconds(25, { roundId: 'b', activeSeconds: 15 });
  for (const store of [a, b, new ProgressStore(storage)]) {
    const snapshot = store.refreshFromStorage();
    assert.deepEqual(snapshot.entries.map(entry => entry.word), ['CAT', 'DOG']);
    assert.equal(snapshot.stats.totalWordsPlayed, 2);
    assert.equal(snapshot.stats.totalPoints, 10);
    assert.equal(snapshot.stats.activeSeconds, 35);
    assert.equal(snapshot.stats.roundsPlayed, 2);
  }
  a.finishRound({ roundId: 'a', activeSeconds: 20 });
  b.finishRound({ roundId: 'b', activeSeconds: 15, abandoned: true });
  const final = new ProgressStore(storage).snapshot();
  assert.equal(final.stats.roundsPlayed, 2);
  assert.equal(final.stats.roundsCompleted, 1);
  assert.equal(final.round.abandoned, true);
});

test('cross-tab same-word events deduplicate by event ID, retain both plays, and merge blank stamps', async () => {
  const { ProgressStore } = await api;
  const storage = memoryStorage();
  const a = new ProgressStore(storage, { now: () => 100 });
  const b = new ProgressStore(storage, { now: () => 200 });
  a.beginRound('a');
  b.beginRound('b');
  a.recordWord(word('NIGHT', { points: 4, blankCount: 1 }), { eventId: 'a-night', activeSeconds: 1 });
  b.recordWord(word('NIGHT', { points: 9 }), { eventId: 'b-night', activeSeconds: 1 });
  assert.equal(a.recordWord(word('NIGHT'), { roundId: 'b', eventId: 'b-night' }).duplicate, true);
  const snapshot = a.refreshFromStorage();
  assert.equal(snapshot.totalWords, 1);
  assert.equal(snapshot.entries[0].timesPlayed, 2);
  assert.equal(snapshot.entries[0].firstSeen, 100);
  assert.equal(snapshot.entries[0].lastSeen, 200);
  assert.equal(snapshot.entries[0].firstWithoutBlanks, 200);
  assert.equal(snapshot.entries[0].withoutBlanks, true);
  assert.equal(snapshot.entries[0].bestPoints, 9);
  assert.equal(snapshot.stats.totalPoints, 13);
  assert.equal(a.finishRound({ roundId: 'a' }).newWordCount, 1);
  assert.equal(b.finishRound({ roundId: 'b' }).newWordCount, 0);
});

test('immutable events survive interleaved writes plus a stale legacy snapshot and backup', async () => {
  const { ProgressStore, STORAGE_KEY, JOURNAL_PREFIX } = await api;
  const storage = memoryStorage();
  const a = new ProgressStore(storage, { now: () => 100 });
  const b = new ProgressStore(storage, { now: () => 200 });
  a.beginRound('a');
  const originalSet = storage.setItem.bind(storage);
  let interleaved = false;
  storage.setItem = (key, value) => {
    if (key.startsWith(JOURNAL_PREFIX) && !interleaved && JSON.parse(value).k === 'w' && JSON.parse(value).e[1] === 'CAT') {
      interleaved = true;
      b.beginRound('b');
      b.recordWord(word('DOG'), { eventId: 'b-dog', activeSeconds: 3 });
    }
    originalSet(key, value);
  };
  a.recordWord(word('CAT'), { eventId: 'a-cat', activeSeconds: 2 });
  assert.equal(interleaved, true);
  // Simulate a still-open older app overwriting its old cache and backup.
  originalSet(STORAGE_KEY, JSON.stringify(a.state));
  originalSet(`${STORAGE_KEY}.backup`, JSON.stringify(a.state));
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).entries.DOG, undefined);
  const recovered = new ProgressStore(storage);
  assert.deepEqual(recovered.snapshot().entries.map(entry => entry.word), ['CAT', 'DOG']);
  assert.equal(recovered.snapshot().stats.totalPoints, 16);
  recovered.refreshFromStorage();
  assert.equal(recovered.snapshot().stats.totalWordsPlayed, 2);
});

test('starting another round abandons only this tab’s old round and preserves its earned words', async () => {
  const { ProgressStore } = await api;
  const storage = memoryStorage();
  const a = new ProgressStore(storage, { now: () => 100 });
  const b = new ProgressStore(storage, { now: () => 200 });
  a.beginRound('a-old');
  a.recordWord(word('CAT'));
  b.beginRound('b-active');
  a.beginRound('a-new');
  const snapshot = new ProgressStore(storage).snapshot();
  assert.equal(snapshot.stats.roundsPlayed, 3);
  assert.equal(snapshot.stats.roundsCompleted, 0);
  assert.equal(snapshot.round.roundId, 'a-old');
  assert.equal(snapshot.round.abandoned, true);
  assert.equal(b.recordWord(word('DOG')).isNew, true);
});

function peer(id, value, extra = {}) {
  return { playerId: id, value, metric: 'five-letter variety', ruleVersion: 'r1', dictionaryVersion: 'd1',
    windowSeconds: 1200, observedSeconds: 1200, updatedAt: 100000, ...extra };
}
function comparison(players, extra = {}) {
  return { value: 10, observedSeconds: 1200, cohort: { verified: true, stable: true, players }, playerId: 'self', metric: 'five-letter variety',
    ruleVersion: 'r1', dictionaryVersion: 'd1', minPlayers: 3, now: 100000, ...extra };
}

test('verified cohort ranking uses midranks and conservative ties; zero never receives a badge', async () => {
  const { rankCommunity } = await api;
  const result = rankCommunity(comparison([peer('a', 9), peer('b', 10), peer('c', 11)]));
  assert.equal(result.percentile, 50);
  assert.equal(result.below, 1);
  assert.equal(result.tied, 1);
  assert.equal(result.topBand, null);
  const zeros = rankCommunity(comparison([peer('a', 0), peer('b', 0), peer('c', 0)], { value: 0 }));
  assert.equal(zeros.percentile, 50);
  assert.equal(zeros.topBand, null);
  const top = rankCommunity(comparison(Array.from({ length: 20 }, (_, i) => peer(String(i), 1))));
  assert.equal(top.topBand, 10);
  assert.equal(rankCommunity(comparison([], { cohort: { verified: true, players: [] } })).reason, 'unstable-cohort');
});

test('cohort filters self, stale, incomplete and incompatible data and uses one observation per player', async () => {
  const { rankCommunity } = await api;
  const result = rankCommunity(comparison([
    peer('a', 1), peer('a', 2, { updatedAt: 99999 }), peer('b', 10), peer('c', 11), peer('self', 99),
    peer('wrong-version', 1, { ruleVersion: 'old' }), peer('short', 1, { observedSeconds: 1199 }),
    peer('missing', 1, { observedSeconds: undefined }), peer('future', 1, { updatedAt: 100001 }),
    peer('old', 1, { updatedAt: -28 * 86400000 }), peer('wrong-length', 1, { metric: 'six-letter variety' }),
  ]));
  assert.equal(result.sampleSize, 3);
  assert.equal(result.percentile, 50);
  assert.equal(rankCommunity(comparison([peer('a', 1)])).reason, 'insufficient-players');
  assert.equal(rankCommunity(comparison([peer('a', 1)], { observedSeconds: 60 })).reason, 'incomplete-personal-window');
});
