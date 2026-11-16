// Synthesised sound: every effect is a small WebAudio oscillator phrase, so the game
// ships no audio files and stays silent until the first user gesture wakes the
// context. Placement thocks, a mirror's rotate click, the pop of a burned-out Murk,
// a leak's low thud, the wave horn, and short win and lose stingers. M mutes it all.

/** One oscillator phrase: a tone that may slide, with a quick attack and decay. */
function tone(context, { freq, slideTo = null, type = 'sine', volume = 0.12, delay = 0, duration = 0.15 }) {
  const start = context.currentTime + delay;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + duration);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(context.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** The named phrases, each a function of the live AudioContext. */
const PHRASES = {
  place: (c) => tone(c, { freq: 210, slideTo: 105, type: 'square', volume: 0.1, duration: 0.12 }),
  rotate: (c) => tone(c, { freq: 660, type: 'sine', volume: 0.07, duration: 0.05 }),
  upgrade: (c) => {
    tone(c, { freq: 523, volume: 0.1, duration: 0.12 });
    tone(c, { freq: 659, volume: 0.1, delay: 0.07, duration: 0.12 });
    tone(c, { freq: 784, volume: 0.12, delay: 0.14, duration: 0.2 });
  },
  sell: (c) => {
    tone(c, { freq: 392, volume: 0.09, duration: 0.1 });
    tone(c, { freq: 330, volume: 0.09, delay: 0.08, duration: 0.16 });
  },
  deny: (c) => tone(c, { freq: 140, type: 'square', volume: 0.08, duration: 0.1 }),
  pop: (c) => tone(c, { freq: 190, slideTo: 42, type: 'sawtooth', volume: 0.07, duration: 0.13 }),
  leak: (c) => {
    tone(c, { freq: 130, slideTo: 60, type: 'sawtooth', volume: 0.16, duration: 0.3 });
    tone(c, { freq: 82, type: 'sine', volume: 0.14, delay: 0.05, duration: 0.3 });
  },
  horn: (c) => {
    tone(c, { freq: 392, type: 'triangle', volume: 0.14, duration: 0.22 });
    tone(c, { freq: 523, type: 'triangle', volume: 0.14, delay: 0.16, duration: 0.34 });
  },
  clear: (c) => {
    tone(c, { freq: 587, volume: 0.1, duration: 0.12 });
    tone(c, { freq: 880, volume: 0.1, delay: 0.09, duration: 0.22 });
  },
  win: (c) => {
    [523, 659, 784, 1047].forEach((freq, i) => tone(c, { freq, type: 'triangle', volume: 0.13, delay: i * 0.12, duration: 0.3 }));
  },
  lose: (c) => {
    [392, 330, 262, 196].forEach((freq, i) => tone(c, { freq, type: 'triangle', volume: 0.13, delay: i * 0.14, duration: 0.32 }));
  },
};

/**
 * The sound player. The context is created lazily inside play() — browsers only allow
 * it after a gesture, and in a headless test there may be no audio at all, so every
 * failure to start is swallowed and the game just stays quiet.
 */
export function createAudio() {
  let context = null;
  let muted = false;
  function ensureContext() {
    if (context === null) {
      try {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        context = Ctor ? new Ctor() : null;
      } catch {
        context = null;
      }
    }
    if (context && context.state === 'suspended') context.resume().catch(() => {});
    return context;
  }
  return {
    /** Play a named effect ('place', 'rotate', 'pop', ...), quietly doing nothing if muted or unavailable. */
    play(name) {
      if (muted) return;
      const live = ensureContext();
      if (!live || !PHRASES[name]) return;
      try {
        PHRASES[name](live);
      } catch {
        // A half-started context must never take the game down with it.
      }
    },
    /** Flip the mute and return the new state. */
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
