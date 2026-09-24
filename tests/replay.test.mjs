// Tests del núcleo determinista. Ejecutar con: node --test
//
// El test principal juega un nivel completo con un bot, graba SOLO las
// entradas y luego reproduce la partida desde cero comprobando que:
//   - cada ronda termina con la misma huella de estado (stateHash),
//   - cada eco recorre exactamente las mismas celdas que jugó el bot.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRng, rngFloat, rngInt, hashString } from '../src/core/rng.js';
import { parseBoard, spawnBody, stepCell, reachableCount, freeCellCount } from '../src/core/board.js';
import { step, stateHash, STATUS, isValidTurn, createRound } from '../src/core/engine.js';
import { CONFIG, MODE_RULES } from '../src/config.js';
import { echoHead, echoBody, advanceEchoClock } from '../src/core/echoes.js';
import {
  createSession, startRound, finishRound, replaySession, sessionTotals,
} from '../src/core/session.js';
import { LEVELS, CLASSIC_LEVEL } from '../src/levels/levels.js';
import { generateDailyLevel, dailyNumber } from '../src/modes/daily.js';

// ---------------------------------------------------------------- bot ----

// Bot sencillo y determinista: evita peligros inmediatos, persigue la fruta,
// usa la muda a veces y tiene algo de ruido con su propio RNG.
function makeBot(seed) {
  const rng = createRng(seed);
  return function decide(s) {
    const b = s.board;
    const danger = new Set();
    for (const c of s.body.slice(0, -1)) danger.add(c);
    for (const w of s.moltWalls) for (const c of w.cells) danger.add(c);
    for (const e of s.echoes) {
      if (e.dissolved) continue;
      for (const c of echoBody(e.data, s.echoClock + 1)) danger.add(c);
      for (const c of echoBody(e.data, s.echoClock)) danger.add(c);
    }
    const fx = s.fruit % b.w;
    const fy = (s.fruit / b.w) | 0;
    let best = null;
    let bestScore = -Infinity;
    for (let d = 0; d < 4; d++) {
      if (d !== s.dir && !isValidTurn(s, d)) continue;
      let c = stepCell(b, s.body[0], d);
      if (b.portal[c] >= 0) c = b.portal[c];
      if (b.walls[c] || danger.has(c)) continue;
      const x = c % b.w;
      const y = (c / b.w) | 0;
      let score = -(Math.abs(x - fx) + Math.abs(y - fy));
      // mirar un paso más para no meterse en callejones
      let exits = 0;
      for (let d2 = 0; d2 < 4; d2++) {
        const c2 = stepCell(b, c, d2);
        if (!b.walls[c2] && !danger.has(c2)) exits++;
      }
      score += exits * 2 + rngFloat(rng) * 3;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    const molt = s.tick > 40 && s.body.length >= 6 && rngInt(rng, 60) === 0;
    return { dir: best === s.dir ? null : best, molt };
  };
}

// Juega una sesión entera "en vivo", guardando por separado la posición
// real de la cabeza en cada tick para verificar los ecos después.
function playSession(mode, level, seed, botSeed) {
  const session = createSession({ mode, level, seed });
  const bot = makeBot(botSeed);
  const liveHeads = [];
  while (session.status === 'playing') {
    const s = startRound(session);
    const heads = [s.body[0]];
    while (s.status === STATUS.PLAYING && s.tick < 5000) {
      step(s, bot(s));
      if (s.status !== STATUS.DEAD) heads.push(s.body[0]);
      // Invariante: el cuerpo es siempre un sufijo del historial.
      const top = s.history.length - 1;
      for (let k = 0; k < s.body.length && s.status !== STATUS.DEAD; k++) {
        assert.equal(s.body[k], s.history[top - k], 'cuerpo != sufijo del historial');
      }
    }
    liveHeads.push(heads);
    finishRound(session, s);
  }
  return { session, liveHeads };
}

// -------------------------------------------------------------- tests ----

test('RNG con semilla es determinista', () => {
  const a = createRng(1234);
  const b = createRng(1234);
  for (let i = 0; i < 1000; i++) assert.equal(rngFloat(a), rngFloat(b));
  assert.notEqual(rngFloat(createRng(1)), rngFloat(createRng(2)));
});

test('todos los niveles son válidos', () => {
  for (const level of [...LEVELS, CLASSIC_LEVEL]) {
    const b = parseBoard(level.map);
    assert.equal(reachableCount(b, b.spawns[0].cell), freeCellCount(b), `${level.id}: zonas aisladas`);
    for (const sp of b.spawns) {
      for (const c of spawnBody(b, sp, 4)) {
        assert.ok(!b.walls[c] && b.portal[c] < 0, `${level.id}: salida bloqueada`);
      }
      let c = sp.cell;
      for (let k = 0; k < 4; k++) {
        c = stepCell(b, c, sp.dir);
        assert.ok(!b.walls[c], `${level.id}: salida mirando a una pared`);
      }
    }
  }
});

test('reto diario: misma fecha => mismo tablero, y es válido', () => {
  for (const key of ['2026-09-24', '2026-12-31', '2027-02-14']) {
    const a = generateDailyLevel(key);
    const b = generateDailyLevel(key);
    assert.deepEqual(a.map, b.map);
    const board = parseBoard(a.map);
    assert.equal(reachableCount(board, board.spawns[0].cell), freeCellCount(board));
  }
  assert.notDeepEqual(generateDailyLevel('2026-09-24').map, generateDailyLevel('2026-09-25').map);
  assert.equal(dailyNumber('2026-01-01'), 1);
});

test('reloj de ecos: congelar e invertir', () => {
  const s = { echoClock: 10, freezeLeft: 2, reverseLeft: 3 };
  advanceEchoClock(s); advanceEchoClock(s);
  assert.equal(s.echoClock, 10, 'congelado no avanza');
  advanceEchoClock(s); advanceEchoClock(s); advanceEchoClock(s);
  assert.equal(s.echoClock, 7, 'invertido retrocede');
  advanceEchoClock(s);
  assert.equal(s.echoClock, 8, 'vuelve a avanzar');
});

test('grabar y reproducir: estado final y ecos idénticos', () => {
  let checkedEchoRounds = 0;
  // Varias semillas de bot y varios niveles para cubrir portales, muda, etc.
  const cases = [
    ['campaign', LEVELS[0], 11],
    ['campaign', LEVELS[3], 22],
    ['campaign', LEVELS[5], 33],
    ['daily', generateDailyLevel('2026-09-24'), 44],
    ['classic', CLASSIC_LEVEL, 55],
  ];
  for (const [mode, level, botSeed] of cases) {
    const seed = hashString(`test-${level.id}`);
    const { session, liveHeads } = playSession(mode, level, seed, botSeed);
    assert.ok(session.rounds.length >= 1);

    // Reproducir solo con las entradas grabadas.
    const replay = replaySession({
      mode, level, seed, maxTicks: 5000, recordings: session.rounds.map((r) => r.inputs),
    });
    assert.equal(replay.rounds.length, session.rounds.length, `${level.id}: nº de rondas`);
    session.rounds.forEach((r, i) => {
      assert.equal(replay.rounds[i].hash, r.hash, `${level.id} ronda ${i}: huella distinta`);
      assert.equal(replay.rounds[i].score, r.score);
    });
    assert.deepEqual(sessionTotals(replay), sessionTotals(session));

    // Cada eco pasa exactamente por donde pasó la cabeza en vivo.
    session.echoes.forEach((echo, i) => {
      const heads = liveHeads[i];
      assert.equal(echo.lastTick + 1, heads.length);
      for (let t = 0; t <= echo.lastTick; t++) {
        assert.equal(echoHead(echo, t), heads[t], `${level.id} eco ${i} tick ${t}`);
      }
      assert.deepEqual(echo.history, replay.echoes[i].history);
      assert.deepEqual(echo.lens, replay.echoes[i].lens);
      checkedEchoRounds++;
    });
  }
  assert.ok(checkedEchoRounds >= 3, `pocos ecos verificados (${checkedEchoRounds})`);
});

test('la reproducción detecta una entrada alterada', () => {
  const level = LEVELS[0];
  const seed = 99;
  const { session } = playSession('campaign', level, seed, 7);
  const recs = session.rounds.map((r) => r.inputs.map((x) => x.slice()));
  const first = recs[0].find(([, code]) => code < 4);
  assert.ok(first, 'el bot debería haber girado');
  first[0] += 1; // girar un tick más tarde
  const replay = replaySession({ mode: 'campaign', level, seed, recordings: recs });
  assert.notEqual(replay.rounds[0].hash, session.rounds[0].hash);
});

test('muda: suelta la mitad de la cola y deja una pared temporal', () => {
  const session = createSession({ mode: 'campaign', level: LEVELS[0], seed: 5 });
  const s = startRound(session);
  s.body.push(...Array(6).fill(s.body.at(-1))); // longitud artificial 10
  const len = s.body.length;
  step(s, { dir: null, molt: true });
  assert.equal(s.body.length, Math.ceil(len / 2));
  assert.equal(s.moltWalls.length, 1);
  assert.equal(s.moltUsed, true);
  step(s, { dir: null, molt: true });
  assert.equal(s.moltWalls.length, 1, 'solo una muda por ronda');
  assert.equal(typeof stateHash(s), 'string');
});

// ------------------------------------------ colisiones con ecos (casos dirigidos)

// Tablero abierto 20x20; la salida del clásico está en (5,10) mirando a la derecha.
function roundWithEcho(historyFn, extra = {}) {
  const board = parseBoard(CLASSIC_LEVEL.map);
  const params = { ...CONFIG, ...MODE_RULES.campaign, echoWarmupTicks: 0, ...extra };
  const history = [];
  for (let i = 0; i < 40; i++) history.push(historyFn(i, board.w));
  const echo = { round: 0, history, lens: Array(37).fill(4), offset: 3, lastTick: 36 };
  return createRound({ board, params, seed: 1, echoes: [echo] });
}
const at = (x, y, w) => y * w + x;

test('cruzar el cuerpo de un eco quita un segmento', () => {
  // Eco subiendo por x=12; en el tick 7 su cuerpo ocupa (12,10).
  const s = roundWithEcho((i, w) => at(12, (19 - i + 20) % 20, w));
  for (let t = 0; t < 7; t++) step(s, null);
  assert.equal(s.status, STATUS.PLAYING);
  assert.equal(s.scrapes, 1);
  assert.equal(s.body.length, 3);
});

test('chocar con la cabeza de un eco es derrota', () => {
  // Cabeza del eco en (12,10) justo en el tick 7.
  const s = roundWithEcho((i, w) => at(12, (20 - i + 20) % 20, w));
  for (let t = 0; t < 7; t++) step(s, null);
  assert.equal(s.status, STATUS.DEAD);
  assert.equal(s.cause, 'echo');
});

test('un eco que toca la pared de muda se disuelve', () => {
  // Muda en el tick 0: la cola (2,10),(3,10) queda como pared.
  // Eco bajando por x=3: su cabeza llega a (3,10) en el tick 7.
  const s = roundWithEcho((i, w) => at(3, i, w));
  step(s, { dir: null, molt: true });
  for (let t = 1; t < 8; t++) step(s, null);
  assert.equal(s.dissolved, 1);
  assert.equal(s.echoes[0].dissolved, true);
  assert.equal(s.score, CONFIG.score.dissolve);
});

test('congelar detiene a los ecos', () => {
  const s = roundWithEcho((i, w) => at(15, i % 20, w));
  step(s, null);
  s.freezeLeft = 3;
  const clock = s.echoClock;
  step(s, null); step(s, null); step(s, null);
  assert.equal(s.echoClock, clock);
  step(s, null);
  assert.equal(s.echoClock, clock + 1);
});
