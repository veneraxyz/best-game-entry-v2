// enemies.js — the dark swarm of ABYSSAL LANTERN.
//
// Six kinds of gloom, each with its own movement and threat, so the player
// reads the field at a glance: pink darters lunge, purple bulwarks wall,
// green splitters punish careless kills, yellow spitters keep their distance,
// and the red Leviathan ends a run that stopped paying attention.
//
// Spawning is the waves module's job; this module owns what an enemy IS and
// what it DOES: seeking, lunging, spitting, splitting, dying. Stats scale with
// run time (see config.ENEMY_SCALING) so the same gloomlet that was a snack at
// 0:20 is a threat at 4:00. Elites (brighter, bigger, worth more) appear after
// a minute and keep the field surprising.

import { VIEW_W, VIEW_H, ENEMIES, ELITE, ENEMY_SCALING } from './config.js';
import { R, clamp } from './random.js';
import { audio } from './audio.js';
import { burst, ring, floatText, addTrauma } from './particles.js';
import { registerKill } from './world.js';
import { hurtPlayer } from './player.js';

/** Look up an enemy definition by id. */
export function enemyDef(id) {
  return ENEMIES.find((e) => e.id === id);
}

/** Time-scaling multipliers for a spawn at run time `t` (seconds). */
function scalingAt(t) {
  return {
    hp: Math.min(ENEMY_SCALING.hpCapMult, 1 + t * ENEMY_SCALING.hpPerSecond),
    speed: Math.min(ENEMY_SCALING.speedCapMult, 1 + t * ENEMY_SCALING.speedPerSecond),
    damage: Math.min(ENEMY_SCALING.damageCapMult, 1 + t * ENEMY_SCALING.damagePerSecond),
  };
}

/**
 * Spawn one enemy of `id` at the arena edge nearest a random angle from the
 * player — never on top of the player, always visible incoming. `elite`
 * forces the elite variant; otherwise it is rolled here (after 60s).
 */
export function spawnEnemy(world, id, elite = null) {
  const def = enemyDef(id);
  const s = scalingAt(world.time);
  const isElite = elite !== null ? elite : (world.time > 60 && R.chance(ELITE.chance));
  const a = R.angle();
  const margin = 30;
  // Pick an edge point: random angle from the player, clamped to the walls.
  const px = world.player.x;
  const py = world.player.y;
  let x = px + Math.cos(a) * 700;
  let y = py + Math.sin(a) * 700;
  x = clamp(x, margin, VIEW_W - margin);
  y = clamp(y, margin, VIEW_H - margin);
  // If the clamp put it too close, push it to the far edge instead.
  if (Math.hypot(x - px, y - py) < 260) {
    x = px < VIEW_W / 2 ? VIEW_W - margin : margin;
    y = R.range(margin, VIEW_H - margin);
  }
  const hp = def.hp * s.hp * (isElite ? ELITE.hpMult : 1);
  const enemy = {
    id,
    def,
    x, y,
    vx: 0, vy: 0,
    hp, maxHp: hp,
    speed: def.speed * s.speed * (isElite ? ELITE.speedMult : 1),
    damage: def.damage * s.damage * (isElite ? ELITE.damageMult : 1),
    radius: def.radius * (isElite ? 1.35 : 1),
    xp: def.xp * (isElite ? ELITE.xpMult : 1),
    score: def.score * (isElite ? ELITE.scoreMult : 1),
    elite: isElite,
    flash: 0, // hit-flash timer (white when struck)
    wobble: R.range(0, Math.PI * 2), // swim-cycle phase
    lungeTimer: R.range(0.4, 1.2), // darter: time to the next lunge
    lunging: 0, // darter: lunge time left
    shootTimer: R.range(1, 2), // spitter: time to the next spit
    burstTimer: 2.5, // leviathan: time to the next radial burst
    seed: R.next(),
  };
  world.enemies.push(enemy);
  return enemy;
}

