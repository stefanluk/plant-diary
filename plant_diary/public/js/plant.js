import { $, LIGHT, SOIL, TYPES, api, armDelete, esc, fmt, modal, opt, resizeImage, nav, showError, t, toast, today } from './util.js';
import { bindWater, lightRange, needsWater, plantCard, waterActions } from './card.js';
import { showList } from './list.js';

function infoBlock(p) {
  const s = p.species;
  if (!s) return `<div class="card"><h3 class="ttl">${t('Info &amp; care')}</h3><p class="muted">${t('No species linked. Choose a species when editing the plant.')}</p></div>`;
  const tip = (label, v) => `<div class="k">${label}</div><div>${v ? esc(v) : `<span class="muted">${t('not filled in yet')}</span>`}</div>`;
  const water = s.water_summer_days ? t('Every {summer} days (summer) · {winter} days (winter)', { summer: s.water_summer_days, winter: s.water_winter_days ?? s.water_summer_days }) : '';
  const mismatch = p.light_status === 'too_bright' || p.light_status === 'too_dark'
    ? `<div class="warnbox">${t(p.light_status === 'too_bright' ? 'Too bright' : 'Too dark')}: ${t('now')} <strong>${LIGHT[p.light_level]}</strong>, ${t('ideal')} <strong>${lightRange(s)}</strong>.</div>` : '';
  return `<div class="card info"><div class="row"><h3 class="ttl">${t('Info &amp; care')}</h3><button class="quiet" id="editspecies">${t('Edit')}</button></div>
    ${p.toxic ? `<div style="margin-bottom:10px"><span class="badge toxic" style="margin-left:0">${t('Toxic to pets and people')}</span></div>` : ''}
    ${mismatch}
    ${s.description ? `<p>${esc(s.description)}</p>` : ''}
    <div class="kv">
      ${tip(t('Water'), water)}
      ${tip(t('Light'), lightRange(s) === '–' ? '' : lightRange(s))}
      ${tip(t('Soil'), SOIL[p.soil_effective])}
      ${tip(t('Feeding'), s.feed_tip)}
      ${tip(t('Repotting'), s.repot_tip)}
      ${tip(t('Pruning'), s.prune_tip)}
    </div></div>`;
}

