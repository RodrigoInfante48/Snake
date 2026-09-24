// Récords y progreso en localStorage. Todo va envuelto en try/catch:
// en modo privado o con almacenamiento bloqueado el juego sigue funcionando
// (simplemente no recuerda nada).

const KEY = 'ecos.v1';

const DEFAULTS = {
  muted: false,
  unlocked: 1,          // niveles de campaña desbloqueados
  best: {},             // levelId -> mejor puntaje
  classicBest: 0,
  daily: {},            // 'AAAA-MM-DD' -> { total, rounds, dissolved, grid }
};

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // sin almacenamiento: ignorar
  }
}

export const storage = {
  get(key) {
    return load()[key];
  },
  set(key, value) {
    load()[key] = value;
    save();
  },
  // Guarda el récord si lo supera. Devuelve true si es nuevo récord.
  recordBest(levelId, score) {
    const data = load();
    if (score <= (data.best[levelId] || 0)) return false;
    data.best = { ...data.best, [levelId]: score };
    save();
    return true;
  },
  unlock(count) {
    const data = load();
    if (count > data.unlocked) {
      data.unlocked = count;
      save();
    }
  },
};
