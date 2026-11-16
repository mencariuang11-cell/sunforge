// SUNFORGE — the entry program for best-game-01 (Node 22, standard library only).
//
// The game itself is the game/ folder beside this file: plain static files a desktop
// browser loads offline (game/index.html and its ES modules — no library, no build
// step, no network request). SUNFORGE is a sunbeam tower defense: the sun crosses the
// sky during every wave, and the player bends its beam with mirror, prism and lens
// towers to burn the Murk before it reaches the Dawn Crystal. This program hands the
// game in: it copies game/ and screenshots/ to the output directory and writes
// /output/dossier.json with buildDossier from the vendored make.fun library, under
// the scorer's own caps, then logs a one-line summary of what was handed in.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

/** Count the files under a directory, recursively — the summary's game-file tally. */
function countFiles(dir) {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countFiles(join(dir, entry.name));
    else count += 1;
  }
  return count;
}

/**
 * A one-line summary of the entry as handed in, built from the dossier text itself:
 * how many game files and screenshots went out, and the dossier's size in bytes.
 * Printed so a human (or a log) can see at a glance that the hand-in is whole.
 */
function entrySummary(outDir, dossierText) {
  const gameFiles = countFiles(join(outDir, 'game'));
  const shotsDir = join(outDir, 'screenshots');
  const screenshots = existsSync(shotsDir) ? readdirSync(shotsDir).filter((name) => !name.startsWith('.')).length : 0;
  const dossierBytes = Buffer.byteLength(dossierText, 'utf8');
  const gameBytes = statSync(join(outDir, 'game', 'index.html')).size;
  return `SUNFORGE entry: ${gameFiles} game files (index.html ${gameBytes} B), ${screenshots} screenshots, dossier ${dossierBytes} bytes`;
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(entrySummary(out, dossier));
