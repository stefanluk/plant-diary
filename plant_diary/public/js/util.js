export const $ = (s) => document.querySelector(s);

/** Shows a message; with `action` ({label, fn}) it also shows a button and stays a bit longer. */
export function toast(msg, ok = false, action = null) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast' + (ok ? ' ok' : '');
  t.setAttribute('role', ok ? 'status' : 'alert');
  const span = document.createElement('span');
  span.textContent = msg;
  t.append(span);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = async () => { t.remove(); try { await action.fn(); } catch (x) { toast(x.message); } };
    t.append(b);
  }
  document.body.append(t);
  setTimeout(() => t.remove(), action ? 8000 : 4000);
}

// Two-step delete without a browser dialog: first click arms, second click confirms.
export function armDelete(btn, label, action) {
  let armed = false, timer;
  btn.onclick = async (e) => {
    e.stopPropagation();
    if (!armed) { armed = true; btn.textContent = 'Zeker weten?'; btn.classList.add('armed'); timer = setTimeout(() => { armed = false; btn.textContent = label; btn.classList.remove('armed'); }, 3000); return; }
    clearTimeout(timer); await action();
  };
}

export const TYPES = { water:'💧 Water', feed:'🌿 Voeding', repot:'🪴 Verpot', prune:'✂️ Gesnoeid', note:'📝 Notitie' };
export const LIGHT = { shade:'Volledige schaduw', half_shade:'Halfschaduw', indirect:'Indirect licht', full_sun:'Vol zonlicht' };
export const SOIL = { standard:'Standaard potgrond', cactus:'Cactus- en succulentengrond', aroid:'Aroid mix', orchid:'Orchideeëngrond' };

export const api = async (path, opts = {}) => {
  const isForm = opts.body instanceof FormData;
  let res;
  try {
    res = await fetch('api/' + path, {
      ...opts,
      headers: isForm || !opts.body ? {} : { 'Content-Type': 'application/json' },
      body: isForm || !opts.body ? opts.body : JSON.stringify(opts.body),
    });
  } catch {
    throw new Error('Geen verbinding met de server');
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.status === 204 ? null : res.json();
};

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
export const fmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('nl-NL', { day:'numeric', month:'short' }) : '–';
export const isoDate = (offsetDays = 0) => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4 + offsetDays * 864e5).toISOString().slice(0, 10);
export const today = () => isoDate();

export const opt = (map, sel, blank) => (blank ? `<option value="">${blank}</option>` : '') +
  Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');

export function modal(title, html) {
  const d = document.createElement('dialog');
  d.innerHTML = `<div class="row"><h3>${title}</h3><button type="button" class="sec" data-x>✕</button></div>${html}`;
  document.body.append(d); d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.querySelector('[data-x]').onclick = () => d.close(); d.showModal(); return d;
}

/** Shrinks a photo (max 1600px, JPEG) before upload; falls back to the original if the browser can't decode it. */
export async function resizeImage(file, max = 1600) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5e6 && file.type === 'image/jpeg') return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

/** Replaces the page content with an error and a retry button. */
export function showError(err, retry) {
  $('#app').innerHTML = `<div class="empty"><p>${esc(err.message)}</p><button id="retry">Opnieuw proberen</button></div>`;
  $('#retry').onclick = retry;
}
