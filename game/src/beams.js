// Beam tracing: the sun throws one white beam, and this module walks it across the
// field segment by segment — reflecting off mirror faces, splitting at prisms into
// red, green and blue, focusing through lenses — until every branch leaves the field
// or spends its bounces. Tracing is pure geometry over the tower list, so the build
// phase can preview the exact network the wave will fire. A second pass then turns
// the traced segments into burn damage on any enemy standing in the light.
import {
  BEAM_CLIP, BEAM_DPS, BEAM_HALF_WIDTH, BEAM_HALF_WIDTH_FOCUSED,
  MAX_BEAM_SEGMENTS, OFF_COLOR_FACTOR, WHITE_FACTOR,
} from './config.js';
import { sunStateAt } from './sunpath.js';
import { TOWER_TYPES } from './towers.js';
import { effectiveColor } from './enemies.js';

/** How far a prism fans its three coloured beams apart, in radians (12 degrees). */
export const PRISM_FAN = (12 * Math.PI) / 180;
/** The colours a prism makes, in fan order: red low, green straight, blue high. */
export const PRISM_COLORS = ['red', 'green', 'blue'];
/** Fan offsets matching PRISM_COLORS. */
const PRISM_OFFSETS = [-PRISM_FAN, 0, PRISM_FAN];
/** The most reflections, splits and focuses one root beam may chain through. */
const MAX_BOUNCES = 48;
/** Hits closer than this to a segment's origin are the tower it just left, not a new hit. */
const MIN_HIT = 1.5;

/** Distance along ray (o + t*d, d unit) where it first touches circle (c, r); Infinity on a miss. */
function rayCircle(ox, oy, dx, dy, cx, cy, r) {
  const lx = cx - ox;
  const ly = cy - oy;
  const tca = lx * dx + ly * dy;
  const d2 = lx * lx + ly * ly - tca * tca;
  if (d2 > r * r) return Infinity;
  const thc = Math.sqrt(r * r - d2);
  let t = tca - thc;
  if (t < MIN_HIT) t = tca + thc;
  return t < MIN_HIT ? Infinity : t;
}

/** Distance along the ray to the far side of the clip rectangle (where the beam leaves play). */
function rayClipExit(ox, oy, dx, dy) {
  let tx = Infinity;
  let ty = Infinity;
  if (dx > 1e-9) tx = (BEAM_CLIP.maxX - ox) / dx;
  else if (dx < -1e-9) tx = (BEAM_CLIP.minX - ox) / dx;
  if (dy > 1e-9) ty = (BEAM_CLIP.maxY - oy) / dy;
  else if (dy < -1e-9) ty = (BEAM_CLIP.minY - oy) / dy;
  return Math.min(tx, ty);
}

/** Reflect unit direction (dx, dy) off a mirror face whose line runs at `angle`. */
function reflectDirection(dx, dy, angle) {
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  const dot = dx * nx + dy * ny;
  const rx = dx - 2 * dot * nx;
  const ry = dy - 2 * dot * ny;
  const len = Math.hypot(rx, ry) || 1;
  return { dx: rx / len, dy: ry / len };
}

/**
 * What happens when `beam` reaches `tower` at point (hx, hy): mirrors hand the beam
 * back changed, prisms end it and queue its three children, lenses let it run on
 * focused. Returns the beam to continue with, or null when the beam ends here.
 */
function interactWithTower(beam, tower, hx, hy, queue) {
  const def = TOWER_TYPES[tower.type];
  if (tower.type === 'mirror') {
    const { dx, dy } = reflectDirection(beam.dx, beam.dy, tower.angle);
    return {
      ...beam,
      x: hx + dx * MIN_HIT, y: hy + dy * MIN_HIT, dx, dy,
      power: beam.power * def.polishByLevel[tower.level - 1],
      ignoreId: tower.id,
    };
  }
  if (tower.type === 'prism') {
    if (beam.color === 'white' && !beam.prisms.has(tower.id)) {
      const base = Math.atan2(beam.dy, beam.dx);
      const prisms = new Set(beam.prisms);
      prisms.add(tower.id);
      for (let i = 0; i < 3; i += 1) {
        const angle = base + PRISM_OFFSETS[i];
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        queue.push({
          ...beam,
          x: hx + dx * MIN_HIT, y: hy + dy * MIN_HIT, dx, dy,
          color: PRISM_COLORS[i],
          power: beam.power * def.splitGainByLevel[tower.level - 1],
          prisms,
          ignoreId: tower.id,
        });
      }
      return null;
    }
    return { ...beam, x: hx + beam.dx * MIN_HIT, y: hy + beam.dy * MIN_HIT, ignoreId: tower.id };
  }
  // A lens: focus once per beam chain, then let the beam run on through it.
  const lenses = new Set(beam.lenses);
  let { power, focused } = beam;
  if (!lenses.has(tower.id)) {
    lenses.add(tower.id);
    power *= def.focusByLevel[tower.level - 1];
    focused = true;
  }
  return {
    ...beam,
    x: hx + beam.dx * MIN_HIT, y: hy + beam.dy * MIN_HIT,
    power, focused, lenses, ignoreId: tower.id,
  };
}

