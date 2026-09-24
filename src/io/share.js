// Texto compartible del reto diario, estilo Wordle. Sin backend.
//   🟩 ronda superada   🟪 superada disolviendo ecos   🟥 derrota   ⬛ no jugada

import { t } from '../i18n/index.js';
import { dailyNumber } from '../modes/daily.js';

export function roundGrid(session) {
  const total = session.params.rounds;
  let out = '';
  for (let i = 0; i < total; i++) {
    const r = session.rounds[i];
    if (!r) out += '⬛';
    else if (!r.cleared) out += '🟥';
    else if (r.dissolved > 0) out += '🟪';
    else out += '🟩';
  }
  return out;
}

// `result`: { grid, survived, rounds, dissolved, total } (se guarda en storage)
export function shareText(dateKey, result) {
  const url = location.origin + location.pathname;
  return [
    t('share.title', { num: dailyNumber(dateKey), date: dateKey }),
    `${result.grid}  ${t('share.rounds', { n: result.survived, total: result.rounds })}`,
    `${t('share.dissolved', { n: result.dissolved })} · ${t('share.points', { score: result.total })}`,
    url,
  ].join('\n');
}

export async function shareOrCopy(text) {
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ text });
      return 'shared';
    }
  } catch {
    // cancelado o no disponible: se copia
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok ? 'copied' : 'failed';
  }
}
