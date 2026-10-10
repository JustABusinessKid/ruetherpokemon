// v7 Haunebu-Animationen (Spec §4): Beschwörung vor dem Hitler-Kampf, Beamen zur Arena, Rückflug.
// Overlay über allem (unter den Toasts), blockiert Eingaben, räumt sich selbst ab und löst immer auf.
// Optik und Keyframes in css/flight.css; fehlen art/fx-haunebu.png bzw. art/fx-tractor-beam.png, zeichnet CSS eine Pixel-Scheibe ohne Symbole.
import { playSheet, banner } from './fx.js';
import { sfx } from './audio.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const rand = (a, b) => Math.round(a + Math.random() * (b - a));

const BEAM = '<div class="fl-beam"><img src="art/fx-tractor-beam.png" alt=""></div>';
const DISC = '<div class="fl-disc"><div class="fl-body"><img src="art/fx-haunebu.png" alt=""><span class="fl-px"><i></i><i></i><i></i></span>'
  + '<span class="fl-lights"></span></div><b class="fl-sign"></b></div>';
// Pixel-Sterne als harte box-shadows auf einem 3-px-Punkt
const stars = () => `<i class="fl-stars" style="box-shadow:${Array.from({ length: 40 }, (_, i) =>
  `${rand(2, 98)}vw ${rand(2, 70)}vh ${i % 3 ? 'var(--paper)' : 'var(--gold)'}`).join(',')}"></i>`;
// Geschwindigkeitsstreifen: je Streifen eigene Höhe, Länge, Tempo
const streaks = () => `<div class="fl-streaks">${Array.from({ length: 12 }, () =>
  `<i style="top:${rand(4, 96)}%;width:${8 * rand(3, 12)}px;--d:${rand(280, 560)}ms;--o:-${rand(0, 500)}ms"></i>`).join('')}</div>`;

function overlay(host, cls, inner) {
  document.activeElement?.blur?.();
  const el = document.createElement('div');
  el.className = `flight ${cls}`;
  el.innerHTML = `<div class="fl-stage">${inner}${BEAM}${DISC}</div><div class="fl-flash"></div>`;
  for (const img of el.querySelectorAll('img')) img.addEventListener('error', () => img.parentElement.classList.add('noimg'));
  host.appendChild(el);
  return el;
}

// Bildschirmpunkt des ersten sichtbaren Elements (Spieler-Marker, Karte), sonst Fenstermitte
function here(...sels) {
  for (const s of sels) {
    const r = document.querySelector(s)?.getBoundingClientRect();
    const x = r && r.left + r.width / 2, y = r && r.top + r.height / 2;
    if (r?.width && x > 0 && y > 0 && x < innerWidth && y < innerHeight) return { x, y };
  }
  return { x: innerWidth / 2, y: innerHeight / 2 };
}
// Zielpunkt des Strahls; die Scheibe schwebt darüber (css/flight.css)
const aim = (el, p) => { el.style.setProperty('--tx', `${p.x}px`); el.style.setProperty('--ty', `${p.y}px`); };

// ~3,7 s: Nacht, Sterne, Scheibe sinkt und wackelt, Strahl an, Wackeln + Rauch + Holzbanner mit Hitlers Spruch
export async function playSummon(host, { line = '' } = {}) {
  const el = overlay(host, 'summon', stars());
  try {
    sfx.play('ufo');
    if (reduced()) { el.classList.add('reduced'); await wait(500); return; }
    await wait(1100);
    el.classList.add('beam');
    await wait(400);
    el.classList.add('quake');
    playSheet(el.firstElementChild, 'smoke', { x: 'var(--tx)', y: 'calc(var(--ty) + 32px)', size: 160 });
    // Hitler als Porträt, damit klar ist, wer spricht; 2,2 s, davon ~1,7 s ruhig lesbar (fx-banner 12–90 %)
    banner(el, { title: 'Die Reichsflugscheibe landet …', sub: line, portrait: 'art/boss-hitler.png', ms: 2200 });
    await wait(2200);
  } catch (e) { console.warn('Haunebu-Animation', e); } finally { el.remove(); }
}

// Abholen (Strahl, Marker hebt ab, Blitz) → Flug (Leaflet flyTo, Schaukeln, Streifen, Schild) → Absetzen (Staub, Scheibe zieht weg)
async function trip(host, { map, to, sign, fly, inMs, outMs }) {
  const el = overlay(host, 'trip', streaks());
  el.querySelector('.fl-sign').textContent = `Kurs: ${sign}`;
  el.style.setProperty('--in', `${inMs}ms`);
  el.style.setProperty('--out', `${outMs}ms`);
  aim(el, here('.leaflet-marker-icon.player-dot', '.leaflet-container'));
  try {
    sfx.play('ufo');
    if (reduced()) { // Blende statt Flug
      el.classList.add('reduced');
      await wait(150);
      await Promise.race([map.flyTo(to, { duration: 0.2 }), wait(250)]);
      await wait(150);
      return;
    }
    el.classList.add('pickup');
    await wait(inMs);
    el.classList.add('beam');
    map.liftPlayer(true);
    await wait(600);
    el.classList.remove('beam');
    el.classList.add('flash', 'fly');
    aim(el, here('.leaflet-container')); // flyTo setzt das Ziel in die Kartenmitte
    await Promise.race([map.flyTo(to, { duration: fly }), wait(fly * 1000 + 1200)]);
    el.classList.remove('fly');
    el.classList.add('beam');
    map.liftPlayer(false, to);
    await wait(500);
    playSheet(el.firstElementChild, 'smoke', { x: 'var(--tx)', y: 'calc(var(--ty) + 16px)', size: 128 });
    el.classList.remove('beam');
    el.classList.add('away');
    await wait(outMs);
  } catch (e) { console.warn('Haunebu-Animation', e); } finally {
    try { map.liftPlayer(false); map.follow(); } catch { /* keine Karte */ }
    el.remove();
  }
}

// ~4,5 s, to = {lat, lon}, label = Arenaname
export function playBeam(host, { map, to, label = '' }) {
  return trip(host, { map, to, sign: label, fly: 2.2, inMs: 600, outMs: 400 });
}

// ~3 s, dieselbe Sequenz zurück
export function playReturn(host, { map, to }) {
  return trip(host, { map, to, sign: 'Zuhause', fly: 1, inMs: 400, outMs: 300 });
}
