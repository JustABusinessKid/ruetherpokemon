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

export function offsetPoint(center, metersNorth, metersEast) {
  return {
    lat: center.lat + metersNorth / M_PER_DEG_LAT,
    lon: center.lon + metersEast / (M_PER_DEG_LAT * Math.cos(toRad(center.lat))),
  };
}

export function randomPointInRing(center, minM, maxM, rng) {
  const d = minM + rng() * (maxM - minM);
  const ang = rng() * 2 * Math.PI;
  return offsetPoint(center, d * Math.cos(ang), d * Math.sin(ang));
}

// GPS mit Fake-Position für den Test-Modus. Startet die Beobachtung neu, wenn der
// Tab wieder sichtbar wird oder die Ortung in einen Timeout läuft.
export function createLocator({ onPosition, onError }) {
  let fake = null;
  let last = null;
  let watchId = null;
  const geo = navigator.geolocation;

  function start() {
    if (!geo) { onError(new Error('Keine Ortung verfügbar')); return; }
    if (watchId !== null) geo.clearWatch(watchId);
    watchId = geo.watchPosition(
      p => {
        last = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
        if (!fake) onPosition(last);
      },
      e => {
        if (e.code === 3) setTimeout(start, 2000); // TIMEOUT: neu versuchen
        if (!fake && !last) onError(e);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }
  start();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') start(); });

  return {
    setFake(pos) { fake = pos; onPosition(pos); },
    clearFake() { fake = null; if (last) onPosition(last); else onError(new Error('Keine Ortung')); },
    restart: start,
    get current() { return fake || last; },
    get isFake() { return fake !== null; },
  };
}
