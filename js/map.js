/* global L */
// Leaflet-Adapter mit Folgen-Modus und Besitz-Markern.

const HAGEN = [51.36, 7.47];

function spriteIcon(id) {
  return L.divIcon({ className: 'spawn-icon', html: `<img src="sprites/${id}.png" alt="">`, iconSize: [48, 48], iconAnchor: [24, 24] });
}
function arenaIcon() {
  return L.divIcon({ className: 'arena-icon', html: '⚔', iconSize: [40, 40], iconAnchor: [20, 20] });
}
function ownedIcon(ruetherId) {
  return L.divIcon({ className: 'arena-icon owned', html: `<img src="sprites/${ruetherId}.png" alt=""><span class="trophy">🏆</span>`, iconSize: [48, 48], iconAnchor: [24, 24] });
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
        // zIndexOffset: Spawns liegen über Arena-Markern, sonst verdeckt die Arena nahe Spawns (Leaflet staffelt nach Breitengrad)
        L.marker([s.lat, s.lon], { icon: spriteIcon(s.ruetherId), zIndexOffset: 1000 }).addTo(spawnLayer).on('click', () => onSpawnTap(s));
      }
    },
    setArenaOwner(id, ruetherId) { arenaMarkers[id].setIcon(ruetherId ? ownedIcon(ruetherId) : arenaIcon()); },
    invalidate() { map.invalidateSize(); },
  };
}
