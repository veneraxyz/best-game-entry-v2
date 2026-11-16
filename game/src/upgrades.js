// upgrades.js — the level-up draft of ABYSSAL LANTERN.
//
// Every level offers exactly 3 cards, and the player picks 1. The pool mixes
// weapon cards (a new weapon, or +1 level on one owned) with stat cards, so
// every draft has a real decision: take the new toy, deepen the build, or
// patch a weakness. The pool is weighted toward weapons early (a build needs
// its tools) and toward upgrades later (a build needs its teeth).
//
// Rules the pool enforces:
//   * A new-weapon card appears only for weapons not owned, and only while the
//     player owns fewer than MAX_WEAPONS.
//   * An upgrade card appears only for owned weapons below the level cap.
//   * Stat cards are always available, but the same stat card never appears
//     twice in one draft.
//   * The 3 cards are always distinct.

import { WEAPONS, STAT_CARDS, MAX_WEAPONS, MAX_WEAPON_LEVEL } from './config.js';
import { R } from './random.js';
import { addWeapon, upgradeWeapon, weaponLevel } from './weapons.js';
import { healPlayer } from './player.js';

/** One offered card: { kind: 'new' | 'upgrade' | 'stat', id, name, desc, level }. */
function weaponCard(kind, def, level) {
  if (kind === 'new') {
    return { kind, id: def.id, name: def.name, desc: def.desc, level: 1, color: def.color };
  }
  return {
    kind,
    id: def.id,
    name: `${def.name} ${level + 1}`,
    desc: `Raise ${def.name} to level ${level + 1}. More damage, faster fire.`,
    level: level + 1,
    color: def.color,
  };
}

function statCard(def) {
  return { kind: 'stat', id: def.id, name: def.name, desc: def.desc, level: 0, color: '#ffd166' };
}

/**
 * Build the 3-card draft for the current build. Weighted: new weapons are
 * likely while slots are free, upgrades dominate once the build is set.
 */
export function buildDraft(world) {
  const owned = world.weapons.map((w) => w.id);
  const pool = [];

  // New weapons (weight 3 each while a slot is free).
  if (owned.length < MAX_WEAPONS) {
    for (const def of WEAPONS) {
      if (!owned.includes(def.id)) {
        pool.push({ card: weaponCard('new', def, 0), weight: 3 });
      }
    }
  }
  // Upgrades (weight 4 each — deepening the build is usually right).
  for (const inst of world.weapons) {
    if (inst.level < MAX_WEAPON_LEVEL) {
      const def = WEAPONS.find((w) => w.id === inst.id);
      pool.push({ card: weaponCard('upgrade', def, inst.level), weight: 4 });
    }
  }
  // Stat cards (weight 2 each).
  for (const def of STAT_CARDS) {
    pool.push({ card: statCard(def), weight: 2 });
  }

  // Weighted draw without replacement: 3 distinct cards.
  const draft = [];
  const used = new Set();
  while (draft.length < 3 && pool.length > 0) {
    let total = 0;
    for (const e of pool) if (!used.has(e.card.id + e.card.kind)) total += e.weight;
    let roll = R.next() * total;
    for (const e of pool) {
      const key = e.card.id + e.card.kind;
      if (used.has(key)) continue;
      roll -= e.weight;
      if (roll <= 0) {
        used.add(key);
        draft.push(e.card);
        break;
      }
    }
  }
  return draft;
}

/**
 * Apply a chosen card to the run. Returns a one-line summary for the HUD's
 * toast (shown briefly after the modal closes).
 */
export function applyCard(world, card) {
  const p = world.player;
  if (card.kind === 'new') {
    addWeapon(world, card.id);
    return `${card.name} joined your light.`;
  }
  if (card.kind === 'upgrade') {
    upgradeWeapon(world, card.id);
    return `${card.name} — brighter and faster.`;
  }
  // Stat card: apply each field of the card's `apply` map.
  const def = STAT_CARDS.find((s) => s.id === card.id);
  if (!def) return '';
  const a = def.apply;
  if (a.speed) p.speed *= a.speed;
  if (a.maxHp) {
    p.maxHp += a.maxHp;
    if (a.heal) healPlayer(world, a.heal);
  }
  if (a.magnet) p.magnet *= a.magnet;
  if (a.damage) p.damageMult *= a.damage;
  if (a.rate) p.rateMult *= a.rate;
  if (a.armor) p.armor += a.armor;
  if (a.crit) p.critChance += a.crit;
  if (a.dashCd) p.dashCdMult = (p.dashCdMult || 1) * a.dashCd;
  return `${card.name} — the deep feels a little smaller.`;
}

/** A short text summary of the current build, for the pause screen. */
export function buildSummary(world) {
  const parts = world.weapons.map((w) => {
    const def = WEAPONS.find((d) => d.id === w.id);
    return `${def.name} Lv${w.level}`;
  });
  return parts.length ? parts.join('  ·  ') : 'No weapons yet';
}
