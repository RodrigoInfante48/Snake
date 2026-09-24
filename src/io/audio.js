// Sonidos sintetizados con Web Audio API (sin archivos de audio).
// El contexto se crea en el primer gesto del usuario (requisito de los navegadores).

let ctx = null;
let master = null;
let muted = false;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.35;
  master.connect(ctx.destination);
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = muted ? 0 : 0.35;
}

function tone(freq, dur, { type = 'sine', vol = 0.5, slideTo = null, delay = 0 } = {}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur, { vol = 0.3, freq = 1200, delay = 0 } = {}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
}

const SOUNDS = {
  eat: () => { tone(520, 0.08, { type: 'square', vol: 0.18 }); tone(780, 0.1, { type: 'square', vol: 0.15, delay: 0.05 }); },
  specialSpawn: () => tone(1200, 0.25, { type: 'sine', vol: 0.12, slideTo: 1800 }),
  freeze: () => [880, 1320, 1760].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.2, delay: i * 0.06 })),
  reverse: () => tone(1400, 0.4, { type: 'sawtooth', vol: 0.12, slideTo: 200 }),
  scrape: () => noise(0.18, { vol: 0.5, freq: 900 }),
  molt: () => { tone(300, 0.3, { type: 'sawtooth', vol: 0.15, slideTo: 90 }); noise(0.2, { vol: 0.2, freq: 400 }); },
  dissolve: () => [660, 990, 1320, 1980].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.18, delay: i * 0.05 })),
  portal: () => tone(400, 0.15, { type: 'sine', vol: 0.15, slideTo: 1200 }),
  die: () => { tone(220, 0.6, { type: 'sawtooth', vol: 0.25, slideTo: 40 }); noise(0.4, { vol: 0.3, freq: 300 }); },
  clear: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.2, delay: i * 0.08 })),
  start: () => tone(440, 0.12, { type: 'square', vol: 0.12 }),
  click: () => tone(660, 0.05, { type: 'square', vol: 0.08 }),
};

export function play(name) {
  const fn = SOUNDS[name];
  if (fn) {
    try { fn(); } catch { /* audio no disponible */ }
  }
}
