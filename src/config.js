// Parámetros de balance. Todo lo que afecta a la simulación se mide en TICKS,
// nunca en milisegundos, para que la grabación/reproducción sea exacta.
// Cambiar estos valores invalida las grabaciones guardadas (ver CLAUDE.md).

export const CONFIG = {
  // Serpiente
  startLength: 4,
  minLength: 1,             // con 1 segmento, otro roce con un eco = muerte

  // Rondas (valores por defecto; cada nivel puede sobrescribirlos)
  rounds: 5,
  roundTicks: 520,          // duración máxima de una ronda
  fruitGoal: 10,            // frutas para terminar la ronda antes de tiempo
  tickMs: 120,              // velocidad de reloj (solo presentación, no lógica)

  // Ecos
  echoWarmupTicks: 10,      // al inicio de la ronda los ecos no colisionan
  echoScrapeGraceTicks: 4,  // tras perder un segmento, inmunidad a roces
  echoPreviewTicks: 5,      // celdas de "futuro" del eco que se dibujan

  // Muda
  moltMinLength: 4,         // longitud mínima para poder mudar
  moltWallTicks: 70,        // vida de la pared de muda

  // Frutas especiales
  specialChance: 0.22,      // probabilidad al comer una fruta normal
  specialTicks: 75,         // tiempo que la especial permanece en el tablero
  freezeTicks: 25,          // ~3 s a 120 ms/tick
  reverseTicks: 25,

  // Puntaje
  score: {
    fruit: 10,
    special: 25,
    dissolve: 60,
    roundClear: 40,
    multPerRound: 0.25,     // +0.25x por ronda sobrevivida
    multPerDissolve: 0.5,   // +0.5x por eco disuelto
  },
};

// Reglas por modo. Se combinan con los valores del nivel.
export const MODE_RULES = {
  campaign: { echoes: true, molt: true, specials: true },
  daily: { echoes: true, molt: true, specials: true },
  classic: {
    echoes: false, molt: false, specials: false,
    rounds: 1, roundTicks: Infinity, fruitGoal: Infinity,
  },
};