/** Spawn the boss at the top of the arena, with a banner and a roar. */
export function spawnBoss(world) {
  const boss = spawnEnemy(world, 'leviathan', false);
  boss.x = VIEW_W / 2;
  boss.y = 90;
  boss.hp = boss.maxHp = boss.def.hp * scalingAt(world.time).hp * (1 + world.bossesSpawned * 0.5);
  world.boss = boss;
  world.bossesSpawned++;
  world.banner = 'THE LEVIATHAN WAKES';
  world.bannerTimer = 2.6;
  audio.play('boss');
  addTrauma(world.fx, 0.4);
  return boss;
}

/** Damage an enemy. Returns true when the hit killed it. */
export function damageEnemy(world, enemy, damage, isCrit = false) {
  enemy.hp -= damage;
  enemy.flash = 0.09;
  world.damageDealt += damage;
  floatText(world.fx, enemy.x, enemy.y - enemy.radius - 6,
    isCrit ? `${Math.round(damage)}!` : `${Math.round(damage)}`,
    isCrit ? '#ffd166' : '#dff6ff', isCrit ? 19 : 14);
  burst(world.fx, enemy.x, enemy.y, enemy.def.color, 3, 140, 0.35, 3);
  if (enemy.hp <= 0) {
    killEnemy(world, enemy);
    return true;
  }
  audio.play('hit', 0.06);
  return false;
}

/** Kill an enemy: score, gems, particles, splits, and the boss's fall. */
function killEnemy(world, enemy) {
  const i = world.enemies.indexOf(enemy);
  if (i >= 0) world.enemies.splice(i, 1);
  registerKill(world, enemy);
  burst(world.fx, enemy.x, enemy.y, enemy.def.color, enemy.elite ? 26 : 12, 260, 0.6, 4);
  ring(world.fx, enemy.x, enemy.y, enemy.def.color, enemy.elite ? 22 : 10, 240);
  audio.play('kill', 0.05);
  if (enemy.id === 'leviathan') {
    world.boss = null;
    addTrauma(world.fx, 0.55);
    world.banner = 'LEVIATHAN SLAIN  +500';
    world.bannerTimer = 2.2;
    // A boss drops a pearl and a kelp: the run's little mercy.
    world.pickups.push({ x: enemy.x - 30, y: enemy.y, kind: 'pearl', life: 20 });
    world.pickups.push({ x: enemy.x + 30, y: enemy.y, kind: 'kelp', life: 20 });
  }
  // Splitters burst into two gloomlets where they died.
  if (enemy.id === 'splitter') {
    for (let k = 0; k < 2; k++) {
      const child = spawnEnemy(world, 'gloomlet', false);
      child.x = enemy.x + R.range(-20, 20);
      child.y = enemy.y + R.range(-20, 20);
    }
  }
  // Gems scatter from the corpse.
  for (let k = 0; k < enemy.xp; k++) {
    const a = R.angle();
    world.gems.push({
      x: enemy.x, y: enemy.y,
      vx: Math.cos(a) * R.range(40, 160),
      vy: Math.sin(a) * R.range(40, 160),
      value: 1, flying: false,
    });
  }
  // Rare pickup drops keep the field generous: kelp when hurt, pearl rarely.
  if (R.chance(0.02)) {
    world.pickups.push({ x: enemy.x, y: enemy.y, kind: 'kelp', life: 15 });
  } else if (R.chance(0.008)) {
    world.pickups.push({ x: enemy.x, y: enemy.y, kind: 'pearl', life: 15 });
  }
}

/**
 * Steer one enemy toward the player, by type. Returns nothing; mutates the
 * enemy's velocity. Called once per enemy per frame.
 */
