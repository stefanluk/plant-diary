import { $, toast } from './util.js';
import { showList } from './list.js';
import { showAdd } from './add.js';

$('#back').onclick = () => showList();
$('#add').onclick = showAdd;
window.addEventListener('unhandledrejection', (e) => { e.preventDefault(); toast(e.reason?.message || 'Er ging iets mis'); });
window.addEventListener('offline', () => toast('Je bent offline'));
window.addEventListener('online', () => toast('Weer online', true));
showList();
