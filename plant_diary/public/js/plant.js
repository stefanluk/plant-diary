import { $, LIGHT, SOIL, TYPES, api, armDelete, esc, fmt, modal, opt, resizeImage, showError, toast, today } from './util.js';
import { bindWater, lightRange, needsWater, plantCard, waterActions } from './card.js';
import { showList } from './list.js';

function infoBlock(p) {
  const s = p.species;
  if (!s) return '<div class="card"><h3 class="ttl">Informatie &amp; verzorging</h3><p class="muted">Geen soort gekoppeld. Kies hieronder een soort.</p></div>';
  const tip = (label, v) => `<div class="k">${label}</div><div>${v ? esc(v) : '<span class="muted">nog niet ingevuld</span>'}</div>`;
  const water = s.water_summer_days ? `elke ${s.water_summer_days} dagen (zomer) · ${s.water_winter_days ?? s.water_summer_days} dagen (winter)` : '';
  const mismatch = p.light_status === 'too_bright' || p.light_status === 'too_dark'
    ? `<div class="warnbox">${p.light_status === 'too_bright' ? 'Staat te licht' : 'Staat te donker'}: nu <strong>${LIGHT[p.light_level]}</strong>, ideaal <strong>${lightRange(s)}</strong>.</div>` : '';
  return `<div class="card info"><div class="row"><h3 class="ttl">Informatie &amp; verzorging</h3><button class="quiet" id="editspecies">Bewerk</button></div>
    ${p.toxic ? '<div style="margin-bottom:10px"><span class="badge toxic" style="margin-left:0">Giftig voor huisdieren en mensen</span></div>' : ''}
    ${mismatch}
    ${s.description ? `<p>${esc(s.description)}</p>` : ''}
    <div class="kv">
      ${tip('Water', water)}
      ${tip('Standplaats', lightRange(s) === '–' ? '' : lightRange(s))}
      ${tip('Grond', SOIL[p.soil_effective])}
      ${tip('Voeding', s.feed_tip)}
      ${tip('Verpotten', s.repot_tip)}
      ${tip('Snoeien', s.prune_tip)}
    </div></div>`;
}

export async function showPlant(id) {
  $('#app').innerHTML = '<p class="muted">Laden…</p>';
  let p, species;
  try { [p, species] = await Promise.all([api('plants/' + id), api('species')]); } catch (x) { return showError(x, () => showPlant(id)); }
  $('#back').hidden = false; $('#title').textContent = p.name; $('#app').className = 'wide';
  const opts = species.map((s) => `<option value="${s.id}" ${s.id === p.species_id ? 'selected' : ''}>${esc(s.latin_name || s.name)}${s.name_nl ? ' (' + esc(s.name_nl) + ')' : ''}</option>`).join('');
  const logForm = (l) => `<form id="log">
        <select name="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${l && l.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <input type="date" name="date" value="${l ? l.date : today()}">
        <textarea name="note" rows="3" placeholder="Notitie">${l ? esc(l.note) : ''}</textarea>
        <div class="actions"><button>Opslaan</button>${l ? '<button type="button" class="danger" id="dellog">Verwijder bericht</button>' : ''}</div></form>`;
  const editForm = `<form id="edit">
        <label>Naam</label><input name="name" value="${esc(p.name)}">
        <label>Soort</label><select name="species_id"><option value="">–</option>${opts}</select>
        <label>Volgende water handmatig (datum)</label><input name="next_water_override" type="date" value="${p.next_water_override ?? ''}">
        <label>Standplaats (waar staat de plant nu?)</label><select name="light_level">${opt(LIGHT, p.light_level, '– kies –')}</select>
        <label>Kamer</label><input name="room" value="${esc(p.room)}">
        <label>Plek</label><input name="location_note" value="${esc(p.location_note)}">
        ${p.light ? `<label>Eerdere lichtnotitie</label><input name="light" value="${esc(p.light)}">` : ''}
        <label>Foto</label><input type="file" id="photofile" accept="image/*">
        ${p.photo ? '<button type="button" class="quiet" id="delphoto">Foto verwijderen</button>' : ''}
        <label>Pot (diameter in cm)</label><input name="pot" type="number" min="1" max="200" step="0.5" value="${isNaN(p.pot) ? '' : p.pot ?? ''}">
        <label>Aangeschaft</label><input name="acquired" type="date" value="${p.acquired ?? ''}">
        <div class="actions"><button>Opslaan</button><button type="button" class="sec" id="dupplant">Dupliceer plant</button><button type="button" class="danger" id="delplant">Plant verwijderen</button></div>
      </form>`;
  $('#app').innerHTML = `
    <div class="cols"><div>
    ${plantCard(p, true, needsWater(p) ? waterActions(id) : '')}
    </div><div>${infoBlock(p)}</div></div>
    <div class="row" style="margin-top:16px"><h3 style="margin:0">Dagboek</h3><button id="openlog">Schrijf update</button></div>
    <div style="height:10px"></div>
    ${p.logs.map((l) => `<div class="card log entry ${l.type}"><div class="ico">${TYPES[l.type].split(' ')[0]}</div>
      <div class="grow"><div class="row"><strong>${TYPES[l.type].split(' ').slice(1).join(' ')}</strong><span class="muted">${fmt(l.date)}</span></div>
      ${l.note ? `<div>${esc(l.note)}</div>` : ''}
      <div style="text-align:right"><button type="button" class="quiet" data-editlog="${l.id}">bewerken</button></div></div></div>`).join('') || '<p class="muted">Nog geen berichten.</p>'}`;
  bindWater(() => showPlant(id));
  if ($('#thumb')) $('#thumb').onclick = () => modal('', `<img class="big" src="photos/${esc(p.photo)}" alt="">`);
  if ($('#editspecies')) $('#editspecies').onclick = () => editSpecies(p);
  $('#openlog').onclick = () => {
    const d = modal('Update schrijven', logForm());
    d.querySelector('#log').onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries([...new FormData(e.target)].filter(([, v]) => v !== ''));
      await api(`plants/${id}/logs`, { method:'POST', body }).catch((x) => toast(x.message)); d.close(); showPlant(id);
    };
  };
  $('#openedit').onclick = () => {
    const d = modal('Plant aanpassen', editForm);
    d.querySelector('#edit').onsubmit = async (e) => {
      e.preventDefault(); const body = Object.fromEntries(new FormData(e.target));
      const file = d.querySelector('#photofile').files[0];
      try {
        await api('plants/' + id, { method:'PATCH', body });
        if (file) { const f = new FormData(); f.append('photo', await resizeImage(file)); await api(`plants/${id}/photo`, { method:'POST', body:f }); }
      } catch (x) { return toast(x.message); }
      d.close(); showPlant(id);
    };
    const dp = d.querySelector('#delphoto');
    if (dp) dp.onclick = async () => { await api(`plants/${id}/photo`, { method:'DELETE' }).catch((x) => toast(x.message)); d.close(); showPlant(id); };
    d.querySelector('#dupplant').onclick = async () => {
      try {
        const copy = await api(`plants/${id}/duplicate`, { method:'POST' });
        d.close(); await showPlant(copy.id); toast('Plant gedupliceerd. Pas naam en foto aan.', true);
      } catch (x) { toast(x.message); }
    };
    armDelete(d.querySelector('#delplant'), 'Plant verwijderen', async () => {
      await api('plants/' + id, { method:'DELETE' }).catch((x) => toast(x.message)); d.close(); showList();
    });
  };
  document.querySelectorAll('[data-editlog]').forEach((b) => b.onclick = () => {
    const l = p.logs.find((x) => x.id == b.dataset.editlog);
    const d = modal('Bericht bewerken', logForm(l));
    d.querySelector('#log').onsubmit = async (e) => {
      e.preventDefault(); const body = Object.fromEntries(new FormData(e.target));
      await api(`plants/${id}/logs/${l.id}`, { method:'PATCH', body }).catch((x) => toast(x.message)); d.close(); showPlant(id);
    };
    armDelete(d.querySelector('#dellog'), 'Verwijder bericht', async () => {
      await api(`plants/${id}/logs/${l.id}`, { method:'DELETE' }); d.close(); showPlant(id);
    });
  });
}

