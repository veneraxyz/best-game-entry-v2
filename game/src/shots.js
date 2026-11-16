// shots.js — screenshot scenes for ABYSSAL LANTERN.
//
// The dossier's screenshots must be real renders of the game's own code, so
// the game stages its own photo moments: `?shot=<scene>&seed=<n>` builds a
// world, pushes it into a chosen moment, and lets the frame render. The scenes
// use fixed seeds, so the same URL always renders the same moment (up to the
// ambient particles), and the screenshots are reproducible.
//
// The four scenes map to the four dossier screenshots, in dossier order:
//   1-cover    dense mid-game action: swarm, boss, bullets, combo, full HUD
//   2-title    the title screen over the living abyss
//   3-levelup  the level-up draft open over a busy field
//   4-results  the game-over screen with final stats
//
// Nothing here is a mock: the scenes run the real systems (real enemies, real
// weapons, real HUD). The cover scene even keeps playing after staging — the
// screenshot catches it mid-motion, particles and all.

import { VIEW_W, VIEW_H } from './config.js';
import { STATE } from './world.js';
import { R } from './random.js';
import { WEAPONS } from './config.js';
import { spawnEnemy, spawnBoss } from './enemies.js';
import { addWeapon, upgradeWeapon } from './weapons.js';
import { buildDraft } from './upgrades.js';
import { burst } from './particles.js';

/** Read the shot scene (and seed) from the URL. Null when not a shot run. */
export function shotFromURL() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (!shot) return null;
  const seed = parseInt(q.get('seed') || '1', 10) || 1;
  return { shot, seed };
}

/** Give the staged player a strong mid-game build: 4 weapons, leveled. */
function armPlayer(world) {
  const build = [
    ['pulse', 4], ['harpoon', 3], ['orbs', 3], ['storm', 2],
  ];
  for (const [id, level] of build) {
    addWeapon(world, id);
    for (let k = 1; k < level; k++) upgradeWeapon(world, id);
  }
  const p = world.player;
  p.level = 12;
  p.xp = 6;
  p.xpNext = 52;
  p.hp = 78;
  p.maxHp = 125;
  p.magnet = 160;
}

/** Scatter a mixed swarm around the player, at staged positions. */
function stageSwarm(world, count) {
  const types = ['gloomlet', 'gloomlet', 'gloomlet', 'darter', 'darter', 'bulwark', 'splitter', 'spitter'];
  for (let i = 0; i < count; i++) {
    const e = spawnEnemy(world, R.pick(types), R.chance(0.12));
    // Pull the swarm into the frame: ring around the player, not at the edge.
    const a = R.angle();
    const d = R.range(160, 520);
    e.x = Math.max(30, Math.min(VIEW_W - 30, world.player.x + Math.cos(a) * d));
    e.y = Math.max(30, Math.min(VIEW_H - 30, world.player.y + Math.sin(a) * d));
  }
}

/** Scatter gems and a couple of pickups across the field. */
function stageField(world) {
  for (let i = 0; i < 26; i++) {
    world.gems.push({
      x: R.range(60, VIEW_W - 60), y: R.range(60, VIEW_H - 60),
      vx: 0, vy: 0, value: 1, flying: false,
    });
  }
  world.pickups.push({ x: 980, y: 180, kind: 'pearl', life: 30 });
  world.pickups.push({ x: 240, y: 640, kind: 'kelp', life: 30 });
  // A few mines already drifting.
  for (let i = 0; i < 3; i++) {
    world.mines.push({
      x: R.range(200, VIEW_W - 200), y: R.range(200, VIEW_H - 200),
      damage: 40, radius: 70, life: 25,
    });
  }
}

/** Pre-fire some bullets so the cover frame has shots in the air. */
function stageBullets(world) {
  const p = world.player;
  for (let i = 0; i < 10; i++) {
    const a = R.angle();
    const d = R.range(60, 320);
    world.bullets.push({
      x: p.x + Math.cos(a) * d,
      y: p.y + Math.sin(a) * d,
      vx: Math.cos(a) * 640, vy: Math.sin(a) * 640,
      damage: 12, radius: 6, color: i % 3 === 0 ? '#ffd166' : '#5ff2ff',
      pierce: 0, life: 1.2,
    });
  }
  // One lightning arc mid-flash.
  const target = world.enemies[0];
  if (target) {
    world.arcs.push({
      points: [[p.x, p.y], [target.x, target.y]],
      life: 0.18, maxLife: 0.18, color: '#7dffb0',
    });
  }
}

