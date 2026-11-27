import { LIGHT, api, esc, fmt, isoDate, modal, toast } from './util.js';

// One badge for watering: overdue/today, the next date (future, blue) or the last date (past, grey).
export function statusBadge(p) {
  if (!p.last_watered) return '<span class="badge">Nog geen water gegeven</span>';
  if (p.days_overdue > 0) return `<span class="badge over">💧 ${p.days_overdue}d te laat</span>`;
  if (p.days_overdue === 0) return '<span class="badge warn">💧 vandaag</span>';
  if (p.next_water) return `<span class="badge next">💧 ${fmt(p.next_water)}</span>`;
  return `<span class="badge">Laatst water: ${fmt(p.last_watered)}</span>`;
}
export const needsWater = (p) => p.days_overdue === null || p.days_overdue >= 0;

const lightBadge = (p) => p.light_status === 'too_bright' ? '<span class="badge warn">☀️ te licht</span>'
  : p.light_status === 'too_dark' ? '<span class="badge warn">🌑 te donker</span>' : '';
export const speciesLine = (p) => [p.latin_name || p.species_name, p.name_nl].filter(Boolean).map(esc).join(' · ');
export const lightRange = (s) => !s.light_min && !s.light_max ? '–'
  : s.light_min === s.light_max ? LIGHT[s.light_min] : `${LIGHT[s.light_min] ?? '…'} t/m ${LIGHT[s.light_max] ?? '…'}`;

/** "Water gegeven" plus a calendar button for watering on another date. */
export const waterActions = (id) => `<div class="wbtns"><button data-water="${id}">💧 Water gegeven</button><button class="sec" data-water-date="${id}" title="Water gegeven op een andere datum" aria-label="Water gegeven op een andere datum">📅</button></div>`;

async function giveWater(id, date, after) {
  const r = await api(`plants/${id}/logs`, { method: 'POST', body: date ? { type: 'water', date } : { type: 'water' } });
  toast('💧 Water gegeven', true, { label: 'Ongedaan maken', fn: async () => { await api(`plants/${id}/logs/${r.log_id}`, { method: 'DELETE' }); await after(); } });
  await after();
}

/** Wires every water button on the page; `after` re-renders the page. */
export function bindWater(after) {
  document.querySelectorAll('[data-water]').forEach((b) => b.onclick = async (e) => {
    e.stopPropagation();
    try { await giveWater(b.dataset.water, null, after); } catch (x) { toast(x.message); }
  });
  document.querySelectorAll('[data-water-date]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const d = modal('Water gegeven op…', `<form id="wd"><input type="date" name="date" value="${isoDate(-1)}" max="${isoDate()}" required>
      <div class="actions"><button>Opslaan</button></div></form>`);
    d.querySelector('#wd').onsubmit = async (ev) => {
      ev.preventDefault();
      const date = new FormData(ev.target).get('date');
      d.close();
      try { await giveWater(b.dataset.waterDate, date, after); } catch (x) { toast(x.message); }
    };
  });
}

/** Card shared by the overview and the plant page: photo + water badge, body, footer with the action. */
export function plantCard(p, detail = false, action = '') {
  const where = [p.room, p.location_note].filter(Boolean).map(esc).join(' - ');
  const place = [where, p.light_level ? `(${LIGHT[p.light_level]})` : ''].filter(Boolean).join(' ');
  const dates = detail ? [['Voeding', p.last_fed], ['Verpot', p.last_repotted]].filter(([, d]) => d).map(([l, d]) => `${l} ${fmt(d)}`).join('<br>') : '';
  const chips = [p.pot ? `<span class="badge">Pot ${isNaN(p.pot) ? esc(p.pot) : p.pot + ' cm'}</span>` : '', lightBadge(p)].filter(Boolean).join('');
  const media = p.photo ? `<img ${detail ? 'id="thumb" ' : ''}src="photos/${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" decoding="async">` : '<span aria-hidden="true">🪴</span>';
  return `<div class="card pcard"${detail ? '' : ` data-id="${p.id}"`}>
    <div class="media${detail ? ' big' : ''}">${media}</div>
    <div class="pmain">
      <div class="pbody">
        <div class="row"><h3 class="ttl">${detail ? esc(p.name) : `<button class="cardlink" data-open="${p.id}">${esc(p.name)}</button>`}</h3>${detail ? '<button class="quiet" id="openedit">Bewerk</button>' : ''}</div>
        <div class="muted clip" title="${speciesLine(p)}">${speciesLine(p)}</div>
        ${place ? `<div class="muted clip">${place}</div>` : ''}
        ${chips ? `<div class="chips">${chips}</div>` : ''}
      </div>
      <div class="pfoot"><span class="muted">${dates}</span><div class="side">${statusBadge(p)}${action}</div></div>
    </div>
  </div>`;
}
