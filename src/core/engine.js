// Motor determinista basado en ticks. Sin DOM, sin Math.random, sin Date.
// `step(state, input)` avanza exactamente un tick. Con el mismo estado
// inicial y las mismas entradas, el resultado es siempre idéntico.

import { createRng, rngInt, rngFloat } from './rng.js';
import { stepCell, spawnBody } from './board.js';
import { echoHead, echoBody, advanceEchoClock, MOLT_CODE } from './echoes.js';

export const STATUS = { PLAYING: 'playing', DEAD: 'dead', CLEARED: 'cleared' };

/**
 * Crea el estado inicial de una ronda.
 * @param {object} o
 * @param {object} o.board   tablero ya parseado
 * @param {object} o.params  CONFIG + reglas de modo + ajustes del nivel
 * @param {number} o.seed    semilla de la ronda
 * @param {number} o.spawnIndex índice del punto de salida
 * @param {Array}  o.echoes  ecos de rondas anteriores (ver echoes.js)
 */
export function createRound({ board, params, seed, spawnIndex = 0, echoes = [] }) {
  const spawn = board.spawns[spawnIndex % board.spawns.length];
  const initial = spawnBody(board, spawn, params.startLength); // cola -> cabeza
  const s = {
    params,
    board,
    rng: createRng(seed),
    tick: 0,
    dir: spawn.dir,
    body: initial.slice().reverse(), // cabeza primero
    grow: 0,
    offset: initial.length - 1,
    history: initial.slice(),
    lens: [initial.length],
    fruit: -1,
    special: null,
    echoes: echoes.map((data) => ({ data, dissolved: false })),
    echoClock: 0,
    freezeLeft: 0,
    reverseLeft: 0,
    moltWalls: [],
    moltUsed: false,
    fruits: 0,
    score: 0,
    dissolved: 0,
    scrapes: 0,
    graceLeft: 0,
    status: STATUS.PLAYING,
    cause: null,
    inputs: [],
    events: [],
  };
  s.fruit = spawnItem(s);
  return s;
}

export function isValidTurn(s, dir) {
  if (dir == null || dir < 0 || dir > 3) return false;
  if (dir === s.dir) return false;
  return s.body.length === 1 || dir !== (s.dir + 2) % 4;
}

export function canMolt(s) {
  return s.params.molt && !s.moltUsed && s.status === STATUS.PLAYING &&
    s.body.length >= s.params.moltMinLength;
}

function echoesDangerous(s) {
  return s.tick > s.params.echoWarmupTicks;
}

function inMoltWall(s, cell) {
  for (const w of s.moltWalls) if (w.cells.includes(cell)) return true;
  return false;
}

// Elige una celda libre al azar (determinista) para una fruta.
function spawnItem(s) {
  const { board } = s;
  const n = board.w * board.h;
  const blocked = new Uint8Array(n);
  for (const c of s.body) blocked[c] = 1;
  for (const w of s.moltWalls) for (const c of w.cells) blocked[c] = 1;
  if (s.fruit >= 0) blocked[s.fruit] = 1;
  if (s.special) blocked[s.special.cell] = 1;
  const free = [];
  for (let i = 0; i < n; i++) {
    if (!board.walls[i] && board.portal[i] < 0 && !blocked[i]) free.push(i);
  }
  if (!free.length) return -1;
  return free[rngInt(s.rng, free.length)];
}

function die(s, cause) {
  s.status = STATUS.DEAD;
  s.cause = cause;
  s.events.push({ t: 'die', cause });
  return s;
}

/**
 * Avanza un tick.
 * @param {object} s estado (se muta)
 * @param {{dir:number|null, molt:boolean}|null} input
 */