/**
 * Trace the whole beam network for the sun's current position: a list of segments
 * { x1, y1, x2, y2, color, power, focused }, where power already carries every mirror
 * polish, prism gain and lens focus along that segment's chain.
 */
export function traceBeams(state) {
  const sun = sunStateAt(state.sunS);
  const segments = [];
  const queue = [{
    x: sun.x, y: sun.y, dx: sun.dirX, dy: sun.dirY,
    color: 'white', power: 1, focused: false,
    prisms: new Set(), lenses: new Set(), ignoreId: -1, bounces: MAX_BOUNCES,
  }];
  while (queue.length > 0 && segments.length < MAX_BEAM_SEGMENTS) {
    let beam = queue.shift();
    while (beam && beam.bounces > 0 && segments.length < MAX_BEAM_SEGMENTS) {
      let bestT = Infinity;
      let hit = null;
      for (const tower of state.towers) {
        if (tower.id === beam.ignoreId) continue;
        const t = rayCircle(beam.x, beam.y, beam.dx, beam.dy, tower.x, tower.y, TOWER_TYPES[tower.type].radius);
        if (t < bestT) {
          bestT = t;
          hit = tower;
        }
      }
      const exitT = rayClipExit(beam.x, beam.y, beam.dx, beam.dy);
      if (hit && bestT < exitT) {
        const hx = beam.x + beam.dx * bestT;
        const hy = beam.y + beam.dy * bestT;
        segments.push({ x1: beam.x, y1: beam.y, x2: hx, y2: hy, color: beam.color, power: beam.power, focused: beam.focused });
        beam = interactWithTower(beam, hit, hx, hy, queue);
      } else {
        segments.push({
          x1: beam.x, y1: beam.y,
          x2: beam.x + beam.dx * exitT, y2: beam.y + beam.dy * exitT,
          color: beam.color, power: beam.power, focused: beam.focused,
        });
        beam = null;
      }
      if (beam) beam.bounces -= 1;
    }
  }
  return segments;
}

/** The damage factor of a beam of `beamColor` on `enemy`: colour match is everything. */
export function beamColorFactor(beamColor, enemy) {
  if (beamColor === 'white') return WHITE_FACTOR;
  return effectiveColor(enemy) === beamColor ? 1 : OFF_COLOR_FACTOR;
}

/** Shortest distance from point (px, py) to the segment (x1, y1)-(x2, y2). */
export function segmentPointDistance(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.min(1, Math.max(0, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Burn every enemy standing in the traced light for `dt` seconds. Enemies take the
 * summed damage of all segments covering them (colour factor and beam resistance
 * applied), glow with the strongest beam's colour, and die into the returned list —
 * the caller pays bounties and bursts splitters, this pass only does the burning.
 */
export function applyBeamDamage(state, segments, dt) {
  const killed = [];
  for (const enemy of state.enemies) {
    if (enemy.dead || enemy.leaked) continue;
    let dps = 0;
    let strongest = 0;
    for (const seg of segments) {
      const halfWidth = seg.focused ? BEAM_HALF_WIDTH_FOCUSED : BEAM_HALF_WIDTH;
      if (segmentPointDistance(seg.x1, seg.y1, seg.x2, seg.y2, enemy.x, enemy.y) < enemy.radius + halfWidth) {
        const here = BEAM_DPS * seg.power * beamColorFactor(seg.color, enemy);
        dps += here;
        if (here > strongest) {
          strongest = here;
          enemy.burnColor = seg.color;
        }
      }
    }
    if (dps > 0) {
      enemy.hp -= dps * (1 - enemy.beamResist) * dt;
      enemy.flash = 0.12;
      if (enemy.hp <= 0) {
        enemy.dead = true;
        killed.push(enemy);
      }
    }
  }
  return killed;
}
