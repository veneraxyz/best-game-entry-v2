// world.js — the game state of ABYSSAL LANTERN.
//
// One plain object holds everything a run needs: the player, the enemies, the
// projectiles, the pickups, the effects, the score, the clock. Systems
// (player.js, enemies.js, weapons.js, waves.js) take the world and mutate it;
// render.js reads it; main.js owns the loop and the state machine.
//
// Keeping the state in one place makes the screenshot scenes trivial: shots.js
// builds a world, then pushes it into whatever moment the shot needs
// (a swarm, a boss, a level-up) without touching the real game code.

import { R } from './random.js';
import { VIEW_W, VIEW_H, PLAYER_BASE, WIN_TIME } from './config.js';
import { createEffects } from './particles.js';

/** Game states. The loop and the HUD both switch on these. */
export const STATE = {
  TITLE: 'title',
  PLAYING: 'playing',
  LEVELUP: 'levelup',
  PAUSED: 'paused',
  OVER: 'over',
  WIN: 'win',
};

/** A fresh player, at the centre of the arena, lantern lit. */
export function createPlayer() {
  return {
    x: VIEW_W / 2,
    y: VIEW_H / 2,
    vx: 0,
    vy: 0,
    radius: PLAYER_BASE.radius,
    speed: PLAYER_BASE.speed,
    hp: PLAYER_BASE.maxHp,
    maxHp: PLAYER_BASE.maxHp,
    level: 1,
    xp: 0,
    xpNext: PLAYER_BASE.xpBase,
    magnet: PLAYER_BASE.magnet,
    armor: PLAYER_BASE.armor,
    critChance: PLAYER_BASE.critChance,
    critMult: PLAYER_BASE.critMult,
    damageMult: 1,
    rateMult: 1,
    facing: 1, // 1 = right, -1 = left (the fish flips)
    dashTime: 0, // >0 while dashing
    dashCd: 0, // seconds until the next dash
    hurtTimer: 0, // invulnerability left, seconds
    dead: false,
  };
}

/**
 * A fresh world. `seed` drives the run's randomness; `shot` names a screenshot
 * scene (or null for a normal run) and is staged by shots.js after creation.
 */
export function createWorld(seed) {
  R.seed(seed);
  return {
    seed,
    state: STATE.TITLE,
    time: 0, // seconds into the run
    player: createPlayer(),
    /** Owned weapons: [{ id, level, timer }] — timer counts to the next shot. */
    weapons: [],
    enemies: [],
    /** Player projectiles: { x, y, vx, vy, damage, radius, color, pierce, life }. */
    bullets: [],
    /** Enemy ink shots: { x, y, vx, vy, damage, radius, life }. */
    shots: [],
    /** XP gems: { x, y, vx, vy, value, flying }. */
    gems: [],
    /** Pickups: { x, y, kind: 'kelp' | 'pearl', life }. */
    pickups: [],
    /** Dropped mines: { x, y, damage, radius, life }. */
    mines: [],
    /** Lightning arcs to draw this frame: [{ points: [[x,y]...], life }]. */
    arcs: [],
    fx: createEffects(),
    score: 0,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    bestCombo: 0,
    wave: 1,
    tier: 0,
    spawnTimer: 0,
    boss: null, // the live Leviathan, if any
    bossesSpawned: 0,
    gemsCollected: 0,
    damageDealt: 0,
    levelUps: 0,
    /** Levels earned but not yet drafted (several can queue from one gem). */
    pendingLevels: 0,
    /** The 3 cards offered on the current level-up (null when not leveling). */
    levelUpCards: null,
    /** Wave banner text + timer (drawn by render.js). */
    banner: '',
    bannerTimer: 0,
    /** Background scroll offsets (parallax layers drift slowly). */
    bgDrift: 0,
    /** Ambient creatures for the title backdrop. */
    drifters: [],
    /** Win flag: set when the timer passes WIN_TIME. */
    won: false,
    /** Final-run stats, filled when the run ends. */
    finalStats: null,
  };
}

/** Seconds left before the Garden blooms. */
export function timeLeft(world) {
  return Math.max(0, WIN_TIME - world.time);
}

/** Add score, multiplied by the current combo chain. */
export function addScore(world, base) {
  const mult = 1 + Math.min(world.combo, 8) * 0.25;
  world.score += Math.round(base * mult);
}

/** Register a kill: combo chain, score, and the best-chain record. */
export function registerKill(world, enemy) {
  world.kills++;
  world.combo++;
  world.comboTimer = 3.0;
  if (world.combo > world.bestCombo) world.bestCombo = world.combo;
  addScore(world, enemy.score);
}

/** The XP needed for the next level, from the player's current level. */
export function xpForLevel(level) {
  return PLAYER_BASE.xpBase + (level - 1) * PLAYER_BASE.xpGrowth;
}

/**
 * Give the player XP. Returns true when a level-up is earned (the caller opens
 * the card modal; leftover XP carries over, and several levels can queue).
 */
export function gainXp(world, amount) {
  const p = world.player;
  p.xp += amount;
  let leveled = false;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    p.xpNext = xpForLevel(p.level);
    world.levelUps++;
    world.pendingLevels++;
    leveled = true;
  }
  return leveled;
}
