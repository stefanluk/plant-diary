import { $, api, armDelete, modal, nav, showError, t, toast } from './util.js';
import { bindWater, needsWater, plantCard, waterActions } from './card.js';
import { showPlant } from './plant.js';

let listOrder = null;

export async function showList(keepOrder = false) {
  nav.back = null; $('#back').hidden = true; $('#title').textContent = t('Plant Diary'); $('#app').className = 'wide';
  if (!keepOrder) $('#app').innerHTML = '<div class="plants"><div class="skel"></div><div class="skel"></div></div>';
  let plants;
  try { plants = await api('plants'); } catch (x) { return showError(x, () => showList()); }
  if (keepOrder && listOrder) plants.sort((a, b) => listOrder.indexOf(a.id) - listOrder.indexOf(b.id));
  else plants.sort((a, b) => (b.days_overdue ?? -999) - (a.days_overdue ?? -999));
  listOrder = plants.map((p) => p.id);
  $('#app').innerHTML = plants.length
    ? `<div class="plants">${plants.map((p) => plantCard(p, false, needsWater(p) ? waterActions(p.id) : '')).join('')}</div>`
    : `<div class="empty"><p>${t('No plants yet.')}</p><button id="addfirst">${t('Add your first plant')}</button></div>`;
  if ($('#addfirst')) $('#addfirst').onclick = () => $('#add').click();
  bindWater(() => showList(true));
  document.querySelectorAll('[data-open]').forEach((c) => c.onclick = () => showPlant(c.dataset.open));
  document.querySelectorAll('.pcard').forEach((c) => c.onclick = (e) => { if (!e.target.closest('button')) showPlant(c.dataset.id); });
  $('#app').insertAdjacentHTML('beforeend', `<div style="margin-top:24px;text-align:center">
    <a class="quiet" href="api/export" download>${t('Export backup')}</a>
    <button class="quiet" id="import">${t('Import backup')}</button>
    <input type="file" id="importfile" accept="application/json,.json" hidden>
    <button class="quiet" id="reset">${t('Empty database')}</button></div>`);
  armDelete($('#reset'), t('Empty database'), async () => {
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
    try { data = JSON.parse(await file.text()); } catch { return toast(t('This file is not a valid backup')); }
    const d = modal(t('Import backup'), `<p>${t('All current plants, diary entries and photos will be <strong>replaced</strong> by the backup ({n} plants).', { n: data.plants?.length ?? 0 })}</p>
      <div class="actions"><button class="danger" id="doimport">${t('Replace')}</button></div>`);
    d.querySelector('#doimport').onclick = async () => {
      d.close();
      try { await api('import', { method:'POST', body: data }); toast(t('Backup restored'), true); } catch (x) { toast(x.message); }
      showList();
    };
  };
}
