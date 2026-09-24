// Controlador de una partida: bucle de ticks de paso fijo, HUD, overlays.
// La simulación vive en core/; aquí solo se conecta con el navegador.

import { t } from './i18n/index.js';
import { step, isValidTurn, canMolt, STATUS } from './core/engine.js';
import { createSession, startRound, finishRound, sessionTotals } from './core/session.js';
import { Renderer } from './io/render.js';
import { Input } from './io/input.js';
import { play, initAudio } from './io/audio.js';
import { storage } from './io/storage.js';
import { roundGrid, shareText, shareOrCopy } from './io/share.js';
import { LEVELS } from './levels/levels.js';

const COUNTDOWN_MS = 1200;
const SOUND_EVENTS = new Set(['eat', 'specialSpawn', 'freeze', 'reverse', 'scrape', 'molt', 'dissolve', 'portal', 'die', 'clear']);

export class Game {
  constructor(el, { onExit, onPlay }) {
    this.el = el;             // referencias DOM (ver main.js)
    this.onExit = onExit;     // volver al menú
    this.onPlay = onPlay;     // arrancar otra configuración (siguiente nivel)
    this.renderer = new Renderer(el.canvas);
    this.input = new Input(el.screen, {
      onPause: () => this.togglePause(),
      onAny: (e) => this.onAnyInput(e),
    });
    this.phase = 'idle';
    this.raf = 0;
    this.frame = this.frame.bind(this);

    el.molt.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.requestMolt();
    });
    el.pause.addEventListener('click', () => this.togglePause());
    window.addEventListener('resize', () => this.fit());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.phase === 'running') this.togglePause();
    });
  }

  // ------------------------------------------------------------ ciclo --

  start(setup) {
    this.setup = setup;
    this.session = createSession(setup);
    this.tickMs = this.session.params.tickMs;
    this.el.molt.hidden = !this.session.params.molt;
    this.fit();
    this.prepareRound();
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.phase = 'idle';
    this.input.enabled = false;
    this.hideOverlay();
  }

  fit() {
    if (!this.session) return;
    const r = this.el.stage.getBoundingClientRect();
    this.renderer.fit(this.session.board, r.width - 8, r.height - 8);
  }

  prepareRound() {
    const s = this.session;
    this.state = startRound(s);
    this.input.clear();
    this.input.enabled = false;
    this.phase = 'ready';
    const n = s.echoes.length;
    const lines = [];
    if (s.params.echoes) {
      lines.push(n === 0 ? t('round.echoesNone') : n === 1 ? t('round.echoesOne') : t('round.echoesMany', { n }));
      lines.push(t('round.goal', { goal: s.params.fruitGoal }));
    } else {
      lines.push(t(s.level.name));
    }
    const title = s.params.rounds > 1
      ? t('round.start', { n: s.roundIndex + 1, total: s.params.rounds })
      : t(s.level.name);
    this.showOverlay({ title, lines, hint: t('round.tapToStart'), onTap: () => this.beginCountdown() });
  }

  beginCountdown() {
    if (this.phase !== 'ready') return;
    initAudio();
    this.hideOverlay();
    this.phase = 'countdown';
    this.countdownEnd = performance.now() + COUNTDOWN_MS;
    this.input.clear();
    this.input.enabled = true; // se pueden encolar giros durante la cuenta
    play('start');
  }

  frame(now) {
    const dt = Math.min(now - this.last, 250);
    this.last = now;
    if (this.phase === 'countdown' && now >= this.countdownEnd) {
      this.phase = 'running';
      this.acc = this.tickMs; // primer tick inmediato
    }
    if (this.phase === 'running') {
      this.acc += dt;
      while (this.acc >= this.tickMs && this.phase === 'running') {
        this.acc -= this.tickMs;
        this.tick();
      }
    }
    this.renderer.draw(this.state, now);
    this.updateHud(now);
    this.raf = requestAnimationFrame(this.frame);
  }

  tick() {
    const s = this.state;
    const input = this.input.next((d) => isValidTurn(s, d));
    step(s, input);
    this.renderer.onEvents(s.events);
    for (const ev of s.events) if (SOUND_EVENTS.has(ev.t)) play(ev.t);
    if (s.status !== STATUS.PLAYING) this.endRound();
  }

  endRound() {
    const s = this.state;
    this.input.enabled = false;
    finishRound(this.session, s);
    if (this.session.status === 'playing') {
      this.phase = 'roundEnd';
      this.showOverlay({
        title: t('round.cleared'),
        lines: [`+${s.score}`, t('round.becomesEcho')],
        buttons: [{ label: t('round.next'), primary: true, action: () => this.prepareRound() }],
        delay: 350,
      });
    } else {
      this.phase = 'over';
      setTimeout(() => this.showResults(), s.status === STATUS.DEAD ? 700 : 300);
    }
  }

  togglePause() {
    if (this.phase === 'running' || this.phase === 'countdown') {
      this.pausedFrom = this.phase;
      this.phase = 'paused';
      this.input.enabled = false;
      this.showOverlay({
        title: t('pause.title'),
        buttons: [
          { label: t('pause.resume'), primary: true, action: () => this.resume() },
          { label: t('pause.quit'), action: () => this.onExit() },
        ],
      });
    } else if (this.phase === 'paused') {
      this.resume();
    }
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.hideOverlay();
    this.input.clear();
    this.input.enabled = true;
    this.phase = 'countdown';
    this.countdownEnd = performance.now() + COUNTDOWN_MS * 0.6;
  }

  onAnyInput(e) {
    if (this.phase === 'ready' && e.type === 'keydown') {
      this.beginCountdown();
      return !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code);
    }
    if ((this.phase === 'roundEnd' || this.phase === 'over') && e.type === 'keydown' && e.code === 'Enter') {
      this.el.overlay.querySelector('button.primary')?.click();
      return true;
    }
    return false;
  }

  // -------------------------------------------------------- resultados --

  showResults() {
    const session = this.session;
    const totals = sessionTotals(session);
    const { mode } = session;
    const last = session.rounds[session.rounds.length - 1];
    let title;
    if (mode === 'classic') title = t('end.classic');
    else title = session.status === 'won' ? t('end.won') : t('end.lost');

    // Récords y progreso
    let isRecord = false;
    let best = 0;
    let practice = false;
    if (mode === 'campaign') {
      isRecord = storage.recordBest(session.level.id, totals.total);
      best = storage.get('best')[session.level.id] || 0;
      if (session.status === 'won') storage.unlock(Math.min(LEVELS.length, this.setup.levelIndex + 2));
    } else if (mode === 'classic') {
      best = storage.get('classicBest') || 0;
      if (totals.total > best) { storage.set('classicBest', totals.total); isRecord = true; best = totals.total; }
    } else if (mode === 'daily') {
      const daily = storage.get('daily') || {};
      if (daily[this.setup.dateKey]) {
        practice = true;
      } else {
        daily[this.setup.dateKey] = {
          grid: roundGrid(session), survived: totals.survived, rounds: session.params.rounds,
          dissolved: totals.dissolved, total: totals.total,
        };
        storage.set('daily', daily);
      }
      best = daily[this.setup.dateKey].total;
    }

    const rows = mode === 'classic'
      ? [[t('end.total'), totals.total]]
      : [
        [t('end.base'), totals.base],
        [t('end.rounds'), `${totals.survived}/${session.params.rounds}`],
        [t('end.dissolved'), totals.dissolved],
        [t('end.multiplier'), `×${totals.multiplier.toFixed(2)}`],
        [t('end.total'), totals.total],
      ];

    const lines = [];
    if (last && !last.cleared && last.cause) lines.push(t(`cause.${last.cause}`));
    if (mode === 'daily') lines.push(roundGrid(session));
    if (practice) lines.push(t('end.practice'));
    lines.push(isRecord ? t('end.record') : t('end.best', { score: best }));

    const buttons = [];
    if (mode === 'campaign' && session.status === 'won' && this.setup.levelIndex + 1 < LEVELS.length) {
      buttons.push({ label: t('end.next'), primary: true, action: () => this.onPlay({ mode: 'campaign', levelIndex: this.setup.levelIndex + 1 }) });
    }
    if (mode === 'daily') {
      buttons.push({
        label: t('end.share'),
        primary: true,
        keepOpen: true,
        action: async (btn) => {
          const result = (storage.get('daily') || {})[this.setup.dateKey];
          const outcome = await shareOrCopy(shareText(this.setup.dateKey, result));
          if (outcome === 'copied') btn.textContent = t('end.copied');
        },
      });
    }
    buttons.push({ label: t('end.retry'), primary: !buttons.length, action: () => this.start(this.setup) });
    buttons.push({ label: t('end.menu'), action: () => this.onExit() });

    this.showOverlay({ title, lines, rows, buttons, highlight: isRecord });
  }

  // --------------------------------------------------------------- HUD --

  updateHud(now) {
    const s = this.state;
    const sess = this.session;
    if (!s) return;
    const p = sess.params;
    const el = this.el;
    const finished = sess.rounds.reduce((a, r) => a + r.score, 0);
    const score = finished + (s.status === STATUS.PLAYING ? s.score : 0);
    setText(el.hudRound, p.rounds > 1 ? t('hud.round', { n: Math.min(sess.roundIndex + 1, p.rounds), total: p.rounds }) : t(sess.level.name));
    setText(el.hudFruits, Number.isFinite(p.fruitGoal) ? t('hud.fruits', { n: s.fruits, goal: p.fruitGoal }) : String(s.fruits));
    setText(el.hudScore, String(score));
    const frac = Number.isFinite(p.roundTicks) ? 1 - s.tick / p.roundTicks : 1;
    el.timebar.style.transform = `scaleX(${Math.max(0, frac)})`;
    el.timebar.parentElement.hidden = !Number.isFinite(p.roundTicks);

    let status = '';
    if (this.phase === 'countdown') {
      status = String(Math.max(1, Math.ceil((this.countdownEnd - now) / (COUNTDOWN_MS / 3))));
    } else if (s.freezeLeft > 0) status = `❄ ${t('hud.freeze')}`;
    else if (s.reverseLeft > 0) status = `⟲ ${t('hud.reverse')}`;
    else if (p.echoes && s.echoes.length) status = t('hud.echoes', { n: s.echoes.filter((e) => !e.dissolved).length });
    setText(el.hudStatus, status);
    el.hudStatus.classList.toggle('big', this.phase === 'countdown');

    const moltReady = canMolt(s);
    setText(el.molt, s.moltUsed ? t('hud.moltUsed') : t('hud.molt'));
    el.molt.classList.toggle('ready', moltReady);
    el.molt.disabled = !moltReady;
  }

  // ----------------------------------------------------------- overlay --

  showOverlay({ title, lines = [], rows = null, hint = null, buttons = [], onTap = null, delay = 0, highlight = false }) {
    const o = this.el.overlay;
    o.innerHTML = '';
    o.className = 'overlay' + (highlight ? ' highlight' : '');
    const card = document.createElement('div');
    card.className = 'card';
    const h = document.createElement('h2');
    h.textContent = title;
    card.appendChild(h);
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      card.appendChild(p);
    }
    if (rows) {
      const table = document.createElement('dl');
      table.className = 'rows';
      for (const [k, v] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        table.append(dt, dd);
      }
      card.appendChild(table);
    }
    if (hint) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = hint;
      card.appendChild(p);
    }
    if (buttons.length) {
      const bar = document.createElement('div');
      bar.className = 'buttons';
      for (const b of buttons) {
        const btn = document.createElement('button');
        btn.textContent = b.label;
        if (b.primary) btn.classList.add('primary');
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          play('click');
          if (!b.keepOpen) this.hideOverlay();
          b.action(btn);
        });
        bar.appendChild(btn);
      }
      card.appendChild(bar);
    }
    o.appendChild(card);
    o.onclick = onTap ? () => onTap() : null;
    o.hidden = false;
    if (delay) {
      o.classList.add('wait');
      setTimeout(() => o.classList.remove('wait'), delay);
    }
  }

  hideOverlay() {
    this.el.overlay.hidden = true;
    this.el.overlay.onclick = null;
  }
}

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}
