// weapons.js — the lanternfish's arsenal.
//
// Five weapons, each with a job, each upgradeable to level 5:
//   Pulse Ray    auto-fire bolts at the nearest gloom (the workhorse)
//   Sun Harpoon  a piercing lance aimed with the mouse (the sniper)
//   Gloworbs     orbiting lights that burn on contact (the guard)
//   Abyss Storm  lightning that chains through the pack (the crowd-clearer)
//   Ink Mines    drifting mines that bloom when touched (the trap-layer)
//
// All weapons fire on their own — the player's job is positioning, dodging
// and choosing the build. Damage rolls crits from the player's crit chance.
// Projectiles live in world.bullets; orbs are computed from the weapon's
// orbit angle each frame; lightning is instant and drawn as a fading arc.

import { VIEW_W, VIEW_H, WEAPONS, MAX_WEAPON_LEVEL } from './config.js';
import { R } from './random.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { burst, ring, addTrauma } from './particles.js';
import { damageEnemy } from './enemies.js';

/** Look up a weapon definition by id. */
export function weaponDef(id) {
  return WEAPONS.find((w) => w.id === id);
}

/** Damage of a weapon instance at its level, with the player's multiplier. */
function weaponDamage(world, inst) {
  const def = weaponDef(inst.id);
  const base = def.damage + (inst.level - 1) * def.dmgGrow;
  return base * world.player.damageMult;
}

/** Fire rate (shots per second) of a weapon instance at its level. */
function weaponRate(world, inst) {
  const def = weaponDef(inst.id);
  const base = def.rate + (inst.level - 1) * def.rateGrow;
  return base * world.player.rateMult;
}

/** Roll a crit from the player's chance. Returns the multiplier (1 or crit). */
function critRoll(world) {
  return R.chance(world.player.critChance) ? world.player.critMult : 1;
}

/** The nearest enemy to a point, within `range` (Infinity for any). */
function nearestEnemy(world, x, y, range = Infinity) {
  let best = null;
  let bestD = range * range;
  for (const e of world.enemies) {
    const d2 = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
    if (d2 < bestD) {
      bestD = d2;
      best = e;
    }
  }
  return best;
}

/** Add a weapon to the player's arsenal (level 1). No-op when already owned. */
export function addWeapon(world, id) {
  if (world.weapons.some((w) => w.id === id)) return false;
  world.weapons.push({ id, level: 1, timer: 0, orbitAngle: R.angle() });
  return true;
}

/** Raise a weapon one level, up to the cap. Returns false at the cap. */
export function upgradeWeapon(world, id) {
  const inst = world.weapons.find((w) => w.id === id);
  if (!inst || inst.level >= MAX_WEAPON_LEVEL) return false;
  inst.level++;
  return true;
}

/** The level of a weapon the player owns (0 when not owned). */
export function weaponLevel(world, id) {
  const inst = world.weapons.find((w) => w.id === id);
  return inst ? inst.level : 0;
}

// ------------------------------------------------------------ firing

/** Pulse Ray: bolts at the nearest enemy; a second bolt from level 3. */
function firePulse(world, inst) {
  const def = weaponDef('pulse');
  const p = world.player;
  const target = nearestEnemy(world, p.x, p.y);
  if (!target) return;
  const count = inst.level >= def.extra.countAt ? 2 : 1;
  for (let k = 0; k < count; k++) {
    const spread = count === 2 ? (k === 0 ? -0.09 : 0.09) : 0;
    const a = Math.atan2(target.y - p.y, target.x - p.x) + spread;
    world.bullets.push({
      x: p.x, y: p.y,
      vx: Math.cos(a) * def.extra.speed,
      vy: Math.sin(a) * def.extra.speed,
      damage: weaponDamage(world, inst),
      radius: 6, color: def.color,
      pierce: 0, life: 1.6,
    });
  }
  audio.play('shoot', 0.08);
}

/** Sun Harpoon: one piercing lance toward the mouse. */
function fireHarpoon(world, inst) {
  const def = weaponDef('harpoon');
  const p = world.player;
  const a = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);
  world.bullets.push({
    x: p.x, y: p.y,
    vx: Math.cos(a) * def.extra.speed,
    vy: Math.sin(a) * def.extra.speed,
    damage: weaponDamage(world, inst),
    radius: 8, color: def.color,
    pierce: def.extra.pierce, life: 1.8,
  });
  audio.play('harpoon', 0.1);
}

/** Abyss Storm: lightning chains from the player through the nearest pack. */
function fireStorm(world, inst) {
  const def = weaponDef('storm');
  const p = world.player;
  const first = nearestEnemy(world, p.x, p.y, def.extra.range);
  if (!first) return;
  const chains = def.extra.chains + (inst.level - 1) * def.extra.chainGrow;
  const hit = new Set();
  const points = [[p.x, p.y]];
  let from = first;
  let fromX = p.x;
  let fromY = p.y;
  for (let k = 0; k < chains && from; k++) {
    hit.add(from);
    points.push([from.x, from.y]);
    const crit = critRoll(world);
    damageEnemy(world, from, weaponDamage(world, inst) * crit, crit > 1);
    burst(world.fx, from.x, from.y, def.color, 4, 160, 0.3, 3);
    // Next link: the nearest enemy not yet hit, within range of this one.
    let next = null;
    let bestD = def.extra.range * def.extra.range;
    for (const e of world.enemies) {
      if (hit.has(e)) continue;
      const d2 = (e.x - from.x) * (e.x - from.x) + (e.y - from.y) * (e.y - from.y);
      if (d2 < bestD) {
        bestD = d2;
        next = e;
      }
    }
    fromX = from.x;
    fromY = from.y;
    from = next;
  }
  world.arcs.push({ points, life: 0.18, maxLife: 0.18, color: def.color });
  audio.play('storm', 0.1);
}

