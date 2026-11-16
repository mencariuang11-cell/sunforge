// The sun's journey: during every wave it travels its arc across the sky band above the
// field CONTINUOUSLY, and the beam it throws sweeps its entry angle as it goes — sunrise
// slants in from the left, noon falls straight down, sunset slants away to the right.
// That sweep is SUNFORGE's headline rule: a mirror network aimed at the morning sun is
// wrong for the evening, so towers must be re-aimed while the wave is running. (The
// tower defense this design answers only moves its sun between waves.)
//
// The sun also has a temper: on waves 10 and up, as it crosses the peak of its arc (wave
// progress 0.45-0.55), a SOLAR FLARE surges — every beam widens (half-width x1.6) and
// burns harder (damage x1.5) for that tenth of the crossing, under its own banner.
// flareStateAt below is the one source of that rule: beams.js burns by it, render.js
// draws by it, and being a pure function of progress and wave it fires at the same
// moment of the crossing every single run.
import {
  FLARE_DAMAGE_MULT, FLARE_FIRST_WAVE, FLARE_S_END, FLARE_S_START, FLARE_WIDTH_MULT, SUN,
} from './config.js';

/**
 * Where the sun is, and which way its beam points, at wave progress s in [0, 1].
 * The position rides a sine arc between the two horizon endpoints; the beam angle
 * interpolates between the sunrise and sunset angles, passing straight down at noon.
 */
export function sunStateAt(s) {
  const t = Math.min(1, Math.max(0, s));
  const x = SUN.x0 + (SUN.x1 - SUN.x0) * t;
  const y = SUN.yBase - Math.sin(t * Math.PI) * (SUN.yBase - SUN.yPeak);
  const angle = SUN.angle0 + (SUN.angle1 - SUN.angle0) * t;
  return { x, y, angle, dirX: Math.cos(angle), dirY: Math.sin(angle) };
}

/**
 * The solar flare at wave progress `s` of wave `wave`: active only on the late waves
 * (FLARE_FIRST_WAVE and beyond) while the sun crosses its peak (progress between
 * FLARE_S_START and FLARE_S_END). While active, beams widen by FLARE_WIDTH_MULT and
 * burn for FLARE_DAMAGE_MULT; otherwise both multipliers are 1 and nothing changes.
 */
export function flareStateAt(s, wave) {
  const active = wave >= FLARE_FIRST_WAVE && s >= FLARE_S_START && s <= FLARE_S_END;
  return {
    active,
    widthMult: active ? FLARE_WIDTH_MULT : 1,
    damageMult: active ? FLARE_DAMAGE_MULT : 1,
  };
}

/** Points along the sun's whole arc, for the dashed forecast line the player plans by. */
export function sunArcPoints(steps = 40) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const { x, y } = sunStateAt(i / steps);
    points.push({ x, y });
  }
  return points;
}
