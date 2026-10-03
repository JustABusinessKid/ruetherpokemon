const R = 6371000;
const toRad = d => (d * Math.PI) / 180;
const M_PER_DEG_LAT = 111320;

// Haversine, Meter. a/b: {lat, lon}
export function distance(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Punkt metersNorth/metersEast von center entfernt
export function offsetPoint(center, metersNorth, metersEast) {
  return {
    lat: center.lat + metersNorth / M_PER_DEG_LAT,
    lon: center.lon + metersEast / (M_PER_DEG_LAT * Math.cos(toRad(center.lat))),
  };
}

// Zufälliger Punkt im Ring [minM, maxM] um center. rng: () => [0,1)
export function randomPointInRing(center, minM, maxM, rng) {
  const d = minM + rng() * (maxM - minM);
  const ang = rng() * 2 * Math.PI;
  return offsetPoint(center, d * Math.cos(ang), d * Math.sin(ang));
}

// GPS mit Fake-Position für den Test-Modus.
// onPosition({lat, lon}) bei jeder Änderung; onError(err) wenn Ortung nicht geht.
export function createLocator({ onPosition, onError }) {
  let fake = null;
  let last = null;
  if (!navigator.geolocation) {
    onError(new Error('Keine Ortung verfügbar'));
  } else {
    navigator.geolocation.watchPosition(
      p => {
        last = { lat: p.coords.latitude, lon: p.coords.longitude };
        if (!fake) onPosition(last);
      },
      e => { if (!fake) onError(e); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }
  return {
    setFake(pos) { fake = pos; onPosition(pos); },
    clearFake() { fake = null; if (last) onPosition(last); else onError(new Error('Keine Ortung')); },
    get current() { return fake || last; },
    get isFake() { return fake !== null; },
  };
}