/** Ink Mines: drop a mine behind the player (capped; oldest pops first). */
function fireMine(world, inst) {
  const def = weaponDef('mines');
  const p = world.player;
  const max = def.extra.maxMines + (inst.level - 1) * def.extra.maxGrow;
  if (world.mines.length >= max) world.mines.shift();
  world.mines.push({
    x: p.x + R.range(-30, 30),
    y: p.y + R.range(-30, 30),
    damage: weaponDamage(world, inst),
    radius: def.extra.radius,
    life: 25,
  });
}

/**
 * Fire one weapon instance (called when its timer expires). Orbs don't fire
 * — they orbit and burn on contact, handled in updateOrbs.
 */
function fireWeapon(world, inst) {
  if (inst.id === 'pulse') firePulse(world, inst);
  else if (inst.id === 'harpoon') fireHarpoon(world, inst);
  else if (inst.id === 'storm') fireStorm(world, inst);
  else if (inst.id === 'mines') fireMine(world, inst);
}

// ------------------------------------------------------------ updates

/** Orbiting gloworbs: position from the orbit angle, burn on contact. */
function updateOrbs(world, inst, dt) {
  const def = weaponDef('orbs');
  const p = world.player;
  const count = def.extra.count + (inst.level - 1) * def.extra.countGrow;
  inst.orbitAngle += def.extra.orbitSpeed * dt;
  inst.orbPos = inst.orbPos || [];
  inst.orbPos.length = 0;
  for (let k = 0; k < count; k++) {
    const a = inst.orbitAngle + (k / count) * Math.PI * 2;
    const ox = p.x + Math.cos(a) * def.extra.radius;
    const oy = p.y + Math.sin(a) * def.extra.radius;
    inst.orbPos.push([ox, oy]);
    // Contact burn: each orb ticks damage on enemies it touches.
    for (const e of [...world.enemies]) {
      if (Math.hypot(e.x - ox, e.y - oy) < e.radius + 14) {
        const crit = critRoll(world);
        damageEnemy(world, e, weaponDamage(world, inst) * weaponRate(world, inst) * dt * 2.2, crit > 1);
      }
    }
  }
}

/** Move bullets, collide with enemies (pierce counts down), expire. */
function updateBullets(world, dt) {
  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const b = world.bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let dead = b.life <= 0 || b.x < -30 || b.x > VIEW_W + 30 || b.y < -30 || b.y > VIEW_H + 30;
    if (!dead) {
      for (const e of [...world.enemies]) {
        if (b.hit && b.hit.has(e)) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.radius + b.radius) {
          const crit = critRoll(world);
          damageEnemy(world, e, b.damage * crit, crit > 1);
          if (b.pierce > 0) {
            b.pierce--;
            (b.hit = b.hit || new Set()).add(e);
          } else {
            dead = true;
            break;
          }
        }
      }
    }
    if (dead) world.bullets.splice(i, 1);
  }
}

/** Mines sit and wait; an enemy that touches one sets it off. */
function updateMines(world, dt) {
  for (let i = world.mines.length - 1; i >= 0; i--) {
    const m = world.mines[i];
    m.life -= dt;
    if (m.life <= 0) {
      world.mines.splice(i, 1);
      continue;
    }
    let tripped = false;
    for (const e of [...world.enemies]) {
      if (Math.hypot(e.x - m.x, e.y - m.y) < e.radius + 16) {
        tripped = true;
        break;
      }
    }
    if (!tripped) continue;
    world.mines.splice(i, 1);
    burst(world.fx, m.x, m.y, '#ff6b9d', 24, 340, 0.6, 5);
    ring(world.fx, m.x, m.y, '#ff6b9d', 20, 380);
    addTrauma(world.fx, 0.18);
    audio.play('mine', 0.08);
    for (const e of [...world.enemies]) {
      if (Math.hypot(e.x - m.x, e.y - m.y) < m.radius + e.radius) {
        const crit = critRoll(world);
        damageEnemy(world, e, m.damage * crit, crit > 1);
      }
    }
  }
}

/** Fade lightning arcs out. */
function updateArcs(world, dt) {
  for (let i = world.arcs.length - 1; i >= 0; i--) {
    world.arcs[i].life -= dt;
    if (world.arcs[i].life <= 0) world.arcs.splice(i, 1);
  }
}

/**
 * Update every weapon for one frame: countdown timers, fire when ready,
 * orbit the gloworbs, move bullets, trip mines, fade arcs.
 */
export function updateWeapons(world, dt) {
  for (const inst of world.weapons) {
    if (inst.id === 'orbs') {
      updateOrbs(world, inst, dt);
      continue;
    }
    inst.timer -= dt;
    if (inst.timer <= 0) {
      inst.timer = 1 / weaponRate(world, inst);
      fireWeapon(world, inst);
    }
  }
  updateBullets(world, dt);
  updateMines(world, dt);
  updateArcs(world, dt);
}