export async function showPlant(id) {
  $('#app').innerHTML = `<p class="muted">${t('Loading…')}</p>`;
  let p, species;
  try { [p, species] = await Promise.all([api('plants/' + id), api('species')]); } catch (x) { return showError(x, () => showPlant(id)); }
  nav.back = null; $('#back').hidden = false; $('#title').textContent = p.name; $('#app').className = 'wide';
  const opts = species.map((s) => `<option value="${s.id}" ${s.id === p.species_id ? 'selected' : ''}>${esc(s.latin_name || s.name)}${s.name_nl ? ' (' + esc(s.name_nl) + ')' : ''}</option>`).join('');
  const logForm = (l) => `<form id="log">
        <select name="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${l && l.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <input type="date" name="date" value="${l ? l.date : today()}" max="${today()}">
        <textarea name="note" rows="3" placeholder="${t('Note')}">${l ? esc(l.note) : ''}</textarea>
        <div class="actions"><button>${t('Save')}</button>${l ? `<button type="button" class="danger" id="dellog">${t('Delete entry')}</button>` : ''}</div></form>`;
  const editForm = `<form id="edit">
        <label>${t('Name')}</label><input name="name" value="${esc(p.name)}">
        <label>${t('Species')}</label><select name="species_id"><option value="">–</option>${opts}</select>
        <label>${t('Next watering (manual date)')}</label><input name="next_water_override" type="date" value="${p.next_water_override ?? ''}">
        <label>${t('Light (where does the plant stand now?)')}</label><select name="light_level">${opt(LIGHT, p.light_level, `– ${t('choose')} –`)}</select>
        <label>${t('Room')}</label><input name="room" value="${esc(p.room)}">
        <label>${t('Spot')}</label><input name="location_note" value="${esc(p.location_note)}">
        ${p.light ? `<label>${t('Earlier light note')}</label><input name="light" value="${esc(p.light)}">` : ''}
        <label>${t('Photo')}</label><input type="file" id="photofile" accept="image/*">
        ${p.photo ? `<button type="button" class="quiet" id="delphoto">${t('Remove photo')}</button>` : ''}
        <label>${t('Pot (diameter in cm)')}</label><input name="pot" type="number" min="1" max="200" step="0.5" value="${isNaN(p.pot) ? '' : p.pot ?? ''}">
        <label>${t('Acquired')}</label><input name="acquired" type="date" value="${p.acquired ?? ''}">
        <div class="actions"><button>${t('Save')}</button><button type="button" class="sec" id="dupplant">${t('Duplicate plant')}</button><button type="button" class="danger" id="delplant">${t('Delete plant')}</button></div>
      </form>`;
  $('#app').innerHTML = `
    <div class="cols"><div>
    ${plantCard(p, true, needsWater(p) ? waterActions(id) : '')}
    </div><div>${infoBlock(p)}</div></div>
    <div class="row" style="margin-top:16px"><h3 style="margin:0">${t('Diary')}</h3><button id="openlog">${t('Write update')}</button></div>
    <div style="height:10px"></div>
    ${p.logs.map((l) => `<div class="card log entry ${l.type}"><div class="row"><div class="ttlrow"><span class="ico">${TYPES[l.type].split(' ')[0]}</span><strong>${TYPES[l.type].split(' ').slice(1).join(' ')}</strong></div><span class="muted">${fmt(l.date)}</span></div>
      ${l.note ? `<div class="note">${esc(l.note)}</div>` : ''}
      <div style="text-align:right"><button type="button" class="quiet" data-editlog="${l.id}">${t('edit')}</button></div></div>`).join('') || `<p class="muted">${t('No entries yet.')}</p>`}`;
  bindWater(() => showPlant(id));
  if ($('#thumb')) $('#thumb').onclick = () => modal('', `<img class="big" src="photos/${esc(p.photo)}" alt="">`);
  if ($('#editspecies')) $('#editspecies').onclick = () => editSpecies(p);
  $('#openlog').onclick = () => {
    const d = modal(t('Write update'), logForm());
    d.querySelector('#log').onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries([...new FormData(e.target)].filter(([, v]) => v !== ''));
      await api(`plants/${id}/logs`, { method:'POST', body }).catch((x) => toast(x.message)); d.close(); showPlant(id);
    };
  };
  $('#openedit').onclick = () => {
    const d = modal(t('Edit plant'), editForm);
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
        d.close(); await showPlant(copy.id); toast(t('Plant duplicated. Adjust the name and photo.'), true);
      } catch (x) { toast(x.message); }
    };
    armDelete(d.querySelector('#delplant'), t('Delete plant'), async () => {
      await api('plants/' + id, { method:'DELETE' }).catch((x) => toast(x.message)); d.close(); showList();
    });
  };
  document.querySelectorAll('[data-editlog]').forEach((b) => b.onclick = () => {
    const l = p.logs.find((x) => x.id == b.dataset.editlog);
    const d = modal(t('Edit entry'), logForm(l));
    d.querySelector('#log').onsubmit = async (e) => {
      e.preventDefault(); const body = Object.fromEntries(new FormData(e.target));
      await api(`plants/${id}/logs/${l.id}`, { method:'PATCH', body }).catch((x) => toast(x.message)); d.close(); showPlant(id);
    };
    armDelete(d.querySelector('#dellog'), t('Delete entry'), async () => {
      await api(`plants/${id}/logs/${l.id}`, { method:'DELETE' }); d.close(); showPlant(id);
    });
  });
}

export function editSpecies(p) {
  const s = p.species; $('#app').className = '';
  nav.back = () => showPlant(p.id); $('#title').textContent = t('Edit species');
  const txt = (n, l) => `<label>${l}</label><textarea name="${n}" rows="2">${esc(s[n])}</textarea>`;
  $('#app').innerHTML = `<div class="card"><p class="muted">${t('Changes apply to all plants of this species.')}</p><form id="sp">
    <label>${t('Latin name')}</label><input name="latin_name" value="${esc(s.latin_name || s.name)}">
    <label>${t('Dutch name')}</label><input name="name_nl" value="${esc(s.name_nl)}">
    <label>${t('English name')}</label><input name="name_en" value="${esc(s.name_en)}">
    <label>${t('Water summer (days)')}</label><input name="water_summer_days" type="number" min="1" value="${s.water_summer_days ?? ''}">
    <label>${t('Water winter (days)')}</label><input name="water_winter_days" type="number" min="1" value="${s.water_winter_days ?? ''}">
    <label>${t('Light minimum')}</label><select name="light_min">${opt(LIGHT, s.light_min, '–')}</select>
    <label>${t('Light maximum')}</label><select name="light_max">${opt(LIGHT, s.light_max, '–')}</select>
    <label>${t('Soil type')}</label><select name="soil">${opt(SOIL, s.soil, '–')}</select>
    <label>${t('Toxic')}</label><select name="toxic"><option value="0" ${!(s.toxic_pets || s.toxic_humans) ? 'selected' : ''}>${t('No')}</option><option value="1" ${s.toxic_pets || s.toxic_humans ? 'selected' : ''}>${t('Yes')}</option></select>
    ${txt('feed_tip', t('Feeding'))}${txt('repot_tip', t('Repotting'))}${txt('prune_tip', t('Pruning'))}${txt('description', t('Description'))}
    <div class="actions"><button>${t('Save')}</button><button type="button" class="sec" id="cancel">${t('Cancel')}</button></div>
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
