# Erzeugt sw.js mit der Liste aller Spieldateien (Offline-Start, als App installierbar).
# Nach jeder Änderung an Dateien neu laufen lassen: python tools/make_sw.py
import hashlib, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = ['./', 'index.html', 'style.css', 'manifest.json']
for pattern in ['css/*.css', 'js/*.js', 'js/quest/*.js', 'js/net/*.js', 'art/*.png', 'sprites/*.png', 'vendor/leaflet/*.js', 'vendor/leaflet/*.css', 'vendor/leaflet/images/*.png']:
    FILES += sorted(p.relative_to(ROOT).as_posix() for p in ROOT.glob(pattern))

h = hashlib.sha256()
for f in FILES[1:]:
    h.update(f.encode()); h.update((ROOT / f).read_bytes())
version = h.hexdigest()[:12]

files = ',\n  '.join(f"'{f}'" for f in FILES)
(ROOT / 'sw.js').write_text(f"""// Service Worker: Rüther GO läuft komplett offline (auch als installierte App). Erzeugt von tools/make_sw.py – nicht von Hand ändern.
const VERSION = '{version}';
const APP = `app-${{VERSION}}`, FONTS = 'fonts-1', TILES = 'tiles-1', TILE_MAX = 3000;
const PRECACHE = [
  {files},
];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&family=Pixelify+Sans:wght@400;700&display=swap';

self.addEventListener('install', e => {{
  e.waitUntil((async () => {{
    const c = await caches.open(APP);
    await c.addAll(PRECACHE);
    try {{ // Schriften gleich mitnehmen, damit sie auch beim ersten Offline-Start da sind
      const f = await caches.open(FONTS), res = await fetch(FONT_CSS);
      if (res.ok) {{
        const css = await res.clone().text();
        await f.put(FONT_CSS, res);
        const urls = [...css.matchAll(/url\\((https:[^)]+)\\)/g)].map(m => m[1]);
        await Promise.all(urls.map(u => fetch(u, {{ mode: 'cors' }}).then(r => r.ok && f.put(u, r)).catch(() => {{}})));
      }}
    }} catch {{ /* ohne Netz beim Installieren: Schriften kommen beim nächsten Online-Start */ }}
    await self.skipWaiting();
  }})());
}});

self.addEventListener('activate', e => {{
  e.waitUntil((async () => {{
    for (const k of await caches.keys()) if (k.startsWith('app-') && k !== APP) await caches.delete(k);
    await self.clients.claim();
  }})());
}});

async function trimTiles(c) {{
  const keys = await c.keys();
  for (let i = 0; i < keys.length - TILE_MAX; i++) await c.delete(keys[i]);
}}

self.addEventListener('fetch', e => {{
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {{ // Spieldateien: erst Cache, dann Netz; Seitenaufrufe (auch ?debug=1) bekommen index.html
    e.respondWith((async () => {{
      const c = await caches.open(APP);
      const hit = req.mode === 'navigate' ? (await c.match('index.html')) : (await c.match(req, {{ ignoreSearch: true }}));
      if (hit) return hit;
      try {{ return await fetch(req); }} catch {{ return req.mode === 'navigate' ? c.match('index.html') : Response.error(); }}
    }})());
    return;
  }}
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {{
    e.respondWith(caches.open(FONTS).then(async c => (await c.match(req)) || fetch(req).then(r => {{ if (r.ok) c.put(req, r.clone()); return r; }})));
    return;
  }}
  if (url.hostname === 'tile.openstreetmap.org') {{ // Kartenkacheln: schon gesehene gehen offline, neue werden nachgeladen
    e.respondWith(caches.open(TILES).then(async c => {{
      const hit = await c.match(req);
      const net = fetch(req).then(r => {{ if (r.ok) c.put(req, r.clone()).then(() => trimTiles(c)); return r; }}).catch(() => hit || Response.error());
      return hit || net;
    }}));
  }}
  // alles andere (Online-Welt, Kurs, Dosenbier-Stops) läuft normal übers Netz und scheitert offline still
}});
""", encoding='utf-8', newline='\n')
print('sw.js', version, len(FILES), 'Dateien')
