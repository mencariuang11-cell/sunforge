// The screenshot scenes behind ?shot=cover|prism|boss|won. Each scene builds a real
// position with the game's own actions — towers placed and upgraded through the same
// calls a player makes, enemies spawned on the path — then searches a fixed grid of
// sun positions for the one where the traced network crosses the path most, plants
// enemies on those crossings (matching wisp colours to coloured beams), freezes the
// sun, and settles a third of a second so the burns are lit. Same seed, same frame.
import { STEP } from './config.js';
import { traceBeams } from './beams.js';

/** Wisp type that burns hardest under each beam colour. */
const WISP_FOR_COLOR = { red: 'emberWisp', green: 'verdantWisp', blue: 'tideWisp' };
/** How close a beam segment must pass to the path to count as a crossing, in px. */
const CROSSING_DISTANCE = 26;
/** Path distance kept between staged enemies, so the frame never stacks them. */
const MIN_SEPARATION = 58;

/** Points sampled every few px along the path, each with its distance from the gate. */
function pathSamples(pathLine) {
  const samples = [];
  let dist = 0;
  for (let i = 1; i < pathLine.points.length; i += 1) {
    const a = pathLine.points[i - 1];
    const b = pathLine.points[i];
    const leg = pathLine.legs[i - 1];
    const steps = Math.max(1, Math.round(leg / 6));
    for (let j = 0; j < steps; j += 1) {
      const t = j / steps;
      samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dist: dist + leg * t });
    }
    dist += leg;
  }
  const last = pathLine.points[pathLine.points.length - 1];
  samples.push({ x: last.x, y: last.y, dist });
  return samples;
}

/** The nearest path sample to a point: how far off the road it is, and where along it. */
function nearestOnPath(samples, x, y) {
  let best = { d: Infinity, dist: 0 };
  for (const s of samples) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < best.d) best = { d, dist: s.dist };
  }
  return best;
}

/** Where a beam segment comes closest to the path, sampled along its length. */
function segmentCrossing(samples, seg) {
  const length = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
  const steps = Math.max(1, Math.round(length / 5));
  let best = { d: Infinity, dist: 0 };
  for (let j = 0; j <= steps; j += 1) {
    const t = j / steps;
    const near = nearestOnPath(samples, seg.x1 + (seg.x2 - seg.x1) * t, seg.y1 + (seg.y2 - seg.y1) * t);
    if (near.d < best.d) best = near;
  }
  return best;
}

/**
 * The campaign ledger a scene on `wave` opens with: the kills, Sunlight earned,
 * leaks and Crystal health accumulated over the waves before it, derived from the
 * game's own numbers — each cleared wave's full composition killed (a splitter's
 * two minis included) at ENEMY_TYPES bounties, plus its waveClearBonus of
 * 25 + 5 x wave — less two leaks along the way (a shade on wave 2, a mini on
 * wave 7: -1 and -2 bounty, -1 Crystal each). So a wave-8 HUD never reads
 * "Burned 0", and the victory totals are a campaign's, not one wave's.
 */
const CAMPAIGN_LEDGER = {
  6: { kills: 56, earned: 692, leaks: 1, crystalHp: 19 },
  8: { kills: 95, earned: 1031, leaks: 2, crystalHp: 18 },
  10: { kills: 128, earned: 1412, leaks: 2, crystalHp: 18 },
  15: { kills: 248, earned: 2767, leaks: 2, crystalHp: 18 },
};

/** Put a fresh scene into a wave on `wave`, with the sun frozen and a full treasury for building. */
function setupScene(game, wave) {
  const state = game.state;
  game.reset();
  state.wave = wave;
  state.phase = 'wave';
  state.waveDuration = 9999;
  state.waveTime = 0;
  state.spawnQueue = [];
  state.spawnIndex = 0;
  state.sunFrozen = true;
  state.sunlight = 100000;
  state.message = '';
  state.messageT = 0;
  const ledger = CAMPAIGN_LEDGER[wave];
  if (ledger) {
    state.kills = ledger.kills;
    state.earned = ledger.earned;
    state.leaks = ledger.leaks;
    state.crystalHp = ledger.crystalHp;
  }
  return state;
}

/** Place a tower through the game's own purchase, then aim and upgrade it as a player would. */
function buildTower(game, type, col, row, angleDeg = null, level = 1) {
  if (!game.placeTower(type, col, row)) return null;
  const tower = game.selectedTower();
  if (angleDeg !== null && type === 'mirror') game.aimSelected((angleDeg * Math.PI) / 180);
  for (let i = 1; i < level; i += 1) game.upgradeSelected();
  return tower;
}

