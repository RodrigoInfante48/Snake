// Tablero: paredes, portales y puntos de salida a partir de un mapa ASCII.
//
// Leyenda del mapa (ver CLAUDE.md > Formato de niveles):
//   #          pared
//   .          vacío
//   > < ^ v    punto de salida con su dirección inicial (en orden de lectura)
//   1..9       portal; cada dígito aparece exactamente dos veces
//
// Las posiciones se representan como un entero: idx = y * w + x.
// Los bordes del tablero dan la vuelta (wrap); para tener bordes sólidos
// se dibujan paredes '#' en el mapa.

export const DIR = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 };
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
const SPAWN_CHARS = { '^': 0, '>': 1, 'v': 2, '<': 3 };

export function parseBoard(map) {
  const h = map.length;
  const w = map[0].length;
  const walls = new Uint8Array(w * h);
  const portal = new Int32Array(w * h).fill(-1);
  const portalCells = [];
  const pending = {};
  const spawns = [];

  for (let y = 0; y < h; y++) {
    const row = map[y];
    if (row.length !== w) {
      throw new Error(`Fila ${y} mide ${row.length}, se esperaba ${w}`);
    }
    for (let x = 0; x < w; x++) {
      const c = row[x];
      const i = y * w + x;
      if (c === '#') walls[i] = 1;
      else if (c in SPAWN_CHARS) spawns.push({ cell: i, dir: SPAWN_CHARS[c] });
      else if (c >= '1' && c <= '9') {
        if (pending[c] === undefined) pending[c] = i;
        else {
          const j = pending[c];
          portal[i] = j;
          portal[j] = i;
          portalCells.push({ a: j, b: i, id: Number(c) });
          delete pending[c];
        }
      } else if (c !== '.' && c !== ' ') {
        throw new Error(`Carácter desconocido '${c}' en (${x},${y})`);
      }
    }
  }
  const unpaired = Object.keys(pending);
  if (unpaired.length) throw new Error(`Portal sin pareja: ${unpaired.join(',')}`);
  if (!spawns.length) throw new Error('El mapa necesita al menos un punto de salida');

  return { w, h, walls, portal, portalCells, spawns };
}

// Paso de una celda en una dirección, con vuelta en los bordes.
export function stepCell(board, cell, dir) {
  const { w, h } = board;
  const x = (cell % w + DX[dir] + w) % w;
  const y = ((cell / w | 0) + DY[dir] + h) % h;
  return y * w + x;
}

// Cuerpo inicial: la cabeza en la salida y el resto hacia atrás.
// Devuelve las celdas de la cola a la cabeza (orden de historial).
export function spawnBody(board, spawn, length) {
  const back = (spawn.dir + 2) % 4;
  const cells = [spawn.cell];
  for (let k = 1; k < length; k++) cells.push(stepCell(board, cells[k - 1], back));
  return cells.reverse();
}

// Cantidad de celdas libres alcanzables desde `from` (sin contar portales).
export function reachableCount(board, from) {
  const seen = new Uint8Array(board.w * board.h);
  const stack = [from];
  seen[from] = 1;
  let n = 0;
  while (stack.length) {
    const c = stack.pop();
    n++;
    for (let d = 0; d < 4; d++) {
      let nc = stepCell(board, c, d);
      if (board.walls[nc] || seen[nc]) continue;
      seen[nc] = 1;
      stack.push(nc);
      const p = board.portal[nc];
      if (p >= 0 && !seen[p]) { seen[p] = 1; stack.push(p); }
    }
  }
  return n;
}

export function freeCellCount(board) {
  let n = 0;
  for (let i = 0; i < board.walls.length; i++) if (!board.walls[i]) n++;
  return n;
}
