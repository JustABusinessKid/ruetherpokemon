// Effekt-Player v5: Sprite-Sheets, Requisiten auf Pfaden, Pixel-Konfetti, schwebender Text.
// Optik und Keyframes stehen in css/theme.css (.fx-sheet, .fx-prop, .fx-confetti, .fx-text);
// hier werden nur Elemente, Klassen, data-Attribute und CSS-Variablen gesetzt.

// Sheets: 4×4-Raster, 128 px je Frame (art/manifest.json). coins loopt über die ersten 8 Frames.
export const SHEETS = {
  impact:  { file: 'art/sheet-impact.png',  frames: 16, fps: 20, loop: false },
  sparkle: { file: 'art/sheet-sparkle.png', frames: 16, fps: 14, loop: true },
  smoke:   { file: 'art/sheet-smoke.png',   frames: 16, fps: 12, loop: false },
  coins:   { file: 'art/sheet-coins.png',   frames: 8,  fps: 12, loop: true },
};

const px = v => (typeof v === 'number' ? `${v}px` : v);
const rand = (a, b) => a + Math.random() * (b - a);

function make(cls, vars) {
  const el = document.createElement('div');
  el.className = cls;
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  return el;
}

// Hängt el nach delay ms in parent ein und entfernt es life ms später. stop() räumt sofort ab.
function mount(parent, el, delay, life) {
  let t = 0;
  const stop = () => { clearTimeout(t); el.remove(); };
  const add = () => { parent.appendChild(el); t = setTimeout(stop, life); };
  if (delay > 0) t = setTimeout(add, delay); else add();
  return { el, stop };
}

// Spielt ein Sheet in parent ab (Mitte bei x/y in px oder %). Ohne loop: ein Durchlauf, mit loop: `ms` lang.
// Unbekannte Namen fallen auf impact zurück.
export function playSheet(parent, name, { x = '50%', y = '50%', size = 128, ms = 0, delay = 0 } = {}) {
  const id = SHEETS[name] ? name : 'impact', s = SHEETS[id];
  const pass = Math.round((s.frames / s.fps) * 1000);
  const el = make(s.loop ? 'fx-sheet loop' : 'fx-sheet', { '--x': px(x), '--y': px(y), '--size': px(size), '--ms': `${pass}ms` });
  el.dataset.sheet = id;
  el.style.backgroundImage = `url(${s.file})`;
  return mount(parent, el, delay, s.loop ? ms || pass : pass);
}

// Requisit art/fx-<name>.png auf einem CSS-Pfad (Klasse path-<path>, Keyframes path-<path>). opts.html landet im Requisit.
export function propFx(parent, name, path, { ms = 900, size = 160, delay = 0, html = '' } = {}) {
  const el = make(`fx-prop path-${path}`, { '--ms': `${ms}ms`, '--size': px(size) });
  el.dataset.path = path;
  el.innerHTML = `<img src="art/fx-${name}.png" alt="">${html}`;
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

// Schwebende Zahl/Text in Pixelify: kind ∈ 'hurt' | 'heal' | 'info' | 'big'
export function floatText(parent, text, { x = '50%', y = '40%', kind = 'info', ms = 900 } = {}) {
  const el = make(`fx-text ${kind}`, { '--x': px(x), '--y': px(y), '--ms': `${ms}ms` });
  el.textContent = text;
  return mount(parent, el, 0, ms);
}
