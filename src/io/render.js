// Render con Canvas 2D. Solo LEE el estado del juego; nunca lo modifica.
// Estética neón: jugador cian, ecos magenta/violeta translúcidos,
// muda ámbar, frutas lima. Las animaciones usan tiempo real (solo visual).

import { echoBody } from '../core/echoes.js';

export const COLORS = {
  bg: '#07060f',
  grid: 'rgba(120, 110, 255, 0.07)',
  wall: '#17143a',
  wallEdge: '#5a4cff',
  player: '#2ff3ff',
  playerHead: '#e6feff',
  echoes: ['#ff3fd2', '#b44dff', '#ff5d8f', '#8a5bff', '#ff7bf0', '#d05bff'],
  frozen: '#9fe8ff',
  molt: '#ffb23e',
  fruit: '#b4ff3e',
  freeze: '#8fe9ff',
  reverse: '#ffd23e',
  portals: ['#39ff9e', '#ffe03e', '#ff8a3e', '#3ea8ff'],
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cell = 16;
    this.board = null;
    this.particles = [];
    this.flashColor = null;
    this.flashUntil = 0;
    this.shakeUntil = 0;
  }

  // Ajusta el tamaño del canvas al espacio disponible (nítido en HiDPI).
  fit(board, availW, availH) {
    this.board = board;
    const cell = Math.max(6, Math.floor(Math.min(availW / board.w, availH / board.h)));
    this.cell = cell;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = cell * board.w;
    const h = cell * board.h;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  xy(cell) {
    const w = this.board.w;
    return [(cell % w) * this.cell, ((cell / w) | 0) * this.cell];
  }

  flash(color, ms = 180) {
    this.flashColor = color;
    this.flashUntil = performance.now() + ms;
  }

  shake(ms = 250) {
    this.shakeUntil = performance.now() + ms;
  }

  burst(cell, color, n = 12) {
    if (!this.board) return;
    const [x, y] = this.xy(cell);
    const c = this.cell;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const sp = (0.04 + Math.random() * 0.08) * c;
      this.particles.push({
        x: x + c / 2, y: y + c / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1, color,
      });
    }
  }

  // Reacciona a los eventos del tick (solo efectos visuales).
  onEvents(events) {
    for (const ev of events) {
      if (ev.t === 'eat') this.burst(ev.cell, COLORS.fruit, 10);
      else if (ev.t === 'freeze') { this.burst(ev.cell, COLORS.freeze, 18); this.flash('rgba(143,233,255,0.18)'); }
      else if (ev.t === 'reverse') { this.burst(ev.cell, COLORS.reverse, 18); this.flash('rgba(255,210,62,0.15)'); }
      else if (ev.t === 'scrape') { this.burst(ev.cell, COLORS.echoes[0], 8); this.shake(120); }
      else if (ev.t === 'dissolve') { this.burst(ev.cell, COLORS.molt, 26); this.flash('rgba(255,178,62,0.2)'); }
      else if (ev.t === 'molt') for (const c of ev.cells) this.burst(c, COLORS.molt, 4);
      else if (ev.t === 'die') { this.flash('rgba(255,60,90,0.35)', 350); this.shake(350); }
    }
  }

  draw(state, now = performance.now()) {
    const { ctx, cell: c, board } = this;
    const W = board.w * c;
    const H = board.h * c;

    ctx.save();
    if (now < this.shakeUntil) {
      const k = (this.shakeUntil - now) / 350;
      ctx.translate((Math.random() - 0.5) * c * 0.4 * k, (Math.random() - 0.5) * c * 0.4 * k);
    }

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(-c, -c, W + 2 * c, H + 2 * c);
    this.drawGrid(W, H);
    this.drawWalls();
    this.drawPortals(now);

    if (state) {
      this.drawMoltWalls(state, now);
      this.drawEchoes(state, now);
      this.drawItems(state, now);
      this.drawPlayer(state, now);
    }
    this.drawParticles();

    if (this.flashColor && now < this.flashUntil) {
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  drawGrid(W, H) {
    const { ctx, cell: c, board } = this;
    ctx.fillStyle = COLORS.grid;
    const r = Math.max(1, c * 0.06);
    for (let y = 0; y < board.h; y++) {
      for (let x = 0; x < board.w; x++) {
        ctx.fillRect(x * c + c / 2 - r / 2, y * c + c / 2 - r / 2, r, r);
      }
    }
  }

  drawWalls() {
    const { ctx, cell: c, board } = this;
    const { w, h, walls } = board;
    ctx.fillStyle = COLORS.wall;
    for (let i = 0; i < walls.length; i++) {
      if (!walls[i]) continue;
      const [x, y] = this.xy(i);
      ctx.fillRect(x, y, c, c);
    }
    // Bordes luminosos solo donde la pared toca espacio libre.
    ctx.strokeStyle = COLORS.wallEdge;
    ctx.lineWidth = Math.max(1, c * 0.1);
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    for (let i = 0; i < walls.length; i++) {
      if (!walls[i]) continue;
      const cx = i % w;
      const cy = (i / w) | 0;
      const [x, y] = [cx * c, cy * c];
      const free = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && !walls[yy * w + xx];
      if (free(cx, cy - 1)) { ctx.moveTo(x, y); ctx.lineTo(x + c, y); }
      if (free(cx, cy + 1)) { ctx.moveTo(x, y + c); ctx.lineTo(x + c, y + c); }
      if (free(cx - 1, cy)) { ctx.moveTo(x, y); ctx.lineTo(x, y + c); }
      if (free(cx + 1, cy)) { ctx.moveTo(x + c, y); ctx.lineTo(x + c, y + c); }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawPortals(now) {
    const { ctx, cell: c } = this;
    for (const p of this.board.portalCells) {
      const color = COLORS.portals[(p.id - 1) % COLORS.portals.length];
      for (const cell of [p.a, p.b]) {
        const [x, y] = this.xy(cell);
        const pulse = 0.5 + 0.5 * Math.sin(now / 220 + p.id);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, c * 0.12);
        ctx.globalAlpha = 0.6 + 0.4 * pulse;
        ctx.beginPath();
        ctx.arc(x + c / 2, y + c / 2, c * (0.28 + 0.1 * pulse), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(x + c / 2, y + c / 2, c * 0.46, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Segmentos + conectores entre celdas vecinas (no a través de portales/bordes).
  drawBody(cells, color, alpha, inset) {
    const { ctx, cell: c, board } = this;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    const pad = c * inset;
    for (let i = 0; i < cells.length; i++) {
      const [x, y] = this.xy(cells[i]);
      ctx.fillRect(x + pad, y + pad, c - 2 * pad, c - 2 * pad);
      if (i + 1 < cells.length) {
        const a = cells[i];
        const b = cells[i + 1];
        const d = b - a;
        if (d === 1 && (b % board.w) !== 0) ctx.fillRect(x + c - pad, y + pad, 2 * pad, c - 2 * pad);
        else if (d === -1 && (a % board.w) !== 0) ctx.fillRect(x - pad, y + pad, 2 * pad, c - 2 * pad);
        else if (d === board.w) ctx.fillRect(x + pad, y + c - pad, c - 2 * pad, 2 * pad);
        else if (d === -board.w) ctx.fillRect(x + pad, y - pad, c - 2 * pad, 2 * pad);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawEchoes(state, now) {
    const { ctx, cell: c } = this;
    const e = state.echoClock;
    const frozen = state.freezeLeft > 0;
    const reversed = !frozen && state.reverseLeft > 0;
    const warming = state.tick <= state.params.echoWarmupTicks;
    const n = state.echoes.length;
    state.echoes.forEach((echo, i) => {
      if (echo.dissolved) return;
      const body = echoBody(echo.data, e);
      if (!body.length) return;
      const age = n - 1 - i; // 0 = el más reciente
      let color = COLORS.echoes[echo.data.round % COLORS.echoes.length];
      if (frozen) color = COLORS.frozen;
      let alpha = Math.max(0.28, 0.58 - age * 0.08);
      if (warming) alpha *= 0.4 + 0.3 * Math.sin(now / 80);
      if (reversed) alpha *= 0.75 + 0.25 * Math.sin(now / 40 + i);

      // Estela del futuro inmediato: hacia dónde irá el eco.
      if (!frozen) {
        const step = reversed ? -1 : 1;
        ctx.fillStyle = color;
        for (let k = 1; k <= state.params.echoPreviewTicks; k++) {
          const idx = echo.data.offset + e + k * step;
          if (e + k * step > echo.data.lastTick || e + k * step < 0) break;
          const [x, y] = this.xy(echo.data.history[idx]);
          ctx.globalAlpha = alpha * (0.5 - k * 0.08);
          const r = c * 0.12;
          ctx.fillRect(x + c / 2 - r, y + c / 2 - r, 2 * r, 2 * r);
        }
      }

      this.drawBody(body, color, alpha, 0.16);
      // Cabeza del eco: marco brillante = peligro.
      const [hx, hy] = this.xy(body[0]);
      ctx.globalAlpha = Math.min(1, alpha + 0.3);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, c * 0.12);
      ctx.strokeRect(hx + c * 0.1, hy + c * 0.1, c * 0.8, c * 0.8);
      ctx.globalAlpha = 1;
    });
  }

  drawMoltWalls(state, now) {
    const { ctx, cell: c } = this;
    for (const w of state.moltWalls) {
      const left = w.until - state.tick;
      const blink = left < 15 ? 0.5 + 0.5 * Math.sin(now / 60) : 1;
      for (const cell of w.cells) {
        const [x, y] = this.xy(cell);
        ctx.globalAlpha = 0.35 * blink;
        ctx.fillStyle = COLORS.molt;
        ctx.fillRect(x, y, c, c);
        ctx.globalAlpha = 0.95 * blink;
        ctx.strokeStyle = COLORS.molt;
        ctx.lineWidth = Math.max(1, c * 0.08);
        ctx.strokeRect(x + c * 0.12, y + c * 0.12, c * 0.76, c * 0.76);
        ctx.beginPath();
        ctx.moveTo(x + c * 0.2, y + c * 0.8);
        ctx.lineTo(x + c * 0.8, y + c * 0.2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawItems(state, now) {
    const { ctx, cell: c } = this;
    if (state.fruit >= 0) {
      const [x, y] = this.xy(state.fruit);
      const pulse = 0.85 + 0.15 * Math.sin(now / 150);
      ctx.shadowColor = COLORS.fruit;
      ctx.shadowBlur = c * 0.6;
      ctx.fillStyle = COLORS.fruit;
      ctx.beginPath();
      ctx.arc(x + c / 2, y + c / 2, c * 0.3 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (state.special) {
      const { cell, kind, until } = state.special;
      const [x, y] = this.xy(cell);
      const left = until - state.tick;
      const color = kind === 'freeze' ? COLORS.freeze : COLORS.reverse;
      ctx.globalAlpha = left < 20 ? 0.5 + 0.5 * Math.sin(now / 50) : 1;
      ctx.save();
      ctx.translate(x + c / 2, y + c / 2);
      ctx.rotate(now / 600);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, c * 0.1);
      ctx.shadowColor = color;
      ctx.shadowBlur = c * 0.5;
      ctx.strokeRect(-c * 0.3, -c * 0.3, c * 0.6, c * 0.6);
      ctx.restore();
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.floor(c * 0.55)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(kind === 'freeze' ? '❄' : '⟲', x + c / 2, y + c / 2 + 1);
      ctx.globalAlpha = 1;
    }
  }

  drawPlayer(state, now) {
    const { ctx, cell: c } = this;
    const dead = state.status === 'dead';
    const hurt = state.graceLeft > 0 && Math.floor(now / 70) % 2 === 0;
    const color = dead ? '#ff3c5a' : COLORS.player;
    // Halo suave barato: el cuerpo dibujado dos veces.
    this.drawBody(state.body, color, 0.2, 0);
    this.drawBody(state.body, color, hurt ? 0.45 : 1, 0.1);
    const [x, y] = this.xy(state.body[0]);
    ctx.shadowColor = color;
    ctx.shadowBlur = c * 0.8;
    ctx.fillStyle = dead ? '#ffd0d8' : COLORS.playerHead;
    ctx.fillRect(x + c * 0.14, y + c * 0.14, c * 0.72, c * 0.72);
    ctx.shadowBlur = 0;
    // Ojos según la dirección.
    ctx.fillStyle = COLORS.bg;
    const e = c * 0.12;
    const off = [[0, -1], [1, 0], [0, 1], [-1, 0]][state.dir];
    const px = x + c / 2 + off[0] * c * 0.15;
    const py = y + c / 2 + off[1] * c * 0.15;
    const sx = off[1] * c * 0.18;
    const sy = off[0] * c * 0.18;
    ctx.fillRect(px + sx - e / 2, py + sy - e / 2, e, e);
    ctx.fillRect(px - sx - e / 2, py - sy - e / 2, e, e);
  }

  drawParticles() {
    const { ctx } = this;
    const alive = [];
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= 0.03;
      if (p.life <= 0) continue;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      const s = Math.max(1.5, this.cell * 0.12);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      alive.push(p);
    }
    this.particles = alive;
    ctx.globalAlpha = 1;
  }
}
