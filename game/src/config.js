// config.js — every tunable number in ABYSSAL LANTERN lives here.
//
// Design goals behind the numbers:
//   * A run lasts at most 5 minutes (WIN_TIME). The first 30 seconds teach the
//     loop gently (slow chasers, generous gems); pressure ramps in tiers so a
//     run that reaches the Hadal zone feels earned, not random.
//   * Every weapon stays useful to the end. Upgrades raise damage and rate, but
//     the real power comes from combining weapons: orbs guard the body while
//     the harpoon deletes what the pulse ray softened.
//   * The player is fast but fragile. The dash is the skill expression: a
//     well-timed dash through a pack is worth more than any card.
//
// Balance is tuned for a keyboard player who keeps moving. Contact damage is
// the main threat; the 0.6s hurt window after a hit keeps a swarm from
// deleting the player in a single frame.

/** The playfield, in game pixels. The canvas is exactly this size. */
export const VIEW_W = 1280;
export const VIEW_H = 800;

/** Survive this many seconds and the Garden blooms: the win. */
export const WIN_TIME = 300;

/** A wave banner every WAVE_SECONDS; a new abyss tier every TIER_SECONDS. */
export const WAVE_SECONDS = 30;
export const TIER_SECONDS = 60;

/** Boss (Leviathan) appearances, in seconds into the run. */
export const BOSS_TIMES = [90, 210];

/** The player's base stats. Upgrades and cards modify these at runtime. */
export const PLAYER_BASE = {
  radius: 16,
  speed: 250, // px per second
  maxHp: 100,
  magnet: 110, // pickup radius, px
  armor: 0, // flat damage reduction per hit
  critChance: 0.05,
  critMult: 2.0,
  dashSpeed: 720,
  dashTime: 0.16, // seconds of dash
  dashCooldown: 2.2, // seconds between dashes
  hurtWindow: 0.6, // invulnerability after taking a hit, seconds
  xpBase: 8, // XP for level 2
  xpGrowth: 4, // extra XP per level
};

/** Combo: kills within COMBO_WINDOW seconds of each other build the chain. */
export const COMBO_WINDOW = 3.0;
export const COMBO_MAX = 8;

/** Score values. The combo multiplier applies to kill score. */
export const SCORE = {
  kill: 10,
  elite: 50,
  boss: 500,
  gem: 1,
  survivalPerSecond: 2,
  winBonus: 1000,
};

/** Gem magnet: gems within this radius fly to the player at this speed. */
export const GEM_FLY_SPEED = 620;

/**
 * Weapons. Each has 5 levels; level stats are computed from the base with the
 * per-level growth fields, so tuning stays in one place.
 *
 *   id        stable id, also the HUD icon key
 *   name      shown on cards and in the HUD
 *   desc      one line for the level-up card
 *   color     projectile / effect colour
 *   damage    base damage per hit
 *   dmgGrow   extra damage per level above 1
 *   rate      shots (or ticks) per second at level 1
 *   rateGrow  extra shots per second per level above 1
 *   extra     weapon-specific numbers, documented per weapon
 */
export const WEAPONS = [
  {
    id: 'pulse',
    name: 'Pulse Ray',
    desc: 'Fires bolts of light at the nearest gloom. Reliable, quick, hungry.',
    color: '#5ff2ff',
    damage: 12,
    dmgGrow: 5,
    rate: 2.6,
    rateGrow: 0.45,
    extra: { speed: 640, count: 1, countAt: 3 }, // +1 bolt from level 3
  },
  {
    id: 'harpoon',
    name: 'Sun Harpoon',
    desc: 'A piercing lance aimed where your mouse points. Goes through all.',
    color: '#ffd166',
    damage: 26,
    dmgGrow: 11,
    rate: 0.9,
    rateGrow: 0.12,
    extra: { speed: 900, pierce: 99 },
  },
  {
    id: 'orbs',
    name: 'Gloworbs',
    desc: 'Living lights orbit you and burn whatever they touch.',
    color: '#c77dff',
    damage: 10,
    dmgGrow: 4,
    rate: 2.0, // contact ticks per second per orb
    rateGrow: 0.3,
    extra: { count: 2, countGrow: 1, radius: 74, orbitSpeed: 2.6 },
  },
  {
    id: 'storm',
    name: 'Abyss Storm',
    desc: 'Lightning arcs from your lantern to the nearest pack, chaining on.',
    color: '#7dffb0',
    damage: 16,
    dmgGrow: 7,
    rate: 0.8,
    rateGrow: 0.14,
    extra: { chains: 3, chainGrow: 1, range: 260 },
  },
  {
    id: 'mines',
    name: 'Ink Mines',
    desc: 'Drops drifting mines behind you. They bloom into fire when touched.',
    color: '#ff6b9d',
    damage: 34,
    dmgGrow: 14,
    rate: 0.55,
    rateGrow: 0.1,
    extra: { radius: 70, maxMines: 6, maxGrow: 2 },
  },
];

/** The most weapons a build can hold at once. Forces real choices. */
export const MAX_WEAPONS = 4;
/** The highest level a weapon reaches. */
export const MAX_WEAPON_LEVEL = 5;

