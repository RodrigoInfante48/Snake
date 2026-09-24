// Entrada: teclado y swipe -> cola de giros (buffer) + petición de muda.
// El bucle de juego consume como máximo un giro por tick, así dos giros
// rápidos (p. ej. arriba+izquierda para dar la vuelta) no se pierden.

import { DIR } from '../core/board.js';

const KEYS = {
  ArrowUp: DIR.UP, KeyW: DIR.UP,
  ArrowRight: DIR.RIGHT, KeyD: DIR.RIGHT,
  ArrowDown: DIR.DOWN, KeyS: DIR.DOWN,
  ArrowLeft: DIR.LEFT, KeyA: DIR.LEFT,
};
const BUFFER_SIZE = 3;
const SWIPE_MIN = 22;        // px
const DOUBLE_TAP_MS = 280;

export class Input {
  constructor(target, handlers = {}) {
    this.queue = [];
    this.moltRequested = false;
    this.handlers = handlers; // { onPause, onAny, onMolt }
    this.enabled = false;
    this._touch = null;
    this._lastTap = 0;

    window.addEventListener('keydown', (e) => this._onKey(e));
    target.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
    target.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    target.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: false });
  }

  clear() {
    this.queue.length = 0;
    this.moltRequested = false;
  }

  pushDir(dir) {
    if (!this.enabled) return;
    const last = this.queue.length ? this.queue[this.queue.length - 1] : null;
    if (last === dir) return;
    if (this.queue.length >= BUFFER_SIZE) this.queue.shift();
    this.queue.push(dir);
  }

  requestMolt() {
    if (!this.enabled) return;
    this.moltRequested = true;
    this.handlers.onMolt?.();
  }

  // Devuelve la entrada para el próximo tick. `isValid(dir)` descarta giros
  // imposibles (reversa o misma dirección) sin gastar un tick.
  next(isValid) {
    let dir = null;
    while (this.queue.length) {
      const d = this.queue.shift();
      if (isValid(d)) { dir = d; break; }
    }
    const molt = this.moltRequested;
    this.moltRequested = false;
    return dir === null && !molt ? null : { dir, molt };
  }

  _onKey(e) {
    if (e.repeat && !(e.code in KEYS)) return;
    const h = this.handlers;
    if (e.code === 'KeyP' || e.code === 'Escape') {
      h.onPause?.();
      e.preventDefault();
      return;
    }
    if (h.onAny?.(e)) {
      e.preventDefault();
      return;
    }
    if (e.code in KEYS) {
      this.pushDir(KEYS[e.code]);
      e.preventDefault();
    } else if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.requestMolt();
      e.preventDefault();
    }
  }

  _onTouchStart(e) {
    if (e.target.closest('.overlay, button')) return;
    const t = e.changedTouches[0];
    this._touch = { x: t.clientX, y: t.clientY, moved: false };
    e.preventDefault();
  }

  // Swipe continuo: cada vez que el dedo recorre SWIPE_MIN px se registra
  // un giro y se reinicia el origen. Permite encadenar giros sin levantar.
  _onTouchMove(e) {
    if (!this._touch) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - this._touch.x;
    const dy = t.clientY - this._touch.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
    const dir = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? DIR.RIGHT : DIR.LEFT)
      : (dy > 0 ? DIR.DOWN : DIR.UP);
    this.pushDir(dir);
    this._touch = { x: t.clientX, y: t.clientY, moved: true };
    e.preventDefault();
  }

  _onTouchEnd(e) {
    if (!this._touch) return;
    const touch = this._touch;
    this._touch = null;
    e.preventDefault();
    if (touch.moved) return;
    if (this.handlers.onAny?.(e)) return;
    const now = performance.now();
    if (now - this._lastTap < DOUBLE_TAP_MS) {
      this.requestMolt();
      this._lastTap = 0;
    } else {
      this._lastTap = now;
    }
  }
}
