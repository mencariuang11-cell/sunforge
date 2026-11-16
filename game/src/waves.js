// The fifteen-wave campaign: every wave is a list of spawn groups (a type, a count, the
// gap between spawns, and a delay before the group starts), plus the number of seconds
// the sun takes to cross the sky while it runs. Waves teach one thing at a time — first
// shades, then one colour of wisp at a time, then splitters, then gloams — and every
// fifth wave is a boss with an escort. Hit points also scale gently with the wave
// number, so a network that cleared wave 3 cannot coast through wave 12 untouched.

/** Hit-point multiplier for enemies spawned on `wave` (1-based). */
export function hpScaleForWave(wave) {
  return 1 + 0.18 * (wave - 1);
}

/** Boss hit-point multiplier for the boss wave `wave` (5, 10 or 15). */
export function bossScaleForWave(wave) {
  return wave / 5;
}

/** One spawn group: `count` enemies of `type`, one every `gap` seconds, after `delay`. */
function group(type, count, gap, delay) {
  return { type, count, gap, delay };
}

/** The campaign: WAVES[wave - 1] is that wave's { duration, groups }. */
export const WAVES = [
  { duration: 46, groups: [group('shade', 8, 2.6, 1)] },
  { duration: 48, groups: [group('shade', 12, 2.0, 1)] },
  { duration: 50, groups: [group('shade', 8, 2.2, 1), group('emberWisp', 6, 1.6, 14)] },
  { duration: 52, groups: [group('shade', 10, 2.0, 1), group('tideWisp', 6, 1.6, 16)] },
  { duration: 62, groups: [group('boss', 1, 1, 2), group('shade', 6, 4.0, 10)] },
  { duration: 54, groups: [group('verdantWisp', 10, 1.5, 1), group('shade', 8, 2.4, 12)] },
  { duration: 56, groups: [group('splitter', 4, 4.5, 1), group('shade', 10, 2.0, 8)] },
  { duration: 58, groups: [group('emberWisp', 6, 1.5, 1), group('verdantWisp', 6, 1.5, 12), group('tideWisp', 6, 1.5, 23)] },
  { duration: 60, groups: [group('gloam', 3, 7.0, 1), group('shade', 12, 1.9, 6)] },
  { duration: 70, groups: [group('boss', 1, 1, 2), group('emberWisp', 5, 3.0, 12), group('tideWisp', 5, 3.0, 26)] },
  { duration: 62, groups: [group('splitter', 6, 3.6, 1), group('verdantWisp', 8, 1.6, 14), group('emberWisp', 6, 1.6, 26)] },
  { duration: 64, groups: [group('gloam', 5, 5.5, 1), group('shade', 14, 1.7, 8)] },
  { duration: 60, groups: [group('emberWisp', 8, 1.1, 1), group('tideWisp', 8, 1.1, 10), group('verdantWisp', 8, 1.1, 19)] },
  { duration: 68, groups: [group('gloam', 4, 6.0, 1), group('splitter', 6, 3.4, 10), group('shade', 12, 1.8, 20)] },
  { duration: 78, groups: [group('boss', 1, 1, 2), group('gloam', 2, 8.0, 14), group('emberWisp', 6, 2.6, 24), group('verdantWisp', 6, 2.6, 36)] },
];

/**
 * Flatten a wave definition into a spawn schedule: a time-sorted list of { time, type }
 * in wave seconds. Pure arithmetic — the same wave always schedules the same.
 */
export function buildSpawnSchedule(waveDef) {
  const schedule = [];
  for (const g of waveDef.groups) {
    for (let i = 0; i < g.count; i += 1) {
      schedule.push({ time: g.delay + i * g.gap, type: g.type });
    }
  }
  schedule.sort((a, b) => a.time - b.time);
  return schedule;
}

/** The Sunlight bonus paid for clearing `wave` with the Crystal still standing. */
export function waveClearBonus(wave) {
  return 25 + 5 * wave;
}