export function editSpecies(p) {
  const s = p.species; $('#app').className = '';
  $('#title').textContent = 'Soort bewerken';
  const txt = (n, l) => `<label>${l}</label><textarea name="${n}" rows="2">${esc(s[n])}</textarea>`;
  $('#app').innerHTML = `<div class="card"><p class="muted">Wijzigingen gelden voor alle planten van deze soort.</p><form id="sp">
    <label>Latijnse naam</label><input name="latin_name" value="${esc(s.latin_name || s.name)}">
    <label>Nederlandse naam</label><input name="name_nl" value="${esc(s.name_nl)}">
    <label>Engelse naam</label><input name="name_en" value="${esc(s.name_en)}">
    <label>Water zomer (dagen)</label><input name="water_summer_days" type="number" min="1" value="${s.water_summer_days ?? ''}">
    <label>Water winter (dagen)</label><input name="water_winter_days" type="number" min="1" value="${s.water_winter_days ?? ''}">
    <label>Licht minimaal</label><select name="light_min">${opt(LIGHT, s.light_min, '–')}</select>
    <label>Licht maximaal</label><select name="light_max">${opt(LIGHT, s.light_max, '–')}</select>
    <label>Grondsoort</label><select name="soil">${opt(SOIL, s.soil, '–')}</select>
    <label>Giftig</label><select name="toxic"><option value="0" ${!(s.toxic_pets || s.toxic_humans) ? 'selected' : ''}>Nee</option><option value="1" ${s.toxic_pets || s.toxic_humans ? 'selected' : ''}>Ja</option></select>
    ${txt('feed_tip', 'Voeding')}${txt('repot_tip', 'Verpotten')}${txt('prune_tip', 'Snoeien')}${txt('description', 'Omschrijving')}
    <div class="actions"><button>Opslaan</button><button type="button" class="sec" id="cancel">Annuleren</button></div>
  </form></div>`;
  $('#cancel').onclick = () => showPlant(p.id);
  $('#sp').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    body.toxic_pets = body.toxic_humans = body.toxic; delete body.toxic;
    const r = await api('species/' + s.id, { method:'PATCH', body }).catch((x) => toast(x.message));
    if (r) showPlant(p.id);
  };
}
