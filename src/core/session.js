// Sesión = un nivel completo (varias rondas). Encadena rondas y convierte
// cada ronda superada en un eco para las siguientes.

import { CONFIG, MODE_RULES } from '../config.js';
import { parseBoard } from './board.js';
import { hashInts } from './rng.js';
import { createRound, step, stateHash, STATUS } from './engine.js';
import { makeEcho, inputsFromRecording } from './echoes.js';

// Combina CONFIG + reglas del modo + ajustes propios del nivel.
export function buildParams(mode, level) {
  const rules = MODE_RULES[mode];
  if (!rules) throw new Error(`Modo desconocido: ${mode}`);
  const params = { ...CONFIG, ...(level.params || {}), ...rules };
  // En campaña/diario el nivel manda sobre rondas, duración y meta.
  if (mode !== 'classic') {
    for (const k of ['rounds', 'roundTicks', 'fruitGoal']) {
      if (level[k] != null) params[k] = level[k];
    }
  }
  params.tickMs = level.tickMs || CONFIG.tickMs;
  return params;
}

export function createSession({ mode, level, seed }) {
  const params = buildParams(mode, level);
  return {
    mode,
    level,
    seed: seed >>> 0,
    params,
    board: parseBoard(level.map),
    echoes: [],
    rounds: [],        // resultados por ronda
    roundIndex: 0,
    status: 'playing', // 'playing' | 'won' | 'lost'
  };
}

export function roundSeed(session, index) {
  return hashInts(session.seed, index + 1);
}

export function startRound(session) {
  const i = session.roundIndex;
  return createRound({
    board: session.board,
    params: session.params,
    seed: roundSeed(session, i),
    spawnIndex: i,
    echoes: session.params.echoes ? session.echoes : [],
  });
}

// Registra el resultado de la ronda y prepara la siguiente.
export function finishRound(session, state) {
  const cleared = state.status === STATUS.CLEARED;
  session.rounds.push({
    index: session.roundIndex,
    cleared,
    cause: state.cause,
    score: state.score,
    fruits: state.fruits,
    dissolved: state.dissolved,
    ticks: state.tick,
    inputs: state.inputs.slice(),
    hash: stateHash(state),
  });
  if (!cleared) {
    session.status = 'lost';
    return session;
  }
  if (session.params.echoes) session.echoes.push(makeEcho(state, session.roundIndex));
  session.roundIndex++;
  if (session.roundIndex >= session.params.rounds) session.status = 'won';
  return session;
}

export function sessionTotals(session) {
  const sc = session.params.score;
  const base = session.rounds.reduce((a, r) => a + r.score, 0);
  const survived = session.rounds.filter((r) => r.cleared).length;
  const dissolved = session.rounds.reduce((a, r) => a + r.dissolved, 0);
  const multiplier = session.mode === 'classic'
    ? 1
    : 1 + survived * sc.multPerRound + dissolved * sc.multPerDissolve;
  return {
    base,
    survived,
    dissolved,
    multiplier,
    total: Math.round(base * multiplier),
    fruits: session.rounds.reduce((a, r) => a + r.fruits, 0),
  };
}

/**
 * Reproduce una sesión completa a partir SOLO de las entradas grabadas.
 * Los ecos se regeneran al vuelo: la ronda N usa los ecos que salen de
 * reproducir las rondas 0..N-1. Devuelve la sesión resultante.
 */
export function replaySession({ mode, level, seed, recordings, maxTicks = 100000 }) {
  const session = createSession({ mode, level, seed });
  for (const rec of recordings) {
    if (session.status !== 'playing') break;
    const state = startRound(session);
    const inputAt = inputsFromRecording(rec);
    let guard = 0;
    while (state.status === STATUS.PLAYING && guard++ < maxTicks) {
      step(state, inputAt(state.tick));
    }
    finishRound(session, state);
  }
  return session;
}