/**
 * Search sun positions on a fixed grid and keep the one whose traced network scores
 * best under `scoreSegments(segments, samples)`. Deterministic: same grid, same pick.
 * `range` narrows the grid (the boss scene searches only inside the flare window).
 */
function bestSunPosition(game, samples, scoreSegments, range = { from: 0.06, to: 0.95, step: 0.02 }) {
  const state = game.state;
  let best = { s: 0.5, score: -Infinity, segments: [] };
  for (let s = range.from; s <= range.to + 1e-9; s += range.step) {
    state.sunS = s;
    const segments = traceBeams(state);
    const score = scoreSegments(segments, samples);
    if (score > best.score) best = { s, score, segments };
  }
  state.sunS = best.s;
  state.segments = best.segments;
  return best;
}

/** The shared score: a lively network (many segments) that keeps crossing the road. */
function networkScore(segments, samples) {
  let score = segments.length * 2;
  for (const seg of segments) {
    const crossing = segmentCrossing(samples, seg);
    if (crossing.d < CROSSING_DISTANCE) score += 6;
    if (seg.focused) score += 3;
    if (seg.color !== 'white') score += 2;
  }
  return score;
}

/**
 * Plant enemies where the traced beams cross the path: wisps matched to coloured
 * segments, shades under white ones. Returns the path distances used.
 */
function plantOnCrossings(game, segments, samples, { max = 7, beefy = 2.5, used = [] } = {}) {
  for (const seg of segments) {
    if (used.length >= max) break;
    const crossing = segmentCrossing(samples, seg);
    if (crossing.d >= CROSSING_DISTANCE) continue;
    if (used.some((d) => Math.abs(d - crossing.dist) < MIN_SEPARATION)) continue;
    const type = seg.color === 'white' ? 'shade' : WISP_FOR_COLOR[seg.color];
    game.spawnEnemyAt(type, crossing.dist, beefy);
    used.push(crossing.dist);
  }
  return used;
}

/** Add an enemy at an exact path distance when it does not crowd the ones already placed. */
function plantAt(game, type, dist, used, beefy = 2.5) {
  if (used.some((d) => Math.abs(d - dist) < MIN_SEPARATION)) return;
  game.spawnEnemyAt(type, dist, beefy);
  used.push(dist);
}

/** Let the staged position burn for a fixed settle, sun held, so the frame is mid-fight. */
function settle(game, seconds = 0.3) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) game.step(STEP);
}

/** 1-cover: the title over a live mid-wave network — mirrors chained into a prism and a lens. */
function stageCover(game) {
  const state = setupScene(game, 6);
  const samples = pathSamples(game.pathLine);
  buildTower(game, 'mirror', 4, 0, 60);
  buildTower(game, 'prism', 7, 2);
  buildTower(game, 'mirror', 10, 3, 120);
  buildTower(game, 'lens', 5, 5);
  buildTower(game, 'mirror', 9, 6, 30);
  buildTower(game, 'mirror', 13, 5, 75);
  const { segments } = bestSunPosition(game, samples, networkScore);
  const used = plantOnCrossings(game, segments, samples, { max: 7 });
  plantAt(game, 'shade', 300, used);
  plantAt(game, 'splitter', 1500, used);
  plantAt(game, 'shade', 2150, used);
  state.sunlight = 85;
  settle(game);
  state.screen = 'title';
}

/** 2-prism: one prism fanning the beam into three colours, each burning its own wisps. */
function stagePrism(game) {
  const state = setupScene(game, 8);
  const samples = pathSamples(game.pathLine);
  buildTower(game, 'prism', 6, 0, null, 2);
  buildTower(game, 'mirror', 3, 2, 105);
  buildTower(game, 'mirror', 10, 2, 60);
  buildTower(game, 'lens', 8, 5);
  buildTower(game, 'mirror', 12, 6, 45);
  const prismScore = (segments, smp) => {
    let score = networkScore(segments, smp);
    for (const seg of segments) if (seg.color !== 'white') score += 5;
    return score;
  };
  const { segments } = bestSunPosition(game, samples, prismScore);
  const used = plantOnCrossings(game, segments, samples, { max: 8 });
  plantAt(game, 'shade', 420, used);
  plantAt(game, 'shade', 1980, used);
  state.sunlight = 40;
  settle(game);
}

