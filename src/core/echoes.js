// Ecos: grabación de una ronda y su reproducción en rondas posteriores.
//
// Invariante clave: el cuerpo de la serpiente SIEMPRE es un sufijo de su
// historial de cabezas (crecer, mudar y perder segmentos solo recortan o
// alargan por la cola). Por eso basta con guardar, por tick, la posición de
// la cabeza y la longitud para reconstruir el cuerpo completo:
//
//   cabeza(e)  = history[offset + e]
//   cuerpo(e)  = history[offset + e - k]  para k = 0 .. lens[e] - 1
//
// `offset` es la longitud inicial - 1 (el cuerpo inicial va al principio
// del historial, de la cola a la cabeza).

export function makeEcho(state, round) {
  return {
    round,
    history: state.history.slice(),
    lens: state.lens.slice(),
    offset: state.offset,
    lastTick: state.tick,
  };
}

// Posición de la cabeza del eco en el tiempo de eco `e`, o -1 si no existe.
export function echoHead(echo, e) {
  if (e < 0 || e > echo.lastTick) return -1;
  return echo.history[echo.offset + e];
}

// Celdas del cuerpo (cabeza primero) en el tiempo de eco `e`.
export function echoBody(echo, e) {
  if (e < 0 || e > echo.lastTick) return [];
  const top = echo.offset + e;
  const len = echo.lens[e];
  const out = new Array(len);
  for (let k = 0; k < len; k++) out[k] = echo.history[top - k];
  return out;
}

// Avanza el reloj compartido de los ecos (congelar > invertir > normal).
export function advanceEchoClock(state) {
  if (state.freezeLeft > 0) {
    state.freezeLeft--;
  } else if (state.reverseLeft > 0) {
    state.reverseLeft--;
    if (state.echoClock > 0) state.echoClock--;
  } else {
    state.echoClock++;
  }
}

// Reconstruye las entradas por tick a partir de la grabación compacta.
// Formato de grabación: lista de [tick, código] con código 0..3 = dirección
// y 4 = muda. Devuelve una función tick -> {dir, molt}.
export const MOLT_CODE = 4;

export function inputsFromRecording(recording) {
  const byTick = new Map();
  for (const [tick, code] of recording) {
    let inp = byTick.get(tick);
    if (!inp) { inp = { dir: null, molt: false }; byTick.set(tick, inp); }
    if (code === MOLT_CODE) inp.molt = true;
    else inp.dir = code;
  }
  return (tick) => byTick.get(tick) || null;
}
