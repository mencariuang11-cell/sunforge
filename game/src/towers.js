// The three towers and what each does to a beam that touches it. A mirror reflects the
// beam specularly off its face (the player rotates the face in 15-degree steps). A prism
// splits a white beam into red, green and blue beams fanned 12 degrees apart. A lens
// focuses whatever passes through it: the beam runs on thinner and burns far harder.
// Every tower upgrades to level 3; levels raise the effect the tower has on the beam,
// and a tower sells back at 70% of everything sunk into it.
import { cellCenter } from './config.js';

/** The highest level any tower can reach. */
export const MAX_TOWER_LEVEL = 3;

/** The fraction of a tower's total invested Sunlight returned when it is sold. */
export const SELL_REFUND = 0.7;

/** Rotation snap for mirror faces, in radians: fifteen degrees per Q or E press. */
export const MIRROR_STEP = Math.PI / 12;

/** Tower definitions: cost, beam-touch radius, and the per-level beam factors. */
export const TOWER_TYPES = {
  mirror: {
    name: 'Mirror',
    cost: 25,
    radius: 17,
    blurbLines: ['Reflects the beam onward.', 'Q / E or drag re-aims it.'],
    /** A polished mirror wastes less light: beam power multiplier by tower level. */
    polishByLevel: [1, 1.2, 1.45],
  },
  prism: {
    name: 'Prism',
    cost: 60,
    radius: 17,
    blurbLines: ['Splits white light into', 'red, green and blue beams.'],
    /** Damage multiplier of the three split beams, by tower level. */
    splitGainByLevel: [1, 1.3, 1.65],
  },
  lens: {
    name: 'Lens',
    cost: 50,
    radius: 16,
    blurbLines: ['Focuses a passing beam:', 'burns x3+, in a thin line.'],
    /** Focus damage multiplier by tower level. */
    focusByLevel: [3, 3.6, 4.3],
  },
};

let nextTowerId = 1;

/**
 * A fresh tower of `type` standing on grid cell (col, row). Mirrors start with their
 * face at 45 degrees, which turns the noon beam sideways along the rows.
 */
export function createTower(type, col, row) {
  const def = TOWER_TYPES[type];
  const { x, y } = cellCenter(col, row);
  return {
    id: nextTowerId++,
    type,
    col,
    row,
    x,
    y,
    level: 1,
    /** Mirror face direction, radians; the face line runs at this angle. */
    angle: Math.PI / 4,
    /** Total Sunlight sunk into this tower, purchase plus upgrades (drives sell value). */
    invested: def.cost,
  };
}

/** What raising `tower` one level costs, or null when it is already at the cap. */
export function upgradeCost(tower) {
  if (tower.level >= MAX_TOWER_LEVEL) return null;
  return Math.round(TOWER_TYPES[tower.type].cost * 0.8 * tower.level);
}

/** What selling `tower` returns to the treasury right now. */
export function sellValue(tower) {
  return Math.floor(tower.invested * SELL_REFUND);
}

/** Rotate a mirror's face by whole 15-degree steps (negative steps turn the other way). */
export function rotateMirror(tower, steps) {
  tower.angle += steps * MIRROR_STEP;
  const twoPi = Math.PI * 2;
  tower.angle = ((tower.angle % twoPi) + twoPi) % twoPi;
}

/** Set a mirror's face from an absolute angle, snapped to the same 15-degree steps. */
export function aimMirror(tower, angle) {
  const snapped = Math.round(angle / MIRROR_STEP) * MIRROR_STEP;
  tower.angle = snapped;
}