function steerEnemy(world, e, dt) {
  const p = world.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  e.wobble += dt * 6;

  if (e.id === 'darter') {
    // Lunges in bursts: charge up, then a fast straight dash, then a pause.
    e.lungeTimer -= dt;
    if (e.lunging > 0) {
      e.lunging -= dt;
      e.vx = e.lungeX * e.speed * 2.6;
      e.vy = e.lungeY * e.speed * 2.6;
    } else if (e.lungeTimer <= 0) {
      e.lunging = 0.35;
      e.lungeTimer = R.range(1.1, 1.8);
      e.lungeX = nx;
      e.lungeY = ny;
      e.vx = nx * e.speed * 2.6;
      e.vy = ny * e.speed * 2.6;
    } else {
      e.vx = nx * e.speed * 0.55;
      e.vy = ny * e.speed * 0.55;
    }
    return;
  }

  if (e.id === 'spitter') {
    // Keeps ~280px away and spits ink; closes in when too far, backs off near.
    const want = 280;
    const toward = d > want + 40 ? 1 : d < want - 60 ? -1 : 0;
    e.vx = nx * e.speed * toward + Math.cos(e.wobble) * 30;
    e.vy = ny * e.speed * toward + Math.sin(e.wobble) * 30;
    e.shootTimer -= dt;
    if (e.shootTimer <= 0 && d < 520) {
      e.shootTimer = R.range(1.6, 2.4);
      world.shots.push({
        x: e.x, y: e.y,
        vx: nx * 260, vy: ny * 260,
        damage: e.damage, radius: 7, life: 3,
      });
      burst(world.fx, e.x, e.y, '#ffca3a', 4, 100, 0.3, 2);
    }
    return;
  }

  if (e.id === 'leviathan') {
    // The boss lumbers at the player and fires radial ink bursts.
    e.vx = nx * e.speed;
    e.vy = ny * e.speed;
    e.burstTimer -= dt;
    if (e.burstTimer <= 0) {
      e.burstTimer = 3.2;
      const n = 10;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + R.range(0, 0.4);
        world.shots.push({
          x: e.x, y: e.y,
          vx: Math.cos(a) * 220, vy: Math.sin(a) * 220,
          damage: 12, radius: 8, life: 4,
        });
      }
      ring(world.fx, e.x, e.y, '#ff5964', 24, 300);
      audio.play('boss');
    }
    return;
  }

  // Chasers (gloomlet, bulwark, splitter): straight at the player, with a
  // swim wobble so the pack never moves like a rigid grid.
  const wob = Math.sin(e.wobble + e.seed * 10) * 0.35;
  const px = -ny * wob;
  const py = nx * wob;
  e.vx = (nx + px) * e.speed;
  e.vy = (ny + py) * e.speed;
}

/**
 * Update every enemy for one frame: steer, move, separate, flash decay, and
 * contact damage against the player. Enemy ink shots are updated here too.
 */
export function updateEnemies(world, dt) {
  const p = world.player;

  for (const e of world.enemies) {
    e.flash = Math.max(0, e.flash - dt);
    steerEnemy(world, e, dt);
    e.x = clamp(e.x + e.vx * dt, e.radius, VIEW_W - e.radius);
    e.y = clamp(e.y + e.vy * dt, e.radius, VIEW_H - e.radius);
  }

  // Soft separation: enemies push apart so they never stack into one blob.
  // O(n^2) is fine at the counts this game reaches (under ~120).
  const list = world.enemies;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * 0.5 * 60 * dt;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
      }
    }
  }

  // Contact damage: touching an enemy hurts (the hurt window throttles it).
  if (!p.dead) {
    for (const e of world.enemies) {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < p.radius + e.radius * 0.85) {
        // The hit is resolved by player.js (armor + hurt window).
        hurtPlayer(world, e.damage);
        break; // one contact per frame is enough; the window does the rest
      }
    }
  }

  // Enemy ink shots fly straight and fade; touching one hurts.
  for (let i = world.shots.length - 1; i >= 0; i--) {
    const s = world.shots[i];
    s.life -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.life <= 0 || s.x < -20 || s.x > VIEW_W + 20 || s.y < -20 || s.y > VIEW_H + 20) {
      world.shots.splice(i, 1);
      continue;
    }
    if (!p.dead && Math.hypot(p.x - s.x, p.y - s.y) < p.radius + s.radius) {
      world.shots.splice(i, 1);
      hurtPlayer(world, s.damage);
    }
  }
}
