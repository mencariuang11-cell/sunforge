// The Murk: the night creatures that walk the path to eat the Dawn Crystal. Shades are
// colourless bulk; the wisps are fast and carry a colour, so only a matching coloured
// beam burns them at full strength; splitters burst into minis; gloams are slow tanks
// that shrug off half of every beam; and every fifth wave a boss walks, cycling its
// colour phase as it goes so the player must keep re-aiming the spectrum at it.
import { COLOR_HEX } from './config.js';

/** Seconds a boss spends in each colour phase before cycling to the next. */
export const BOSS_PHASE_SECONDS = 4;
/** The order a boss's colour phase cycles through; null is its colourless phase. */
export const BOSS_PHASES = ['red', 'green', 'blue', null];

/** Enemy definitions: hit points, path speed in px/s, size, Sunlight bounty, Crystal damage. */
export const ENEMY_TYPES = {
  shade: { name: 'Shade', hp: 60, speed: 44, radius: 13, bounty: 6, leak: 1, color: null, beamResist: 0 },
  emberWisp: { name: 'Ember Wisp', hp: 36, speed: 56, radius: 11, bounty: 7, leak: 1, color: 'red', beamResist: 0 },
  verdantWisp: { name: 'Verdant Wisp', hp: 36, speed: 56, radius: 11, bounty: 7, leak: 1, color: 'green', beamResist: 0 },
  tideWisp: { name: 'Tide Wisp', hp: 36, speed: 56, radius: 11, bounty: 7, leak: 1, color: 'blue', beamResist: 0 },
  splitter: { name: 'Splitter', hp: 84, speed: 30, radius: 14, bounty: 8, leak: 1, color: null, beamResist: 0 },
  mini: { name: 'Mini', hp: 18, speed: 50, radius: 8, bounty: 2, leak: 1, color: null, beamResist: 0 },
  gloam: { name: 'Gloam', hp: 320, speed: 20, radius: 17, bounty: 16, leak: 2, color: null, beamResist: 0.5 },
  boss: { name: 'The Hollow Sun', hp: 1500, speed: 16, radius: 26, bounty: 150, leak: 5, color: null, beamResist: 0 },
};

let nextEnemyId = 1;

/**
 * A fresh enemy of `type`, `hpScale` times as tough as its definition, standing at
 * distance `dist` along the path (0 is the night gate). Position is filled in by
 * placeOnPath during the step.
 */
export function createEnemy(type, hpScale, dist = 0) {
  const def = ENEMY_TYPES[type];
  const hp = Math.round(def.hp * hpScale);
  return {
    id: nextEnemyId++,
    type,
    hp,
    maxHp: hp,
    speed: def.speed,
    radius: def.radius,
    bounty: def.bounty,
    leak: def.leak,
    /** The enemy's own colour; null burns as colourless. Bosses override with their phase. */
    color: def.color,
    beamResist: def.beamResist,
    dist,
    x: 0,
    y: 0,
    /** Seconds this enemy has been alive; drives the boss's colour phase. */
    age: 0,
    /** Seconds of burn glow left to draw; set while a beam is on the enemy. */
    flash: 0,
    /** The colour of the beam burning it right now, for the glow; null when unburned. */
    burnColor: null,
    dead: false,
    leaked: false,
  };
}

/** The colour a beam sees when it lands on `enemy` right now (bosses answer with their phase). */
export function effectiveColor(enemy) {
  if (enemy.type !== 'boss') return enemy.color;
  const index = Math.floor(enemy.age / BOSS_PHASE_SECONDS) % BOSS_PHASES.length;
  return BOSS_PHASES[index];
}

/** The hex colour to draw an enemy's core with, following a boss's phase. */
export function enemyCoreHex(enemy) {
  const color = effectiveColor(enemy);
  return color === null ? '#8d84b8' : COLOR_HEX[color];
}

/**
 * Put `enemy` at its distance along the path line: walk the legs until the leg that
 * holds the distance, then interpolate. Past the end the enemy clamps to the Crystal.
 */
export function placeOnPath(enemy, pathLine) {
  let rest = enemy.dist;
  const { points, legs } = pathLine;
  for (let i = 0; i < legs.length; i += 1) {
    if (rest <= legs[i]) {
      const t = legs[i] === 0 ? 0 : rest / legs[i];
      enemy.x = points[i].x + (points[i + 1].x - points[i].x) * t;
      enemy.y = points[i].y + (points[i + 1].y - points[i].y) * t;
      return;
    }
    rest -= legs[i];
  }
  const last = points[points.length - 1];
  enemy.x = last.x;
  enemy.y = last.y;
}
