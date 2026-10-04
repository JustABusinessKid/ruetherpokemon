# Rüther GO

Pokémon GO, aber man fängt Rüthers. Handy-Web-App, kein Server.

## Starten

    python -m http.server 8000

Dann `http://localhost:8000` öffnen. Auf dem Handy braucht die Ortung HTTPS,
also auf einen statischen Host (z.B. GitHub Pages) legen.

## Steuerung

- Karte folgt dir. Karte verschoben? 📍 unten rechts tippen.
- Rüthers gibt es in vier Seltenheiten (Normal, Selten, Episch, Legendär), erkennbar an Rand und Aura auf der Karte. Seltenere sind stärker und schwerer zu fangen.
- Fangen: Münze nach oben schnippen, kleiner Ring = bessere Chance. Super-Münze (Shop) gibt +20 %. Drei Ausbrüche, dann ist der Rüther weg.
- Sammlung: bis zu drei ins Team, Power-Up hebt das Level (kostet Sats). Rütherdex zeigt alle 20 Kombinationen.
- Shop: Lockmodul (5 Minuten doppelte Spawns), Super-Münzen. Sats gibt es für Fänge, neue Dex-Einträge und Arenasiege.
- Kampf: VS-Intro, dann auf den Boss tippen. Spezial-Buttons unten, wenn die Energie reicht. Blinkt es, wischen = ausweichen. Unter 50 % wird der Boss wütend und schneller. 90 Sekunden Zeit, ✕ oben links = aufgeben.
- Arenen haben fünf Level, der Boss wird pro Level stärker und die Belohnung größer. Level 5 besiegt = gemeistert (👑). Alle drei gemeistert = Krone.

## Test-Modus

`?debug=1` an die URL hängen oder siebenmal auf den Titel tippen. Dann kann
man sich an die drei Arenen beamen.

## Tests

    node --test test/*.test.mjs

## Sprites neu erzeugen

    python tools/pixelate.py

Fotos liegen im Projektordner (nicht im Git). Ramona hat noch kein Foto und
einen Platzhalter.
