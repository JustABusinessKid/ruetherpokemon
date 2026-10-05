// Screens, Tab-Leiste, Toasts, Popups, Kit-Icons. Kein Spielzustand.
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Kit-Icons (art/icon-<name>.png) ----------
export const KIT = ['coin', 'star', 'trophy', 'lightning', 'quest', 'gear', 'beer', 'profile', 'bag', 'map', 'shop', 'lock'];
// Alte Emoji-Aufrufe (app.js, data.js) → Kit-Name. Schlüssel ohne Variationszeichen U+FE0F.
const EMOJI = {
  '💰': 'coin', '🪙': 'coin', '🎯': 'coin', '🧲': 'beer', '🍺': 'beer', '⏰': 'lightning', '⚡': 'lightning', '💥': 'lightning',
  '🔥': 'star', '⬆': 'star', '⭐': 'star', '🌟': 'star', '✨': 'star', '⚗': 'star', '🔵': 'star', '🟣': 'star', '🟡': 'star',
  '🏆': 'trophy', '👑': 'trophy', '⚔': 'trophy', '🏅': 'trophy', '📋': 'quest', '📗': 'quest', '📕': 'quest', '📣': 'quest',
  '🎁': 'bag', '🎒': 'bag', '🧺': 'bag', '🏹': 'bag', '👤': 'profile', '👨‍👩‍👧‍👦': 'profile', '🗺': 'map', '📍': 'map',
  '🛒': 'shop', '🔒': 'lock', '⚙': 'gear',
};
export const kitName = s => (KIT.includes(s) ? s : EMOJI[String(s || '').replace(/️/g, '')] || '');
export const ico = (name, cls = '') => `<img class="ico${cls ? ` ${cls}` : ''}" src="art/icon-${name}.png" alt="">`;
// Ersetzt Emoji in einem HTML-String durch Kit-Icons; unbekannte Emoji fallen weg.
const EMOJI_RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*️?/gu;
export const kitHtml = html => String(html).replace(EMOJI_RE, m => {
  if (m.codePointAt(0) < 0x2190) return m; // ©, ® usw. bleiben Text
  const n = kitName(m);
  return n ? ico(n, 'ico-in') : '';
});
export const kitify = text => kitHtml(esc(text));
// Elemente, deren Text app.js setzt (Sats-Chips, Banner): Emoji nach jeder Änderung durch Icons ersetzen.
// Umschreiben nur, wenn ein Emoji ersetzt wurde – sonst würde der Observer sich selbst endlos auslösen.
for (const el of document.querySelectorAll('.sats-chip, .banner')) {
  new MutationObserver(() => { const t = el.textContent, out = kitify(t); if (out !== esc(t)) el.innerHTML = out; })
    .observe(el, { childList: true, characterData: true, subtree: true });
}

// ---------- Screens, Tabs ----------
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

// ---------- Toasts ----------
// icon: Kit-Name (coin, star, trophy, …) oder altes Emoji; ohne icon bringt die Variante ihr Icon mit.
const KIND_ICON = { sats: 'coin', achievement: 'trophy', level: 'star' };
export function toast(text, { icon = '', kind = 'info' } = {}) {
  const box = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast-item ${kind}`;
  const name = kitName(icon) || KIND_ICON[kind] || '';
  t.innerHTML = `${name ? ico(name, 't-ico') : ''}<span class="t-text">${kitify(text)}</span>`;
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, 2200);
}

// ---------- Popups ----------
// Warteschlange: das nächste erscheint, wenn das vorige geschlossen ist.
// html kommt unverändert in die Karte (Nutzerdaten in value/textarea dürfen nicht umgeschrieben werden): Icons per ico().
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
  card.innerHTML = `<h2>${kitify(item.title)}</h2><div class="popup-body">${item.html}</div><div class="popup-buttons"></div>`;
  const bb = card.querySelector('.popup-buttons');
  item.buttons.forEach((b, i) => {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    if (b.primary) btn.classList.add('primary');
    if (b.danger) btn.classList.add('danger');
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
