/* global L */
// Leaflet-Adapter mit Folgen-Modus, Seltenheits-Markern, Arena-Leveln, Dosenbier-Stops und Namensschild des globalen Besitzers.
// v6: Reichweitenkreis um den Spieler, Spawn-Marker in Reichweite „near" (hüpfen), außerhalb „far" (blass).
// v7: Keller-Marker mit Treppen-Plakette, flyTo und liftPlayer für den Haunebu-Flug (js/flight.js, Styles in css/flight.css).
// v8: wave() = Puls der Lockmodul-Welle, setLure() = enger Zoom während des Lockmoduls (lureZoom: nach Breitengrad, die Welle liegt eng um den Spieler).
import { CONST } from './data.js';
import { distance, offsetPoint } from './geo.js';

const HAGEN = [51.36, 7.47];
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// Schwert für freie Arenen: 12×16-Pixelgrafik (O = Ink, W = Klinge, L = Klingenlicht, G = Messing, B = Griff)
const SWORD = ['....OO......', '...OWLO.....', '...OWLO.....', '...OWLO.....', '...OWLO.....', '...OWLO.....', '...OWLO.....', '...OWLO.....',
  'OOOOOOOOOO..', 'OGGGGGGGGO..', 'OOOOOOOOOO..', '...OBBO.....', '...OBBO.....', '...OBBO.....', '...OGGO.....', '...OOOO.....'];
