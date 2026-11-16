// hud.js — the DOM face of ABYSSAL LANTERN.
//
// The HUD, the menus and the modals are DOM, not canvas: text stays crisp at
// any scale, buttons are real buttons (clickable, keyboard-focusable), and the
// level-up cards are readable cards instead of painted rectangles. The canvas
// draws the game; the DOM tells the player how they are doing.
//
// Elements are looked up once at boot (by id) and cached. updateHUD runs
// every frame but only writes the DOM when a value actually changed, so the
// frame rate never pays for the HUD.

import { WEAPONS, TIERS, WIN_TIME } from './config.js';
import { timeLeft } from './world.js';

/** Cached element handles, filled by initHUD. */
const el = {};
/** Last-written values, for change-only DOM updates. */
const last = {};

function setText(key, node, value) {
  if (last[key] !== value) {
    last[key] = value;
    node.textContent = value;
  }
}

function setWidth(key, node, pct) {
  const v = `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
  if (last[key] !== v) {
    last[key] = v;
    node.style.width = v;
  }
}

/** mm:ss for a seconds count. */
function fmtTime(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/**
 * Cache every HUD element by id. Called once at boot; the ids live in
 * index.html. Missing elements are tolerated (a headless test may run without
 * the full DOM) — the getters guard with optional chaining.
 */
export function initHUD() {
  const ids = [
    'hud', 'hp-fill', 'hp-text', 'xp-fill', 'xp-text', 'level-badge',
    'score', 'combo', 'timer', 'wave-label', 'tier-label', 'kills',
    'dash-fill', 'weapons', 'boss-bar', 'boss-fill', 'boss-name',
    'toast', 'screen-title', 'screen-pause', 'screen-levelup', 'screen-over',
    'screen-win', 'levelup-cards', 'over-stats', 'win-stats', 'pause-build',
    'mute-btn', 'bestiary',
  ];
  for (const id of ids) el[id] = document.getElementById(id);
}

/** Show one screen overlay and hide the others. Null hides all. */
export function showScreen(name) {
  const map = {
    title: el['screen-title'],
    pause: el['screen-pause'],
    levelup: el['screen-levelup'],
    over: el['screen-over'],
    win: el['screen-win'],
  };
  for (const [key, node] of Object.entries(map)) {
    if (!node) continue;
    node.classList.toggle('hidden', key !== name);
  }
  // The HUD belongs to a run: hidden on the title screen, dimmed behind the
  // level-up and pause overlays, full everywhere else.
  if (el.hud) el.hud.classList.toggle('hidden', name === 'title');
  if (el.hud) el.hud.classList.toggle('dimmed', name === 'levelup' || name === 'pause');
}

/** A toast: one line of feedback under the HUD, fading after 2.4s. */
let toastTimer = null;
export function toast(msg) {
  if (!el.toast) return;
  el.toast.textContent = msg;
  el.toast.classList.remove('hidden');
  el.toast.classList.remove('fade');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.classList.add('fade');
    setTimeout(() => el.toast.classList.add('hidden'), 500);
  }, 2400);
}

/** Weapon icons with level pips, rebuilt only when the arsenal changes. */
function renderWeapons(world) {
  if (!el.weapons) return;
  const key = world.weapons.map((w) => `${w.id}:${w.level}`).join('|');
  if (last.weaponsKey === key) return;
  last.weaponsKey = key;
  el.weapons.innerHTML = '';
  for (const w of world.weapons) {
    const def = WEAPONS.find((d) => d.id === w.id);
    const chip = document.createElement('div');
    chip.className = 'weapon-chip';
    chip.title = def.name;
    const pips = '●'.repeat(w.level) + '○'.repeat(5 - w.level);
    chip.innerHTML = `<span class="weapon-dot" style="background:${def.color}"></span>
      <span class="weapon-name">${def.name}</span>
      <span class="weapon-pips">${pips}</span>`;
    el.weapons.appendChild(chip);
  }
}

/**
 * Update the whole HUD for one frame: bars, numbers, labels, boss bar, weapon
 * chips. Change-only writes keep this cheap.
 */
export function updateHUD(world) {
  if (!el.hud) return;
  const p = world.player;

  setWidth('hp', el['hp-fill'], (p.hp / p.maxHp) * 100);
  setText('hpText', el['hp-text'], `${Math.ceil(p.hp)} / ${p.maxHp}`);
  setWidth('xp', el['xp-fill'], (p.xp / p.xpNext) * 100);
  setText('xpText', el['xp-text'], `LV ${p.level}`);
  setText('level', el['level-badge'], `${p.level}`);
  setText('score', el.score, `${Math.floor(world.score)}`);
  setText('timer', el.timer, fmtTime(timeLeft(world)));
  setText('wave', el['wave-label'], `WAVE ${world.wave}`);
  setText('tier', el['tier-label'], TIERS[world.tier].name);
  setText('kills', el.kills, `${world.kills} slain`);

  // Combo: shown only while the chain is alive, with its multiplier.
  if (el.combo) {
    if (world.combo >= 2) {
      el.combo.classList.remove('hidden');
      setText('combo', el.combo, `COMBO x${Math.min(world.combo, 8)}`);
    } else {
      el.combo.classList.add('hidden');
    }
  }

  // Dash: the fill drains while recharging, glows when ready.
  setWidth('dash', el['dash-fill'], p.dashCd <= 0 ? 100 : (1 - p.dashCd / 2.2) * 100);
  if (el['dash-fill']) el['dash-fill'].classList.toggle('ready', p.dashCd <= 0);

  // Boss bar: visible only while a Leviathan lives.
  if (el['boss-bar']) {
    const boss = world.boss;
    el['boss-bar'].classList.toggle('hidden', !boss);
    if (boss) {
      setText('bossName', el['boss-name'], 'LEVIATHAN');
      setWidth('boss', el['boss-fill'], (boss.hp / boss.maxHp) * 100);
    }
  }

  renderWeapons(world);
}

/**
 * Build the level-up modal's 3 cards. `onPick` receives the chosen card.
 * Cards are buttons: click them, or press 1/2/3 (main.js wires the keys).
 */
export function showLevelUp(world, onPick) {
  if (!el['levelup-cards']) return;
  el['levelup-cards'].innerHTML = '';
  world.levelUpCards.forEach((card, i) => {
    const btn = document.createElement('button');
    btn.className = 'card';
    btn.dataset.index = String(i);
    const tag = card.kind === 'new' ? 'NEW WEAPON' : card.kind === 'upgrade' ? 'UPGRADE' : 'BOON';
    btn.innerHTML = `
      <span class="card-tag" style="color:${card.color}">${tag}</span>
      <span class="card-name">${card.name}</span>
      <span class="card-desc">${card.desc}</span>
      <span class="card-key">[${i + 1}]</span>`;
    btn.addEventListener('click', () => onPick(card));
    el['levelup-cards'].appendChild(btn);
  });
  showScreen('levelup');
}

/** Fill the game-over screen with the run's final stats. */
export function showGameOver(world) {
  if (!el['over-stats']) return;
  const s = world.finalStats;
  el['over-stats'].innerHTML = `
    <div class="stat"><span>Score</span><b>${Math.floor(s.score)}</b></div>
    <div class="stat"><span>Survived</span><b>${fmtTime(s.time)}</b></div>
    <div class="stat"><span>Level</span><b>${s.level}</b></div>
    <div class="stat"><span>Slain</span><b>${s.kills}</b></div>
    <div class="stat"><span>Best combo</span><b>x${s.bestCombo}</b></div>
    <div class="stat"><span>Damage dealt</span><b>${Math.floor(s.damageDealt)}</b></div>
    <div class="stat"><span>Gems gathered</span><b>${s.gems}</b></div>
    <div class="stat"><span>Wave reached</span><b>${s.wave}</b></div>`;
  showScreen('over');
}

/** Fill the victory screen with the run's final stats. */
export function showVictory(world) {
  if (!el['win-stats']) return;
  const s = world.finalStats;
  el['win-stats'].innerHTML = `
    <div class="stat"><span>Score</span><b>${Math.floor(s.score)}</b></div>
    <div class="stat"><span>Level</span><b>${s.level}</b></div>
    <div class="stat"><span>Slain</span><b>${s.kills}</b></div>
    <div class="stat"><span>Best combo</span><b>x${s.bestCombo}</b></div>
    <div class="stat"><span>Damage dealt</span><b>${Math.floor(s.damageDealt)}</b></div>
    <div class="stat"><span>Gems gathered</span><b>${s.gems}</b></div>`;
  showScreen('win');
}

/** Fill the pause screen's build summary. */
export function showPause(world, buildText) {
  if (el['pause-build']) el['pause-build'].textContent = buildText;
  showScreen('pause');
}
