// Pointer and keyboard input: the panel cards arm a tower for placement, a click on
// the field builds or selects, a drag on a selected mirror re-aims its face, and the
// keys cover the rest — Q/E rotate in 15-degree steps, U upgrades, X sells, Space
// starts waves and runs, P pauses, M mutes. Everything lands on the game's own
// actions, so playing by hand exercises exactly what the headless test drives.
import {
  GRID, PANEL, PANEL_BUTTONS, PANEL_CARDS, VIEW, cellAt,
} from './config.js';
import { TOWER_TYPES } from './towers.js';

const PLACE_KEYS = { Digit1: 'mirror', Digit2: 'prism', Digit3: 'lens' };

function inside(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/**
 * Wire a canvas to a game. Pointer positions are converted from client pixels into
 * the game's 1280x800 logical area through the canvas's own rectangle, so input is
 * right at any window size. `announce` receives screen-reader lines for big events.
 */
export function createInput(canvas, game, announce) {
  const state = game.state;

  function toLogical(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEW.width,
      y: ((event.clientY - rect.top) / rect.height) * VIEW.height,
    };
  }

  function towerAt(x, y) {
    const cell = cellAt(x, y);
    if (!cell) return null;
    return state.towers.find((t) => t.col === cell.col && t.row === cell.row) ?? null;
  }

  canvas.addEventListener('pointermove', (event) => {
    const { x, y } = toLogical(event);
    state.pointer = { x, y, inside: true };
    if (state.draggingId !== null) {
      const tower = game.selectedTower();
      if (tower && tower.id === state.draggingId) {
        // The face turns to look at the pointer: its normal aims at the drag point.
        game.aimSelected(Math.atan2(y - tower.y, x - tower.x) + Math.PI / 2);
      }
    }
  });
  canvas.addEventListener('pointerleave', () => {
    state.pointer.inside = false;
    state.draggingId = null;
  });
  window.addEventListener('pointerup', () => {
    state.draggingId = null;
  });

  canvas.addEventListener('pointerdown', (event) => {
    const { x, y } = toLogical(event);
    state.pointer = { x, y, inside: true };
    if (state.screen !== 'play') {
      game.startGame();
      announce('Playing. Place towers, then start the wave.');
      return;
    }
    if (state.paused) return;

    // The wave button.
    if (inside(x, y, PANEL_BUTTONS.wave)) {
      if (game.startWave()) announce(`Wave ${state.wave}. The sun is crossing.`);
      return;
    }
    // Tower cards arm placement.
    for (const card of PANEL_CARDS) {
      if (inside(x, y, { x: PANEL.x + 16, y: card.y, width: PANEL.width - 32, height: card.height })) {
        state.placing = state.placing === card.type ? null : card.type;
        state.selectedId = null;
        return;
      }
    }
    // Upgrade and sell act on the selection.
    if (inside(x, y, PANEL_BUTTONS.upgrade)) {
      game.upgradeSelected();
      return;
    }
    if (inside(x, y, PANEL_BUTTONS.sell)) {
      game.sellSelected();
      return;
    }
    // The field: build when armed, otherwise select (and maybe start a mirror drag).
    const cell = cellAt(x, y);
    if (!cell) {
      state.placing = null;
      state.selectedId = null;
      return;
    }
    if (state.placing) {
      if (game.placeTower(state.placing, cell.col, cell.row)) state.placing = null;
      return;
    }
    const tower = towerAt(x, y);
    state.selectedId = tower ? tower.id : null;
    if (tower && tower.type === 'mirror') state.draggingId = tower.id;
  });

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault();
      return;
    }
    switch (event.code) {
      case 'Space':
      case 'Enter':
        event.preventDefault();
        if (state.screen !== 'play') {
          game.startGame();
          announce('Playing. Place towers, then start the wave.');
        } else if (state.paused) {
          state.paused = false;
        } else if (state.phase === 'build') {
          if (game.startWave()) announce(`Wave ${state.wave}. The sun is crossing.`);
        }
        break;
      case 'KeyP':
        if (state.screen === 'play') {
          state.paused = !state.paused;
          announce(state.paused ? 'Paused.' : 'Playing.');
        }
        break;
      case 'Escape':
        if (state.placing) state.placing = null;
        else if (state.selectedId !== null) state.selectedId = null;
        else if (state.screen === 'play') state.paused = !state.paused;
        break;
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
        if (state.screen === 'play' && !state.paused) {
          const type = PLACE_KEYS[event.code];
          state.placing = state.placing === type ? null : type;
          state.selectedId = null;
        }
        break;
      case 'KeyQ':
        game.rotateSelected(-1);
        break;
      case 'KeyE':
        game.rotateSelected(1);
        break;
      case 'KeyU':
        game.upgradeSelected();
        break;
      case 'KeyX':
      case 'Delete':
        game.sellSelected();
        break;
      case 'KeyM': {
        const muted = game.audio.toggleMute();
        state.muted = muted;
        announce(muted ? 'Sound off.' : 'Sound on.');
        break;
      }
      case 'KeyR':
        if (state.screen === 'won' || state.screen === 'lost') game.startGame();
        break;
      default:
        break;
    }
  });

  return {
    /** How much Sunlight the armed tower type costs, for hints; null when unarmed. */
    armedCost() {
      return state.placing ? TOWER_TYPES[state.placing].cost : null;
    },
  };
}
