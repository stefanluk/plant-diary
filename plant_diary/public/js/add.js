import { $, LIGHT, api, esc, opt, toast, today } from './util.js';
import { showList } from './list.js';
import { showPlant } from './plant.js';

export function showAdd() {
  $('#app').className = '';
  $('#back').hidden = false; $('#title').textContent = 'Nieuwe plant';
  let chosen = null, timer;
  $('#app').innerHTML = `<div class="card"><form id="new">
    <label>Soort zoeken (Latijns, Nederlands of Engels)</label>
    <input id="q" autocomplete="off" placeholder="bijv. sanse, monstera, orchidee">
    <div id="sugg"></div>
    <div id="chosen" class="muted"></div>
    <div class="actions" style="margin-bottom:12px"><button type="button" class="sec" id="own">Eigen soort aanmaken</button></div>
    <label>Naam van de plant</label><input name="name" required>
    <label>Standplaats</label><select name="light_level">${opt(LIGHT, '', '– kies –')}</select>
    <label>Kamer</label><input name="room">
    <label>Plek</label><input name="location_note">
    <label>Pot (diameter in cm)</label><input name="pot" type="number" min="1" max="200" step="0.5" inputmode="decimal">
    <label>Aangeschaft</label><input name="acquired" type="date" value="${today()}">
    <div class="actions"><button>Toevoegen</button><button type="button" class="sec" id="cancel">Annuleren</button></div>
  </form></div>`;
  const form = $('#new');
  const pick = (s, note) => {
    chosen = s; $('#sugg').innerHTML = '';
    $('#chosen').innerHTML = `Gekozen: <strong>${esc(s.latin_name || s.name)}</strong>${s.name_nl ? ' · ' + esc(s.name_nl) : ''}${note ? `<br>${esc(note)}` : ''}`;
    if (!form.name.value) form.name.value = s.name_nl || s.latin_name || s.name;
  };
  const choose = async (it) => {
    if (it.id) return pick(it);
    $('#chosen').textContent = 'Soort opslaan…';
    try { const r = await api('species/resolve', { method:'POST', body: it }); pick(r.species, r.created ? 'Nieuwe soort: vul de verzorgingsgegevens in via "Bewerk soort" op de plantpagina.' : ''); }
    catch (x) { $('#chosen').textContent = ''; toast(x.message); }
  };
  const label = (s) => `<strong>${esc(s.latin_name || s.name)}</strong> <span class="muted">${esc([s.name_nl, s.name_en].filter(Boolean).join(' · '))}${s.id ? ' · opgeslagen' : ''}</span>`;
  $('#q').oninput = (e) => {
    clearTimeout(timer); const q = e.target.value.trim();
    if (q.length < 3) { $('#sugg').innerHTML = ''; return; }
    timer = setTimeout(async () => {
      const r = await api('names/suggest?q=' + encodeURIComponent(q)).catch((x) => (toast(x.message), null));
      if (!r || $('#q').value.trim() !== q) return;
      const items = [...r.local, ...r.online];
      $('#sugg').innerHTML = items.map((s, i) => `<button type="button" class="sugg" data-i="${i}">${label(s)}</button>`).join('')
        || `<div class="muted" style="margin-bottom:8px">Geen resultaten${r.offline ? ' (online zoeken niet bereikbaar)' : ''}.</div>`;
      document.querySelectorAll('.sugg').forEach((b) => b.onclick = () => choose(items[b.dataset.i]));
    }, 300);
  };
  $('#own').onclick = async () => {
    const name = $('#q').value.trim();
    if (name.length < 2) return toast('Typ eerst de naam van de soort in het zoekveld');
    const s = await api('species', { method:'POST', body:{ name, latin_name: name } }).catch((x) => toast(x.message));
    if (s) pick(s);
  };
  $('#cancel').onclick = showList;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries([...new FormData(form)].filter(([, v]) => v !== ''));
    if (chosen) body.species_id = chosen.id;
    const p = await api('plants', { method:'POST', body }).catch((x) => toast(x.message));
    if (p) showPlant(p.id);
  };
}
