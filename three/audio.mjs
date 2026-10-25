// Quiet, synthesized feedback. Gameplay never waits for an audio device.
// Only unlock(), called from a real input gesture, creates/resumes the context.
export function createAudio({ effects = false, music = false, haptics = false } = {}) {
  let settings = { effects: Boolean(effects), music: Boolean(music), haptics: Boolean(haptics) };
  let context, effectsBus, musicBus, active = true, ambientActive = true, disposed = false;
  const voices = new Set();
  const lastPlayed = new Map();
  let ambient = false, lastWordAt = -Infinity, lastWordPriority = -1;
  const toneFloor = .0001;

  function cancelVoice(voice) {
    if (!voices.has(voice)) return;
    voices.delete(voice);
    try { voice.gain.gain.cancelScheduledValues(context.currentTime); voice.gain.gain.setValueAtTime(0, context.currentTime); } catch { /* Device may be gone. */ }
    try { voice.oscillator.stop(context.currentTime); } catch { /* Already stopped. */ }
    try { voice.oscillator.disconnect(); voice.gain.disconnect(); } catch { /* Already disconnected. */ }
  }
  function cancelWhere(predicate) {
    for (const voice of [...voices]) if (predicate(voice)) cancelVoice(voice);
  }
  function cancelHaptics() {
    try { if (settings.haptics) globalThis.navigator?.vibrate?.(0); } catch { /* Optional on mobile browsers. */ }
  }
  function addVoice(frequency, delay, duration, volume, { bus = 'effects', family = '', type = 'sine', detune = 0, sustain = false } = {}) {
    if (!context || context.state !== 'running' || !active || disposed) return;
    // Keep even unusually fast input bounded. Ambient voices do not displace feedback.
    if (voices.size >= 32) {
      const oldest = [...voices].find(voice => voice.bus === 'effects');
      if (oldest) cancelVoice(oldest);
      else return;
    }
    const oscillator = context.createOscillator(), gain = context.createGain();
    const at = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.detune.setValueAtTime(detune, at);
    gain.gain.setValueAtTime(toneFloor, at);
    gain.gain.linearRampToValueAtTime(volume, at + (sustain ? 1.4 : .008));
    if (!sustain) gain.gain.exponentialRampToValueAtTime(toneFloor, at + duration);
    oscillator.connect(gain); gain.connect(bus === 'music' ? musicBus : effectsBus);
    const voice = { oscillator, gain, bus, family };
    voices.add(voice);
    oscillator.onended = () => {
      voices.delete(voice);
      try { oscillator.disconnect(); gain.disconnect(); } catch { /* Optional cleanup. */ }
    };
    oscillator.start(at);
    if (!sustain) oscillator.stop(at + duration + .025);
  }
  function pluck(frequency, delay = 0, duration = .18, volume = .035, family = '') {
    addVoice(frequency, delay, duration, volume, { family });
    // A quiet octave gives each note a rounded wooden edge, not a piercing beep.
    addVoice(frequency * 2, delay, duration * .55, volume * .11, { type: 'triangle', family });
  }
  function syncAmbient() {
    const shouldPlay = Boolean(!disposed && active && ambientActive && settings.music && context?.state === 'running');
    if (!shouldPlay) {
      cancelWhere(voice => voice.bus === 'music'); ambient = false; return;
    }
    if (ambient) return;
    ambient = true;
    // A deliberately unobtrusive suspended chord; no tempo competes with the timers.
    for (const [frequency, volume, detune] of [[130.81, .007, -3], [196, .0045, 2], [293.66, .0025, -2]]) {
      addVoice(frequency, 0, 0, volume, { bus: 'music', sustain: true, detune });
    }
  }
  function vibrate(kind, info) {
    if (!settings.haptics || !active || disposed) return;
    const duration = kind === 'word' ? (info.isNew || info.isRecord || info.length >= 5 ? 12 : 8)
      : { letter: 5, ui: 4, start: 8, pause: 5, resume: 5, clear: 5, repeat: 4,
        miss: 3, invalid: 6, gameover: 8, gold: 10, hourglass: 10, fire: 10, penalty: 7, grenade: 9 }[kind] || 0;
    if (duration) try { globalThis.navigator?.vibrate?.(duration); } catch { /* Haptics never gate play. */ }
  }
  function normalize(kind, info) {
    if (kind === 'ordinary') return ['word', info];
    if (kind === 'long') return ['word', { ...info, length: Math.max(5, info.length || 0) }];
    if (kind === 'newword') return ['word', { ...info, isNew: true }];
    if (kind === 'record') return ['word', { ...info, isRecord: true }];
    return [kind, info];
  }
  function play(kind, info = {}) {
    if (!active || disposed) return false;
    [kind, info] = normalize(kind, info);
    // Haptics are independent of both sound preferences and Web Audio support.
    vibrate(kind, info);
    if (!settings.effects || context?.state !== 'running') return false;
    const now = context.currentTime;
    const cooldown = { letter: .025, lowtime: 4, penalty: .12, grenade: .25, hourglass: .2, fire: .2,
      ui: .06, start: .25, pause: .1, resume: .1, clear: .08, repeat: .15, miss: .1,
      invalid: .12, gameover: .5, gold: .12 }[kind] || 0;
    if (now - (lastPlayed.get(kind) ?? -Infinity) < cooldown) return false;
    lastPlayed.set(kind, now);
    try {
      if (kind === 'word') {
        const priority = info.isRecord ? 3 : info.isNew ? 2 : info.length >= 5 ? 1 : 0;
        // One phrase expresses the strongest achievement, even if callers emit
        // several kinds for the same submission. Rapid later words still sound.
        if (now - lastWordAt < .075) {
          if (priority <= lastWordPriority) return false;
          cancelWhere(voice => voice.family === 'word');
        }
        lastWordAt = now; lastWordPriority = priority;
        const notes = priority === 3 ? [392, 523.25, 659.25, 783.99]
          : priority === 2 ? [523.25, 659.25, 880]
          : priority === 1 ? [392, 523.25, 659.25] : [392, 523.25];
        notes.forEach((frequency, index) => pluck(frequency, index * .055, .2, .032, 'word'));
        return true;
      }
      if (kind === 'letter' || kind === 'ui') {
        const notes = [261.63, 293.66, 329.63, 392, 440];
        const index = Math.max(0, Math.floor(Number(info.length) || 0)) % notes.length;
        pluck(kind === 'ui' ? 349.23 : notes[index], 0, .095, .018, kind);
      } else if (kind === 'start') {
        [261.63, 329.63, 392, 523.25].forEach((note, index) => pluck(note, index * .055, .18, .023, kind));
      } else if (kind === 'pause' || kind === 'resume') {
        const notes = kind === 'pause' ? [392, 293.66] : [293.66, 392];
        notes.forEach((note, index) => pluck(note, index * .065, .13, .018, kind));
      } else if (kind === 'clear') {
        pluck(196, 0, .075, .017, kind); pluck(130.81, .04, .1, .012, kind);
      } else if (kind === 'repeat') {
        // A neutral double tap acknowledges a familiar word without an error buzz.
        pluck(329.63, 0, .1, .016, kind); pluck(329.63, .095, .14, .012, kind);
      } else if (kind === 'miss') {
        pluck(196, 0, .065, .011, kind);
      } else if (kind === 'invalid') {
        pluck(246.94, 0, .11, .02, kind); pluck(220, .065, .13, .016, kind);
      } else if (kind === 'gold') {
        [659.25, 830.61, 987.77].forEach((note, index) => pluck(note, index * .045, .24, .023, kind));
      } else if (kind === 'gameover') {
        // A warm resolution invites another try, regardless of the round's score.
        [523.25, 440, 392, 523.25].forEach((note, index) => pluck(note, index * .085, .25, .022, kind));
      } else if (kind === 'penalty') {
        pluck(220, 0, .13, .025, 'penalty'); pluck(196, .055, .16, .018, 'penalty');
      } else if (kind === 'hourglass') {
        pluck(659.25, 0, .32, .024, 'hourglass'); pluck(523.25, .09, .37, .021, 'hourglass');
      } else if (kind === 'fire') {
        [220, 329.63, 493.88].forEach((note,index)=>pluck(note,index*.035,.15,.022,'fire'));
      } else if (kind === 'grenade') {
        addVoice(130.81, 0, .25, .028, { type: 'triangle', family: 'grenade' });
        pluck(174.61, .035, .16, .012, 'grenade');
      } else if (kind === 'lowtime') {
        // A single gentle cue per threshold crossing, with a defensive cooldown.
        pluck(329.63, 0, .16, .018, 'lowtime'); pluck(293.66, .12, .18, .016, 'lowtime');
      } else return false;
      return true;
    } catch { return false; }
  }
  return {
    setSettings(partial = {}) {
      const previous = settings;
      settings = { ...settings };
      for (const key of ['effects', 'music', 'haptics']) if (typeof partial[key] === 'boolean') settings[key] = partial[key];
      if (!settings.effects) cancelWhere(voice => voice.bus === 'effects');
      if (previous.haptics && !settings.haptics) {
        try { globalThis.navigator?.vibrate?.(0); } catch { /* Optional capability. */ }
      }
      syncAmbient();
      return { ...settings };
    },
    async unlock() {
      if (disposed || (!settings.effects && !settings.music)) return false;
      try {
        if (!context) {
          const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!AudioContext) return false;
          context = new AudioContext();
          effectsBus = context.createGain(); musicBus = context.createGain();
          effectsBus.gain.value = .85; musicBus.gain.value = .75;
          effectsBus.connect(context.destination); musicBus.connect(context.destination);
          context.onstatechange = () => { if (context?.state === 'running') syncAmbient(); };
        }
        if (context.state !== 'running') await context.resume();
        if (disposed) return false;
        syncAmbient();
        return context.state === 'running';
      } catch { return false; }
    },
    play,
    setAmbientActive(value) {
      ambientActive = Boolean(value);
      syncAmbient();
    },
    setActive(value) {
      const next = Boolean(value);
      if (next === active) return;
      active = next;
      if (!active) {
        cancelWhere(() => true); ambient = false; cancelHaptics();
        lastPlayed.clear(); lastWordAt = -Infinity; lastWordPriority = -1;
      } else syncAmbient();
    },
    dispose() {
      if (disposed) return;
      cancelHaptics(); active = false; disposed = true;
      cancelWhere(() => true); ambient = false;
      if (context) {
        context.onstatechange = null;
        try { effectsBus.disconnect(); musicBus.disconnect(); } catch { /* Already detached. */ }
        try { void context.close().catch(() => {}); } catch { /* Device teardown is optional. */ }
      }
    },
  };
}
