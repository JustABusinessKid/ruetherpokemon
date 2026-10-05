/* global L */
// Leaflet-Adapter mit Folgen-Modus, Seltenheits-Markern, Arena-Leveln, Dosenbier-Stops und Namensschild des globalen Besitzers.

const HAGEN = [51.36, 7.47];
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// Schwert für freie Arenen: 12×16-Pixelgrafik (O = Ink, W = Klinge, L = Klingenlicht, G = Messing, B = Griff)
const SWORD = ['....OO......', '...OWLO.....', '...OWLO.....', '...OWLO.....', '...OWLO.....', '...OWLO.....', '...OWLO.....', '...OWLO.....',
  'OOOOOOOOOO..', 'OGGGGGGGGO..', 'OOOOOOOOOO..', '...OBBO.....', '...OBBO.....', '...OBBO.....', '...OGGO.....', '...OOOO.....'];
const PX = { O: '#1E2A22', W: '#C9CED1', L: '#F4E8C8', G: '#F2C94C', B: '#5A3A1E' };
const swordSvg = `<svg class="sign" viewBox="-2 0 16 16" shape-rendering="crispEdges">${SWORD.flatMap((row, y) =>
  [...row].map((c, x) => (PX[c] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${PX[c]}"/>` : ''))).join('')}</svg>`;

function spriteIcon(id, rarity = 'normal') {
  const star = rarity === 'legendaer' ? '<img class="star" src="art/icon-star.png" alt="">' : '';
  return L.divIcon({ className: `spawn-icon r-${rarity}`, html: `<img class="face" src="sprites/${id}.png" alt="">${star}`, iconSize: [48, 48], iconAnchor: [24, 24] });
}
function arenaIcon({ level = 1, mastered = false, ownerId = null, globalOwner = null } = {}) {
  const badge = `<span class="lvl">${mastered ? '<img src="art/icon-star.png" alt="">Max' : 'Lv.' + level}</span>`;
  const label = globalOwner?.owner ? `<span class="owner-label${globalOwner.mine ? ' mine' : ''}">${esc(globalOwner.owner)}</span>` : '';
  const cls = mastered ? ' mastered' : '';
  if (ownerId) {
    return L.divIcon({ className: 'arena-icon owned' + cls, html: `<img class="sign" src="art/icon-trophy.png" alt=""><img class="owner-face" src="sprites/${ownerId}.png" alt="">${badge}${label}`, iconSize: [48, 48], iconAnchor: [24, 24] });
  }
  return L.divIcon({ className: 'arena-icon' + cls, html: `${swordSvg}${badge}${label}`, iconSize: [48, 48], iconAnchor: [24, 24] });
}
const stopIcon = ready => L.divIcon({ className: 'stop-icon px-circle' + (ready ? '' : ' cooling'), html: '<img src="art/icon-beer.png" alt="">', iconSize: [40, 40], iconAnchor: [20, 20] });

export function createMap({ el, arenas, onSpawnTap, onArenaTap, onStopTap, onFollowChange }) {
  const map = L.map(el, { zoomControl: false }).setView(HAGEN, 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const pulse = L.marker(HAGEN, { icon: L.divIcon({ className: 'player-pulse', iconSize: [48, 48], iconAnchor: [24, 24] }), interactive: false });
  const player = L.marker(HAGEN, { icon: L.divIcon({ className: 'player-dot px-circle', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false });
  const stopLayer = L.layerGroup().addTo(map);
  const spawnLayer = L.layerGroup().addTo(map);
  const arenaMarkers = {};
  for (const a of arenas) {
    arenaMarkers[a.id] = L.marker([a.lat, a.lon], { icon: arenaIcon() }).addTo(map).on('click', () => onArenaTap(a));
  }
  let following = true;
  let centered = false;
  map.on('dragstart', () => { following = false; onFollowChange?.(false); });

  return {
    setPlayer(pos) {
      const ll = [pos.lat, pos.lon];
      player.setLatLng(ll); pulse.setLatLng(ll);
      if (!map.hasLayer(player)) { pulse.addTo(map); player.addTo(map); }
      if (!centered) { map.setView(ll, 16); centered = true; }
      else if (following) map.panTo(ll, { animate: true, duration: 0.5 });
    },
    follow(pos) {
      following = true; onFollowChange?.(true);
      if (pos) { map.setView([pos.lat, pos.lon], 16); centered = true; }
    },
    setSpawns(spawns) {
      spawnLayer.clearLayers();
      for (const s of spawns) {
        L.marker([s.lat, s.lon], { icon: spriteIcon(s.ruetherId, s.rarity), zIndexOffset: 1000 }).addTo(spawnLayer).on('click', () => onSpawnTap(s));
      }
    },
    // readyFn(stop) -> bool: false = in Abkühlung (grau)
    setStops(stops, readyFn = () => true) {
      stopLayer.clearLayers();
      for (const s of stops) {
        L.marker([s.lat, s.lon], { icon: stopIcon(readyFn(s)), zIndexOffset: 500 }).addTo(stopLayer).on('click', () => onStopTap?.(s));
      }
    },
    setArena(id, info) { arenaMarkers[id].setIcon(arenaIcon(info)); },
    invalidate() { map.invalidateSize(); },
  };
}