/**
 * 3-boss: the wave-10 Hollow Sun under a lens-focused beam, the network around it —
 * staged inside the solar-flare window (sun progress 0.46-0.54, within 0.45-0.55),
 * so the frame carries the flare banner and the widened, brightened beams.
 */
function stageBoss(game) {
  const state = setupScene(game, 10);
  const samples = pathSamples(game.pathLine);
  const lens = buildTower(game, 'lens', 6, 0, null, 2);
  buildTower(game, 'mirror', 6, 2, 75);
  buildTower(game, 'prism', 11, 3);
  buildTower(game, 'mirror', 13, 6, 105);
  buildTower(game, 'mirror', 2, 3, 45);
  buildTower(game, 'mirror', 4, 6, 30);
  buildTower(game, 'lens', 9, 5);
  buildTower(game, 'mirror', 8, 6, 120);
  const bossScore = (segments, smp) => {
    let score = networkScore(segments, smp);
    for (const seg of segments) {
      if (seg.focused && segmentCrossing(smp, seg).d < CROSSING_DISTANCE) score += 14;
    }
    return score;
  };
  const { segments } = bestSunPosition(game, samples, bossScore, { from: 0.46, to: 0.54, step: 0.02 });
  // The boss stands where the focused light crosses the road, if it does anywhere.
  let bossDist = null;
  for (const seg of segments) {
    if (!seg.focused) continue;
    const crossing = segmentCrossing(samples, seg);
    if (crossing.d < CROSSING_DISTANCE) {
      bossDist = crossing.dist;
      break;
    }
  }
  if (bossDist === null) {
    for (const seg of segments) {
      const crossing = segmentCrossing(samples, seg);
      if (crossing.d < CROSSING_DISTANCE) {
        bossDist = crossing.dist;
        break;
      }
    }
  }
  const used = [];
  if (bossDist === null) bossDist = 1200;
  game.spawnEnemyAt('boss', bossDist, 1);
  used.push(bossDist);
  plantOnCrossings(game, segments, samples, { max: 4, used });
  plantAt(game, 'shade', 500, used);
  plantAt(game, 'gloam', 950, used);
  plantAt(game, 'emberWisp', 1750, used);
  plantAt(game, 'tideWisp', 2150, used);
  state.sunlight = 130;
  settle(game);
  if (lens) state.selectedId = lens.id;
}

/**
 * 4-victory: the dawn network of the old dawn scene, opened on the campaign ledger
 * (setupScene), but the final wave is then genuinely fought: enemies planted on
 * the crossings at reduced strength burn, leak or burst under the game's own step
 * until its own wave-clear rule ends wave 15 and raises the victory screen — the
 * totals on it are the seeded campaign's plus the fight's real kills and bounties.
 */
function stageWon(game) {
  const state = setupScene(game, 15);
  const samples = pathSamples(game.pathLine);
  buildTower(game, 'mirror', 2, 0, 45);
  buildTower(game, 'mirror', 5, 0, 105);
  buildTower(game, 'prism', 8, 0);
  buildTower(game, 'lens', 11, 0, null, 2);
  buildTower(game, 'mirror', 4, 2, 75);
  buildTower(game, 'prism', 9, 3);
  buildTower(game, 'mirror', 13, 2, 60);
  buildTower(game, 'lens', 6, 5);
  buildTower(game, 'mirror', 10, 6, 135);
  const hero = buildTower(game, 'prism', 13, 5, null, 3);
  buildTower(game, 'mirror', 7, 8, 45);
  buildTower(game, 'lens', 12, 8);
  const { segments } = bestSunPosition(game, samples, networkScore);
  const used = plantOnCrossings(game, segments, samples, { max: 7, beefy: 0.35 });
  plantAt(game, 'shade', 250, used, 0.35);
  plantAt(game, 'emberWisp', 620, used, 0.35);
  plantAt(game, 'splitter', 1050, used, 0.35);
  plantAt(game, 'verdantWisp', 1650, used, 0.35);
  plantAt(game, 'shade', 1450, used, 0.35);
  state.sunlight = 65;
  // Fight it out under the game's own rules until the campaign is won.
  let guard = 0;
  while (state.screen === 'play' && guard < 120 / STEP) {
    game.step(STEP);
    guard += 1;
  }
  settle(game, 0.5);
  if (hero) state.selectedId = hero.id;
}

/** Stage the named screenshot scene on `game` (any other name stages the cover). */
export function stageShot(name, game) {
  if (name === 'prism') stagePrism(game);
  else if (name === 'boss') stageBoss(game);
  else if (name === 'won') stageWon(game);
  else stageCover(game);
}
