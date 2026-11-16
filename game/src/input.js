// input.js — keyboard and mouse for ABYSSAL LANTERN.
//
// The game is played with WASD or arrows to swim, SPACE to dash, and the mouse
// to aim the Sun Harpoon and to pick level-up cards. This module owns the raw
// browser events and exposes a small polling API the game loop reads once per
// frame, so no other module touches the DOM events directly.
//
// Keys are tracked by event.code (layout-independent): KeyW/KeyA/KeyS/KeyD and
// the arrows move, Space dashes, KeyP or Escape pauses, KeyR restarts from an
// end screen, KeyM mutes, Digit1/2/3 pick a level-up card. Edge-triggered
// "pressed" state is consumed by the loop each frame so a single keypress never
// fires twice.

import { VIEW_W, VIEW_H } from './config.js';

/** Codes that move the player, mapped to a unit direction. */
const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

/** The shared input state, updated by listeners, read by the loop. */
export const input = {
  /** Codes currently held down. */
  down: new Set(),
  /** Codes pressed since the last frame (edge-triggered). */
  pressed: new Set(),
  /** Mouse position in game pixels (canvas space, 1280x800). */
  mouseX: VIEW_W / 2,
  mouseY: VIEW_H / 2 - 100,
  /** Whether the primary mouse button is held. */
  mouseDown: false,
  /** Whether the mouse moved since the last frame (for aim freshness). */
  mouseMoved: false,
  /** The canvas element, set by attach(). */
  canvas: null,

  /** True while the code is held. */
  isDown(code) {
    return this.down.has(code);
  },

  /** True once, the frame the code was pressed. Consumed by the loop. */
  wasPressed(code) {
    return this.pressed.has(code);
  },

  /** The movement vector from held keys, normalized (0,0 when idle). */
  moveVector() {
    let x = 0;
    let y = 0;
    for (const code of this.down) {
      const d = MOVE_KEYS[code];
      if (d) {
        x += d[0];
        y += d[1];
      }
    }
    if (x === 0 && y === 0) return { x: 0, y: 0 };
    const len = Math.hypot(x, y);
    return { x: x / len, y: y / len };
  },

  /** Clear the edge-triggered set. Called once per frame by the loop. */
  endFrame() {
    this.pressed.clear();
    this.mouseMoved = false;
  },
};

/**
 * Convert a client-space mouse position to game pixels, honoring the canvas's
 * on-screen size (the canvas is letterboxed by CSS, so client coords need
 * scaling). Keeps the harpoon's aim true at any window size.
 */
function toGameCoords(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * VIEW_W,
    y: ((clientY - rect.top) / rect.height) * VIEW_H,
  };
}

/**
 * Attach the listeners. `onFirstGesture` runs once, on the first key or click
 * — the game uses it to unlock the WebAudio context (browsers block audio
 * before a gesture). Returns a detach function (unused in practice, kept for
 * cleanliness).
 */
export function attachInput(canvas, onFirstGesture) {
  input.canvas = canvas;
  let gestured = false;
  const gesture = () => {
    if (!gestured) {
      gestured = true;
      if (onFirstGesture) onFirstGesture();
    }
  };

  const onKeyDown = (e) => {
    gesture();
    // Space and arrows scroll the page by default; the game owns them.
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) input.pressed.add(e.code);
    input.down.add(e.code);
  };
  const onKeyUp = (e) => {
    input.down.delete(e.code);
  };
  const onMouseMove = (e) => {
    const p = toGameCoords(canvas, e.clientX, e.clientY);
    input.mouseX = p.x;
    input.mouseY = p.y;
    input.mouseMoved = true;
  };
  const onMouseDown = (e) => {
    gesture();
    if (e.button === 0) input.mouseDown = true;
    const p = toGameCoords(canvas, e.clientX, e.clientY);
    input.mouseX = p.x;
    input.mouseY = p.y;
  };
  const onMouseUp = (e) => {
    if (e.button === 0) input.mouseDown = false;
  };
  const onBlur = () => {
    // Losing the window clears held keys so the player never swims forever.
    input.down.clear();
    input.mouseDown = false;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('blur', onBlur);
  };
}
