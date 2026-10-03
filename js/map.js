/* global L */
// Leaflet-Adapter. Erwartet das globale L aus dem Leaflet-Script.

const HAGEN = [51.36, 7.47];

function spriteIcon(id) {
  return L.divIcon({ className: 'spawn-icon', html: `<img src="sprites/${id}.png" alt="">`, iconSize: [48, 48], iconAnchor: [24, 24] });
}
function arenaIcon(beaten) {
  return L.divIcon({ className: 'arena-icon' + (beaten ? ' beaten' : ''), html: beaten ? '✓' : '⚔', iconSize: [40, 40], iconAnchor: [20, 20] });
}

export function createMap({ el, arenas, onSpawnTap, onArenaTap }) {
  const map = L.map(el, { zoomControl: false }).setView(HAGEN, 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const player = L.circleMarker(HAGEN, { radius: 8, color: '#fff', fillColor: '#2a7fff', fillOpacity: 1, weight: 2 });
  const spawnLayer = L.layerGroup().addTo(map);
  const arenaMarkers = {};
  for (const a of arenas) {
    arenaMarkers[a.id] = L.marker([a.lat, a.lon], { icon: arenaIcon(false) }).addTo(map).on('click', () => onArenaTap(a));
  }
  let centered = false;
  return {
    setPlayer(pos) {
      player.setLatLng([pos.lat, pos.lon]);
      if (!map.hasLayer(player)) player.addTo(map);
      if (!centered) { map.setView([pos.lat, pos.lon], 16); centered = true; }
    },
    center(pos) { map.setView([pos.lat, pos.lon], 16); centered = true; },
    setSpawns(spawns) {
      spawnLayer.clearLayers();
      for (const s of spawns) {
        L.marker([s.lat, s.lon], { icon: spriteIcon(s.ruetherId) }).addTo(spawnLayer).on('click', () => onSpawnTap(s));
      }
    },
    setArenaBeaten(id, beaten) { arenaMarkers[id].setIcon(arenaIcon(beaten)); },
    invalidate() { map.invalidateSize(); },
  };
}
