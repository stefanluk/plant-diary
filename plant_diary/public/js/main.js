import { $, toast } from './util.js';
import { showList } from './list.js';
import { showAdd } from './add.js';

$('#back').onclick = () => document.addEventListener('click', (e) => { if (e.target.matches?.('input[type=date]')) try { e.target.showPicker(); } catch {} });
showList();
$('#add').onclick = showAdd;
window.addEventListener('unhandledrejection', (e) => { e.preventDefault(); toast(e.reason?.message || 'Er ging iets mis'); });
window.addEventListener('offline', () => toast('Je bent offline'));
window.addEventListener('online', () => toast('Weer online', true));
document.addEventListener('click', (e) => { if (e.target.matches?.('input[type=date]')) try { e.target.showPicker(); } catch {} });
showList();
