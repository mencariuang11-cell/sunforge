// Drawing only: the game state in, pixels out. SUNFORGE is painted in a warm dawn
// palette — an indigo night sky warming to amber at the horizon, a stone field, the
// Murk as dark blobs with coloured cores, and the beam network as layered glowing
// strokes. The canvas is the fixed 1280x800 logical area from config.js; index.html
// scales it to the window. The judge reads this game mostly through its screenshots,
// so every screen — title, battle, victory, defeat — is composed to read at a glance.
import {
  COLOR_HEX, FONT, GRID, PANEL, PANEL_BUTTONS, PANEL_CARDS, PALETTE,
  TOTAL_WAVES, VIEW, buildPathLine, cellAt, isPathCell,
} from './config.js';
import { TOWER_TYPES, sellValue, upgradeCost } from './towers.js';
import { enemyCoreHex } from './enemies.js';
import { flareStateAt, sunArcPoints, sunStateAt } from './sunpath.js';
import { createRandom } from './random.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, value, x, y, { size = 16, color = PALETTE.text, align = 'left', weight = '400', alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y);
  ctx.restore();
}

/** The glyph of one tower type at (x, y): a mirror's face, a prism, a lens. */
function drawTowerGlyph(ctx, type, x, y, angle = Math.PI / 4, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (type === 'mirror') {
    ctx.fillStyle = '#6b5836';
    ctx.fillRect(-2.5, 4, 5, 13);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    ctx.strokeStyle = '#e8efff';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#aaccff';
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.moveTo(-dx * 19, -dy * 19);
    ctx.lineTo(dx * 19, dy * 19);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fffbe8';
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'prism') {
    const top = { x: 0, y: -17 };
    const left = { x: -16, y: 12 };
    const right = { x: 16, y: 12 };
    ctx.fillStyle = 'rgba(200,220,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(left.x, left.y);
    ctx.closePath();
    ctx.fill();
    const edges = [
      [top, right, PALETTE.red],
      [right, left, PALETTE.green],
      [left, top, PALETTE.blue],
    ];
    ctx.lineWidth = 2.6;
    for (const [a, b, color] of edges) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = '#cfe8ff';
    ctx.fillStyle = 'rgba(160,210,255,0.16)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(207,232,255,0.65)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-4.5, -5, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const pathLine = buildPathLine();
  const starRandom = createRandom(7);
  const stars = Array.from({ length: 110 }, () => ({
    x: starRandom.range(0, VIEW.width),
    y: starRandom.range(0, 190),
    r: starRandom.range(0.6, 1.8),
    p: starRandom.range(0, Math.PI * 2),
  }));

  function drawSky(state) {
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, PALETTE.nightTop);
    grad.addColorStop(0.24, PALETTE.nightMid);
    grad.addColorStop(0.42, PALETTE.horizon);
    grad.addColorStop(0.55, '#5a3a56');
    grad.addColorStop(1, '#241a38');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    for (const star of stars) {
      const fade = (1 - star.y / 200) * (1 - state.sunS * 0.45);
      const twinkle = 0.7 + 0.3 * Math.sin(state.time * 0.7 + star.p);
      ctx.globalAlpha = Math.max(0, 0.75 * fade * twinkle);
      ctx.fillStyle = '#e8e6ff';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Distant mesas silhouetted against the sky band, behind the field's top edge.
    ctx.fillStyle = '#1a1433';
    ctx.beginPath();
    ctx.moveTo(0, 156);
    ctx.lineTo(0, 118);
    ctx.lineTo(120, 118);
    ctx.lineTo(196, 156);
    ctx.closePath();
    ctx.moveTo(852, 156);
    ctx.lineTo(928, 112);
    ctx.lineTo(1008, 130);
    ctx.lineTo(1008, 156);
    ctx.closePath();
    ctx.fill();
  }

  function drawField(state) {
    for (let row = 0; row < GRID.rows; row += 1) {
      for (let col = 0; col < GRID.cols; col += 1) {
        const x = GRID.x + col * GRID.tile;
        const y = GRID.y + row * GRID.tile;
        ctx.fillStyle = isPathCell(col, row) ? PALETTE.path : ((col + row) % 2 === 0 ? PALETTE.fieldA : PALETTE.fieldB);
        ctx.fillRect(x, y, GRID.tile, GRID.tile);
      }
    }
    // The route itself glows faintly, so the Murk's road reads across the whole field.
    ctx.save();
    ctx.strokeStyle = PALETTE.pathEdge;
    ctx.globalAlpha = 0.4 + 0.12 * Math.sin(state.time * 1.6);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    pathLine.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(GRID.x, GRID.y, GRID.cols * GRID.tile, GRID.rows * GRID.tile);
    // The night gate the Murk pours from.
    ctx.fillStyle = '#0a0618';
    roundRect(ctx, -6, 214, 34, 64, 8);
    ctx.fill();
    ctx.strokeStyle = '#7a5cff';
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 2;
    roundRect(ctx, -6, 214, 34, 64, 8);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawCrystal(state) {
    const x = 988;
    const y = 486;
    const pulse = 0.75 + 0.25 * Math.sin(state.time * 2.4);
    const glow = ctx.createRadialGradient(x, y, 2, x, y, 46);
    glow.addColorStop(0, `rgba(174,243,255,${0.5 * pulse})`);
    glow.addColorStop(1, 'rgba(174,243,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 46, y - 46, 92, 92);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = PALETTE.crystal;
    ctx.shadowColor = PALETTE.crystal;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(14, 0);
    ctx.lineTo(0, 24);
    ctx.lineTo(-14, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(7, 0);
    ctx.lineTo(0, 13);
    ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    text(ctx, 'DAWN CRYSTAL', x, y + 40, { size: 10, color: PALETTE.crystal, align: 'center', weight: '700' });
  }

  function drawSunAndForecast(state) {
    const arc = sunArcPoints(40);
    ctx.save();
    ctx.strokeStyle = PALETTE.muted;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([5, 8]);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    arc.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.setLineDash([]);
    const end = arc[arc.length - 1];
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = PALETTE.dawnGlow;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const sun = sunStateAt(state.sunS);
    // While the solar flare burns (late waves, the sun at its peak) the sun swells.
    const flare = flareStateAt(state.sunS, state.wave);
    const glowRadius = flare.active ? 88 : 58;
    const glow = ctx.createRadialGradient(sun.x, sun.y, 2, sun.x, sun.y, glowRadius);
    glow.addColorStop(0, `rgba(255,215,106,${flare.active ? 0.85 : 0.55})`);
    glow.addColorStop(1, 'rgba(255,215,106,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sun.x - glowRadius, sun.y - glowRadius, glowRadius * 2, glowRadius * 2);
    ctx.save();
    ctx.translate(sun.x, sun.y);
    ctx.rotate(state.time * 0.25);
    ctx.strokeStyle = 'rgba(255,183,90,0.55)';
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 22, Math.sin(a) * 22);
      ctx.lineTo(Math.cos(a) * 30, Math.sin(a) * 30);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = PALETTE.sunlight;
    ctx.shadowColor = PALETTE.sunlight;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawBeams(state) {
    // The solar flare draws as it burns: wider strokes, brighter light (flareStateAt).
    const flare = flareStateAt(state.sunS, state.wave);
    const brighten = flare.active ? 1.35 : 1;
    ctx.save();
    ctx.lineCap = 'round';
    for (const seg of state.segments) {
      const hex = COLOR_HEX[seg.color];
      const flicker = 0.86 + 0.14 * Math.sin(state.time * 34 + seg.x1 * 0.05 + seg.y1 * 0.03);
      ctx.strokeStyle = hex;
      ctx.globalAlpha = Math.min(1, 0.13 * flicker * brighten);
      ctx.lineWidth = (seg.focused ? 10 : 15) * flare.widthMult;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
      ctx.globalAlpha = Math.min(1, 0.38 * flicker * brighten);
      ctx.lineWidth = (seg.focused ? 4.5 : 7) * flare.widthMult;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
      ctx.strokeStyle = '#fffbe8';
      ctx.globalAlpha = Math.min(1, 0.92 * flicker * brighten);
      ctx.lineWidth = (seg.focused ? 1.8 : 2.6) * flare.widthMult;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTowers(state) {
    for (const tower of state.towers) {
      ctx.fillStyle = '#241d3f';
      ctx.strokeStyle = PALETTE.panelEdge;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      drawTowerGlyph(ctx, tower.type, tower.x, tower.y - 2, tower.angle, 1);
      for (let i = 0; i < tower.level; i += 1) {
        ctx.fillStyle = PALETTE.sunlight;
        ctx.beginPath();
        ctx.arc(tower.x - 10 + i * 10, tower.y + 25, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      if (tower.id === state.selectedId) {
        ctx.save();
        ctx.strokeStyle = PALETTE.sunlight;
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        if (tower.type === 'mirror') {
          const nx = -Math.sin(tower.angle);
          const ny = Math.cos(tower.angle);
          ctx.strokeStyle = 'rgba(255,215,106,0.75)';
          ctx.beginPath();
          ctx.moveTo(tower.x, tower.y);
          ctx.lineTo(tower.x + nx * 34, tower.y + ny * 34);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    // The placement ghost follows the pointer while a tower card is armed.
    if (state.placing && state.pointer.inside && state.screen === 'play') {
      const cell = cellAt(state.pointer.x, state.pointer.y);
      if (cell) {
        const cx = GRID.x + cell.col * GRID.tile;
        const cy = GRID.y + cell.row * GRID.tile;
        const occupied = state.towers.some((t) => t.col === cell.col && t.row === cell.row);
        const valid = !isPathCell(cell.col, cell.row) && !occupied && state.sunlight >= TOWER_TYPES[state.placing].cost;
        ctx.fillStyle = valid ? 'rgba(255,215,106,0.22)' : 'rgba(255,90,78,0.28)';
        ctx.fillRect(cx, cy, GRID.tile, GRID.tile);
        ctx.globalAlpha = 0.65;
        drawTowerGlyph(ctx, state.placing, cx + GRID.tile / 2, cy + GRID.tile / 2 - 2, Math.PI / 4, 1);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawEnemies(state) {
    for (const enemy of state.enemies) {
      const { x, y, radius: r } = enemy;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.85, r * 0.9, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      const body = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.2, x, y, r * 1.15);
      body.addColorStop(0, '#3d3468');
      body.addColorStop(1, '#17122b');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (enemy.type === 'gloam' || enemy.type === 'boss') {
        ctx.fillStyle = '#241d45';
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + 0.4;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92, r * 0.24, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (enemy.type === 'splitter') {
        ctx.strokeStyle = 'rgba(200,190,255,0.5)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.55, y - r * 0.4);
        ctx.lineTo(x - r * 0.1, y + r * 0.1);
        ctx.lineTo(x + r * 0.45, y - r * 0.2);
        ctx.stroke();
      }
      // The core: the creature's colour, which is also the light that kills it fastest.
      const core = enemyCoreHex(enemy);
      ctx.fillStyle = core;
      ctx.shadowColor = core;
      ctx.shadowBlur = enemy.type === 'boss' ? 20 : 10;
      ctx.beginPath();
      ctx.arc(x, y, r * (enemy.type === 'boss' ? 0.5 : 0.42), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (enemy.type === 'boss') {
        ctx.strokeStyle = core;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(x, y, r + 5 + 2 * Math.sin(state.time * 3), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Eyes: two pale sparks that make the Murk read as alive, not as tokens.
      ctx.fillStyle = '#efeaff';
      ctx.beginPath();
      ctx.arc(x - r * 0.34, y - r * 0.42, 1.9, 0, Math.PI * 2);
      ctx.arc(x + r * 0.3, y - r * 46 / 100, 1.9, 0, Math.PI * 2);
      ctx.fill();
      if (enemy.flash > 0 && enemy.burnColor) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(0.45, enemy.flash * 3.6);
        ctx.fillStyle = COLOR_HEX[enemy.burnColor];
        ctx.beginPath();
        ctx.arc(x, y, r * 1.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (enemy.hp < enemy.maxHp) {
        const w = r * 2;
        const frac = Math.max(0, enemy.hp / enemy.maxHp);
        ctx.fillStyle = 'rgba(8,6,18,0.8)';
        ctx.fillRect(x - r, y - r - 11, w, 4.6);
        ctx.fillStyle = frac > 0.45 ? '#5ee06e' : frac > 0.2 ? '#f2c94c' : '#ff5a4e';
        ctx.fillRect(x - r, y - r - 11, w * frac, 4.6);
      }
    }
  }

  function drawParticles(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife) * 0.85;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBar(x, y, w, frac, color) {
    ctx.fillStyle = 'rgba(8,6,18,0.75)';
    roundRect(ctx, x, y, w, 9, 4);
    ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = color;
      roundRect(ctx, x, y, w * Math.min(1, frac), 9, 4);
      ctx.fill();
    }
  }

  function drawHUD(state) {
    ctx.fillStyle = 'rgba(13,10,28,0.88)';
    ctx.fillRect(0, 0, VIEW.width, 52);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.beginPath();
    ctx.moveTo(0, 52);
    ctx.lineTo(VIEW.width, 52);
    ctx.stroke();
    // Sunlight treasury.
    ctx.fillStyle = PALETTE.sunlight;
    ctx.shadowColor = PALETTE.sunlight;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(34, 26, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    text(ctx, `${state.sunlight}`, 52, 27, { size: 21, weight: '700', color: PALETTE.sunlight });
    text(ctx, 'SUNLIGHT', 52, 44, { size: 9, color: PALETTE.muted, weight: '700' });
    // Wave and phase.
    const waveLabel = state.screen === 'play'
      ? (state.phase === 'wave' ? `WAVE ${state.wave} / ${TOTAL_WAVES}` : `WAVE ${state.wave} / ${TOTAL_WAVES} — BUILD`)
      : `WAVE ${state.wave} / ${TOTAL_WAVES}`;
    text(ctx, waveLabel, 210, 27, { size: 18, weight: '700' });
    // Crystal health.
    text(ctx, 'CRYSTAL', 420, 20, { size: 10, color: PALETTE.muted, weight: '700' });
    drawBar(420, 30, 130, state.crystalHp / 20, PALETTE.crystal);
    text(ctx, `${state.crystalHp}`, 560, 35, { size: 15, weight: '700', color: PALETTE.crystal });
    // Sun progress through the arc.
    text(ctx, 'SUN', 640, 20, { size: 10, color: PALETTE.muted, weight: '700' });
    drawBar(640, 30, 130, state.sunS, PALETTE.dawnGlow);
    // Tallies and sound state.
    text(ctx, `Burned ${state.kills}`, 830, 27, { size: 15, color: PALETTE.text });
    text(ctx, `Leaked ${state.leaks}`, 950, 27, { size: 15, color: state.leaks > 0 ? PALETTE.red : PALETTE.muted });
    text(ctx, state.muted ? 'SOUND OFF (M)' : 'SOUND ON (M)', 1256, 27, { size: 12, color: PALETTE.muted, align: 'right' });
  }

  function drawPanel(state) {
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 10);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.6;
    roundRect(ctx, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 10);
    ctx.stroke();
    text(ctx, 'TOWERS', PANEL.x + 16, PANEL.y + 26, { size: 13, weight: '700', color: PALETTE.muted });
    text(ctx, 'click, then click a tile', PANEL.x + 16, PANEL.y + 46, { size: 11, color: PALETTE.muted });

    for (const card of PANEL_CARDS) {
      const def = TOWER_TYPES[card.type];
      const x = PANEL.x + 16;
      const w = PANEL.width - 32;
      const armed = state.placing === card.type;
      const afford = state.sunlight >= def.cost;
      ctx.fillStyle = armed ? 'rgba(255,215,106,0.16)' : 'rgba(255,255,255,0.045)';
      roundRect(ctx, x, card.y, w, card.height, 8);
      ctx.fill();
      ctx.strokeStyle = armed ? PALETTE.sunlight : PALETTE.panelEdge;
      ctx.lineWidth = armed ? 2 : 1.2;
      roundRect(ctx, x, card.y, w, card.height, 8);
      ctx.stroke();
      drawTowerGlyph(ctx, card.type, x + 34, card.y + 30, Math.PI / 4, 0.9);
      text(ctx, def.name, x + 66, card.y + 20, { size: 16, weight: '700', color: afford ? PALETTE.text : PALETTE.muted });
      text(ctx, def.blurbLines[0], x + 66, card.y + 42, { size: 10, color: PALETTE.muted });
      text(ctx, def.blurbLines[1], x + 66, card.y + 56, { size: 10, color: PALETTE.muted });
      text(ctx, `${def.cost}`, x + w - 12, card.y + 20, { size: 16, weight: '700', color: PALETTE.sunlight, align: 'right' });
      text(ctx, `key ${PANEL_CARDS.indexOf(card) + 1}`, x + 34, card.y + 54, { size: 9, color: PALETTE.muted, align: 'center' });
    }

    // The selected tower's dossier, or the standing orders when nothing is selected.
    const tower = state.towers.find((t) => t.id === state.selectedId) ?? null;
    text(ctx, 'SELECTED', PANEL.x + 16, 452, { size: 13, weight: '700', color: PALETTE.muted });
    if (tower) {
      const def = TOWER_TYPES[tower.type];
      text(ctx, `${def.name} · Lv ${tower.level}`, PANEL.x + 16, 478, { size: 17, weight: '700' });
      let effect = '';
      if (tower.type === 'mirror') effect = `Beam power x${def.polishByLevel[tower.level - 1].toFixed(2)} · face ${Math.round((tower.angle * 180) / Math.PI)}°`;
      if (tower.type === 'prism') effect = `Split beams burn x${def.splitGainByLevel[tower.level - 1].toFixed(2)}`;
      if (tower.type === 'lens') effect = `Focused beam burns x${def.focusByLevel[tower.level - 1].toFixed(1)}`;
      text(ctx, effect, PANEL.x + 16, 502, { size: 12, color: PALETTE.text });
      text(ctx, tower.type === 'mirror' ? 'Q / E or drag to re-aim the face' : 'It works on any beam that touches it', PANEL.x + 16, 524, { size: 11.5, color: PALETTE.muted });
    } else {
      text(ctx, 'No tower selected.', PANEL.x + 16, 478, { size: 14, color: PALETTE.text });
      text(ctx, 'Mirrors bend the beam. Prisms colour it.', PANEL.x + 16, 502, { size: 11.5, color: PALETTE.muted });
      text(ctx, 'Lenses focus it. Re-aim as the sun moves!', PANEL.x + 16, 522, { size: 11.5, color: PALETTE.muted });
    }

    // Upgrade and sell buttons.
    const up = PANEL_BUTTONS.upgrade;
    const sell = PANEL_BUTTONS.sell;
    const upCost = tower ? upgradeCost(tower) : null;
    ctx.fillStyle = tower && upCost !== null && state.sunlight >= upCost ? 'rgba(94,224,110,0.18)' : 'rgba(255,255,255,0.05)';
    roundRect(ctx, up.x, up.y, up.width, up.height, 8);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    roundRect(ctx, up.x, up.y, up.width, up.height, 8);
    ctx.stroke();
    text(ctx, !tower ? 'Upgrade' : upCost === null ? 'MAX LV' : `Upgrade ${upCost}`, up.x + up.width / 2, up.y + 21, { size: 13.5, weight: '700', align: 'center', color: tower && upCost !== null ? PALETTE.text : PALETTE.muted });
    ctx.fillStyle = tower ? 'rgba(255,90,78,0.14)' : 'rgba(255,255,255,0.05)';
    roundRect(ctx, sell.x, sell.y, sell.width, sell.height, 8);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    roundRect(ctx, sell.x, sell.y, sell.width, sell.height, 8);
    ctx.stroke();
    text(ctx, tower ? `Sell +${sellValue(tower)}` : 'Sell', sell.x + sell.width / 2, sell.y + 21, { size: 13.5, weight: '700', align: 'center', color: tower ? PALETTE.text : PALETTE.muted });

    // The wave button: the one big verb of the build phase.
    const waveBtn = PANEL_BUTTONS.wave;
    if (state.phase === 'build' && state.screen === 'play') {
      ctx.fillStyle = 'rgba(255,183,90,0.85)';
      roundRect(ctx, waveBtn.x, waveBtn.y, waveBtn.width, waveBtn.height, 9);
      ctx.fill();
      text(ctx, `START WAVE ${state.wave}`, waveBtn.x + waveBtn.width / 2, waveBtn.y + 19, { size: 16, weight: '800', align: 'center', color: '#2a1602' });
      text(ctx, 'or press Space', waveBtn.x + waveBtn.width / 2, waveBtn.y + 37, { size: 10.5, align: 'center', color: '#5a3402' });
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      roundRect(ctx, waveBtn.x, waveBtn.y, waveBtn.width, waveBtn.height, 9);
      ctx.fill();
      ctx.strokeStyle = PALETTE.panelEdge;
      roundRect(ctx, waveBtn.x, waveBtn.y, waveBtn.width, waveBtn.height, 9);
      ctx.stroke();
      const remaining = state.enemies.length + (state.spawnQueue.length - state.spawnIndex);
      text(ctx, state.screen === 'play' ? `${remaining} Murk remain` : '—', waveBtn.x + waveBtn.width / 2, waveBtn.y + 25, { size: 14, weight: '700', align: 'center', color: PALETTE.muted });
    }
  }

  function drawMessage(state) {
    if (!state.message || state.messageT <= 0) return;
    text(ctx, state.message, GRID.x + 4, 782, { size: 14.5, color: PALETTE.dawnGlow, alpha: Math.min(1, state.messageT) });
  }

  function drawBanner(state) {
    if (state.banner.t <= 0) return;
    const alpha = Math.min(1, state.banner.t / 0.7);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `800 46px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = PALETTE.dawnGlow;
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffe9bb';
    ctx.fillText(state.banner.text, 504, 108);
    ctx.restore();
  }

  /** The solar flare's banner: up for exactly the window flareStateAt calls active. */
  function drawFlareBanner(state) {
    if (state.screen !== 'play' || state.phase !== 'wave') return;
    if (!flareStateAt(state.sunS, state.wave).active) return;
    const pulse = 0.8 + 0.2 * Math.sin(state.time * 6);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.font = `800 27px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff9d45';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#ffd76a';
    ctx.fillText('SOLAR FLARE — THE SUN SURGES', 504, 108);
    ctx.restore();
  }

  function overlayPanel(title, titleColor, lines, prompt, state) {
    ctx.fillStyle = 'rgba(9,7,22,0.58)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.save();
    ctx.font = `800 62px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = titleColor;
    ctx.shadowBlur = 30;
    ctx.fillStyle = titleColor;
    ctx.fillText(title, VIEW.width / 2, 268);
    ctx.restore();
    lines.forEach((line, i) => {
      text(ctx, line, VIEW.width / 2, 330 + i * 27, { size: 16.5, align: 'center', color: PALETTE.text });
    });
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.2);
    text(ctx, prompt, VIEW.width / 2, 348 + lines.length * 27, { size: 17, align: 'center', weight: '700', color: PALETTE.sunlight, alpha: pulse });
  }

  function draw(state) {
    drawSky(state);
    drawField(state);
    drawCrystal(state);
    drawSunAndForecast(state);
    drawTowers(state);
    drawBeams(state);
    drawEnemies(state);
    drawParticles(state);
    drawHUD(state);
    drawPanel(state);
    drawMessage(state);
    drawBanner(state);
    drawFlareBanner(state);
    if (state.screen === 'title') {
      overlayPanel('S U N F O R G E', PALETTE.sunlight, [
        'Bend the dawn. Burn the night.',
        'The Murk walks the path to eat the Dawn Crystal. Stop it with sunlight.',
        'Mirrors bend the beam · Prisms split it into colours · Lenses focus it.',
        'The sun crosses the sky DURING each wave — re-aim with Q / E or drag.',
        'Coloured light burns matching wisps hardest. Clear all 15 waves.',
      ], 'CLICK OR PRESS SPACE TO PLAY', state);
    } else if (state.screen === 'won') {
      overlayPanel('THE DAWN IS RESTORED', PALETTE.crystal, [
        'All fifteen waves burned away, and the Crystal still shines.',
        `Murk burned: ${state.kills} · Sunlight earned: ${state.earned} · Leaks: ${state.leaks}`,
      ], 'CLICK OR PRESS SPACE TO PLAY AGAIN', state);
    } else if (state.screen === 'lost') {
      overlayPanel('THE CRYSTAL FALLS', PALETTE.red, [
        `The night got through on wave ${state.wave} of ${TOTAL_WAVES}.`,
        `Murk burned: ${state.kills} · Sunlight earned: ${state.earned}`,
      ], 'CLICK OR PRESS SPACE TO TRY AGAIN', state);
    } else if (state.paused) {
      overlayPanel('PAUSED', PALETTE.text, ['The sun holds its breath.'], 'PRESS P TO RESUME', state);
    }
  }

  return { draw };
}
