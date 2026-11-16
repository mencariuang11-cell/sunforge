// SUNFORGE — boot, the fixed-step loop, and the whole game orchestration in one place:
// the state, the wave lifecycle, tower purchases, kill and leak resolution. The pieces
// live in their own modules (sunpath, beams, towers, enemies, waves, economy, audio,
// render, input); this file wires them together and owns the rules that cross between
// them, like a splitter bursting into minis or a cleared wave paying its bonus.
//
// ?seed=N fixes the run's random stream. ?shot=cover|prism|boss|won (with &seed=N)
// stages that screenshot scene instead of running the loop, paints it twice and sets
// window.__shotReady. window.__sunforge exposes a small test hook for headless play.
import {
  CRYSTAL_HP, START_SUNLIGHT, STEP, TOTAL_WAVES, buildPathLine, isPathCell,
} from './config.js';
import { applyBeamDamage, traceBeams } from './beams.js';
import { createRandom } from './random.js';
import { aimMirror, createTower, rotateMirror, sellValue, upgradeCost, TOWER_TYPES } from './towers.js';
import { createEnemy, enemyCoreHex, placeOnPath } from './enemies.js';
import { buildSpawnSchedule, bossScaleForWave, hpScaleForWave, waveClearBonus, WAVES } from './waves.js';
import { addSunlight, trySpend } from './economy.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { stageShot } from './shots.js';

/**
 * Create a whole game at `seed`: fresh state plus the actions that change it. The
 * browser boot at the bottom drives it with real input; tests and screenshot staging
 * drive the same object directly, so what is staged is exactly what is played.
 */
