// main.js — boot, loop and state machine for ABYSSAL LANTERN.
//
// The loop runs on requestAnimationFrame with a fixed 60Hz logic step (an
// accumulator, capped so a slow frame never spirals). Rendering is every
// frame; logic is every 1/60s. The state machine is small and explicit:
// TITLE -> PLAYING <-> LEVELUP/PAUSED -> OVER/WIN -> (restart) -> PLAYING.
//
// Starting a run: the title's Start button (or Enter) seeds a fresh world
// from the clock and gives the player the Pulse Ray. Restarting from an end
// screen (R, or the button) does the same. Quitting to the title is not
// offered mid-run on purpose: a run is a commitment, and the pause screen
// says so.
//
// Screenshot runs (?shot=...) skip the title: the scene stages a world and
// the loop renders it. The cover scene keeps playing; the modal scenes hold
// still. A `window.__gameReady` flag tells screenshot tooling the first frame
// has rendered.

import { VIEW_W, VIEW_H, WIN_TIME, SCORE } from './config.js';
import { R } from './random.js';
import { input, attachInput } from './input.js';
import { audio } from './audio.js';
import { createWorld, STATE, timeLeft } from './world.js';
import { updatePlayer, updateGems, updatePickups, tryDash } from './player.js';
import { updateEnemies } from './enemies.js';
import { updateWeapons, addWeapon } from './weapons.js';
import { updateWaves } from './waves.js';
import { updateEffects } from './particles.js';
import { drawWorld } from './render.js';
import { initHUD, updateHUD, showScreen, showLevelUp, showGameOver, showVictory, showPause, toast } from './hud.js';
import { buildDraft, applyCard, buildSummary } from './upgrades.js';
import { shotFromURL, stageShot } from './shots.js';

/** Fixed logic step: 60 updates per second. */
const STEP = 1 / 60;
/** The most logic time a single frame may consume (spiral guard). */
const MAX_FRAME = 0.1;

/** The live game: canvas, context, world, loop bookkeeping. */
const game = {
  canvas: null,
  ctx: null,
  world: null,
  lastTime: 0,
  acc: 0,
  shot: null,
  started: false,
};

/** Start a fresh run: new world, Pulse Ray in hand, state PLAYING. */
function startRun() {
  const seed = (Date.now() % 2147483647) | 0;
  game.world = createWorld(seed);
  game.world.state = STATE.PLAYING;
  addWeapon(game.world, 'pulse');
  game.world.banner = 'THE DARK STIRS';
  game.world.bannerTimer = 2.2;
  showScreen(null);
  audio.play('click');
  game.started = true;
}

/** End the run: fill finalStats and show the right end screen. */
function endRun(won) {
  const w = game.world;
  const p = w.player;
  w.finalStats = {
    score: w.score + (won ? SCORE.winBonus : 0),
    time: w.time,
    level: p.level,
    kills: w.kills,
    bestCombo: w.bestCombo,
    damageDealt: w.damageDealt,
    gems: w.gemsCollected,
    wave: w.wave,
  };
  w.score = w.finalStats.score;
  w.state = won ? STATE.WIN : STATE.OVER;
  if (won) {
    audio.play('win');
    showVictory(w);
  } else {
    audio.play('gameover');
    showGameOver(w);
  }
}

/** Apply a chosen card, then either draft again (queued levels) or resume. */
function pickCard(card) {
  const w = game.world;
  const msg = applyCard(w, card);
  audio.play('click');
  w.pendingLevels = Math.max(0, w.pendingLevels - 1);
  if (w.pendingLevels > 0) {
    openLevelUp();
  } else {
    w.state = STATE.PLAYING;
    showScreen(null);
    toast(msg);
  }
}

/** Open the level-up draft: build 3 cards, pause the action, show the modal. */
function openLevelUp() {
  const w = game.world;
  w.levelUpCards = buildDraft(w);
  w.state = STATE.LEVELUP;
  audio.fanfare();
  showLevelUp(w, (card) => pickCard(card));
}

/** One fixed logic step, in PLAYING state only. */
function stepPlaying(dt) {
  const w = game.world;
  const p = w.player;

  updateWaves(w, dt);
  updatePlayer(w, dt);
  updateEnemies(w, dt);
  updateWeapons(w, dt);
  updateGems(w, dt);
  updatePickups(w, dt);
  updateEffects(w.fx, dt, VIEW_W, VIEW_H);
  if (w.bannerTimer > 0) w.bannerTimer -= dt;

  // Death ends the run (the player module sets dead on the killing hit).
  if (p.dead) {
    endRun(false);
    return;
  }
  // The clock running out is the win: the Garden blooms.
  if (w.time >= WIN_TIME) {
    w.won = true;
    endRun(true);
    return;
  }
  // A level earned this step opens the draft (pending levels drain one draft
  // at a time; pickCard re-opens while any remain).
  if (w.pendingLevels > 0) {
    openLevelUp();
  }
}

