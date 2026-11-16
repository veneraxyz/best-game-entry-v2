// render.js — everything the eye sees in ABYSSAL LANTERN.
//
// The game is drawn on one canvas with plain 2D calls — no images, no assets,
// every creature a path of arcs and curves lit by shadowBlur. The look is one
// coherent idea: a dark abyss and the light that fights it. The background is
// a vertical gradient per tier, with drifting light rays, parallax rock
// silhouettes, swaying kelp and marine snow; the creatures glow against it
// (additive blending for lights, normal blending for bodies).
//
// Readability rules the drawing: the player is the brightest thing on screen
// (a white-hot lantern), enemies are colour-coded by type, bullets are small
// and bright, gems are tiny diamonds, and the boss is huge and red. At a
// glance — even shrunk to a contact sheet — the scene must read: light fish,
// dark swarm, bright shots.

import { VIEW_W, VIEW_H } from './config.js';
import { R } from './random.js';
import { tierPalette } from './waves.js';
import { drawEffects } from './particles.js';

/** Precomputed background dressing, seeded once per world. */
function ensureBackdrop(world) {
  if (world.backdrop) return world.backdrop;
  const rocks = [];
  for (let i = 0; i < 9; i++) {
    rocks.push({
      x: R.range(0, VIEW_W), y: VIEW_H + R.range(-40, 60),
      w: R.range(160, 420), h: R.range(60, 190), layer: R.int(0, 1),
    });
  }
  const kelp = [];
  for (let i = 0; i < 14; i++) {
    kelp.push({
      x: R.range(0, VIEW_W), h: R.range(90, 260),
      sway: R.range(0, Math.PI * 2), speed: R.range(0.4, 1.1),
    });
  }
  const rays = [];
  for (let i = 0; i < 5; i++) {
    rays.push({ x: R.range(0, VIEW_W), w: R.range(60, 160), alpha: R.range(0.03, 0.07) });
  }
  const snow = [];
  for (let i = 0; i < 70; i++) {
    snow.push({ x: R.range(0, VIEW_W), y: R.range(0, VIEW_H), s: R.range(0.6, 2), v: R.range(6, 22) });
  }
  world.backdrop = { rocks, kelp, rays, snow };
  return world.backdrop;
}

