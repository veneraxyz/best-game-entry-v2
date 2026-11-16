// random.js — deterministic randomness for ABYSSAL LANTERN.
//
// The whole game runs on one seeded generator (mulberry32). A normal run seeds
// from the clock so every dive is different; the screenshot scenes (?shot=...)
// seed from a fixed number so their renders are reproducible. Nothing here
// touches Math.random, which keeps the seeded scenes stable across machines.

/** The game's single shared generator. Seeded per run, or per shot scene. */
export const R = {
  /** Current 32-bit state. */
  s: 0x9e3779b9,

  /** (Re)seed the generator. Any integer works; it is folded to 32 bits. */
  seed(n) {
    this.s = (n | 0) >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  },

  /** Next float in [0, 1). mulberry32: small, fast, good enough for a game. */
  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },

  /** Float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  },

  /** Integer in [min, max] inclusive. */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  },

  /** A random element of a non-empty array. */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  },

  /** True with probability p (0..1). */
  chance(p) {
    return this.next() < p;
  },

  /** A random angle in radians, [0, 2*pi). */
  angle() {
    return this.next() * Math.PI * 2;
  },

  /** -1 or 1 with equal probability. */
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  },
};

/** Clamp a number into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Linear interpolation between a and b by t (0..1). */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Distance between two points. */
export function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distance squared (cheaper when only comparing). */
export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}
