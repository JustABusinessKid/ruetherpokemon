// Effekt-Player v6: Sprite-Sheets, Requisiten auf Pfaden (mit echtem Gesicht als Reiter), Pixel-Konfetti,
// ₿-Regen, Holzbanner, Sprechblasen, schwebender Text.
// Optik und Keyframes stehen in css/theme.css (.fx-sheet, .fx-prop, .fx-confetti, .fx-text, .fx-btc, .fx-banner, .fx-say);
// hier werden nur Elemente, Klassen, data-Attribute und CSS-Variablen gesetzt.

// Sheets: 4×4-Raster, 128 px je Frame (art/manifest.json). coins loopt über die ersten 8 Frames (v6 nicht mehr benutzt).
export const SHEETS = {
  impact:   { file: 'art/sheet-impact.png',    frames: 16, fps: 20, loop: false },
  sparkle:  { file: 'art/sheet-sparkle.png',   frames: 16, fps: 14, loop: true },
  smoke:    { file: 'art/sheet-smoke.png',     frames: 16, fps: 12, loop: false },
  coins:    { file: 'art/sheet-coins.png',     frames: 8,  fps: 12, loop: true },
  btcspin:  { file: 'art/sheet-btc-spin.png',  frames: 15, fps: 12, loop: true },
  btcburst: { file: 'art/sheet-btc-burst.png', frames: 16, fps: 18, loop: false },
};
// Fehlt eine neue Grafik (lädt nicht), springen die alten ein (Spec §8)
const SHEET_FALLBACK = { btcspin: 'sparkle', btcburst: 'impact' };
const PROP_FALLBACK = 'art/fx-chart-up.png';
const broken = new Set();
if (typeof Image !== 'undefined') {
  for (const id of Object.keys(SHEET_FALLBACK)) {
    const probe = new Image();
    probe.onerror = () => broken.add(id);
    probe.src = SHEETS[id].file;
  }
}
const sheetId = name => (!SHEETS[name] ? 'impact' : broken.has(name) ? SHEET_FALLBACK[name] : name);

const px = v => (typeof v === 'number' ? `${v}px` : v);
const rand = (a, b) => a + Math.random() * (b - a);
const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);

function make(cls, vars) {
  const el = document.createElement('div');
  el.className = cls;
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  return el;
}

// Hängt el nach delay ms in parent ein und entfernt es life ms später (life 0 = bis stop()). stop() räumt sofort ab.
function mount(parent, el, delay, life) {
  let t = 0;
  const stop = () => { clearTimeout(t); el.remove(); };
  const add = () => { parent.appendChild(el); if (life > 0) t = setTimeout(stop, life); };
  if (delay > 0) t = setTimeout(add, delay); else add();
  return { el, stop };
}

function sheetEl(name, vars) {
  const id = sheetId(name), s = SHEETS[id];
  const pass = Math.round((s.frames / s.fps) * 1000);
  const el = make(s.loop ? 'fx-sheet loop' : 'fx-sheet', { '--ms': `${pass}ms`, ...vars });
  el.dataset.sheet = id;
  el.style.backgroundImage = `url(${s.file})`;
  return { el, pass, loop: s.loop };
}

// Spielt ein Sheet in parent ab (Mitte bei x/y in px oder %). Ohne loop: ein Durchlauf, mit loop: `ms` lang.
// Unbekannte Namen fallen auf impact zurück, fehlende neue Sheets auf impact/sparkle.
export function playSheet(parent, name, { x = '50%', y = '50%', size = 128, ms = 0, delay = 0 } = {}) {
  const { el, pass, loop } = sheetEl(name, { '--x': px(x), '--y': px(y), '--size': px(size) });
  return mount(parent, el, delay, loop ? ms || pass : pass);
}

// Drehender Bitcoin, bleibt bis stop(). el.style.setProperty('--x'/'--y', …) verschiebt ihn (z.B. Münze im Flug).
export function spinCoin(parent, { x = '50%', y = '50%', size = 48 } = {}) {
  return mount(parent, sheetEl('btcspin', { '--x': px(x), '--y': px(y), '--size': px(size) }).el, 0, 0);
}

