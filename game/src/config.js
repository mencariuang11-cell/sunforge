// SUNFORGE — every tuning number, colour and layout rectangle in one place.
// The game is a sunbeam tower defense on a fixed 1280x800 logical canvas: index.html
// scales that area to the window, so no rule below depends on the screen size. The Murk
// walks a winding path across a 16x10 tile grid from the night gate (left) to the Dawn
// Crystal (right); the player spends Sunlight on mirror, prism and lens towers that
// steer the sun's beam into them.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The logical canvas the whole game is drawn in. */
export const VIEW = { width: 1280, height: 800 };

/** The tile grid: 16 columns by 10 rows of 60 px tiles, with its origin in the dawn field. */
export const GRID = { cols: 16, rows: 10, tile: 60, x: 24, y: 156 };

/** The Dawn Crystal's health: the game is lost when leaks bring it to zero. */
export const CRYSTAL_HP = 20;

/** Sunlight in the treasury when a run begins: enough for a mirror, a lens and change. */
export const START_SUNLIGHT = 120;

/** The campaign length: clear wave 15 and the dawn is restored. */
export const TOTAL_WAVES = 15;

/**
 * The path the Murk walks, as grid cells in walking order: in along row 1, down column
 * 12, back along row 4, down column 3, and out along row 7 to the Crystal. Enemies enter
 * from one cell off the left edge and leave one cell past the right edge.
 */
export const PATH_CELLS = [
  [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1],
  [12, 2], [12, 3], [12, 4],
  [11, 4], [10, 4], [9, 4], [8, 4], [7, 4], [6, 4], [5, 4], [4, 4], [3, 4],
  [3, 5], [3, 6], [3, 7],
  [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7], [12, 7], [13, 7], [14, 7], [15, 7], [16, 7],
];

/** The pixel centre of a grid cell (cells outside the grid are how the path enters and leaves). */
export function cellCenter(col, row) {
  return { x: GRID.x + (col + 0.5) * GRID.tile, y: GRID.y + (row + 0.5) * GRID.tile };
}

/** The grid cell under a canvas point, or null when the point is off the field. */
export function cellAt(x, y) {
  const col = Math.floor((x - GRID.x) / GRID.tile);
  const row = Math.floor((y - GRID.y) / GRID.tile);
  if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) return null;
  return { col, row };
}

/** True when a cell is path: no tower may stand where the Murk walks. */
export function isPathCell(col, row) {
  return PATH_CELLS.some(([c, r]) => c === col && r === row);
}

/**
 * The walking line in pixels, with the length of every leg and the total, so an enemy's
 * distance along the path becomes a position by one walk of the legs.
 */
export function buildPathLine() {
  const points = PATH_CELLS.map(([c, r]) => cellCenter(c, r));
  const legs = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    legs.push(length);
    total += length;
  }
  return { points, legs, total };
}

/** The sun's arc across the sky band above the field, and the beam it throws. */
export const SUN = {
  /** Arc endpoints and peak height (canvas px): the sun rises left, crests, sets right. */
  x0: 150, x1: 880, yBase: 138, yPeak: 66,
  /** Beam entry angle at sunrise and sunset, in radians from +x (canvas y grows downward). */
  angle0: 1.02, angle1: 2.12,
  radius: 17,
};

/**
 * The beam's base burn rate in damage per second before colour, focus and level
 * factors. Tuned so the naked sunbeam only wounds what it sweeps across: a Shade
 * crossing it survives the pass, and killing takes towers — mirrors for coverage,
 * prisms for colour, lenses for the big burns.
 */
export const BEAM_DPS = 30;
/** A white beam burns everything at this fraction of the base rate. */
export const WHITE_FACTOR = 0.6;
/** A coloured beam burns enemies of other colours (and the colourless) at this fraction. */
export const OFF_COLOR_FACTOR = 0.25;
/** How wide a beam burns around its centre line, in px (a focused beam burns narrower). */
export const BEAM_HALF_WIDTH = 7;
export const BEAM_HALF_WIDTH_FOCUSED = 4;
/** The most segments one traced beam network may have, splits included. */
export const MAX_BEAM_SEGMENTS = 140;

/** The rectangle a traced beam is clipped to: a little past the field on every side. */
export const BEAM_CLIP = { minX: -40, minY: 96, maxX: 1048, maxY: 812 };

/**
 * The solar flare: on the late waves (10-15), while the sun crosses the peak of its
 * arc — wave progress between FLARE_S_START and FLARE_S_END, a tenth of the crossing
 * around noon — its light surges: every beam burns wider and harder. A pure function
 * of wave and progress (sunpath.js's flareStateAt), never of the clock, so a wave
 * always flares at the same moment of its crossing.
 */
export const FLARE_FIRST_WAVE = 10;
/** Wave progress where the flare window opens and closes (the sun's peak crossing). */
export const FLARE_S_START = 0.45;
export const FLARE_S_END = 0.55;
/** Beam half-width multiplier while the flare burns. */
export const FLARE_WIDTH_MULT = 1.6;
/** Beam damage multiplier while the flare burns. */
export const FLARE_DAMAGE_MULT = 1.5;

/** The side panel: tower cards, the selected tower's details, the wave button. */
export const PANEL = { x: 1008, y: 156, width: 248, height: 600 };
export const PANEL_CARDS = [
  { type: 'mirror', y: 216, height: 64 },
  { type: 'prism', y: 288, height: 64 },
  { type: 'lens', y: 360, height: 64 },
];
export const PANEL_BUTTONS = {
  upgrade: { x: 1024, y: 560, width: 104, height: 40 },
  sell: { x: 1140, y: 560, width: 100, height: 40 },
  wave: { x: 1024, y: 692, width: 216, height: 48 },
};

export const PALETTE = {
  nightTop: '#141433',
  nightMid: '#2c2150',
  horizon: '#b3543f',
  dawnGlow: '#f2a65a',
  fieldA: '#3a2c4e',
  fieldB: '#42335a',
  path: '#241a38',
  pathEdge: '#c97b4a',
  crystal: '#aef3ff',
  sunlight: '#ffd76a',
  text: '#f5ead9',
  muted: '#b8a888',
  panel: '#1d1836',
  panelEdge: '#574a7a',
  white: '#fff6da',
  red: '#ff5a4e',
  green: '#5ee06e',
  blue: '#4ea8ff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Beam and enemy colours by name, for code that is handed a colour key. */
export const COLOR_HEX = {
  white: PALETTE.white,
  red: PALETTE.red,
  green: PALETTE.green,
  blue: PALETTE.blue,
};