export function step(s, input) {
  if (s.status !== STATUS.PLAYING) return s;
  const p = s.params;
  const board = s.board;
  s.events = [];

  // 1. Entrada: giro y muda (solo se graban las entradas aplicadas).
  if (input && isValidTurn(s, input.dir)) {
    s.dir = input.dir;
    s.inputs.push([s.tick, input.dir]);
  }
  if (input && input.molt && canMolt(s)) {
    const keep = Math.ceil(s.body.length / 2);
    const shed = s.body.splice(keep);
    s.moltWalls.push({ cells: shed, until: s.tick + p.moltWallTicks });
    s.moltUsed = true;
    s.inputs.push([s.tick, MOLT_CODE]);
    s.events.push({ t: 'molt', cells: shed });
  }
  if (s.graceLeft > 0) s.graceLeft--;

  // 2. Nueva cabeza (con portales).
  const oldHead = s.body[0];
  let head = stepCell(board, oldHead, s.dir);
  if (board.portal[head] >= 0) {
    s.events.push({ t: 'portal', from: head });
    head = board.portal[head];
  }

  // 3. Reloj de ecos y tiempo.
  const prevClock = s.echoClock;
  advanceEchoClock(s);
  s.tick++;
  const e = s.echoClock;

  // 4. Colisiones mortales.
  const willGrow = s.grow > 0;
  if (board.walls[head]) return die(s, 'wall');
  if (inMoltWall(s, head)) return die(s, 'molt');
  const selfLen = s.body.length - (willGrow ? 0 : 1);
  for (let i = 0; i < selfLen; i++) {
    if (s.body[i] === head) return die(s, 'self');
  }
  if (echoesDangerous(s)) {
    for (const echo of s.echoes) {
      if (echo.dissolved) continue;
      const eh = echoHead(echo.data, e);
      if (eh < 0) continue;
      const crossed = echoHead(echo.data, prevClock) === head && eh === oldHead;
      if (eh === head || crossed) return die(s, 'echo');
    }
  }

  // 5. Movimiento.
  s.body.unshift(head);
  if (willGrow) s.grow--;
  else s.body.pop();

  // 6. Roce con el cuerpo de un eco: pierdes un segmento.
  if (echoesDangerous(s) && s.graceLeft === 0) {
    for (const echo of s.echoes) {
      if (echo.dissolved) continue;
      const body = echoBody(echo.data, e);
      if (body.indexOf(head, 1) > 0) {
        if (s.body.length <= p.minLength) return die(s, 'scrape');
        s.body.pop();
        s.scrapes++;
        s.graceLeft = p.echoScrapeGraceTicks;
        s.events.push({ t: 'scrape', cell: head });
        break;
      }
    }
  }

  // 7. Frutas.
  if (head === s.fruit) {
    s.grow++;
    s.fruits++;
    s.score += p.score.fruit;
    s.events.push({ t: 'eat', cell: head });
    s.fruit = -1;
    s.fruit = spawnItem(s);
    if (p.specials && !s.special && s.echoes.length && rngFloat(s.rng) < p.specialChance) {
      const kind = rngFloat(s.rng) < 0.5 ? 'freeze' : 'reverse';
      const cell = spawnItem(s);
      if (cell >= 0) {
        s.special = { cell, kind, until: s.tick + p.specialTicks };
        s.events.push({ t: 'specialSpawn', kind });
      }
    }
  }
  if (s.special) {
    if (head === s.special.cell) {
      if (s.special.kind === 'freeze') s.freezeLeft = p.freezeTicks;
      else s.reverseLeft = p.reverseTicks;
      s.score += p.score.special;
      s.events.push({ t: s.special.kind, cell: head });
      s.special = null;
    } else if (s.tick >= s.special.until) {
      s.special = null;
    }
  }

  // 8. Ecos contra paredes de muda: el eco se disuelve.
  if (s.moltWalls.length) {
    for (const echo of s.echoes) {
      if (echo.dissolved) continue;
      const eh = echoHead(echo.data, e);
      if (eh >= 0 && inMoltWall(s, eh)) {
        echo.dissolved = true;
        s.dissolved++;
        s.score += p.score.dissolve;
        s.events.push({ t: 'dissolve', cell: eh, round: echo.data.round });
      }
    }
    s.moltWalls = s.moltWalls.filter((w) => w.until > s.tick);
  }

  // 9. Grabación del recorrido (esto es lo que se convierte en eco).
  s.history.push(head);
  s.lens.push(s.body.length);

  // 10. Fin de ronda.
  if (s.fruits >= p.fruitGoal || s.tick >= p.roundTicks) {
    s.status = STATUS.CLEARED;
    s.score += p.score.roundClear;
    s.events.push({ t: 'clear' });
  }
  return s;
}

// Huella del estado para comparar partidas (FNV-1a sobre los campos lógicos).
export function stateHash(s) {
  const parts = [
    s.tick, s.dir, s.grow, s.rng.s, s.fruit, s.score, s.fruits, s.dissolved,
    s.scrapes, s.echoClock, s.freezeLeft, s.reverseLeft, s.moltUsed ? 1 : 0,
    s.status, s.special ? `${s.special.cell}:${s.special.kind}:${s.special.until}` : '-',
    s.body.join(','), s.moltWalls.map((w) => w.cells.join(',') + '@' + w.until).join('|'),
    s.echoes.map((x) => (x.dissolved ? 1 : 0)).join(''),
  ];
  const str = parts.join(';');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
