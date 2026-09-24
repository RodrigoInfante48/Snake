// Reto diario: la fecha local (AAAA-MM-DD) define la semilla y el tablero.
// Todo es determinista: mismo día => mismo tablero y mismas frutas para todos.

import { hashString, createRng, rngInt, rngFloat } from '../core/rng.js';
import { parseBoard, spawnBody, stepCell, reachableCount, freeCellCount } from '../core/board.js';

const W = 20;
const H = 20;
const EPOCH = Date.UTC(2026, 0, 1);

export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Número de reto (#1 = 2026-01-01), para el texto compartible.
export function dailyNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000) + 1;
}

export function dailySeed(key) {
  return hashString(`ecos-daily-${key}`);
}

// Salidas fijas, pensadas para no chocar con los obstáculos reservados.
const SPAWNS = [
  { x: 5, y: 3, c: '>' },
  { x: 16, y: 5, c: 'v' },
  { x: 14, y: 16, c: '<' },
  { x: 3, y: 14, c: '^' },
  { x: 9, y: 10, c: '>' },
];

function emptyGrid() {
  const g = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      row.push(x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.');
    }
    g.push(row);
  }
  return g;
}

function toMap(g) {
  return g.map((r) => r.join(''));
}

function reservedCells() {
  // Cuerpo inicial + 6 celdas por delante de cada salida quedan libres.
  const g = emptyGrid();
  for (const s of SPAWNS) g[s.y][s.x] = s.c;
  const board = parseBoard(toMap(g));
  const set = new Set();
  for (const sp of board.spawns) {
    for (const c of spawnBody(board, sp, 5)) set.add(c);
    let c = sp.cell;
    for (let k = 0; k < 6; k++) { c = stepCell(board, c, sp.dir); set.add(c); }
  }
  return set;
}

function tryGenerate(rng, reserved) {
  const g = emptyGrid();
  const put = (x, y, ch) => {
    if (x <= 0 || y <= 0 || x >= W - 1 || y >= H - 1) return;
    if (reserved.has(y * W + x)) return;
    g[y][x] = ch;
  };
  // Obstáculos con simetría de 180° (se ve "diseñado" y es justo).
  const blocks = 4 + rngInt(rng, 4);
  for (let b = 0; b < blocks; b++) {
    const horizontal = rngFloat(rng) < 0.5;
    const len = 2 + rngInt(rng, 4);
    const x0 = 2 + rngInt(rng, W - 4);
    const y0 = 2 + rngInt(rng, H - 4);
    for (let k = 0; k < len; k++) {
      const x = horizontal ? x0 + k : x0;
      const y = horizontal ? y0 : y0 + k;
      put(x, y, '#');
      put(W - 1 - x, H - 1 - y, '#');
    }
  }
  // A veces, un par de portales.
  if (rngFloat(rng) < 0.6) {
    for (let tries = 0; tries < 20; tries++) {
      const x = 2 + rngInt(rng, W - 4);
      const y = 2 + rngInt(rng, H - 4);
      const ox = W - 1 - x;
      const oy = H - 1 - y;
      if ((x === ox && y === oy) || reserved.has(y * W + x) || reserved.has(oy * W + ox)) continue;
      if (g[y][x] !== '.' || g[oy][ox] !== '.') continue;
      g[y][x] = '1';
      g[oy][ox] = '1';
      break;
    }
  }
  for (const s of SPAWNS) g[s.y][s.x] = s.c;
  return toMap(g);
}

export function generateDailyLevel(key) {
  const seed = dailySeed(key);
  const rng = createRng(seed ^ 0x9e3779b9);
  const reserved = reservedCells();
  let map = null;
  for (let attempt = 0; attempt < 40 && !map; attempt++) {
    const candidate = tryGenerate(rng, reserved);
    const board = parseBoard(candidate);
    if (reachableCount(board, board.spawns[0].cell) === freeCellCount(board)) map = candidate;
  }
  if (!map) {
    const g = emptyGrid();
    for (const s of SPAWNS) g[s.y][s.x] = s.c;
    map = toMap(g);
  }
  return {
    id: `diario-${key}`,
    name: 'mode.daily',
    tickMs: 120,
    rounds: 5,
    roundTicks: 460,
    fruitGoal: 8,
    map,
  };
}
