// particles.js — juice for ABYSSAL LANTERN: bursts, bubbles, floating text,
// and screen shake.
//
// Feel is a judging criterion, and most of it lives here. Every kill bursts
// into glowing motes, every pickup chimes a rising number, every hit shakes
// the frame a little and every boss hit shakes it a lot. The systems are
// deliberately cheap (plain arrays, no allocation in the hot loop beyond the
// spawn itself) so a hundred particles cost nothing.
//
// Screen shake uses the trauma model: events add trauma (0..1), trauma decays
// linearly, and the offset is trauma^2 times a max displacement, so small hits
// barely move the frame and big ones punch it.

import { R } from './random.js';

/** The most live particles and floating texts. Old ones are dropped first. */
const MAX_PARTICLES = 420;
const MAX_TEXTS = 48;
/** The biggest shake offset, in pixels, at trauma 1. */
const SHAKE_MAX = 14;

/** One particle: a glowing mote with velocity, drag, gravity and a life. */
function makeParticle(x, y, vx, vy, life, size, color, drag) {
  return { x, y, vx, vy, life, maxLife: life, size, color, drag };
}

/** The effects state, owned by the world and updated once per frame. */
export function createEffects() {
  return {
    particles: [],
    texts: [],
    /** Screen-shake trauma, 0..1. */
    trauma: 0,
    /** Current shake offset, recomputed each frame. */
    shakeX: 0,
    shakeY: 0,
    /** Ambient bubble timer (the abyss always breathes). */
    bubbleTimer: 0,
  };
}

/** Add trauma (clamped to 1). Small hits add ~0.12, boss hits ~0.5. */
export function addTrauma(fx, amount) {
  fx.trauma = Math.min(1, fx.trauma + amount);
}

/** Spawn a burst of glowing motes at (x, y). */
export function burst(fx, x, y, color, count, speed = 220, life = 0.6, size = 4) {
  for (let i = 0; i < count; i++) {
    if (fx.particles.length >= MAX_PARTICLES) fx.particles.shift();
    const a = R.angle();
    const s = R.range(speed * 0.3, speed);
    fx.particles.push(makeParticle(
      x, y,
      Math.cos(a) * s, Math.sin(a) * s,
      R.range(life * 0.5, life),
      R.range(size * 0.5, size * 1.4),
      color,
      0.9,
    ));
  }
}

/** Spawn a ring shockwave: motes flying outward in a circle. */
export function ring(fx, x, y, color, count = 18, speed = 320) {
  for (let i = 0; i < count; i++) {
    if (fx.particles.length >= MAX_PARTICLES) fx.particles.shift();
    const a = (i / count) * Math.PI * 2;
    fx.particles.push(makeParticle(
      x, y,
      Math.cos(a) * speed, Math.sin(a) * speed,
      R.range(0.3, 0.5),
      R.range(2, 4),
      color,
      0.86,
    ));
  }
}

/** A floating text: damage numbers, pickups, level-ups. Rises and fades. */
export function floatText(fx, x, y, str, color = '#dff6ff', size = 16) {
  if (fx.texts.length >= MAX_TEXTS) fx.texts.shift();
  fx.texts.push({ x: x + R.range(-6, 6), y, str, color, size, life: 0.9, maxLife: 0.9 });
}

/**
 * Update particles, texts and shake. `dt` is seconds. Bubbles spawn on their
 * own timer so the water always feels alive even in a quiet moment.
 */
export function updateEffects(fx, dt, viewW, viewH) {
  // Trauma decays; the offset is quadratic so small shakes stay subtle.
  fx.trauma = Math.max(0, fx.trauma - dt * 1.6);
  const mag = fx.trauma * fx.trauma * SHAKE_MAX;
  fx.shakeX = R.range(-mag, mag);
  fx.shakeY = R.range(-mag, mag);

  for (let i = fx.particles.length - 1; i >= 0; i--) {
    const p = fx.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      fx.particles.splice(i, 1);
      continue;
    }
    // Drag + a gentle upward drift: everything in the abyss floats.
    p.vx *= Math.pow(p.drag, dt * 60);
    p.vy *= Math.pow(p.drag, dt * 60);
    p.vy -= 26 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  for (let i = fx.texts.length - 1; i >= 0; i--) {
    const t = fx.texts[i];
    t.life -= dt;
    if (t.life <= 0) {
      fx.texts.splice(i, 1);
      continue;
    }
    t.y -= 42 * dt;
  }

  // Ambient bubbles: one every ~0.12s, rising from the floor.
  fx.bubbleTimer -= dt;
  if (fx.bubbleTimer <= 0) {
    fx.bubbleTimer = 0.12;
    if (fx.particles.length < MAX_PARTICLES - 4) {
      fx.particles.push(makeParticle(
        R.range(0, viewW), viewH + 8,
        R.range(-8, 8), R.range(-60, -30),
        R.range(2.5, 5),
        R.range(1.5, 4),
        'rgba(160, 220, 255, 0.5)',
        1,
      ));
    }
  }
}

/** Draw particles (additive glow) and floating texts. */
export function drawEffects(ctx, fx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of fx.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  for (const t of fx.texts) {
    const a = Math.max(0, t.life / t.maxLife);
    ctx.globalAlpha = a;
    ctx.font = `700 ${t.size}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = t.color;
    ctx.fillText(t.str, t.x, t.y);
  }
  ctx.restore();
}
