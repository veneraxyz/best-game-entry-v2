// audio.js — synthesized sound effects for ABYSSAL LANTERN.
//
// No audio files ship with the game: every sound is a tiny WebAudio
// oscillator-and-gain envelope built at runtime. That keeps game/ small, keeps
// the dossier free of binary assets, and means the game never needs a network
// fetch for sound. The context is created lazily on the first user gesture
// (browsers refuse audio before one) and every effect is fire-and-forget.
//
// The palette is deliberately soft and underwater: sine and triangle waves,
// short decays, low volumes. A survival game fires its weapons constantly, so
// the shoot sound is quiet and short — a loud one would fatigue the ear in a
// minute. The level-up arpeggio is the loudest thing in the game on purpose:
// it is the moment the player earned.

/** Master volume, 0..1. */
const MASTER = 0.35;

/** Per-effect definitions: waveform, frequency path, duration, volume. */
const EFFECTS = {
  shoot: { type: 'sine', from: 880, to: 620, dur: 0.07, vol: 0.10 },
  harpoon: { type: 'triangle', from: 340, to: 180, dur: 0.16, vol: 0.16 },
  hit: { type: 'square', from: 220, to: 140, dur: 0.06, vol: 0.08 },
  kill: { type: 'sine', from: 520, to: 180, dur: 0.14, vol: 0.14 },
  pickup: { type: 'sine', from: 1040, to: 1560, dur: 0.09, vol: 0.10 },
  gem: { type: 'sine', from: 1320, to: 1760, dur: 0.06, vol: 0.06 },
  hurt: { type: 'sawtooth', from: 160, to: 70, dur: 0.22, vol: 0.22 },
  dash: { type: 'sine', from: 300, to: 900, dur: 0.12, vol: 0.12 },
  levelup: { type: 'triangle', from: 523, to: 1046, dur: 0.5, vol: 0.2 },
  boss: { type: 'sawtooth', from: 90, to: 55, dur: 0.7, vol: 0.25 },
  mine: { type: 'sine', from: 200, to: 40, dur: 0.3, vol: 0.22 },
  storm: { type: 'square', from: 1200, to: 300, dur: 0.1, vol: 0.1 },
  gameover: { type: 'triangle', from: 392, to: 98, dur: 1.1, vol: 0.22 },
  win: { type: 'triangle', from: 523, to: 1568, dur: 1.2, vol: 0.2 },
  click: { type: 'sine', from: 700, to: 900, dur: 0.05, vol: 0.1 },
};

/** The audio engine: one context, one master gain, no files. */
export const audio = {
  ctx: null,
  master: null,
  muted: false,
  /** Last-played time per effect, for rate limiting the chatty ones. */
  lastPlayed: {},

  /** Create the context. Call from a user gesture; safe to call twice. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER;
      this.master.connect(this.ctx.destination);
    } catch {
      // Audio is a garnish, never a requirement: silence is fine.
      this.ctx = null;
    }
  },

  /** Toggle mute. Returns the new muted state for the HUD. */
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : MASTER;
    return this.muted;
  },

  /**
   * Play one effect. `minGap` (seconds) rate-limits effects that fire many
   * times a second (shoot, hit, gem) so they stay a texture, not a noise.
   */
  play(name, minGap = 0) {
    if (this.muted || !this.ctx || !this.master) return;
    const def = EFFECTS[name];
    if (!def) return;
    const now = this.ctx.currentTime;
    if (minGap > 0) {
      const last = this.lastPlayed[name] || -99;
      if (now - last < minGap) return;
      this.lastPlayed[name] = now;
    }
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = def.type;
    osc.frequency.setValueAtTime(def.from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, def.to), now + def.dur);
    gain.gain.setValueAtTime(def.vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + def.dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + def.dur + 0.02);
  },

  /** The level-up arpeggio: three rising notes, the game's little fanfare. */
  fanfare() {
    if (this.muted || !this.ctx) return;
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => {
        if (!this.ctx || this.muted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(now);
        osc.stop(now + 0.3);
      }, i * 90);
    });
  },
};
