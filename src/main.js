// Punto de entrada: pantallas, menú y arranque de modos.

import { t, applyI18n, setLanguage } from './i18n/index.js';
import { Game } from './game.js';
import { storage } from './io/storage.js';
import { initAudio, setMuted, play } from './io/audio.js';
import { LEVELS } from './levels/levels.js';
import { campaignSetup, dailySetup, classicSetup } from './modes/modes.js';
import { dateKey } from './modes/daily.js';

setLanguage('es');
applyI18n();

const $ = (id) => document.getElementById(id);
const screens = [...document.querySelectorAll('.screen')];

function show(id) {
  for (const s of screens) s.classList.toggle('active', s.id === id);
  if (id !== 'screen-game') game.stop();
  if (id === 'screen-menu') refreshMenu();
  if (id === 'screen-levels') renderLevels();
}

const game = new Game({
  screen: $('screen-game'),
  canvas: $('board'),
  stage: $('stage'),
  overlay: $('overlay'),
  molt: $('btn-molt'),
  pause: $('btn-pause'),
  hudRound: $('hud-round'),
  hudFruits: $('hud-fruits'),
  hudScore: $('hud-score'),
  hudStatus: $('hud-status'),
  timebar: $('timebar'),
}, {
  onExit: () => show('screen-menu'),
  onPlay: (opts) => startMode(opts.mode, opts),
});

function startMode(mode, opts = {}) {
  initAudio();
  let setup;
  if (mode === 'campaign') setup = campaignSetup(opts.levelIndex ?? 0);
  else if (mode === 'daily') setup = dailySetup();
  else setup = classicSetup();
  show('screen-game');
  // Esperar al layout para medir el espacio disponible.
  requestAnimationFrame(() => game.start(setup));
}

// ---------------------------------------------------------------- menú --

function refreshMenu() {
  const muted = storage.get('muted');
  setMuted(muted);
  $('btn-sound').textContent = muted ? t('menu.sound.off') : t('menu.sound.on');
  const today = (storage.get('daily') || {})[dateKey()];
  $('daily-status').textContent = today ? `${today.grid} · ${today.total}` : '';
}

function renderLevels() {
  const list = $('level-list');
  list.innerHTML = '';
  const unlocked = storage.get('unlocked') || 1;
  const best = storage.get('best') || {};
  LEVELS.forEach((level, i) => {
    const btn = document.createElement('button');
    btn.className = 'level';
    const locked = i >= unlocked;
    btn.disabled = locked;
    const name = document.createElement('strong');
    name.textContent = t(level.name);
    const info = document.createElement('span');
    info.textContent = locked
      ? t('levels.locked')
      : `${t(level.hint)} ${best[level.id] ? t('levels.best', { score: best[level.id] }) : t('levels.new')}`;
    btn.append(name, info);
    btn.addEventListener('click', () => startMode('campaign', { levelIndex: i }));
    list.appendChild(btn);
  });
}

function renderHowto() {
  const body = $('howto-body');
  body.innerHTML = '';
  for (const line of t('howto.body')) {
    const p = document.createElement('p');
    p.textContent = line;
    body.appendChild(p);
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  initAudio();
  play('click');
  const action = btn.dataset.action;
  if (action === 'campaign') show('screen-levels');
  else if (action === 'daily') startMode('daily');
  else if (action === 'classic') startMode('classic');
  else if (action === 'howto') show('screen-howto');
  else if (action === 'back') show('screen-menu');
  else if (action === 'sound') {
    storage.set('muted', !storage.get('muted'));
    refreshMenu();
  }
});

renderHowto();
refreshMenu();

// Depuración: ?debug expone el controlador en window.__ecos.
if (new URLSearchParams(location.search).has('debug')) window.__ecos = game;
