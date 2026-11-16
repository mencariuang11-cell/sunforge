// The sun's journey: during every wave it travels its arc across the sky band above the
// field CONTINUOUSLY, and the beam it throws sweeps its entry angle as it goes — sunrise
// slants in from the left, noon falls straight down, sunset slants away to the right.
// That sweep is SUNFORGE's headline rule: a mirror network aimed at the morning sun is
// wrong for the evening, so towers must be re-aimed while the wave is running. (The
// tower defense this design answers only moves its sun between waves.)
import { SUN } from './config.js';

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

/** Points along the sun's whole arc, for the dashed forecast line the player plans by. */
export function sunArcPoints(steps = 40) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const { x, y } = sunStateAt(i / steps);
    points.push({ x, y });
  }
  return points;
}