// Keller-Treppe 8×8 für die Plakette am Keller-Marker
const STAIRS = ['......LL', '......LL', '....LLLL', '....LLLL', '..LLLLLL', '..LLLLLL', 'LLLLLLLL', 'LLLLLLLL'];
const PX = { O: '#1E2A22', W: '#C9CED1', L: '#F4E8C8', G: '#F2C94C', B: '#5A3A1E' };
const pxSvg = (rows, cls, viewBox) => `<svg class="${cls}" viewBox="${viewBox}" shape-rendering="crispEdges">${rows.flatMap((row, y) =>
  [...row].map((c, x) => (PX[c] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${PX[c]}"/>` : ''))).join('')}</svg>`;
const swordSvg = pxSvg(SWORD, 'sign', '-2 0 16 16');
const kellerBadge = `<span class="keller-badge">${pxSvg(STAIRS, 'stairs', '0 0 8 8')}</span>`;

function spriteIcon(id, rarity = 'normal', reach = '') {
  const star = rarity === 'legendaer' ? '<img class="star" src="art/icon-star.png" alt="">' : '';
  return L.divIcon({ className: `spawn-icon r-${rarity} ${reach}`, html: `<img class="face" src="sprites/${id}.png" alt="">${star}`, iconSize: [48, 48], iconAnchor: [24, 24] });
}
// Keller liegt nur 29 m neben Worringen: Schild nach rechts versetzt, sonst decken sich die Marker bei Zoom 16
const arenaAnchor = id => (id === 'keller' ? [-20, 12] : [24, 24]);
function arenaIcon({ level = 1, mastered = false, ownerId = null, globalOwner = null } = {}, id = '') {
  const keller = id === 'keller';
  const badge = `<span class="lvl">${mastered ? '<img src="art/icon-star.png" alt="">Max' : 'Lv.' + level}</span>` + (keller ? kellerBadge : '');
  const label = globalOwner?.owner ? `<span class="owner-label${globalOwner.mine ? ' mine' : ''}">${esc(globalOwner.owner)}</span>` : '';
  const cls = (mastered ? ' mastered' : '') + (keller ? ' arena-keller' : '');
  const iconAnchor = arenaAnchor(id);
  if (ownerId) {
    return L.divIcon({ className: 'arena-icon owned' + cls, html: `<img class="sign" src="art/icon-trophy.png" alt=""><img class="owner-face" src="sprites/${ownerId}.png" alt="">${badge}${label}`, iconSize: [48, 48], iconAnchor });
  }
  return L.divIcon({ className: 'arena-icon' + cls, html: `${swordSvg}${badge}${label}`, iconSize: [48, 48], iconAnchor });
}
// v8 Lockmodul-Zoom: größter Zoom (Viertelstufen, 15–18), bei dem der Ring bis LURE_RING[1] = 90 m höchstens 40 % der kürzeren
// Kartenseite (side, px) misst; m/px = 156543·cos(lat)/2^z. Ein fester Zoom passt nur auf einer Breite (17 ≈ Hagen, in
// Neuschwabenland bei -72° läge die Welle neben dem Bild). Viertel- statt ganzer Stufen: m/px liegt höchstens 19 % unter dem
// Ziel, damit bleiben die ≥ 44 m Mindestabstand der Welle (spawn.js lureWave) über 48 px, die Gesichter decken sich nicht.
export function lureZoom(lat, side) {
  const z = Math.log2((156543 * Math.cos((lat * Math.PI) / 180) * 0.4 * side) / CONST.LURE_RING[1]);
  return Math.min(18, Math.max(15, Math.floor(z * 4) / 4));
}
const mPerPx = (lat, z) => (156543 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
// v8 Platz für die Lockmodul-Welle (spawn.js lureWave avoid/gap), gerechnet bei lureZoom mit dem Spieler pos in der Kartenmitte.
// avoid: Sperrquadrate für jedes Arena-Schild samt Besitzer-Foto, Lv-Schild und Keller-Plakette (ragen 10 px über das 48-px-Schild)
// und jeden Knopf aus boxes ({ x, y, h }: Mitte relativ zur Kartenmitte, halbe Kantenlänge, px), plus halbes Gesicht samt Rand.
// gap: so weit (m, je Achse) müssen zwei Gesichter auseinander, damit sich die Quadrate nicht berühren.
const FACE = 26;
export function lureRoom(pos, arenas, side, boxes = []) {
  const m = mPerPx(pos.lat, lureZoom(pos.lat, side));
  const avoid = [
    ...arenas.map(a => { const [ax, ay] = arenaAnchor(a.id); return { ...offsetPoint(a, (ay - 24) * m, (24 - ax) * m), r: (34 + FACE) * m }; }),
    ...boxes.map(b => ({ ...offsetPoint(pos, -b.y * m, b.x * m), r: (b.h + FACE) * m })),
  ];
  return { avoid, gap: 2 * FACE * m };
}
const stopIcon = ready => L.divIcon({ className: 'stop-icon px-circle' + (ready ? '' : ' cooling'), html: '<img src="art/icon-beer.png" alt="">', iconSize: [40, 40], iconAnchor: [20, 20] });

export function createMap({ el, arenas, onSpawnTap, onArenaTap, onStopTap, onFollowChange }) {
  const map = L.map(el, { zoomControl: false, zoomSnap: 0.25 }).setView(HAGEN, 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  // eigene Position immer über den Spawns (zIndexOffset 1000); nicht klickbar, Tipps gehen an die Gesichter darunter
  const pulse = L.marker(HAGEN, { icon: L.divIcon({ className: 'player-pulse', iconSize: [48, 48], iconAnchor: [24, 24] }), interactive: false, zIndexOffset: 2000 });
  const player = L.marker(HAGEN, { icon: L.divIcon({ className: 'player-dot px-circle', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false, zIndexOffset: 2000 });
  const reachCircle = L.circle(HAGEN, { radius: CONST.CATCH_RANGE, className: 'reach-circle', weight: 2, dashArray: '6 6', fillOpacity: 0.06, interactive: false });
  const stopLayer = L.layerGroup().addTo(map);
  const spawnLayer = L.layerGroup().addTo(map);
  let spawnMarkers = [], reachPos = null;
  const reachOf = s => (!reachPos ? '' : distance(reachPos, s) < CONST.CATCH_RANGE ? 'near' : 'far');
  const arenaMarkers = {};
  for (const a of arenas) {
    arenaMarkers[a.id] = L.marker([a.lat, a.lon], { icon: arenaIcon({}, a.id) }).addTo(map).on('click', () => onArenaTap(a));
  }
  let following = true;
  let centered = false;
  let waveT = 0;
  let lure = false;
  let size = [innerWidth, innerHeight];
  const view = () => (el.clientWidth ? (size = [el.clientWidth, el.clientHeight]) : size); // verdeckt: zuletzt gesehene Größe
  const zoom = lat => (lure ? lureZoom(lat, Math.min(...view())) : 16);
  map.on('dragstart', () => { following = false; onFollowChange?.(false); });
  // Banner und Haunebu-Chip ändern die Kartenhöhe: Leaflet nachführen, im Lockmodul den Zoom neu rechnen (sonst ragt die Welle aus dem Bild)
  new ResizeObserver(() => {
    if (!el.clientWidth) return;
    map.invalidateSize();
    const ll = player.getLatLng();
    if (lure && following && map.hasLayer(player)) map.setView(ll, zoom(ll.lat), { animate: false });
  }).observe(el);

  return {
    setPlayer(pos) {
      const ll = [pos.lat, pos.lon];
      player.setLatLng(ll); pulse.setLatLng(ll);
      if (!map.hasLayer(player)) { pulse.addTo(map); player.addTo(map); }
      if (!centered) { map.setView(ll, zoom(pos.lat)); centered = true; }
      else if (following) map.panTo(ll, { animate: true, duration: 0.5 });
    },
    follow(pos) {
      following = true; onFollowChange?.(true);
      if (pos) { map.setView([pos.lat, pos.lon], zoom(pos.lat)); centered = true; }
    },
    setSpawns(spawns) {
      spawnLayer.clearLayers();
      spawnMarkers = spawns.map(s => ({ s, m: L.marker([s.lat, s.lon], { icon: spriteIcon(s.ruetherId, s.rarity, reachOf(s)), zIndexOffset: 1000 }).addTo(spawnLayer).on('click', () => onSpawnTap(s)) }));
    },
    // pos = Spielerposition oder null (keine Ortung: Kreis weg, Marker neutral)
    setReach(pos) {
      reachPos = pos;
      if (pos) reachCircle.setLatLng([pos.lat, pos.lon]).addTo(map); else reachCircle.remove();
      for (const { s, m } of spawnMarkers) {
        const el = m.getElement(), r = reachOf(s);
        el?.classList.toggle('near', r === 'near');
        el?.classList.toggle('far', r === 'far');
      }
    },
    // readyFn(stop) -> bool: false = in Abkühlung (grau)
    setStops(stops, readyFn = () => true) {
      stopLayer.clearLayers();
      for (const s of stops) {
        L.marker([s.lat, s.lon], { icon: stopIcon(readyFn(s)), zIndexOffset: 500 }).addTo(stopLayer).on('click', () => onStopTap?.(s));
      }
    },
    setArena(id, info) { arenaMarkers[id].setIcon(arenaIcon(info, id)); },
    // v8 Lockmodul-Welle: ein Pixel-Ring läuft einmal vom Spieler nach außen (style.css .player-pulse.wave)
    wave() {
      const el = pulse.getElement();
      if (!el) return;
      el.classList.remove('wave'); void el.offsetWidth; el.classList.add('wave');
      clearTimeout(waveT); waveT = setTimeout(() => el.classList.remove('wave'), 1400);
    },
    // v8: Lockmodul an/aus. Beim Wechsel zoomt die Karte, wenn sie dem Spieler folgt, auf lureZoom bzw. zurück auf 16;
    // bei 16 decken sich die bis zu 15 Gesichter des Lockmoduls im 90-m-Ring (spawn.js lureWave), darum hält die App den
    // Lock-Zoom, solange noch Wellen-Gesichter liegen (v9). Flüge und follow() rechnen den Zoom am Ziel neu.
    setLure(on) {
      if (on === lure) return;
      lure = on;
      const ll = player.getLatLng();
      if (following && map.hasLayer(player)) map.setView(ll, zoom(ll.lat), { animate: !!el.clientWidth }); // verdeckt: ohne Animation
    },
    // v8: lureRoom für die Welle um pos. buttons: Knöpfe über der Karte (absolut mit right/bottom in px; ausgeblendete
    // zählen nicht). Liest das Stylesheet, geht also auch bei verdeckter Karte; schaut man woanders hin, zählen nur die Arenen.
    lureRoom(pos, buttons = []) {
      if (!pos) return {};
      const [w, h] = view();
      const boxes = !following ? [] : buttons.map(b => getComputedStyle(b)).filter(cs => cs.display !== 'none').map(cs => {
        const s = parseFloat(cs.width) / 2;
        return { x: w / 2 - parseFloat(cs.right) - s, y: h / 2 - parseFloat(cs.bottom) - s, h: s };
      });
      return lureRoom(pos, arenas, Math.min(w, h), boxes);
    },
    invalidate() { map.invalidateSize(); },
    // Kamera-Flug mit Raus-/Reinzoomen. Folgen aus, sonst zieht das nächste GPS-Update die Karte zurück (follow() schaltet es wieder an).
    // Löst bei moveend auf, spätestens nach duration + 1 s.
    flyTo(pos, { duration = 2 } = {}) {
      following = false; onFollowChange?.(false);
      return new Promise(resolve => {
        let t = 0;
        const done = () => { clearTimeout(t); map.off('moveend', done); resolve(); };
        try {
          const ll = [pos.lat, pos.lon];
          if (!el.clientWidth) { map.setView(ll, zoom(pos.lat), { animate: false }); return resolve(); } // Karte verdeckt: Leaflet rechnet sonst mit Größe 0
          map.flyTo(ll, zoom(pos.lat), { duration });
        } catch { return resolve(); }
        map.on('moveend', done); // erst nach dem Start: flyTo stoppt ein laufendes panTo, und das feuert sofort moveend
        t = setTimeout(done, (duration + 1) * 1000);
      });
    },
    // Spieler-Marker steigt in die Scheibe (on) bzw. landet wieder; pos setzt ihn vorher dorthin (Landung am Ziel)
    liftPlayer(on, pos) {
      if (pos) { player.setLatLng([pos.lat, pos.lon]); pulse.setLatLng([pos.lat, pos.lon]); }
      for (const m of [player, pulse]) {
        const c = m.getElement()?.classList;
        if (!c) continue;
        if (on) c.remove('land'); else if (c.contains('lift')) c.add('land');
        c.toggle('lift', !!on);
      }
    },
  };
}
