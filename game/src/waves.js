// waves.js — the spawn director of ABYSSAL LANTERN.
//
// The director, not a fixed script, decides what arrives: a continuous spawn
// timer whose interval shrinks as the run deepens, a weighted pick among the
// enemy types unlocked so far, and set-piece moments (the wave banner every
// 30s, the tier shift every 60s, the Leviathans at 90s and 210s). Continuous
// spawning keeps pressure smooth instead of lumpy, and the weights keep the
// field mixed: even late, gloomlets still arrive to feed the combo.
//
// The cap on live enemies keeps the frame rate honest on a modest machine:
// the director never spawns past it, and the cap itself grows with time so
// the late game still feels like a swarm.

import { WAVE_SECONDS, TIER_SECONDS, BOSS_TIMES, ENEMIES, TIERS } from './config.js';
import { R } from './random.js';
import { spawnEnemy, spawnBoss } from './enemies.js';
import { audio } from './audio.js';

/** Live-enemy cap: grows from 40 to 110 across the run. */
function enemyCapAt(t) {
  return Math.round(40 + Math.min(70, t * 0.25));
}

/** Pick an enemy type by weight among the types unlocked at time `t`. */
function pickType(t) {
  const open = ENEMIES.filter((e) => e.unlock <= t && e.id !== 'leviathan');
  let total = 0;
  for (const e of open) total += e.weight;
  let roll = R.next() * total;
  for (const e of open) {
    roll -= e.weight;
    if (roll <= 0) return e.id;
  }
  return 'gloomlet';
}

/**
 * Update the director for one frame: advance the clock, spawn, shift tiers,
 * ring the wave banners, and wake the bosses on schedule.
 */
export function updateWaves(world, dt) {
  world.time += dt;

  // Tier shift: every TIER_SECONDS the abyss deepens (palette + spawn rate).
  const tier = Math.min(TIERS.length - 1, Math.floor(world.time / TIER_SECONDS));
  if (tier !== world.tier) {
    world.tier = tier;
    world.banner = TIERS[tier].name.toUpperCase();
    world.bannerTimer = 2.4;
    audio.play('boss', 0);
  }

  // Wave banner: every WAVE_SECONDS, a new wave number.
  const wave = Math.floor(world.time / WAVE_SECONDS) + 1;
  if (wave !== world.wave) {
    world.wave = wave;
    if (world.bannerTimer <= 0) {
      world.banner = `WAVE ${wave}`;
      world.bannerTimer = 1.8;
    }
  }

  // Boss schedule: a Leviathan at each listed time (once each).
  for (let i = 0; i < BOSS_TIMES.length; i++) {
    if (world.time >= BOSS_TIMES[i] && world.bossesSpawned === i && !world.boss) {
      spawnBoss(world);
      break;
    }
  }

  // Continuous spawning, on the tier's interval, under the live cap.
  world.spawnTimer -= dt;
  if (world.spawnTimer <= 0) {
    world.spawnTimer = TIERS[world.tier].spawnInterval;
    if (world.enemies.length < enemyCapAt(world.time)) {
      // Late game spawns in small packs so the swarm feels like a swarm.
      const pack = world.time > 150 ? R.int(1, 3) : 1;
      for (let k = 0; k < pack; k++) {
        if (world.enemies.length < enemyCapAt(world.time)) {
          spawnEnemy(world, pickType(world.time));
        }
      }
    }
  }

  // Survival trickle: staying alive is worth points on its own.
  world.score += 2 * dt;
}

/** The current tier's palette (background gradient + fog colour). */
export function tierPalette(world) {
  return TIERS[world.tier];
}
