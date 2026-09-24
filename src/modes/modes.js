// Cómo arranca cada modo: qué nivel y qué semilla usa.
// La lógica de reglas vive en config.js (MODE_RULES) y core/session.js.

import { LEVELS, CLASSIC_LEVEL } from '../levels/levels.js';
import { hashString } from '../core/rng.js';
import { dateKey, dailySeed, generateDailyLevel } from './daily.js';

export function campaignSetup(levelIndex) {
  const level = LEVELS[levelIndex];
  // Semilla fija por nivel: las frutas caen igual en cada intento,
  // así puedes aprender el nivel y planear la muda.
  return { mode: 'campaign', level, levelIndex, seed: hashString(`campaign-${level.id}`) };
}

export function dailySetup(date = new Date()) {
  const key = dateKey(date);
  return { mode: 'daily', level: generateDailyLevel(key), seed: dailySeed(key), dateKey: key };
}

export function classicSetup() {
  // El clásico no se comparte: una semilla distinta por partida.
  return { mode: 'classic', level: CLASSIC_LEVEL, seed: (Date.now() ^ 0x5bd1e995) >>> 0 };
}
