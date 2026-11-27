import { $, api, armDelete, modal, showError, toast } from './util.js';
import { bindWater, needsWater, plantCard, waterActions } from './card.js';
import { showPlant } from './plant.js';

let listOrder = null;

export async function showList(keepOrder = false) {
  $('#back').hidden = true; $('#title').textContent = 'Plantendagboek'; $('#app').className = 'wide';
  if (!keepOrder) $('#app').innerHTML = '<div class="plants"><div class="skel"></div><div class="skel"></div></div>';
  let plants;
  try { plants = await api('plants'); } catch (x) { return showError(x, () => showList()); }
  if (keepOrder && listOrder) plants.sort((a, b) => listOrder.indexOf(a.id) - listOrder.indexOf(b.id));
  else plants.sort((a, b) => (b.days_overdue ?? -999) - (a.days_overdue ?? -999));
  listOrder = plants.map((p) => p.id);
  $('#app').innerHTML = plants.length
    ? `<div class="plants">${plants.map((p) => plantCard(p, false, needsWater(p) ? waterActions(p.id) : '')).join('')}</div>`
    : '<div class="empty"><p>Nog geen planten.</p><button id="addfirst">Voeg je eerste plant toe</button></div>';
  if ($('#addfirst')) $('#addfirst').onclick = () => $('#add').click();
  bindWater(() => showList(true));
  document.querySelectorAll('[data-open]').forEach((c) => c.onclick = () => showPlant(c.dataset.open));
  document.querySelectorAll('.pcard').forEach((c) => c.onclick = (e) => { if (!e.target.closest('button')) showPlant(c.dataset.id); });
  $('#app').insertAdjacentHTML('beforeend', `<div style="margin-top:24px;text-align:center">
    <a class="quiet" href="api/export" download>Exporteer back-up</a>
    <button class="quiet" id="import">Importeer back-up</button>
    <input type="file" id="importfile" accept="application/json,.json" hidden>
    <button class="quiet" id="reset">Database leegmaken</button></div>`);
  armDelete($('#reset'), 'Database leegmaken', async () => {
    await api('reset', { method:'POST' }).catch((x) => toast(x.message)); showList();
  });
  bindImport();
}

function bindImport() {
  $('#import').onclick = () => $('#importfile').click();
  $('#importfile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { return toast('Dit bestand is geen geldige back-up'); }
    const d = modal('Back-up importeren', `<p>Alle huidige planten, dagboekberichten en foto's worden <strong>vervangen</strong> door de back-up (${data.plants?.length ?? 0} planten).</p>
      <div class="actions"><button class="danger" id="doimport">Vervangen</button></div>`);
    d.querySelector('#doimport').onclick = async () => {
      d.close();
      try { await api('import', { method:'POST', body: data }); toast('Back-up teruggezet', true); } catch (x) { toast(x.message); }
      showList();
    };
  };
}
