import { $, lang, t, toast } from './util.js';
import { showList } from './list.js';
import { showAdd } from './add.js';

document.documentElement.lang = lang;
document.title = t('Plant Diary');
$('#title').textContent = t('Plant Diary');
$('#add').textContent = t('+ Plant');
$('#back').setAttribute('aria-label', t('Back'));
$('#back').onclick = () => document.addEventListener('click', (e) => { if (e.target.matches?.('input[type=date]')) try { e.target.showPicker(); } catch {} });
showList();
$('#add').onclick = showAdd;
window.addEventListener('unhandledrejection', (e) => { e.preventDefault(); toast(e.reason?.message || t('Something went wrong')); });
window.addEventListener('offline', () => toast(t('You are offline')));
window.addEventListener('online', () => toast(t('Back online'), true));
document.addEventListener('click', (e) => { if (e.target.matches?.('input[type=date]')) try { e.target.showPicker(); } catch {} });
showList();