export function createGame(seed) {
  const audio = createAudio();
  const pathLine = buildPathLine();
  let rng = createRandom(seed);
  let popCooldown = 0;

  const state = {
    screen: 'title', // 'title' | 'play' | 'won' | 'lost'
    paused: false,
    phase: 'build', // 'build' between waves, 'wave' while one runs
    wave: 1,
    sunlight: START_SUNLIGHT,
    earned: 0,
    crystalHp: CRYSTAL_HP,
    towers: [],
    enemies: [],
    particles: [],
    /** The beam network as last traced; render draws this, tests inspect it. */
    segments: [],
    /** Sun progress through its arc, 0 at sunrise and 1 at sunset. */
    sunS: 0,
    /** Staging switch: hold the sun still while a screenshot scene settles. */
    sunFrozen: false,
    waveTime: 0,
    waveDuration: 0,
    spawnQueue: [],
    spawnIndex: 0,
    kills: 0,
    leaks: 0,
    time: 0,
    banner: { text: '', t: 0 },
    message: '',
    messageT: 0,
    selectedId: null,
    placing: null,
    pointer: { x: 0, y: 0, inside: false },
    draggingId: null,
    muted: false,
  };

  /** The tower the player has selected, or null. */
  function selectedTower() {
    return state.towers.find((t) => t.id === state.selectedId) ?? null;
  }

  /** Show a short-lived line of guidance under the field. */
  function setMessage(text, seconds = 4) {
    state.message = text;
    state.messageT = seconds;
  }

  /** A burst of glow particles (a death, a leak, a burn shimmer) in a colour. */
  function burst(x, y, color, count, speed = 90) {
    for (let i = 0; i < count; i += 1) {
      if (state.particles.length >= MAX_PARTICLES) return;
      const angle = rng.range(0, Math.PI * 2);
      const v = rng.range(speed * 0.3, speed);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - 24,
        life: rng.range(0.3, 0.75),
        maxLife: 0.75,
        color,
        size: rng.range(1.6, 3.6),
      });
    }
  }

  /** Back to a fresh run: empty field, full Crystal, wave 1, the starting treasury. */
  function reset() {
    rng = createRandom(seed);
    state.screen = 'play';
    state.paused = false;
    state.phase = 'build';
    state.wave = 1;
    state.sunlight = START_SUNLIGHT;
    state.earned = 0;
    state.crystalHp = CRYSTAL_HP;
    state.towers = [];
    state.enemies = [];
    state.particles = [];
    state.segments = [];
    state.sunS = 0;
    state.sunFrozen = false;
    state.waveTime = 0;
    state.spawnQueue = [];
    state.spawnIndex = 0;
    state.kills = 0;
    state.leaks = 0;
    state.banner = { text: '', t: 0 };
    state.selectedId = null;
    state.placing = null;
    state.draggingId = null;
    setMessage('Place towers, then start the wave. The sun will not wait.', 6);
  }

  /** Start (or restart) a run from any screen. */
  function startGame() {
    reset();
    audio.play('horn');
  }

  /** Add an enemy of `type` at path distance `dist`, scaled for the current wave. */
  function spawnEnemyAt(type, dist, hpScale = null) {
    const scale = hpScale ?? (type === 'boss' ? bossScaleForWave(state.wave) : hpScaleForWave(state.wave));
    const enemy = createEnemy(type, scale, dist);
    placeOnPath(enemy, pathLine);
    state.enemies.push(enemy);
    return enemy;
  }

  /**
   * Buy and place a tower of `type` on cell (col, row). Refuses — returning false —
   * for a path cell, an occupied cell, or a treasury that cannot cover the cost.
   */
  function placeTower(type, col, row) {
    if (state.screen !== 'play' || state.paused) return false;
    if (isPathCell(col, row)) {
      setMessage('The Murk walks there — towers need open ground.');
      audio.play('deny');
      return false;
    }
    if (state.towers.some((t) => t.col === col && t.row === row)) {
      setMessage('That tile is taken.');
      audio.play('deny');
      return false;
    }
    if (!trySpend(state, TOWER_TYPES[type].cost)) {
      setMessage(`Not enough Sunlight for a ${TOWER_TYPES[type].name}.`);
      audio.play('deny');
      return false;
    }
    const tower = createTower(type, col, row);
    state.towers.push(tower);
    state.selectedId = tower.id;
    audio.play('place');
    return true;
  }

  /** Rotate the selected mirror by whole 15-degree steps (Q turns one way, E the other). */
  function rotateSelected(steps) {
    const tower = selectedTower();
    if (!tower || tower.type !== 'mirror') return false;
    rotateMirror(tower, steps);
    audio.play('rotate');
    return true;
  }

  /** Aim the selected mirror's face at an absolute angle (the drag gesture), snapped to steps. */
  function aimSelected(angle) {
    const tower = selectedTower();
    if (!tower || tower.type !== 'mirror') return false;
    aimMirror(tower, angle);
    return true;
  }

  /** Raise the selected tower one level, when the treasury covers the upgrade. */
  function upgradeSelected() {
    const tower = selectedTower();
    if (!tower) return false;
    const cost = upgradeCost(tower);
    if (cost === null) {
      setMessage('That tower is already at level 3.');
      audio.play('deny');
      return false;
    }
    if (!trySpend(state, cost)) {
      setMessage('Not enough Sunlight to upgrade.');
      audio.play('deny');
      return false;
    }
    tower.level += 1;
    tower.invested += cost;
    audio.play('upgrade');
    return true;
  }

  /** Sell the selected tower back at the refund rate and clear the selection. */
  function sellSelected() {
    const tower = selectedTower();
    if (!tower) return false;
    addSunlight(state, sellValue(tower));
    state.towers = state.towers.filter((t) => t.id !== tower.id);
    state.selectedId = null;
    audio.play('sell');
    return true;
  }

  /** Begin the current wave: schedule its spawns, raise the banner, sound the horn. */
  function startWave() {
    if (state.screen !== 'play' || state.paused || state.phase !== 'build') return false;
    const def = WAVES[state.wave - 1];
    state.waveDuration = def.duration;
    state.spawnQueue = buildSpawnSchedule(def);
    state.spawnIndex = 0;
    state.waveTime = 0;
    state.sunS = 0;
    state.phase = 'wave';
    state.banner = { text: state.wave === TOTAL_WAVES ? 'FINAL WAVE' : `WAVE ${state.wave}`, t: 2.2 };
    audio.play('horn');
    return true;
  }

  /** Pay a kill's bounty, burst its glow, and burst a splitter into two minis. */
  function resolveKill(enemy) {
    state.kills += 1;
    addSunlight(state, enemy.bounty);
    burst(enemy.x, enemy.y, enemyCoreHex(enemy), enemy.type === 'boss' ? 42 : 12, enemy.type === 'boss' ? 150 : 95);
    if (popCooldown <= 0) {
      audio.play('pop');
      popCooldown = 0.09;
    }
    if (enemy.type === 'splitter') {
      spawnEnemyAt('mini', Math.max(0, enemy.dist - 12), 1);
      spawnEnemyAt('mini', enemy.dist + 2, 1);
    }
    if (enemy.type === 'boss') setMessage('The Hollow Sun is shattered. The dawn holds.', 6);
  }

  /** The wave is clear: pay the bonus, then either win the campaign or open the next build. */
  function endWave() {
    const bonus = waveClearBonus(state.wave);
    addSunlight(state, bonus);
    if (state.wave >= TOTAL_WAVES) {
      state.screen = 'won';
      audio.play('win');
      return;
    }
    setMessage(`Wave ${state.wave} cleared. +${bonus} Sunlight bonus.`, 5);
    state.wave += 1;
    state.phase = 'build';
    state.sunS = 0;
    state.waveTime = 0;
    audio.play('clear');
  }

  /** Advance the whole game by one fixed step of dt seconds. */
  function step(dt) {
    state.time += dt;
    if (popCooldown > 0) popCooldown -= dt;
    if (state.banner.t > 0) state.banner.t -= dt;
    if (state.messageT > 0) state.messageT -= dt;
    // Particles drift and die on every screen, so menus never look frozen.
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy = p.vy * 0.96 - 14 * dt;
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);

    if (state.screen !== 'play' || state.paused) {
      state.segments = traceBeams(state);
      return;
    }
    if (state.phase !== 'wave') {
      // Build phase: the traced network is the player's aiming preview, drawn not fired.
      state.segments = traceBeams(state);
      return;
    }

    state.waveTime += dt;
    if (!state.sunFrozen) state.sunS = Math.min(1, state.waveTime / state.waveDuration);
    while (state.spawnIndex < state.spawnQueue.length && state.spawnQueue[state.spawnIndex].time <= state.waveTime) {
      spawnEnemyAt(state.spawnQueue[state.spawnIndex].type, 0);
      state.spawnIndex += 1;
    }
    for (const enemy of state.enemies) {
      enemy.age += dt;
      enemy.dist += enemy.speed * dt;
      if (enemy.flash > 0) enemy.flash -= dt;
      placeOnPath(enemy, pathLine);
    }
    state.segments = traceBeams(state);
    for (const enemy of applyBeamDamage(state, state.segments, dt)) resolveKill(enemy);
    // Leaks: anything that walked the whole path bites the Crystal.
    const end = pathLine.points[pathLine.points.length - 1];
    for (const enemy of state.enemies) {
      if (enemy.dead || enemy.leaked || enemy.dist < pathLine.total) continue;
      enemy.leaked = true;
      state.leaks += 1;
      state.crystalHp -= enemy.leak;
      burst(end.x - 10, end.y, '#ff5a4e', 16, 120);
      audio.play('leak');
      if (state.crystalHp <= 0) {
        state.crystalHp = 0;
        state.screen = 'lost';
        audio.play('lose');
      }
    }
    state.enemies = state.enemies.filter((e) => !e.dead && !e.leaked);
    if (state.screen === 'play' && state.spawnIndex >= state.spawnQueue.length && state.enemies.length === 0) {
      endWave();
    }
  }

  return {
    state, audio, pathLine,
    reset, startGame, placeTower, rotateSelected, aimSelected,
    upgradeSelected, sellSelected, startWave, spawnEnemyAt, selectedTower, step,
  };
}

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Particle ceiling: past this, new bursts are dropped so a boss death cannot flood the frame. */
const MAX_PARTICLES = 420;