/** One fixed logic step in TITLE state: ambient drift only. */
function stepTitle(dt) {
  const w = game.world;
  w.time += dt;
  updateEffects(w.fx, dt, VIEW_W, VIEW_H);
  // Ambient drifters: slow glowing shapes crossing the title backdrop.
  if (w.drifters.length < 6 && R.chance(dt * 0.5)) {
    w.drifters.push({
      x: R.chance(0.5) ? -40 : VIEW_W + 40,
      y: R.range(80, VIEW_H - 120),
      vx: R.range(14, 34) * (R.chance(0.5) ? 1 : -1),
      r: R.range(8, 18),
      color: R.pick(['#8ecae6', '#c77dff', '#7dffb0', '#ffafcc']),
    });
  }
  for (let i = w.drifters.length - 1; i >= 0; i--) {
    const d = w.drifters[i];
    d.x += d.vx * dt;
    d.y += Math.sin(w.time + d.y) * 6 * dt;
    if (d.x < -60 || d.x > VIEW_W + 60) w.drifters.splice(i, 1);
  }
}

/** Handle one frame's edge-triggered keys, by state. */
function handleKeys() {
  const w = game.world;
  if (!w) return;

  if (input.wasPressed('KeyM')) {
    const muted = audio.toggleMute();
    toast(muted ? 'Sound off' : 'Sound on');
  }

  if (w.state === STATE.TITLE) {
    if (input.wasPressed('Enter') || input.wasPressed('Space')) startRun();
    return;
  }
  if (w.state === STATE.PLAYING) {
    if (input.wasPressed('Space')) tryDash(w);
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
      w.state = STATE.PAUSED;
      showPause(w, buildSummary(w));
      audio.play('click');
    }
    return;
  }
  if (w.state === STATE.PAUSED) {
    if (input.wasPressed('KeyP') || input.wasPressed('Escape') || input.wasPressed('Enter')) {
      w.state = STATE.PLAYING;
      showScreen(null);
      audio.play('click');
    }
    if (input.wasPressed('KeyR')) startRun();
    return;
  }
  if (w.state === STATE.LEVELUP) {
    const pick = ['Digit1', 'Digit2', 'Digit3'].findIndex((c) => input.wasPressed(c));
    if (pick >= 0 && w.levelUpCards && w.levelUpCards[pick]) {
      pickCard(w.levelUpCards[pick]);
    }
    return;
  }
  if (w.state === STATE.OVER || w.state === STATE.WIN) {
    if (input.wasPressed('KeyR') || input.wasPressed('Enter') || input.wasPressed('Space')) {
      startRun();
    }
  }
}

/** The frame: advance the accumulator, step logic, render, update the HUD. */
function frame(now) {
  const dtMs = Math.min(MAX_FRAME * 1000, now - game.lastTime);
  game.lastTime = now;
  const dt = dtMs / 1000;
  const w = game.world;

  handleKeys();

  if (w.state === STATE.PLAYING) {
    game.acc += dt;
    while (game.acc >= STEP) {
      stepPlaying(STEP);
      game.acc -= STEP;
      if (w.state !== STATE.PLAYING) {
        game.acc = 0;
        break;
      }
    }
  } else if (w.state === STATE.TITLE) {
    stepTitle(dt);
  } else if (w.state === STATE.LEVELUP || w.state === STATE.PAUSED || w.state === STATE.OVER || w.state === STATE.WIN) {
    // Held states: particles settle but nothing moves. (The level-up modal
    // sits over a frozen field; the end screens over the last moment.)
    updateEffects(w.fx, dt * 0.25, VIEW_W, VIEW_H);
  }

  drawWorld(game.ctx, w, dt);
  if (w.state !== STATE.TITLE) updateHUD(w);
  input.endFrame();

  if (!window.__gameReady) window.__gameReady = true;
  requestAnimationFrame(frame);
}

/** Wire the DOM buttons to the state machine. */
function wireButtons() {
  const startBtn = document.getElementById('start-btn');
  if (startBtn) startBtn.addEventListener('click', startRun);
  const resumeBtn = document.getElementById('resume-btn');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
      game.world.state = STATE.PLAYING;
      showScreen(null);
      audio.play('click');
    });
  }
  const restartBtns = document.querySelectorAll('[data-restart]');
  restartBtns.forEach((b) => b.addEventListener('click', startRun));
  const muteBtn = document.getElementById('mute-btn');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      const muted = audio.toggleMute();
      muteBtn.textContent = muted ? '🔇' : '🔊';
    });
  }
}

/** Boot: canvas, HUD, input, then either a shot scene or the title. */
function boot() {
  game.canvas = document.getElementById('game');
  game.ctx = game.canvas.getContext('2d');
  initHUD();
  attachInput(game.canvas, () => audio.unlock());
  wireButtons();

  game.shot = shotFromURL();
  if (game.shot) {
    // Screenshot run: fixed seed, staged scene, no title.
    game.world = createWorld(game.shot.seed);
    stageShot(game.world, game.shot.shot);
    if (game.world.state === STATE.LEVELUP) {
      // The modal needs its cards built (stageShot set levelUpCards).
      showLevelUp(game.world, () => {});
    } else if (game.world.state === STATE.OVER) {
      showGameOver(game.world);
    } else if (game.world.state === STATE.TITLE) {
      showScreen('title');
    } else {
      showScreen(null);
    }
  } else {
    game.world = createWorld((Date.now() % 2147483647) | 0);
    showScreen('title');
  }

  game.lastTime = performance.now();
  requestAnimationFrame(frame);
}

// The script is a module at the end of the body, so the DOM is ready.
boot();