// Requisit art/fx-<name>.png auf einem CSS-Pfad (Klasse path-<path>, Keyframes path-<path>). opts.html landet im Requisit.
// rider = Rüther-id → sein echtes Gesicht sprites/<id>.png sitzt im Requisit (Rahmen in riderRarity);
// Lage/Größe/Ebene über die Variablen --rider-x/-y/-size/-z/-filter am Requisit (css/theme.css).
export function propFx(parent, name, path, { ms = 900, size = 160, delay = 0, html = '', rider = '', riderRarity = 'normal' } = {}) {
  const el = make(`fx-prop path-${path}`, { '--ms': `${ms}ms`, '--size': px(size) });
  el.dataset.path = path;
  el.innerHTML = `<img src="art/fx-${esc(name)}.png" alt="">${html}`
    + (rider ? `<img class="rider r-${esc(riderRarity)}" src="sprites/${esc(rider)}.png" alt="">` : '');
  const img = el.firstElementChild;
  img.addEventListener('error', () => { if (!img.src.endsWith(PROP_FALLBACK)) img.src = PROP_FALLBACK; });
  return mount(parent, el, delay, ms);
}

// Pixel-Konfetti: n Quadrate fallen von oben durch parent, je Stück eigene Spalte, Drift und Falldauer.
export function confetti(parent, n = 30, colors = ['#F2C94C', '#3FC1B0', '#B8412F', '#F4E8C8'], ms = 2000) {
  const all = [];
  for (let i = 0; i < n; i++) {
    const size = 4 * Math.round(rand(1.5, 3)); // 8 oder 12 px, ganze Pixel
    const el = make('fx-confetti', {
      '--x': `${rand(0, 100).toFixed(1)}%`, '--y': `${-size}px`, '--dx': `${Math.round(rand(-48, 48))}px`,
      '--size': `${size}px`, '--ms': `${Math.round(rand(0.6, 1) * ms)}ms`,
    });
    el.style.background = colors[i % colors.length];
    all.push(mount(parent, el, 0, ms));
  }
  return { stop: () => all.forEach(c => c.stop()) };
}

// ₿-Regen: n drehende Bitcoins (sheet-btc-spin) fallen gestaffelt durch parent, je Stück eigene Spalte, Größe, Drift, Tempo.
export function btcRain(parent, { n = 18, ms = 2200, size = 40 } = {}) {
  const all = [];
  for (let i = 0; i < n; i++) {
    const sz = Math.round(size * rand(0.7, 1.3));
    const fall = Math.round(rand(0.55, 0.85) * ms), delay = Math.round(rand(0, ms - fall));
    const { el, pass } = sheetEl('btcspin', {
      '--x': `${rand(4, 96).toFixed(1)}%`, '--y': `${-sz}px`, '--dx': `${Math.round(rand(-40, 40))}px`,
      '--size': `${sz}px`, '--fall': `${fall}ms`,
    });
    el.style.setProperty('--ms', `${Math.round(pass * rand(0.7, 1.2))}ms`);
    el.classList.add('fx-btc');
    all.push(mount(parent, el, delay, fall));
  }
  return { stop: () => all.forEach(c => c.stop()) };
}

// Holzbanner für Spezial-Attacken: echtes Gesicht (portrait = sprites/<id>.png) im Seltenheitsrahmen,
// Attackenname groß, darunter ein Spruch. Bühne darunter abgedunkelt (Requisiten liegen darüber).
export function banner(parent, { title, sub = '', portrait = '', rarity = 'normal', ms = 1100 } = {}) {
  const el = make('fx-banner', { '--ms': `${ms}ms` });
  el.innerHTML = '<div class="fx-dim"></div><div class="fx-board">'
    + (portrait ? `<img class="portrait r-${esc(rarity)}" src="${esc(portrait)}" alt="">` : '')
    + `<div class="fx-board-text"><b>${esc(title)}</b>${sub ? `<span>„${esc(sub)}“</span>` : ''}</div></div>`;
  return mount(parent, el, 0, ms);
}

// Pixel-Sprechblase (Papier, Ink-Rand, Zipfel). Der Zipfel zeigt auf x/y; side = Seite des Zipfels ('left' | 'right').
export function say(parent, text, { x = '50%', y = '30%', ms = 2200, side = 'left' } = {}) {
  const el = make(`fx-say ${side === 'right' ? 'right' : 'left'}`, { '--x': px(x), '--y': px(y), '--ms': `${ms}ms` });
  el.textContent = text;
  return mount(parent, el, 0, ms);
}

// Schwebende Zahl/Text in Pixelify: kind ∈ 'hurt' | 'heal' | 'info' | 'big' | 'mega'
export function floatText(parent, text, { x = '50%', y = '40%', kind = 'info', ms = 900 } = {}) {
  const el = make(`fx-text ${kind}`, { '--x': px(x), '--y': px(y), '--ms': `${ms}ms` });
  el.textContent = text;
  return mount(parent, el, 0, ms);
}