/** The cover: the game at its most alive. Wave 6, boss up, combo burning. */
function stageCover(world) {
  world.state = STATE.PLAYING;
  world.time = 152;
  world.wave = 6;
  world.tier = 2;
  world.score = 18420;
  world.kills = 214;
  world.combo = 6;
  world.comboTimer = 2.4;
  world.bestCombo = 8;
  world.bossesSpawned = 1;
  armPlayer(world);
  stageSwarm(world, 34);
  stageField(world);
  stageBullets(world);
  const boss = spawnBoss(world);
  boss.x = VIEW_W - 260;
  boss.y = 170;
  boss.hp = boss.maxHp * 0.62;
  world.banner = '';
  world.bannerTimer = 0;
  burst(world.fx, world.player.x, world.player.y, '#5ff2ff', 18, 260, 0.7, 4);
}

/** The title: the living abyss behind the menu. Pre-stage five drifters so
 *  the backdrop is alive from the first frame (the ambient spawner would
 *  take seconds to fill it). */
function stageTitle(world) {
  world.state = STATE.TITLE;
  const colors = ['#8ecae6', '#c77dff', '#7dffb0', '#ffafcc', '#ffd166'];
  for (let i = 0; i < 5; i++) {
    world.drifters.push({
      x: R.range(90, VIEW_W - 90),
      y: R.range(80, VIEW_H - 140),
      vx: R.range(14, 34) * (R.chance(0.5) ? 1 : -1),
      r: R.range(9, 18),
      color: colors[i % colors.length],
    });
  }
}

/** The level-up draft: modal open over a busy, paused field. */
function stageLevelUp(world) {
  world.state = STATE.LEVELUP;
  world.time = 96;
  world.wave = 4;
  world.tier = 1;
  world.score = 8210;
  world.kills = 118;
  world.combo = 3;
  world.comboTimer = 1.5;
  world.bestCombo = 5;
  armPlayer(world);
  // A slightly smaller arsenal for the draft: the 4th slot is still open, so
  // the draft offers a new weapon among the cards.
  world.weapons = world.weapons.slice(0, 3);
  stageSwarm(world, 18);
  stageField(world);
  // Re-roll the draft until it offers a new weapon: the screenshot should
  // show all three card kinds the draft can produce (new, upgrade, boon).
  world.levelUpCards = buildDraft(world);
  let tries = 0;
  while (tries < 8 && !world.levelUpCards.some((c) => c.kind === 'new')) {
    world.levelUpCards = buildDraft(world);
    tries++;
  }
}

/** The results screen: a finished run, stats filled, restart waiting. */
function stageResults(world) {
  world.state = STATE.OVER;
  world.time = 238;
  world.wave = 8;
  world.tier = 3;
  world.score = 24780;
  world.kills = 312;
  world.bestCombo = 8;
  world.player.level = 15;
  world.player.dead = true;
  world.player.hp = 0;
  world.damageDealt = 48210;
  world.gemsCollected = 412;
  world.levelUps = 14;
  armPlayer(world);
  stageSwarm(world, 12);
  world.finalStats = {
    score: world.score,
    time: world.time,
    level: world.player.level,
    kills: world.kills,
    bestCombo: world.bestCombo,
    damageDealt: world.damageDealt,
    gems: world.gemsCollected,
    wave: world.wave,
  };
}

/**
 * Stage a scene into a fresh world. Unknown scenes fall back to the title.
 * Returns the scene name that was staged.
 */
export function stageShot(world, name) {
  if (name === 'cover') stageCover(world);
  else if (name === 'title') stageTitle(world);
  else if (name === 'levelup') stageLevelUp(world);
  else if (name === 'results') stageResults(world);
  else stageTitle(world);
  return name;
}