// ---------------------------------------------------------------------------
// Browser boot: input, the render loop, screenshot staging, and the test hook.
// ---------------------------------------------------------------------------
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const game = createGame(seed);
const renderer = createRenderer(canvas);

function announce(message) {
  if (status) status.textContent = message;
}

/** A read-only snapshot of the run for the headless play test. */
function snapshot() {
  const s = game.state;
  return {
    screen: s.screen, phase: s.phase, wave: s.wave, sunlight: s.sunlight,
    crystalHp: s.crystalHp, kills: s.kills, leaks: s.leaks,
    enemies: s.enemies.length, towers: s.towers.length,
    segments: s.segments.length, sunS: s.sunS, paused: s.paused,
  };
}

window.__sunforge = {
  snapshot,
  startGame: () => game.startGame(),
  startWave: () => game.startWave(),
  placeTower: (type, col, row) => game.placeTower(type, col, row),
  rotateSelected: (steps) => game.rotateSelected(steps),
  selectTowerAt: (col, row) => {
    const tower = game.state.towers.find((t) => t.col === col && t.row === row);
    game.state.selectedId = tower ? tower.id : null;
    return !!tower;
  },
  /** Advance the simulation by whole fixed steps, synchronously (tests, not play). */
  stepSeconds: (seconds) => {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i += 1) game.step(STEP);
    return snapshot();
  },
};

if (shot) {
  stageShot(shot, game);
  let painted = 0;
  const paint = () => {
    renderer.draw(game.state);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else {
  createInput(canvas, game, announce);
  let accumulator = 0;
  let last = performance.now();
  const frame = (now) => {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (accumulator >= STEP) {
      game.step(STEP);
      accumulator -= STEP;
    }
    renderer.draw(game.state);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state.screen === 'play') game.state.paused = true;
  });
  announce('SUNFORGE. Bend the dawn, burn the night. Click or press Space to play.');
  requestAnimationFrame(frame);
}
