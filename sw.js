// Service Worker: Rüther GO läuft komplett offline (auch als installierte App). Erzeugt von tools/make_sw.py – nicht von Hand ändern.
const VERSION = '32fec3c3a5d3';
const APP = `app-${VERSION}`, FONTS = 'fonts-1', TILES = 'tiles-1', VIDS = 'ruether-vids', TILE_MAX = 3000;
const PRECACHE = [
  './',
  'index.html',
  'style.css',
  'manifest.json',
  'css/app.css',
  'css/battle.css',
  'css/catch.css',
  'css/duel.css',
  'css/flight.css',
  'css/quest.css',
  'css/screens.css',
  'css/theme.css',
  'js/ad.js',
  'js/app.js',
  'js/audio.js',
  'js/battle-ui.js',
  'js/battle.js',
  'js/catch-logic.js',
  'js/catch.js',
  'js/data.js',
  'js/duel-ui.js',
  'js/duel.js',
  'js/flight.js',
  'js/format.js',
  'js/fx.js',
  'js/geo.js',
  'js/lobby.js',
  'js/map.js',
  'js/onboarding.js',
  'js/online-merge.js',
  'js/online.js',
  'js/overpass.js',
  'js/progress.js',
  'js/quests.js',
  'js/screens.js',
  'js/spawn.js',
  'js/stops.js',
  'js/storage.js',
  'js/ticker.js',
  'js/ui.js',
  'js/wild.js',
  'js/quest/abilities.js',
  'js/quest/coop.js',
  'js/quest/draw.js',
  'js/quest/engine.js',
  'js/quest/missions.js',
  'js/quest/path.js',
  'js/quest/race.js',
  'js/quest/video.js',
  'js/quest/view.js',
  'js/net/link.js',
  'js/net/online.js',
  'art/ab-buch.png',
  'art/ab-crash.png',
  'art/ab-deo.png',
  'art/ab-feierabend.png',
  'art/ab-firewall.png',
  'art/ab-geschenk.png',
  'art/ab-horde.png',
  'art/ab-insider.png',
  'art/ab-junge.png',
  'art/ab-kursalarm.png',
  'art/ab-mittag.png',
  'art/ab-mutter.png',
  'art/ab-neuesvideo.png',
  'art/ab-raubkopie.png',
  'art/ab-sale.png',
  'art/ab-schlange.png',
  'art/ab-tratsch.png',
  'art/ab-vibra.png',
  'art/ab-vp.png',
  'art/ab-wlan.png',
  'art/ab-zinseszins.png',
  'art/ad-car.png',
  'art/ad-cover.png',
  'art/bg-anzeige.png',
  'art/bg-catch.png',
  'art/bg-huettenberg.png',
  'art/bg-keller.png',
  'art/bg-kieser.png',
  'art/bg-menu.png',
  'art/bg-mondbasis.png',
  'art/bg-moon.png',
  'art/bg-mosel.png',
  'art/bg-neuschwabenland.png',
  'art/bg-pcsale.png',
  'art/bg-ranger.png',
  'art/bg-video.png',
  'art/bg-worringen.png',
  'art/boss-bernd.png',
  'art/boss-goebbels.png',
  'art/boss-heizung.png',
  'art/boss-himmler.png',
  'art/boss-hitler.png',
  'art/boss-moshe.png',
  'art/boss-ps3.png',
  'art/boss-satoshi.png',
  'art/boss-schanze.png',
  'art/boss-tachionen.png',
  'art/coin-big.png',
  'art/frame-button.png',
  'art/frame-panel.png',
  'art/fx-bags.png',
  'art/fx-beer-can.png',
  'art/fx-block.png',
  'art/fx-book.png',
  'art/fx-btc-rocket.png',
  'art/fx-candles.png',
  'art/fx-chain.png',
  'art/fx-chart-up.png',
  'art/fx-clock.png',
  'art/fx-contract.png',
  'art/fx-controller.png',
  'art/fx-crash.png',
  'art/fx-disc.png',
  'art/fx-echo.png',
  'art/fx-family.png',
  'art/fx-fan.png',
  'art/fx-firmware.png',
  'art/fx-gas.png',
  'art/fx-halving.png',
  'art/fx-handbag.png',
  'art/fx-handshake.png',
  'art/fx-haunebu.png',
  'art/fx-heat.png',
  'art/fx-key.png',
  'art/fx-lectern.png',
  'art/fx-mms.png',
  'art/fx-phone.png',
  'art/fx-pickaxe.png',
  'art/fx-rant.png',
  'art/fx-speech.png',
  'art/fx-tractor-beam.png',
  'art/fx-wallet.png',
  'art/fx-yellow-light.png',
  'art/icon-bag.png',
  'art/icon-beer.png',
  'art/icon-btc.png',
  'art/icon-coin.png',
  'art/icon-gear.png',
  'art/icon-hashrate.png',
  'art/icon-haunebu.png',
  'art/icon-lightning.png',
  'art/icon-lock.png',
  'art/icon-map.png',
  'art/icon-mining.png',
  'art/icon-profile.png',
  'art/icon-quest.png',
  'art/icon-shop.png',
  'art/icon-star.png',
  'art/icon-trophy.png',
  'art/q-berater.png',
  'art/q-bernd.png',
  'art/q-box.png',
  'art/q-camper.png',
  'art/q-coin.png',
  'art/q-dackel.png',
  'art/q-detektiv.png',
  'art/q-drohne.png',
  'art/q-kids.png',
  'art/q-moshe.png',
  'art/q-pad.png',
  'art/q-phone.png',
  'art/q-pinguin.png',
  'art/q-platzwart.png',
  'art/q-plug.png',
  'art/q-ps3.png',
  'art/q-ranger.png',
  'art/q-sack.png',
  'art/q-saucer.png',
  'art/q-sign.png',
  'art/q-tree.png',
  'art/q-valve.png',
  'art/q-vault.png',
  'art/sheet-btc-burst.png',
  'art/sheet-btc-spin.png',
  'art/sheet-coins.png',
  'art/sheet-impact.png',
  'art/sheet-smoke.png',
  'art/sheet-sparkle.png',
  'sprites/christian.png',
  'sprites/coin.png',
  'sprites/hildegard.png',
  'sprites/icon-192.png',
  'sprites/icon-512.png',
  'sprites/micha.png',
  'sprites/moshe.png',
  'sprites/ps3.png',
  'sprites/ramona.png',
  'sprites/satoshi.png',
  'sprites/schanze.png',
  'sprites/unknown.png',
  'sprites/viktor.png',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/images/layers-2x.png',
  'vendor/leaflet/images/layers.png',
  'vendor/leaflet/images/marker-icon-2x.png',
  'vendor/leaflet/images/marker-icon.png',
  'vendor/leaflet/images/marker-shadow.png',
];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&family=Pixelify+Sans:wght@400;700&display=swap';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    await c.addAll(PRECACHE);
    try { // Schriften gleich mitnehmen, damit sie auch beim ersten Offline-Start da sind
      const f = await caches.open(FONTS), res = await fetch(FONT_CSS);
      if (res.ok) {
        const css = await res.clone().text();
        await f.put(FONT_CSS, res);
        const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
        await Promise.all(urls.map(u => fetch(u, { mode: 'cors' }).then(r => r.ok && f.put(u, r)).catch(() => {})));
      }
    } catch { /* ohne Netz beim Installieren: Schriften kommen beim nächsten Online-Start */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('app-') && k !== APP) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trimTiles(c) {
  const keys = await c.keys();
  for (let i = 0; i < keys.length - TILE_MAX; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.includes('/vids/')) { // v13 §3: Moshes Videos (16 MB) nicht vorab, sondern beim ersten Abspielen in einen
    // eigenen Cache, der Releases überlebt; Range-Anfragen bekommen die volle 200-Antwort (reicht Chrome/Android), darum ohne Request-Header holen
    e.respondWith(caches.open(VIDS).then(async c => (await c.match(url.pathname)) || fetch(url.pathname).then(r => { if (r.ok) c.put(url.pathname, r.clone()).catch(() => {}); return r; }).catch(() => Response.error())));
    return;
  }
  if (url.origin === location.origin) { // Spieldateien: erst Cache, dann Netz; Seitenaufrufe (auch ?debug=1) bekommen index.html
    e.respondWith((async () => {
      const c = await caches.open(APP);
      const hit = req.mode === 'navigate' ? (await c.match('index.html')) : (await c.match(req, { ignoreSearch: true }));
      if (hit) return hit;
      try { return await fetch(req); } catch { return req.mode === 'navigate' ? c.match('index.html') : Response.error(); }
    })());
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async c => (await c.match(req)) || fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (url.hostname === 'tile.openstreetmap.org') { // Kartenkacheln: schon gesehene gehen offline, neue werden nachgeladen
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()).then(() => trimTiles(c)); return r; }).catch(() => hit || Response.error());
      return hit || net;
    }));
  }
  // alles andere (Online-Welt, Kurs, Dosenbier-Stops) läuft normal übers Netz und scheitert offline still
});
