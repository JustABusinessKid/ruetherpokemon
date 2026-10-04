/* global L */
// Leaflet-Adapter mit Folgen-Modus, Seltenheits-Markern und Arena-Leveln.

const HAGEN = [51.36, 7.47];

function spriteIcon(id, rarity = 'normal') {
  const star = rarity === 'legendaer' ? '<span class="star">✨</span>' : '';
  return L.divIcon({ className: `spawn-icon r-${rarity}`, html: `<span class="aura"></span><img src="sprites/${id}.png" alt="">${star}`, iconSize: [48, 48], iconAnchor: [24, 24] });
}
function arenaIcon({ level = 1, mastered = false, ownerId = null } = {}) {
  const badge = `<span class="lvl">${mastered ? '👑' : 'Lv.' + level}</span>`;
  const cls = mastered ? ' mastered' : '';
  if (ownerId) {
    return L.divIcon({ className: 'arena-icon owned' + cls, html: `<img src="sprites/${ownerId}.png" alt=""><span class="trophy">🏆</span>${badge}`, iconSize: [48, 48], iconAnchor: [24, 24] });
  }
  return L.divIcon({ className: 'arena-icon' + cls, html: `⚔${badge}`, iconSize: [40, 40], iconAnchor: [20, 20] });
}

export function createMap({ el, arenas, onSpawnTap, onArenaTap, onFollowChange }) {
  const map = L.map(el, { zoomControl: false }).setView(HAGEN, 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const pulse = L.marker(HAGEN, { icon: L.divIcon({ className: 'player-pulse', iconSize: [40, 40], iconAnchor: [20, 20] }), interactive: false });
  const player = L.circleMarker(HAGEN, { radius: 8, color: '#fff', fillColor: '#2a7fff', fillOpacity: 1, weight: 2 });
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
    setArena(id, info) { arenaMarkers[id].setIcon(arenaIcon(info)); },
    invalidate() { map.invalidateSize(); },
  };
}
