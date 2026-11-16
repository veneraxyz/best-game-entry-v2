// main.ts — the entrypoint for ABYSSAL LANTERN (best-game-01).
//
// The grader runs `node main.ts` twice in a fresh container with a read-only
// /bot (this repository at the submitted commit) and a writable /output, no
// network, 120 seconds. This program copies game/ and screenshots/ into
// /output and writes /output/dossier.json with buildDossier from the kit's
// vendor/makefun-game.ts (the kit's copy, unchanged — the gate rebuilds the
// dossier with the same library and compares the two byte for byte).
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Determinism: the copy walks directories in sorted order and buildDossier
// is deterministic, so both runs write the same bytes.

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

/** This repository's root (the directory holding main.ts). */
const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

/** Where the grader wants the entry: /output, or MAKEFUN_OUTPUT_DIR locally. */
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The gate's cap on the dossier itself: 1.5 MiB. */
const DOSSIER_MAX_BYTES = 1572864;
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

/**
 * Copy a directory tree, entries in sorted order so the copy is
 * deterministic. Plain files and directories only — the gate refuses
 * symlinks, and so does this copy (it follows none).
 */
function copyTree(srcDir: string, dstDir: string): void {
  mkdirSync(dstDir, { recursive: true });
  const entries = readdirSync(srcDir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    const src = join(srcDir, entry.name);
    const dst = join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyTree(src, dst);
    } else if (entry.isFile()) {
      copyFileSync(src, dst);
    }
  }
}

/** Fail fast with a clear message if the entry is incomplete: a missing
 *  index.html or an empty screenshots/ folder would otherwise surface as a
 *  confusing gate failure two steps later. */
if (!existsSync(join(REPO_ROOT, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing — the entry has no game to hand in');
}
if (readdirSync(join(REPO_ROOT, 'screenshots')).filter((f) => /\.(png|jpe?g)$/i.test(f)).length === 0) {
  throw new Error('screenshots/ holds no screenshots — the dossier would have no cover');
}

copyTree(join(REPO_ROOT, 'game'), join(OUTPUT_DIR, 'game'));
copyTree(join(REPO_ROOT, 'screenshots'), join(OUTPUT_DIR, 'screenshots'));

const dossier = buildDossier(OUTPUT_DIR, DOSSIER_CAPS);

/** The dossier itself must fit the gate's 1.5 MiB cap; fail loudly if the
 *  screenshots or the text ever push it over, instead of handing in a
 *  dossier the gate will refuse. */
if (Buffer.byteLength(dossier, 'utf8') > DOSSIER_MAX_BYTES) {
  throw new Error(`dossier is ${Buffer.byteLength(dossier, 'utf8')} bytes, over the ${DOSSIER_MAX_BYTES}-byte cap`);
}

writeFileSync(join(OUTPUT_DIR, 'dossier.json'), dossier);
