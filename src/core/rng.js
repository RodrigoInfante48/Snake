// Generador aleatorio con semilla (mulberry32). El estado es un único entero
// de 32 bits guardado dentro del estado del juego, así se puede serializar
// y comparar en los tests.

export function hashString(str) {
  // FNV-1a de 32 bits
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hashInts(...nums) {
  let h = 0x811c9dc5;
  for (const n of nums) {
    let v = n | 0;
    for (let i = 0; i < 4; i++) {
      h ^= v & 0xff;
      h = Math.imul(h, 0x01000193);
      v >>>= 8;
    }
  }
  return h >>> 0;
}

export function createRng(seed) {
  return { s: seed >>> 0 };
}

// Número en [0, 1)
export function rngFloat(rng) {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Entero en [0, n)
export function rngInt(rng, n) {
  return Math.floor(rngFloat(rng) * n);
}
