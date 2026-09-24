// Acceso centralizado a los textos. Uso: t('menu.campaign'), t('hud.round', {n, total}).

import es from './es.js';

const LANGS = { es };
let current = es;

export function setLanguage(code) {
  current = LANGS[code] || es;
  document.documentElement.lang = LANGS[code] ? code : 'es';
}

export function t(key, params) {
  let str = current[key] ?? es[key] ?? key;
  if (Array.isArray(str)) return str;
  if (params) str = str.replace(/\{(\w+)\}/g, (_, k) => (k in params ? params[k] : `{${k}}`));
  return str;
}

// Rellena los elementos con data-i18n="clave".
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
}