/** The abyss: gradient, light rays, rocks, kelp, marine snow. */
function drawBackground(ctx, world, dt) {
  const pal = tierPalette(world);
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, pal.bg0);
  g.addColorStop(1, pal.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const bd = ensureBackdrop(world);
  world.bgDrift += dt * 4;

  // God rays from the surface, drifting slowly.
  ctx.save();
  for (const r of bd.rays) {
    const x = ((r.x + world.bgDrift * 0.3) % (VIEW_W + 200)) - 100;
    ctx.fillStyle = `rgba(140, 220, 255, ${r.alpha})`;
    ctx.beginPath();
    ctx.moveTo(x, -10);
    ctx.lineTo(x + r.w, -10);
    ctx.lineTo(x + r.w * 0.4, VIEW_H);
    ctx.lineTo(x - r.w * 0.6, VIEW_H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Rock silhouettes, two parallax layers.
  for (const rock of bd.rocks) {
    ctx.fillStyle = rock.layer === 0 ? 'rgba(6, 20, 38, 0.9)' : 'rgba(10, 30, 55, 0.75)';
    ctx.beginPath();
    ctx.ellipse(rock.x, rock.y, rock.w / 2, rock.h / 2, 0, Math.PI, 0);
    ctx.fill();
  }

  // Kelp swaying in the current.
  ctx.strokeStyle = 'rgba(20, 90, 70, 0.8)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const k of bd.kelp) {
    const sway = Math.sin(world.time * k.speed + k.sway) * 14;
    ctx.beginPath();
    ctx.moveTo(k.x, VIEW_H + 10);
    ctx.quadraticCurveTo(k.x + sway, VIEW_H - k.h * 0.5, k.x + sway * 1.6, VIEW_H - k.h);
    ctx.stroke();
    ctx.fillStyle = 'rgba(40, 160, 120, 0.5)';
    ctx.beginPath();
    ctx.arc(k.x + sway * 1.6, VIEW_H - k.h, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Marine snow, drifting down.
  ctx.fillStyle = 'rgba(200, 230, 255, 0.35)';
  for (const s of bd.snow) {
    s.y += s.v * dt;
    if (s.y > VIEW_H + 4) {
      s.y = -4;
      s.x = R.range(0, VIEW_W);
    }
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
}

/** Ambient drifters: soft jellyfish blobs crossing the title backdrop.
 *  Drawn dim (they are scenery, not gameplay) with trailing tentacles that
 *  wave with the world clock. */
function drawDrifters(ctx, world) {
  for (const d of world.drifters) {
    const wob = Math.sin(world.time * 1.4 + d.y) * 0.3;
    ctx.save();
    ctx.globalAlpha = 0.55;
    // Dome.
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    // Tentacles: three waving lines under the dome.
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(d.x + i * d.r * 0.5, d.y);
      ctx.quadraticCurveTo(
        d.x + i * d.r * 0.5 + Math.sin(world.time * 2 + i) * 6 + wob * 8,
        d.y + d.r * 0.9,
        d.x + i * d.r * 0.5 + Math.sin(world.time * 1.6 + i * 2) * 8,
        d.y + d.r * 1.6,
      );
      ctx.stroke();
    }
    // A faint glow at the dome's heart.
    glowCircle(ctx, d.x, d.y - d.r * 0.3, d.r * 0.35, d.color, 0.6);
    ctx.restore();
  }
}

/** A glowing circle: body + additive halo. The workhorse of the look. */
function glowCircle(ctx, x, y, r, color, halo = 0.5) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r * (1 + halo * 2));
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r * (1 + halo * 2), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** The player: a lanternfish — body, tail, glowing lure, bright eye. */
function drawPlayer(ctx, world) {
  const p = world.player;
  if (p.dead) return;
  const flicker = 0.85 + Math.sin(world.time * 9) * 0.15;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.facing, 1);

  // Hurt flash: the fish blinks white while invulnerable.
  if (p.hurtTimer > 0 && Math.floor(world.time * 18) % 2 === 0) {
    ctx.globalAlpha = 0.45;
  }

  // Lantern halo: the brightest light in the game.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 120);
  halo.addColorStop(0, `rgba(120, 240, 255, ${0.28 * flicker})`);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Tail (wagging with the swim cycle).
  const wag = Math.sin(world.time * 10) * 4;
  ctx.fillStyle = '#2aa5c4';
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(-26, -9 + wag);
  ctx.lineTo(-26, 9 + wag);
  ctx.closePath();
  ctx.fill();

  // Body.
  ctx.fillStyle = '#b8f1ff';
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5ff2ff';
  ctx.beginPath();
  ctx.ellipse(-2, 2, 13, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // The lure: a stalk and a white-hot bulb above the head.
  ctx.strokeStyle = '#8be9ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(6, -8);
  ctx.quadraticCurveTo(12, -20, 18, -22);
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 18 * flicker;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(19, -23, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Eye.
  ctx.fillStyle = '#062a4d';
  ctx.beginPath();
  ctx.arc(9, -2, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Dash cooldown ring under the player (a full ring means ready).
  if (p.dashCd > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(95, 242, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y + 24, 8, -Math.PI / 2, -Math.PI / 2 + (1 - p.dashCd / 2.2) * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** One enemy, drawn by type. Each type has a distinct silhouette + colour. */
function drawEnemy(ctx, world, e) {
  const t = world.time;
  ctx.save();
  ctx.translate(e.x, e.y);
  const flash = e.flash > 0;
  const body = flash ? '#ffffff' : e.def.color;
  ctx.shadowColor = e.def.color;
  ctx.shadowBlur = e.elite ? 22 : 12;

  if (e.id === 'gloomlet') {
    // A round gloom with two eyes and a wobble.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(2, 10, 25, 0.85)';
    ctx.beginPath();
    ctx.arc(-5, -3, 3.4, 0, Math.PI * 2);
    ctx.arc(5, -3, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-4, -4, 1.4, 0, Math.PI * 2);
    ctx.arc(6, -4, 1.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.id === 'darter') {
    // A dart: triangle nose, fast look.
    const a = Math.atan2(world.player.y - e.y, world.player.x - e.x);
    ctx.rotate(a);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(e.radius + 6, 0);
    ctx.lineTo(-e.radius, -e.radius * 0.7);
    ctx.lineTo(-e.radius * 0.5, 0);
    ctx.lineTo(-e.radius, e.radius * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(2, 10, 25, 0.85)';
    ctx.beginPath();
    ctx.arc(4, -3, 2.6, 0, Math.PI * 2);
    ctx.arc(4, 3, 2.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.id === 'bulwark') {
    // A hex reef: thick plates, slow menace.
    ctx.fillStyle = body;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + t * 0.3;
      const px = Math.cos(a) * e.radius;
      const py = Math.sin(a) * e.radius;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(2, 10, 25, 0.7)';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-4, -2, 2, 0, Math.PI * 2);
    ctx.arc(4, -2, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.id === 'splitter') {
    // A cell about to divide: two nuclei inside.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(2, 30, 10, 0.8)';
    ctx.beginPath();
    ctx.arc(-6, 0, 5, 0, Math.PI * 2);
    ctx.arc(6, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -e.radius);
    ctx.lineTo(0, e.radius);
    ctx.stroke();
  } else if (e.id === 'spitter') {
    // A puffer with a snout: round body, visible mouth.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
    ctx.fill();
    const a = Math.atan2(world.player.y - e.y, world.player.x - e.x);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(2, 10, 25, 0.85)';
    ctx.beginPath();
    ctx.arc(e.radius - 2, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(-a);
    ctx.fillStyle = 'rgba(2, 10, 25, 0.85)';
    ctx.beginPath();
    ctx.arc(-4, -5, 2.6, 0, Math.PI * 2);
    ctx.arc(4, -5, 2.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.id === 'leviathan') {
    // The boss: a great serpent head with jaws, horns and a crown of light.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, e.radius * 1.25, e.radius * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    // Horns.
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(-e.radius * 0.7, -e.radius * 0.5);
    ctx.lineTo(-e.radius * 0.9, -e.radius * 1.15);
    ctx.lineTo(-e.radius * 0.4, -e.radius * 0.6);
    ctx.closePath();
    ctx.moveTo(e.radius * 0.7, -e.radius * 0.5);
    ctx.lineTo(e.radius * 0.9, -e.radius * 1.15);
    ctx.lineTo(e.radius * 0.4, -e.radius * 0.6);
    ctx.closePath();
    ctx.fill();
    // Jaws.
    ctx.fillStyle = 'rgba(10, 0, 5, 0.9)';
    ctx.beginPath();
    ctx.ellipse(0, e.radius * 0.3, e.radius * 0.6, e.radius * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(k * 12 - 5, e.radius * 0.12);
      ctx.lineTo(k * 12, e.radius * 0.38);
      ctx.lineTo(k * 12 + 5, e.radius * 0.12);
      ctx.closePath();
      ctx.fill();
    }
    // Eyes: burning white.
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-e.radius * 0.4, -e.radius * 0.25, 6, 0, Math.PI * 2);
    ctx.arc(e.radius * 0.4, -e.radius * 0.25, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Boss HP arc above the head.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius + 14, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.strokeStyle = '#ff5964';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius + 14, Math.PI * 1.15, Math.PI * 1.15 + (Math.PI * 0.7) * (e.hp / e.maxHp));
    ctx.stroke();
  }

  // Elite crown: a gold ring so elites read as special at a glance.
  if (e.elite) {
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius + 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Thin HP bar for wounded enemies (not for full-HP ones — less clutter).
  if (e.hp < e.maxHp && e.id !== 'leviathan') {
    const w = e.radius * 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(-w / 2, -e.radius - 10, w, 4);
    ctx.fillStyle = '#7dffb0';
    ctx.fillRect(-w / 2, -e.radius - 10, w * (e.hp / e.maxHp), 4);
  }
  ctx.restore();
}

/** Gems (diamonds), pickups (kelp / pearl), mines, bullets, orbs, arcs. */
function drawField(ctx, world) {
  // Gems: small cyan diamonds.
  for (const g of world.gems) {
    const tw = 0.7 + Math.sin(world.time * 6 + g.x) * 0.3;
    ctx.save();
    ctx.globalAlpha = tw;
    ctx.shadowColor = '#5ff2ff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#8ff5ff';
    ctx.beginPath();
    ctx.moveTo(g.x, g.y - 6);
    ctx.lineTo(g.x + 4, g.y);
    ctx.lineTo(g.x, g.y + 6);
    ctx.lineTo(g.x - 4, g.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Pickups: kelp (green cross) and pearl (gold orb).
  for (const k of world.pickups) {
    const pulse = 1 + Math.sin(world.time * 5) * 0.12;
    if (k.kind === 'kelp') {
      glowCircle(ctx, k.x, k.y, 12 * pulse, '#7dffb0', 0.6);
      ctx.fillStyle = '#063';
      ctx.fillRect(k.x - 2, k.y - 7, 4, 14);
      ctx.fillRect(k.x - 7, k.y - 2, 14, 4);
    } else {
      glowCircle(ctx, k.x, k.y, 11 * pulse, '#ffd166', 0.8);
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.arc(k.x - 3, k.y - 3, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Mines: dark orbs with a pink core, blinking when armed.
  for (const m of world.mines) {
    const blink = m.life < 5 ? (Math.floor(world.time * 6) % 2 === 0 ? 1 : 0.4) : 1;
    ctx.save();
    ctx.globalAlpha = blink;
    glowCircle(ctx, m.x, m.y, 10, '#ff6b9d', 0.5);
    ctx.fillStyle = '#1a0510';
    ctx.beginPath();
    ctx.arc(m.x, m.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Bullets: bright bolts with a short trail.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of world.bullets) {
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  // Enemy ink shots: dark purple orbs with a sickly rim.
  for (const s of world.shots) {
    ctx.fillStyle = '#b5179e';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffafcc';
    ctx.beginPath();
    ctx.arc(s.x - 2, s.y - 2, s.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Gloworbs: orbiting lights with halos.
  for (const w of world.weapons) {
    if (w.id !== 'orbs' || !w.orbPos) continue;
    for (const [ox, oy] of w.orbPos) {
      glowCircle(ctx, ox, oy, 11, '#c77dff', 0.7);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ox, oy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Lightning arcs: jagged polylines, fading fast.
  for (const arc of world.arcs) {
    const a = Math.max(0, arc.life / arc.maxLife);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = arc.color;
    ctx.lineWidth = 3;
    ctx.shadowColor = arc.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    arc.points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else {
        // A midpoint jitter makes the bolt jagged, like real lightning.
        const [px, py] = arc.points[i - 1];
        const mx = (px + x) / 2 + R.range(-14, 14);
        const my = (py + y) / 2 + R.range(-14, 14);
        ctx.lineTo(mx, my);
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.restore();
  }
}

/** The wave banner: big centred text that fades. */
function drawBanner(ctx, world) {
  if (world.bannerTimer <= 0 || !world.banner) return;
  const a = Math.min(1, world.bannerTimer / 0.6);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.font = '700 44px "Segoe UI", system-ui, sans-serif';
  ctx.shadowColor = '#5ff2ff';
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#dff6ff';
  ctx.fillText(world.banner, VIEW_W / 2, 120);
  ctx.restore();
}

/** Vignette: darkened edges so the centre glows by contrast. */
function drawVignette(ctx) {
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

/**
 * Draw one frame. `dt` advances the background drift. The shake offset from
 * the effects system translates the whole scene (the vignette stays fixed).
 */
export function drawWorld(ctx, world, dt) {
  const fx = world.fx;
  drawBackground(ctx, world, dt);
  drawDrifters(ctx, world);
  ctx.save();
  ctx.translate(fx.shakeX, fx.shakeY);
  drawField(ctx, world);
  for (const e of world.enemies) drawEnemy(ctx, world, e);
  drawPlayer(ctx, world);
  drawEffects(ctx, fx);
  ctx.restore();
  drawBanner(ctx, world);
  drawVignette(ctx);
}