/**
 * Enemies. hp/damage/speed scale with run time (see waves.js); the numbers
 * below are the values at t=0.
 *
 *   id       stable id
 *   name     shown in the bestiary on the title screen
 *   hp       hit points at spawn
 *   speed    px per second
 *   damage   contact damage
 *   radius   collision radius
 *   xp       gems dropped (each gem is worth 1 XP)
 *   score    base score, before the combo multiplier
 *   color    body glow colour
 *   unlock   earliest second this type may spawn
 *   weight   relative spawn weight once unlocked
 */
export const ENEMIES = [
  {
    id: 'gloomlet',
    name: 'Gloomlet',
    hp: 18, speed: 105, damage: 8, radius: 15,
    xp: 1, score: 10, color: '#8ecae6', unlock: 0, weight: 10,
    desc: 'The dark’s foot soldier. Slow, numberless, always hungry.',
  },
  {
    id: 'darter',
    name: 'Darter',
    hp: 12, speed: 165, damage: 10, radius: 12,
    xp: 1, score: 15, color: '#ffafcc', unlock: 25, weight: 6,
    desc: 'Darts in bursts, then pauses. Punish the pause.',
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    hp: 70, speed: 55, damage: 14, radius: 26,
    xp: 3, score: 25, color: '#b5179e', unlock: 45, weight: 4,
    desc: 'A walking reef. Slow to arrive, slow to die.',
  },
  {
    id: 'splitter',
    name: 'Splitter',
    hp: 30, speed: 90, damage: 9, radius: 18,
    xp: 2, score: 20, color: '#80ed99', unlock: 70, weight: 5,
    desc: 'Bursts into two gloomlets when slain. Aim carefully.',
  },
  {
    id: 'spitter',
    name: 'Spitter',
    hp: 22, speed: 80, damage: 6, radius: 15,
    xp: 2, score: 20, color: '#ffca3a', unlock: 100, weight: 5,
    desc: 'Keeps its distance and spits ink. Close the gap or dodge.',
  },
  {
    id: 'leviathan',
    name: 'Leviathan',
    hp: 900, speed: 62, damage: 22, radius: 54,
    xp: 20, score: 500, color: '#ff5964', unlock: 90, weight: 0,
    desc: 'An old hunger given a body. It does not hurry. It does not need to.',
  },
];

/** Elite enemies: tougher, faster, brighter, worth more. */
export const ELITE = {
  chance: 0.06, // per spawn, after 60s
  hpMult: 4,
  speedMult: 1.15,
  damageMult: 1.5,
  xpMult: 4,
  scoreMult: 5,
};

/** Enemy stat growth with run time. hp grows ~+7% per 10s, capped. */
export const ENEMY_SCALING = {
  hpPerSecond: 0.007,
  hpCapMult: 4.5,
  speedPerSecond: 0.0009,
  speedCapMult: 1.6,
  damagePerSecond: 0.004,
  damageCapMult: 2.2,
};

/**
 * Abyss tiers. Every TIER_SECONDS the water darkens, the palette shifts, and
 * the spawn director turns up. The tier names the zone the player has sunk
 * into; the HUD shows it.
 */
export const TIERS = [
  { name: 'Twilight Reach', bg0: '#062a4d', bg1: '#020d1f', fog: '#0a4a6b', spawnInterval: 1.15 },
  { name: 'Midnight Shelf', bg0: '#0b1e4b', bg1: '#030818', fog: '#123a6b', spawnInterval: 0.95 },
  { name: 'Hadal Garden', bg0: '#1a1040', bg1: '#05030f', fog: '#2a1a5e', spawnInterval: 0.78 },
  { name: 'The Quiet Deep', bg0: '#240b33', bg1: '#08020d', fog: '#3d1452', spawnInterval: 0.62 },
  { name: 'Void Floor', bg0: '#2b0a1e', bg1: '#0a0208', fog: '#4a1030', spawnInterval: 0.5 },
];

/**
 * Level-up stat cards. Weapon cards (new weapon / upgrade) are built from
 * WEAPONS at runtime; these are the always-available stat boosts.
 */
export const STAT_CARDS = [
  { id: 'swift', name: 'Swift Fins', desc: '+12% swim speed. The dark is slower than you.', apply: { speed: 1.12 } },
  { id: 'vitality', name: 'Deep Heart', desc: '+25 max HP and heal 25 now.', apply: { maxHp: 25, heal: 25 } },
  { id: 'magnet', name: 'Wide Lantern', desc: '+45% pickup radius. The light reaches further.', apply: { magnet: 1.45 } },
  { id: 'sharp', name: 'Sharpened Light', desc: '+15% damage on every weapon.', apply: { damage: 1.15 } },
  { id: 'haste', name: 'Swift Current', desc: 'Weapons fire 12% faster.', apply: { rate: 1.12 } },
  { id: 'armor', name: 'Reef Scales', desc: '+2 armor: every hit hurts 2 less.', apply: { armor: 2 } },
  { id: 'lucky', name: 'Lucky Pearl', desc: '+8% critical chance. Crits deal double.', apply: { crit: 0.08 } },
  { id: 'dash', name: 'Slipstream', desc: 'Dash recharges 30% faster.', apply: { dashCd: 0.7 } },
];

/** The palette for HUD, text and effects. One coherent abyssal scheme. */
export const PALETTE = {
  hp: '#ff5964',
  xp: '#5ff2ff',
  score: '#ffd166',
  combo: '#c77dff',
  text: '#dff6ff',
  dim: '#8fb8cc',
  gold: '#ffd166',
};
