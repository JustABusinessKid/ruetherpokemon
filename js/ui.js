// Screens, Tab-Leiste, Toasts, Popups. Kein Spielzustand.
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let tabHandler = null;
export function setScreen(id) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const s of document.querySelectorAll('section.screen')) {
    const on = s.id === id;
    if (on && !s.classList.contains('active') && !reduce) { s.classList.add('enter'); setTimeout(() => s.classList.remove('enter'), 220); }
    s.classList.toggle('active', on);
  }
  const target = document.getElementById(id);
  const tabs = document.getElementById('tabbar');
  tabs.classList.toggle('hidden', !target?.classList.contains('with-tabs'));
  tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
}
export function onTab(fn) { tabHandler = fn; }
document.getElementById('tabbar')?.addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (b && tabHandler) tabHandler(b.dataset.tab);
});
export function setTabBadge(id, n) {
  const b = document.querySelector(`#tabbar button[data-tab="${id}"] .tab-badge`);
  if (!b) return;
  b.textContent = n;
  b.classList.toggle('hidden', !(n > 0));
}

export function toast(text, { icon = '', kind = 'info' } = {}) {
  const box = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast-item ${kind}`;
  t.innerHTML = `${icon ? `<span class="t-ico">${esc(icon)}</span>` : ''}<span class="t-text"></span>`;
  t.querySelector('.t-text').textContent = text;
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, 2200);
}

// Popups laufen in einer Warteschlange: das nächste erscheint, wenn das vorige geschlossen ist.
const queue = [];
let open = false;
export function popup({ title, html = '', buttons = [{ label: 'OK', primary: true }] }) {
  return new Promise(resolve => { queue.push({ title, html, buttons, resolve }); if (!open) next(); });
}
function next() {
  const el = document.getElementById('popup');
  const item = queue.shift();
  if (!item) { open = false; el.classList.add('hidden'); return; }
  open = true;
  const card = el.querySelector('.popup-card');
  card.innerHTML = `<h2></h2><div class="popup-body">${item.html}</div><div class="popup-buttons"></div>`;
  card.querySelector('h2').textContent = item.title;
  const bb = card.querySelector('.popup-buttons');
  item.buttons.forEach((b, i) => {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    if (b.primary) btn.classList.add('primary');
    btn.addEventListener('click', () => { item.resolve(i); next(); });
    bb.appendChild(btn);
  });
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.classList.remove('hidden');
  card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
  (card.querySelector('input, textarea') || bb.querySelector('.primary') || bb.firstChild)?.focus();
}
export function closePopup() { queue.length = 0; open = false; document.getElementById('popup').classList.add('hidden'); }
